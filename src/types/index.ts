export type GlpiTicketStatus = 1 | 2 | 3 | 4 | 5 | 6;

export interface Technician {
  id: number | string;
  name: string;
  username: string;
}

export interface TechnicalGroup {
  id: number | string;
  name: string;
}

export interface Ticket {
  id: number | string;
  title: string;
  status: number;
  statusLabel: string;
  priority: number;
  priorityLabel: string;
  technicians: Technician[];
  groups: TechnicalGroup[];
  hoursWithoutUpdate: number | null;
  isStale: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  category: string | null;
  isBacklog?: boolean;
  countsInGoal?: boolean;
  excludedSameDayOpenClose?: boolean;
  lastEffectiveUpdateAt?: string | null;
}

export interface Priority {
  ticketId?: number | string | null;
  title: string;
  owner: string;
  support: string;
  dueDate: string;
  nextAction: string;
  justification: string;
}

export interface DailyChallenge {
  weekday: string;
  title: string;
  objective: string;
  owner: string;
  dueDate: string;
}

export interface MeetingDecision {
  id: string;
  description: string;
  owner?: string;
  dueDate?: string;
}

export interface MeetingCommitment {
  id: string;
  description: string;
  owner: string;
  dueDate: string;
  status?: 'pendente' | 'em_andamento' | 'concluido';
}

export interface MeetingPendingFollowUp {
  id: string;
  description: string;
  owner?: string;
  dueDate?: string;
}

export interface MeetingMetricsSnapshot {
  activeTickets?: number;
  inProgressTickets?: number;
  pendingTickets?: number;
  criticalTickets?: number;
  staleTickets?: number;
  newTickets?: number;
  solvedToday?: number | null;
  capturedAt?: string;
}

export interface MeetingPayload {
  participants: string[];
  goals: string[];
  decisions: MeetingDecision[];
  commitments: MeetingCommitment[];
  challenges: DailyChallenge[];
  pendingFollowUps: MeetingPendingFollowUp[];
  priorities: Priority[];
  metricsSnapshot: MeetingMetricsSnapshot | null;
  opportunities?: string[];
  operationalDirectives?: string[];
  resultsSummary?: string;
}

export type MeetingKind = 'daily_operacional' | 'alinhamento_semanal';
export type MeetingStatus = 'rascunho' | 'finalizada' | 'inativa';

export interface Meeting {
  id: string;
  externalMeetingId: string;
  kind: MeetingKind;
  title: string;
  referenceDate: string;
  weekStart: string;
  active: boolean;
  status: MeetingStatus;
  durationMinutes?: number | null;
  template?: string | null;
  linkedMeetingId?: string | null;
  linkedMeetingTitle?: string | null;
  linkedMeetingKind?: MeetingKind | null;
  payload: MeetingPayload;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

export interface SyncState {
  connected: boolean;
  sourceCheckedAt: string | null;
  changeDetectedAt: string | null;
  stale: boolean;
  lastSuccessfulUpdate: string | null;
  upstreamConfigured?: boolean;
  upstreamError?: string | null;
}

export interface EvolutionPeriod {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
  resultText: string;
  resultValue?: number | null;
  goalStatus: 'atingida' | 'em_andamento' | 'abaixo' | 'nao_informada';
  goalStatusLabel: string;
}

export interface OperationalIndicators {
  activeCount: number;
  inProgressCount: number; // GLPI status 2 + 3
  pendingCount: number; // GLPI status 4
  criticalCount: number;
  staleCount: number;
  newCount: number;
  solvedTodayCount: number | null; // Optional from backend
  staleThresholdHours: number;
}

export interface DailyAgendaData {
  priorityTickets: Priority[];
  pendingAndDecisions: Array<{
    id: string;
    kind: 'pendencia' | 'decisao';
    text: string;
    owner?: string;
    dueDate?: string;
  }>;
  opportunitiesOfDay: string[];
  ticketsCountingInGoal: Ticket[];
  sameDayExcludedTickets: Ticket[];
  operationalDirectives: string[];
}

export interface AgentSummary {
  id: string;
  generatedAt: string | null;
  modelName?: string | null;
  executiveSummary: string | null;
  facts: string[];
  risks: string[];
  recommendations: string[];
  evidences: Array<{
    label: string;
    detail: string;
    referenceId?: string;
  }>;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  eventType:
    | 'meeting_synced'
    | 'meeting_created'
    | 'meeting_finalized'
    | 'meeting_inactivated'
    | 'meeting_reactivated'
    | 'glpi_sync'
    | 'auth_event';
  externalMeetingId?: string | null;
  meetingId?: string | null;
  actor: string;
  summary: string;
  idempotentAction?: 'created' | 'updated' | 'deduplicated' | 'n/a';
}

export interface DashboardSnapshot {
  evolution: EvolutionPeriod[];
  tickets: Ticket[];
  staleThresholdHours: number;
  indicators: OperationalIndicators | null;
  activeWeeklyAlignment: Meeting | null;
  latestFinalizedDaily: Meeting | null;
  dailyAgenda: DailyAgendaData | null;
  agentSummary: AgentSummary | null;
  meetings: Meeting[];
  auditLogs: AuditEntry[];
  syncState: SyncState;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: AuthUser | null;
  needsFirstRunSetup: boolean;
  upstreamConfigured: boolean;
  authMode: 'upstream' | 'env_admin' | 'first_run_bootstrap';
}

export interface LiveUpdateEvent {
  type:
    | 'dashboard:snapshot'
    | 'tickets:updated'
    | 'meeting:synced'
    | 'meeting:updated'
    | 'agent:updated'
    | 'sync:heartbeat'
    | 'sync:status';
  timestamp: string;
  payload: unknown;
}
