import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  AgentSummary,
  AuditEntry,
  AuthStatusResponse,
  AuthUser,
  DailyAgendaData,
  DashboardSnapshot,
  EvolutionPeriod,
  Meeting,
  MeetingKind,
  MeetingPayload,
  OperationalIndicators,
  SyncState,
  Ticket,
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const HEAL_OPS_API_URL = (process.env.HEAL_OPS_API_URL ?? '').trim().replace(/\/+$/, '');
const HEAL_OPS_EVENTS_URL = (process.env.HEAL_OPS_EVENTS_URL ?? '').trim();
const HEAL_OPS_API_TOKEN = (process.env.HEAL_OPS_API_TOKEN ?? '').trim();
const HEAL_OPS_SYNC_TOKEN = (process.env.HEAL_OPS_SYNC_TOKEN ?? '').trim();
const HEAL_OPS_ADMIN_USER = (process.env.HEAL_OPS_ADMIN_USER ?? 'operacao@heal.org.br').trim();
const HEAL_OPS_ADMIN_PASSWORD = (process.env.HEAL_OPS_ADMIN_PASSWORD ?? '').trim();
const STALE_HOURS_THRESHOLD = Number(process.env.HEAL_OPS_STALE_HOURS_THRESHOLD ?? 24) || 24;

function isValidHttpUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const upstreamConfigured = isValidHttpUrl(HEAL_OPS_API_URL);

