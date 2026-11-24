import type {
  AgentSummary,
  AuditEntry,
  AuthStatusResponse,
  AuthUser,
  DashboardSnapshot,
  Meeting,
} from '../types';

let authTokenInMemory: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authTokenInMemory = token;
}

export function getAuthToken(): string | null {
  return authTokenInMemory;
}

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  skipAuthCheck = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authTokenInMemory) {
    headers.set('Authorization', `Bearer ${authTokenInMemory}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401 && !skipAuthCheck) {
    authTokenInMemory = null;
    unauthorizedHandler?.();
  }

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `Erro na requisição (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  getAuthStatus(): Promise<AuthStatusResponse> {
    return requestJson<AuthStatusResponse>('/api/auth/status', { method: 'GET' }, true);
  },

  setupInitialAdmin(input: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<{ token: string; user: AuthUser }> {
    return requestJson<{ token: string; user: AuthUser }>(
      '/api/auth/setup',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      true,
    );
  },

  login(input: {
    username: string;
    password: string;
  }): Promise<{ token: string; user: AuthUser }> {
    return requestJson<{ token: string; user: AuthUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      true,
    );
  },

  async logout(): Promise<void> {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }, true);
    } finally {
      authTokenInMemory = null;
    }
  },

  getDashboardSnapshot(): Promise<DashboardSnapshot> {
    return requestJson<DashboardSnapshot>('/api/dashboard', { method: 'GET' });
  },

  getMeetings(): Promise<Meeting[]> {
    return requestJson<Meeting[]>('/api/meetings', { method: 'GET' });
  },

  createMeeting(payload: Partial<Meeting>): Promise<Meeting> {
    return requestJson<Meeting>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMeeting(id: string, payload: Partial<Meeting>): Promise<Meeting> {
    return requestJson<Meeting>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  finalizeMeeting(id: string, payload?: Partial<Meeting>): Promise<Meeting> {
    return requestJson<Meeting>(`/api/meetings/${encodeURIComponent(id)}/finalize`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  inactivateMeeting(id: string): Promise<Meeting> {
    return requestJson<Meeting>(`/api/meetings/${encodeURIComponent(id)}/inactivate`, {
      method: 'POST',
    });
  },

  reactivateMeeting(id: string): Promise<Meeting> {
    return requestJson<Meeting>(`/api/meetings/${encodeURIComponent(id)}/reactivate`, {
      method: 'POST',
    });
  },

  getAgentSummary(): Promise<{ summary: AgentSummary | null; upstreamConfigured: boolean }> {
    return requestJson<{ summary: AgentSummary | null; upstreamConfigured: boolean }>(
      '/api/agent',
      { method: 'GET' },
    );
  },

  getAuditLogs(): Promise<AuditEntry[]> {
    return requestJson<AuditEntry[]>('/api/audit', { method: 'GET' });
  },
};
