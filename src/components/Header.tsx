import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react';
import type { AuthUser, SyncState } from '../types';
import type { ConnectionDisplayState } from '../services/liveUpdates';
import { formatHeaderDate } from '../utils/datetime';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user: AuthUser;
  onLogout: () => Promise<void>;
  connectionStatus: ConnectionDisplayState;
  syncState: SyncState;
}

export function Header({
  theme,
  onToggleTheme,
  user,
  onLogout,
  connectionStatus,
  syncState,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { dateLabel, weekdayLabel } = formatHeaderDate(now);

  const effectiveStatus: ConnectionDisplayState =
    connectionStatus === 'stale' || syncState.stale
      ? 'stale'
      : connectionStatus === 'reconnecting'
        ? 'reconnecting'
        : 'connected';

  const syncLabel =
    effectiveStatus === 'connected'
      ? 'SSE · Incremental'
      : effectiveStatus === 'reconnecting'
        ? 'Reconectando'
        : 'Dados desatualizados';

  const syncColorClass =
    effectiveStatus === 'connected'
      ? 'text-emerald-700 dark:text-emerald-400'
      : effectiveStatus === 'reconnecting'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-rose-700 dark:text-rose-400';

  const dotColorClass =
    effectiveStatus === 'connected'
      ? 'bg-emerald-600 dark:bg-emerald-400'
      : effectiveStatus === 'reconnecting'
        ? 'bg-amber-500'
        : 'bg-rose-600 dark:bg-rose-400';

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  };

  return (
    <header className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-6 px-4 py-2 lg:px-6">
        {/* Zone 1: HEAL Ops Identity & Title */}
        <div className="flex items-baseline gap-3 min-w-0 shrink-0">
          <span className="text-xs font-bold tracking-wider text-sky-700 dark:text-sky-400 whitespace-nowrap">
            HEAL Ops
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <h1 className="font-display text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50 lg:text-lg whitespace-nowrap">
            DAILY OPERACIONAL — TI HEAL
          </h1>
        </div>

        {/* Zone 2: Sao Paulo Date, Weekday & Discreet Incremental Status */}
        <div className="hidden md:flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {weekdayLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono font-medium tabular-nums">{dateLabel}</span>
          <span aria-hidden="true">·</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${syncColorClass}`}>
            <span className={`h-2 w-2 rounded-full ${dotColorClass}`} aria-hidden="true" />
            {syncLabel}
          </span>
        </div>

        {/* Zone 3: Theme Toggle & User Menu */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className={`flex md:hidden items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${syncColorClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColorClass}`} aria-hidden="true" />
            {syncLabel}
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <User className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span className="max-w-[140px] truncate">{user.displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user.role}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={handleSignOut}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{loggingOut ? 'Saindo...' : 'Sair para login'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