// --- Server-Side Session & Auth Store (Never persisted to browser localStorage) ---
interface SessionRecord {
  token: string;
  user: AuthUser;
  upstreamToken?: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, SessionRecord>();

interface FirstRunAdminCredential {
  username: string;
  displayName: string;
  salt: string;
  passwordHash: string;
}

let firstRunAdmin: FirstRunAdminCredential | null = null;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPasswordHash(password: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function verifyTimingSafeString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getAuthMode(): AuthStatusResponse['authMode'] {
  if (upstreamConfigured) return 'upstream';
  if (HEAL_OPS_ADMIN_PASSWORD) return 'env_admin';
  return 'first_run_bootstrap';
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

function getValidSession(req: Request): SessionRecord | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return record;
}

function createSession(user: AuthUser, upstreamToken?: string): SessionRecord {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const record: SessionRecord = {
    token,
    user,
    upstreamToken,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(token, record);
  return record;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = getValidSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }
  (req as Request & { session?: SessionRecord }).session = session;
  next();
}

// --- In-Memory BFF State (Zero Fictional Operational Data Seeded) ---
interface BffStateStore {
  evolution: EvolutionPeriod[];
  tickets: Ticket[];
  indicators: OperationalIndicators | null;
  agentSummary: AgentSummary | null;
  meetings: Meeting[];
  auditLogs: AuditEntry[];
  syncState: SyncState;
  lastFingerprint: string;
}

const bffStore: BffStateStore = {
  evolution: [],
  tickets: [],
  indicators: null,
  agentSummary: null,
  meetings: [],
  auditLogs: [],
  syncState: {
    connected: false,
    sourceCheckedAt: null,
    changeDetectedAt: null,
    stale: false,
    lastSuccessfulUpdate: null,
    upstreamConfigured,
    upstreamError: null,
  },
  lastFingerprint: '',
};

function appendAuditLog(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const full: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  bffStore.auditLogs = [full, ...bffStore.auditLogs].slice(0, 250);
  return full;
}

// --- SSE Connected Clients & Broadcast ---
interface SseClient {
  id: string;
  res: Response;
}

const sseClients = new Map<string, SseClient>();

function sendSseEvent(res: Response, event: string, payload: unknown): void {
  const envelope = JSON.stringify({
    type: event,
    timestamp: new Date().toISOString(),
    payload,
  });
  res.write(`event: ${event}\n`);
  res.write(`data: ${envelope}\n\n`);
}

function broadcastSse(event: string, payload: unknown): void {
  for (const [id, client] of sseClients.entries()) {
    try {
      sendSseEvent(client.res, event, payload);
    } catch {
      sseClients.delete(id);
    }
  }
}

function selectActiveWeeklyAlignment(meetings: Meeting[]): Meeting | null {
  return (
    meetings
      .filter((m) => m.kind === 'alinhamento_semanal' && m.active && m.status === 'finalizada')
      .sort((a, b) => {
        const dateA = a.finalizedAt ?? a.referenceDate ?? a.updatedAt;
        const dateB = b.finalizedAt ?? b.referenceDate ?? b.updatedAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })[0] ?? null
  );
}

function selectLatestFinalizedDaily(meetings: Meeting[]): Meeting | null {
  return (
    meetings
      .filter((m) => m.kind === 'daily_operacional' && m.active && m.status === 'finalizada')
      .sort((a, b) => {
        const dateA = a.finalizedAt ?? a.referenceDate ?? a.updatedAt;
        const dateB = b.finalizedAt ?? b.referenceDate ?? b.updatedAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })[0] ?? null
  );
}

function deriveAgendaFromLatestMeetings(
  tickets: Ticket[],
  latestDaily: Meeting | null,
  activeAlignment: Meeting | null,
): DailyAgendaData | null {
  if (!latestDaily && !activeAlignment && tickets.length === 0) {
    return null;
  }

  const dailyPayload = latestDaily?.payload;
  const alignmentPayload = activeAlignment?.payload;

  const priorityTickets =
    dailyPayload?.priorities && dailyPayload.priorities.length > 0
      ? dailyPayload.priorities
      : alignmentPayload?.priorities ?? [];

  const pendingAndDecisions: DailyAgendaData['pendingAndDecisions'] = [];
  for (const p of dailyPayload?.pendingFollowUps ?? []) {
    pendingAndDecisions.push({
      id: p.id,
      kind: 'pendencia',
      text: p.description,
      owner: p.owner,
      dueDate: p.dueDate,
    });
  }
  for (const d of dailyPayload?.decisions ?? []) {
    pendingAndDecisions.push({
      id: d.id,
      kind: 'decisao',
      text: d.description,
      owner: d.owner,
      dueDate: d.dueDate,
    });
  }

  return {
    priorityTickets,
    pendingAndDecisions,
    opportunitiesOfDay: dailyPayload?.opportunities ?? [],
    ticketsCountingInGoal: tickets.filter((t) => t.countsInGoal === true),
    sameDayExcludedTickets: tickets.filter((t) => t.excludedSameDayOpenClose === true),
    operationalDirectives: dailyPayload?.operationalDirectives ?? alignmentPayload?.goals ?? [],
  };
}

function buildDashboardSnapshot(): DashboardSnapshot {
  const activeWeeklyAlignment = selectActiveWeeklyAlignment(bffStore.meetings);
  const latestFinalizedDaily = selectLatestFinalizedDaily(bffStore.meetings);
  const dailyAgenda = deriveAgendaFromLatestMeetings(
    bffStore.tickets,
    latestFinalizedDaily,
    activeWeeklyAlignment,
  );

  return {
    evolution: bffStore.evolution,
    tickets: bffStore.tickets,
    staleThresholdHours: STALE_HOURS_THRESHOLD,
    indicators: bffStore.indicators,
    activeWeeklyAlignment,
    latestFinalizedDaily,
    dailyAgenda,
    agentSummary: bffStore.agentSummary,
    meetings: bffStore.meetings,
    auditLogs: bffStore.auditLogs,
    syncState: {
      ...bffStore.syncState,
      upstreamConfigured,
    },
  };
}

// --- Upstream HTTP Helper (Strict SSRF Protection: URL comes only from process.env) ---
async function upstreamFetch<T>(
  endpointPath: string,
  options: RequestInit = {},
  userToken?: string,
): Promise<T> {
  if (!upstreamConfigured) {
    throw new Error('Integração upstream HEAL_OPS_API_URL não configurada.');
  }
  const target = new URL(endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`, HEAL_OPS_API_URL);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (userToken) {
    headers.set('Authorization', `Bearer ${userToken}`);
  } else if (HEAL_OPS_API_TOKEN) {
    headers.set('Authorization', `Bearer ${HEAL_OPS_API_TOKEN}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target.toString(), {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Erro upstream (${response.status}): ${errorText || response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function computeFingerprint(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function syncFromUpstream(userToken?: string): Promise<void> {
  if (!upstreamConfigured) return;
  const checkedAt = new Date().toISOString();
  try {
    const remote = await upstreamFetch<Partial<DashboardSnapshot>>(
      '/api/dashboard',
      { method: 'GET' },
      userToken,
    );

    const nextPayload = {
      evolution: Array.isArray(remote.evolution) ? remote.evolution : bffStore.evolution,
      tickets: Array.isArray(remote.tickets) ? remote.tickets : bffStore.tickets,
      indicators: remote.indicators ?? null,
      agentSummary: remote.agentSummary ?? bffStore.agentSummary,
      meetings: Array.isArray(remote.meetings) ? remote.meetings : bffStore.meetings,
    };

    const nextFingerprint = computeFingerprint(nextPayload);
    const changed = nextFingerprint !== bffStore.lastFingerprint;

    bffStore.evolution = nextPayload.evolution;
    bffStore.tickets = nextPayload.tickets;
    bffStore.indicators = nextPayload.indicators;
    bffStore.agentSummary = nextPayload.agentSummary;
    bffStore.meetings = nextPayload.meetings;
    bffStore.lastFingerprint = nextFingerprint;

    bffStore.syncState = {
      connected: true,
      sourceCheckedAt: checkedAt,
      changeDetectedAt: changed ? checkedAt : bffStore.syncState.changeDetectedAt,
      stale: false,
      lastSuccessfulUpdate: checkedAt,
      upstreamConfigured: true,
      upstreamError: null,
    };

    if (changed) {
      broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha de comunicação com HEAL Ops';
    bffStore.syncState = {
      ...bffStore.syncState,
      connected: false,
      sourceCheckedAt: checkedAt,
      stale: true,
      upstreamConfigured: true,
      upstreamError: message,
    };
    broadcastSse('sync:status', bffStore.syncState);
  }
}

function emptyMeetingPayload(): MeetingPayload {
  return {
    participants: [],
    goals: [],
    decisions: [],
    commitments: [],
    challenges: [],
    pendingFollowUps: [],
    priorities: [],
    metricsSnapshot: null,
    opportunities: [],
    operationalDirectives: [],
    resultsSummary: '',
  };
}

function normalizeMeetingInput(
  raw: Partial<Meeting>,
  existing?: Meeting,
): Meeting {
  const now = new Date().toISOString();
  const kind: MeetingKind =
    raw.kind === 'alinhamento_semanal' ? 'alinhamento_semanal' : 'daily_operacional';
  const payloadInput = (raw.payload ?? {}) as Partial<MeetingPayload>;
  const existingPayload = existing?.payload ?? emptyMeetingPayload();

  const payload: MeetingPayload = {
    participants: Array.isArray(payloadInput.participants)
      ? payloadInput.participants
      : existingPayload.participants,
    goals: Array.isArray(payloadInput.goals) ? payloadInput.goals : existingPayload.goals,
    decisions: Array.isArray(payloadInput.decisions)
      ? payloadInput.decisions
      : existingPayload.decisions,
    commitments: Array.isArray(payloadInput.commitments)
      ? payloadInput.commitments
      : existingPayload.commitments,
    challenges: Array.isArray(payloadInput.challenges)
      ? payloadInput.challenges
      : existingPayload.challenges,
    pendingFollowUps: Array.isArray(payloadInput.pendingFollowUps)
      ? payloadInput.pendingFollowUps
      : existingPayload.pendingFollowUps,
    priorities: Array.isArray(payloadInput.priorities)
      ? payloadInput.priorities
      : existingPayload.priorities,
    metricsSnapshot:
      payloadInput.metricsSnapshot !== undefined
        ? payloadInput.metricsSnapshot
        : existingPayload.metricsSnapshot,
    opportunities: Array.isArray(payloadInput.opportunities)
      ? payloadInput.opportunities
      : existingPayload.opportunities ?? [],
    operationalDirectives: Array.isArray(payloadInput.operationalDirectives)
      ? payloadInput.operationalDirectives
      : existingPayload.operationalDirectives ?? [],
    resultsSummary:
      typeof payloadInput.resultsSummary === 'string'
        ? payloadInput.resultsSummary
        : existingPayload.resultsSummary ?? '',
  };

  const active = raw.active !== undefined ? Boolean(raw.active) : existing?.active ?? true;
  const status =
    raw.status === 'finalizada' || raw.status === 'inativa' || raw.status === 'rascunho'
      ? raw.status
      : existing?.status ?? (active ? 'rascunho' : 'inativa');

  return {
    id: existing?.id ?? raw.id ?? crypto.randomUUID(),
    externalMeetingId:
      raw.externalMeetingId?.trim() ||
      existing?.externalMeetingId ||
      `heal-${kind}-${crypto.randomUUID()}`,
    kind,
    title:
      raw.title?.trim() ||
      existing?.title ||
      (kind === 'alinhamento_semanal' ? 'Alinhamento Semanal' : 'Daily Operacional'),
    referenceDate: raw.referenceDate ?? existing?.referenceDate ?? now.slice(0, 10),
    weekStart: raw.weekStart ?? existing?.weekStart ?? now.slice(0, 10),
    active,
    status: active ? (status === 'inativa' ? 'rascunho' : status) : 'inativa',
    durationMinutes:
      raw.durationMinutes !== undefined
        ? raw.durationMinutes
        : existing?.durationMinutes ?? null,
    template: raw.template !== undefined ? raw.template : existing?.template ?? null,
    linkedMeetingId:
      raw.linkedMeetingId !== undefined
        ? raw.linkedMeetingId
        : existing?.linkedMeetingId ?? null,
    linkedMeetingTitle:
      raw.linkedMeetingTitle !== undefined
        ? raw.linkedMeetingTitle
        : existing?.linkedMeetingTitle ?? null,
    linkedMeetingKind:
      raw.linkedMeetingKind !== undefined
        ? raw.linkedMeetingKind
        : existing?.linkedMeetingKind ?? null,
    payload,
    createdAt: existing?.createdAt ?? raw.createdAt ?? now,
    updatedAt: now,
    finalizedAt:
      status === 'finalizada'
        ? raw.finalizedAt ?? existing?.finalizedAt ?? now
        : raw.finalizedAt ?? existing?.finalizedAt ?? null,
  };
}

// --- Express App Setup ---
async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Healthcheck
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      upstreamConfigured,
      sseClients: sseClients.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Auth status
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const session = getValidSession(req);
    const authMode = getAuthMode();
    const status: AuthStatusResponse = {
      authenticated: Boolean(session),
      user: session?.user ?? null,
      needsFirstRunSetup:
        authMode === 'first_run_bootstrap' && firstRunAdmin === null,
      upstreamConfigured,
      authMode,
    };
    res.json(status);
  });

  // First-run admin setup (only active when neither upstream nor env password is set, and not yet claimed)
  app.post('/api/auth/setup', (req: Request, res: Response) => {
    if (getAuthMode() !== 'first_run_bootstrap' || firstRunAdmin !== null) {
      res.status(403).json({
        error: 'Configuração inicial já concluída ou gerenciada pelo servidor.',
      });
      return;
    }

    const { username, displayName, password } = req.body ?? {};
    const cleanUser = typeof username === 'string' ? username.trim() : '';
    const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    if (!cleanUser || cleanPass.length < 6) {
      res.status(400).json({
        error: 'Informe usuário válido e senha com no mínimo 6 caracteres.',
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    firstRunAdmin = {
      username: cleanUser.toLowerCase(),
      displayName: cleanName || cleanUser,
      salt,
      passwordHash: hashPassword(cleanPass, salt),
    };

    const user: AuthUser = {
      id: 'admin-local',
      username: firstRunAdmin.username,
      displayName: firstRunAdmin.displayName,
      role: 'Coordenador Operacional',
    };
    const session = createSession(user);
    appendAuditLog({
      eventType: 'auth_event',
      actor: user.displayName,
      summary: 'Acesso inicial do BFF configurado pelo operador.',
      idempotentAction: 'created',
    });

    res.status(201).json({ token: session.token, user });
  });

  // Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    const cleanUser = typeof username === 'string' ? username.trim() : '';
    const cleanPass = typeof password === 'string' ? password : '';

    if (!cleanUser || !cleanPass) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
      return;
    }

    const mode = getAuthMode();

    if (mode === 'upstream') {
      try {
        const result = await upstreamFetch<{
          token?: string;
          accessToken?: string;
          user?: Partial<AuthUser>;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: cleanUser, password: cleanPass }),
        });

        const upstreamToken = result.token ?? result.accessToken;
        const user: AuthUser = {
          id: String(result.user?.id ?? cleanUser),
          username: result.user?.username ?? cleanUser,
          displayName: result.user?.displayName ?? cleanUser,
          role: result.user?.role ?? 'Operador HEAL Ops',
        };
        const session = createSession(user, upstreamToken);
        appendAuditLog({
          eventType: 'auth_event',
          actor: user.displayName,
          summary: 'Login validado pelo ecossistema HEAL Ops.',
          idempotentAction: 'n/a',
        });
        res.json({ token: session.token, user });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Credenciais inválidas.';
        res.status(401).json({ error: msg });
        return;
      }
    }

    if (mode === 'env_admin') {
      const userMatches =
        cleanUser.toLowerCase() === HEAL_OPS_ADMIN_USER.toLowerCase();
      const passMatches = verifyTimingSafeString(cleanPass, HEAL_OPS_ADMIN_PASSWORD);
      if (!userMatches || !passMatches) {
        res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        return;
      }
      const user: AuthUser = {
        id: 'env-admin',
        username: HEAL_OPS_ADMIN_USER,
        displayName: 'Operação TI HEAL',
        role: 'Administrador Operacional',
      };
      const session = createSession(user);
      appendAuditLog({
        eventType: 'auth_event',
        actor: user.displayName,
        summary: 'Login autenticado via BFF.',
        idempotentAction: 'n/a',
      });
      res.json({ token: session.token, user });
      return;
    }

    // first_run_bootstrap mode
    if (!firstRunAdmin) {
      res.status(409).json({
        error: 'Primeiro acesso ainda não configurado. Defina o acesso inicial.',
      });
      return;
    }

    const userMatches = cleanUser.toLowerCase() === firstRunAdmin.username;
    const passMatches = verifyPasswordHash(
      cleanPass,
      firstRunAdmin.salt,
      firstRunAdmin.passwordHash,
    );
    if (!userMatches || !passMatches) {
      res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      return;
    }

    const user: AuthUser = {
      id: 'admin-local',
      username: firstRunAdmin.username,
      displayName: firstRunAdmin.displayName,
      role: 'Coordenador Operacional',
    };
    const session = createSession(user);
    appendAuditLog({
      eventType: 'auth_event',
      actor: user.displayName,
      summary: 'Login autenticado na sessão BFF.',
      idempotentAction: 'n/a',
    });
    res.json({ token: session.token, user });
  });

  // Logout (invalidates server session immediately)
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const session = getValidSession(req);
    if (session) {
      sessions.delete(session.token);
      appendAuditLog({
        eventType: 'auth_event',
        actor: session.user.displayName,
        summary: 'Sessão encerrada pelo usuário (Sair para login).',
        idempotentAction: 'n/a',
      });
      if (upstreamConfigured && session.upstreamToken) {
        upstreamFetch('/api/auth/logout', { method: 'POST' }, session.upstreamToken).catch(
          () => undefined,
        );
      }
    }
    res.json({ ok: true });
  });

