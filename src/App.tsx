import { useCallback, useEffect, useState } from 'react';
import type {
  AuthStatusResponse,
  AuthUser,
  DashboardSnapshot,
  LiveUpdateEvent,
  Meeting,
  SyncState,
} from './types';
import { api, onUnauthorized, setAuthToken } from './services/api';
import {
  connectLiveUpdates,
  type ConnectionDisplayState,
} from './services/liveUpdates';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  evolution: [],
  tickets: [],
  staleThresholdHours: 24,
  indicators: null,
  activeWeeklyAlignment: null,
  latestFinalizedDaily: null,
  dailyAgenda: null,
  agentSummary: null,
  meetings: [],
  auditLogs: [],
  syncState: {
    connected: false,
    sourceCheckedAt: null,
    changeDetectedAt: null,
    stale: false,
    lastSuccessfulUpdate: null,
    upstreamConfigured: false,
    upstreamError: null,
  },
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('heal-daily-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionDisplayState>('reconnecting');
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('heal-daily-theme', theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const clearAuthState = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setHasLoadedOnce(false);
    setConnectionStatus('reconnecting');
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.history.pushState({}, '', '/login');
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      clearAuthState();
    });
    return () => onUnauthorized(null);
  }, [clearAuthState]);

  useEffect(() => {
    let active = true;
    api
      .getAuthStatus()
      .then((status) => {
        if (!active) return;
        setAuthStatus(status);
        if (!status.authenticated) {
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.history.replaceState({}, '', '/login');
          }
        } else if (status.user) {
          setUser(status.user);
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthStatus({
          authenticated: false,
          user: null,
          needsFirstRunSetup: false,
          upstreamConfigured: false,
          authMode: 'upstream',
        });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    api
      .getDashboardSnapshot()
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        setHasLoadedOnce(true);
      })
      .catch(() => {
        if (cancelled) return;
        setConnectionStatus((prev) =>
          prev === 'connected' ? 'stale' : 'reconnecting',
        );
      });

    const disconnectSse = connectLiveUpdates({
      onStatusChange: (status) => {
        if (!cancelled) {
          setConnectionStatus(status);
        }
      },
      onUnauthorized: () => {
        if (!cancelled) {
          clearAuthState();
        }
      },
      onEvent: (evt: LiveUpdateEvent) => {
        if (cancelled) return;
        if (evt.type === 'dashboard:snapshot') {
          const next = evt.payload as DashboardSnapshot;
          setSnapshot(next);
          setHasLoadedOnce(true);
        } else if (evt.type === 'meeting:synced' || evt.type === 'meeting:updated') {
          const meeting = evt.payload as Meeting;
          setSnapshot((prev) => {
            const exists = prev.meetings.some((m) => m.id === meeting.id);
            const updatedMeetings = exists
              ? prev.meetings.map((m) => (m.id === meeting.id ? meeting : m))
              : [meeting, ...prev.meetings];
            return {
              ...prev,
              meetings: updatedMeetings,
            };
          });
        } else if (evt.type === 'sync:status') {
          const syncState = evt.payload as SyncState;
          setSnapshot((prev) => ({ ...prev, syncState }));
        }
      },
    });

    return () => {
      cancelled = true;
      disconnectSse();
    };
  }, [user, clearAuthState]);

  const handleAuthenticated = (loggedUser: AuthUser) => {
    setUser(loggedUser);
    setAuthStatus((prev) =>
      prev
        ? { ...prev, authenticated: true, user: loggedUser, needsFirstRunSetup: false }
        : prev,
    );
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    const freshStatus = await api.getAuthStatus().catch(() => authStatus);
    if (freshStatus) {
      setAuthStatus(freshStatus);
    }
    clearAuthState();
  };

  if (!authStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Validando sessão HEAL Ops...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        authStatus={authStatus}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 lg:h-dvh lg:overflow-hidden dark:bg-slate-950 dark:text-slate-100">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        user={user}
        onLogout={handleLogout}
        connectionStatus={connectionStatus}
        syncState={snapshot.syncState}
      />

      <Dashboard
        snapshot={snapshot}
        hasLoadedOnce={hasLoadedOnce}
        connectionStatus={connectionStatus}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />
    </div>
  );
}