  // SSE Live Updates Stream (authenticated via Bearer token)
  app.get('/api/events', (req: Request, res: Response) => {
    const session = getValidSession(req);
    if (!session) {
      res.status(401).json({ error: 'Não autorizado para stream SSE.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = crypto.randomUUID();
    sseClients.set(clientId, { id: clientId, res });

    // Send immediate snapshot upon connection
    sendSseEvent(res, 'dashboard:snapshot', buildDashboardSnapshot());

    const heartbeatTimer = setInterval(() => {
      try {
        sendSseEvent(res, 'sync:heartbeat', {
          sourceCheckedAt: bffStore.syncState.sourceCheckedAt ?? new Date().toISOString(),
          stale: bffStore.syncState.stale,
          upstreamConfigured,
        });
      } catch {
        clearInterval(heartbeatTimer);
        sseClients.delete(clientId);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      sseClients.delete(clientId);
    });
  });

  // Protected Dashboard Snapshot
  app.get('/api/dashboard', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session?: SessionRecord }).session;
    if (upstreamConfigured) {
      await syncFromUpstream(session?.upstreamToken);
    }
    res.json(buildDashboardSnapshot());
  });

  // Protected Meetings List
  app.get('/api/meetings', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session?: SessionRecord }).session;
    if (upstreamConfigured) {
      try {
        const remote = await upstreamFetch<Meeting[]>(
          '/api/meetings',
          { method: 'GET' },
          session?.upstreamToken,
        );
        if (Array.isArray(remote)) {
          bffStore.meetings = remote;
        }
      } catch {
        // Keep last valid meetings on transient failure
      }
    }
    res.json(bffStore.meetings);
  });

  // Protected Create Meeting (Draft or Finalized)
  app.post('/api/meetings', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session: SessionRecord }).session;
    const body = (req.body ?? {}) as Partial<Meeting>;

    if (body.kind === 'daily_operacional' && !body.linkedMeetingId) {
      res.status(400).json({
        error:
          'Toda Daily Operacional deve estar vinculada a um Alinhamento Semanal ou a uma Daily anterior.',
      });
      return;
    }

    if (body.linkedMeetingId) {
      const target = bffStore.meetings.find((m) => m.id === body.linkedMeetingId);
      if (target) {
        body.linkedMeetingTitle = target.title;
        body.linkedMeetingKind = target.kind;
      }
    }

    if (upstreamConfigured) {
      try {
        const created = await upstreamFetch<Meeting>(
          '/api/meetings',
          { method: 'POST', body: JSON.stringify(body) },
          session.upstreamToken,
        );
        const normalized = normalizeMeetingInput(created);
        bffStore.meetings = [normalized, ...bffStore.meetings.filter((m) => m.id !== normalized.id)];
        appendAuditLog({
          eventType: 'meeting_created',
          meetingId: normalized.id,
          externalMeetingId: normalized.externalMeetingId,
          actor: session.user.displayName,
          summary: `Reunião criada (${normalized.title}).`,
          idempotentAction: 'created',
        });
        broadcastSse('meeting:updated', normalized);
        broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
        res.status(201).json(normalized);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar reunião no upstream.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const meeting = normalizeMeetingInput(body);
    bffStore.meetings = [meeting, ...bffStore.meetings];
    appendAuditLog({
      eventType: 'meeting_created',
      meetingId: meeting.id,
      externalMeetingId: meeting.externalMeetingId,
      actor: session.user.displayName,
      summary: `Reunião criada (${meeting.title}).`,
      idempotentAction: 'created',
    });
    broadcastSse('meeting:updated', meeting);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    res.status(201).json(meeting);
  });

  // Protected Update Meeting
  app.put('/api/meetings/:id', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session: SessionRecord }).session;
    const { id } = req.params;
    const existing = bffStore.meetings.find((m) => m.id === id);

    if (!existing && !upstreamConfigured) {
      res.status(404).json({ error: 'Reunião não encontrada.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<Meeting>;

    if (upstreamConfigured) {
      try {
        const updatedRemote = await upstreamFetch<Meeting>(
          `/api/meetings/${encodeURIComponent(String(id))}`,
          { method: 'PUT', body: JSON.stringify(body) },
          session.upstreamToken,
        );
        const normalized = normalizeMeetingInput(updatedRemote, existing);
        bffStore.meetings = [
          normalized,
          ...bffStore.meetings.filter((m) => m.id !== normalized.id),
        ];
        broadcastSse('meeting:updated', normalized);
        broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
        res.json(normalized);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar reunião.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const updated = normalizeMeetingInput(body, existing);
    bffStore.meetings = bffStore.meetings.map((m) => (m.id === id ? updated : m));
    broadcastSse('meeting:updated', updated);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    res.json(updated);
  });

  // Protected Finalize Meeting
  app.post('/api/meetings/:id/finalize', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session: SessionRecord }).session;
    const { id } = req.params;
    const existing = bffStore.meetings.find((m) => m.id === id);

    if (!existing && !upstreamConfigured) {
      res.status(404).json({ error: 'Reunião não encontrada.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<Meeting>;
    const now = new Date().toISOString();

    if (upstreamConfigured) {
      try {
        const finalizedRemote = await upstreamFetch<Meeting>(
          `/api/meetings/${encodeURIComponent(String(id))}/finalize`,
          { method: 'POST', body: JSON.stringify(body) },
          session.upstreamToken,
        );
        const normalized = normalizeMeetingInput(
          { ...finalizedRemote, status: 'finalizada', active: true, finalizedAt: finalizedRemote.finalizedAt ?? now },
          existing,
        );
        bffStore.meetings = [
          normalized,
          ...bffStore.meetings.filter((m) => m.id !== normalized.id),
        ];
        appendAuditLog({
          eventType: 'meeting_finalized',
          meetingId: normalized.id,
          externalMeetingId: normalized.externalMeetingId,
          actor: session.user.displayName,
          summary: `Reunião finalizada e refletida no painel (${normalized.title}).`,
          idempotentAction: 'updated',
        });
        broadcastSse('meeting:synced', normalized);
        broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
        res.json(normalized);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao finalizar reunião.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const finalized = normalizeMeetingInput(
      { ...body, status: 'finalizada', active: true, finalizedAt: now },
      existing,
    );
    bffStore.meetings = bffStore.meetings.map((m) => (m.id === id ? finalized : m));
    appendAuditLog({
      eventType: 'meeting_finalized',
      meetingId: finalized.id,
      externalMeetingId: finalized.externalMeetingId,
      actor: session.user.displayName,
      summary: `Reunião finalizada e refletida no painel (${finalized.title}).`,
      idempotentAction: 'updated',
    });
    broadcastSse('meeting:synced', finalized);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    res.json(finalized);
  });

  // Protected Logical Inactivation (NEVER physically deletes)
  app.post('/api/meetings/:id/inactivate', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session: SessionRecord }).session;
    const { id } = req.params;
    const existing = bffStore.meetings.find((m) => m.id === id);

    if (!existing && !upstreamConfigured) {
      res.status(404).json({ error: 'Reunião não encontrada.' });
      return;
    }

    if (upstreamConfigured) {
      try {
        await upstreamFetch(
          `/api/meetings/${encodeURIComponent(String(id))}/inactivate`,
          { method: 'POST' },
          session.upstreamToken,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao inativar reunião.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const updated: Meeting = {
      ...(existing as Meeting),
      active: false,
      status: 'inativa',
      updatedAt: new Date().toISOString(),
    };
    bffStore.meetings = bffStore.meetings.map((m) => (m.id === id ? updated : m));
    appendAuditLog({
      eventType: 'meeting_inactivated',
      meetingId: updated.id,
      externalMeetingId: updated.externalMeetingId,
      actor: session.user.displayName,
      summary: `Reunião inativada logicamente (${updated.title}).`,
      idempotentAction: 'updated',
    });
    broadcastSse('meeting:updated', updated);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    res.json(updated);
  });

  // Protected Reactivation
  app.post('/api/meetings/:id/reactivate', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session: SessionRecord }).session;
    const { id } = req.params;
    const existing = bffStore.meetings.find((m) => m.id === id);

    if (!existing && !upstreamConfigured) {
      res.status(404).json({ error: 'Reunião não encontrada.' });
      return;
    }

    if (upstreamConfigured) {
      try {
        await upstreamFetch(
          `/api/meetings/${encodeURIComponent(String(id))}/reactivate`,
          { method: 'POST' },
          session.upstreamToken,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao reativar reunião.';
        res.status(502).json({ error: msg });
        return;
      }
    }

    const restoredStatus = existing?.finalizedAt ? 'finalizada' : 'rascunho';
    const updated: Meeting = {
      ...(existing as Meeting),
      active: true,
      status: restoredStatus,
      updatedAt: new Date().toISOString(),
    };
    bffStore.meetings = bffStore.meetings.map((m) => (m.id === id ? updated : m));
    appendAuditLog({
      eventType: 'meeting_reactivated',
      meetingId: updated.id,
      externalMeetingId: updated.externalMeetingId,
      actor: session.user.displayName,
      summary: `Reunião reativada (${updated.title}).`,
      idempotentAction: 'updated',
    });
    broadcastSse('meeting:updated', updated);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());
    res.json(updated);
  });

  // Idempotent Sync Endpoint for HEAL Ops -> Painel
  app.post('/api/integrations/meetings/sync', (req: Request, res: Response) => {
    const session = getValidSession(req);
    const syncHeader =
      (req.headers['x-heal-sync-token'] as string | undefined)?.trim() ??
      extractBearerToken(req) ??
      '';

    if (HEAL_OPS_SYNC_TOKEN) {
      const authorizedBySyncToken =
        syncHeader.length > 0 && verifyTimingSafeString(syncHeader, HEAL_OPS_SYNC_TOKEN);
      if (!authorizedBySyncToken && !session) {
        res.status(401).json({ error: 'Token de sincronização inválido.' });
        return;
      }
    } else if (!session) {
      res.status(401).json({
        error: 'Configure HEAL_OPS_SYNC_TOKEN ou autentique-se para sincronizar reuniões.',
      });
      return;
    }

    const raw = (req.body ?? {}) as Partial<Meeting>;
    if (!raw.externalMeetingId || typeof raw.externalMeetingId !== 'string') {
      res.status(400).json({ error: 'Campo obrigatório externalMeetingId ausente.' });
      return;
    }

    const cleanExternalId = raw.externalMeetingId.trim();
    const existing = bffStore.meetings.find(
      (m) => m.externalMeetingId === cleanExternalId,
    );

    const synced = normalizeMeetingInput(
      { ...raw, externalMeetingId: cleanExternalId },
      existing,
    );

    const action: 'created' | 'updated' = existing ? 'updated' : 'created';
    if (existing) {
      bffStore.meetings = bffStore.meetings.map((m) =>
        m.externalMeetingId === cleanExternalId ? synced : m,
      );
    } else {
      bffStore.meetings = [synced, ...bffStore.meetings];
    }

    appendAuditLog({
      eventType: 'meeting_synced',
      meetingId: synced.id,
      externalMeetingId: synced.externalMeetingId,
      actor: session?.user.displayName ?? 'Integração HEAL Ops',
      summary:
        action === 'created'
          ? `Reunião sincronizada com idempotência (${synced.title}).`
          : `Reunião atualizada sem duplicação via externalMeetingId (${synced.title}).`,
      idempotentAction: action,
    });

    broadcastSse('meeting:synced', synced);
    broadcastSse('dashboard:snapshot', buildDashboardSnapshot());

    res.status(existing ? 200 : 201).json({
      idempotentAction: action,
      meeting: synced,
    });
  });

  // Protected Managerial Agent (Backend/Ollama only, zero frontend invention)
  app.get('/api/agent', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session?: SessionRecord }).session;
    if (upstreamConfigured) {
      try {
        const remote = await upstreamFetch<AgentSummary | null>(
          '/api/agent',
          { method: 'GET' },
          session?.upstreamToken,
        );
        bffStore.agentSummary = remote;
      } catch {
        // Keep last valid summary if transient error occurs
      }
    }
    res.json({
      summary: bffStore.agentSummary,
      upstreamConfigured,
    });
  });

  // Protected Audit & Reconciliation Trail
  app.get('/api/audit', requireAuth, async (req: Request, res: Response) => {
    const session = (req as Request & { session?: SessionRecord }).session;
    if (upstreamConfigured) {
      try {
        const remote = await upstreamFetch<AuditEntry[]>(
          '/api/audit',
          { method: 'GET' },
          session?.upstreamToken,
        );
        if (Array.isArray(remote)) {
          return res.json(remote);
        }
      } catch {
        // Fallback to BFF audit logs recorded locally
      }
    }
    res.json(bffStore.auditLogs);
  });

  // Low-latency background upstream incremental check when configured
  if (upstreamConfigured) {
    void syncFromUpstream();
    setInterval(() => {
      if (sseClients.size > 0) {
        void syncFromUpstream();
      }
    }, 5000);

    // Optional upstream SSE listener when HEAL_OPS_EVENTS_URL is provided
    if (isValidHttpUrl(HEAL_OPS_EVENTS_URL)) {
      const connectUpstreamSse = async () => {
        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (HEAL_OPS_API_TOKEN) {
            headers.Authorization = `Bearer ${HEAL_OPS_API_TOKEN}`;
          }
          const resp = await fetch(HEAL_OPS_EVENTS_URL, { headers });
          if (!resp.ok || !resp.body) {
            throw new Error(`Upstream SSE status ${resp.status}`);
          }
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() ?? '';
            for (const chunk of chunks) {
              if (chunk.includes('data:')) {
                void syncFromUpstream();
              }
            }
          }
        } catch {
          setTimeout(() => void connectUpstreamSse(), 5000);
        }
      };
      void connectUpstreamSse();
    }
  }

  // Mount Vite middleware in development, or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HEAL Daily Operacional BFF ouvindo na porta ${PORT}`);
  });
}

void startServer();
