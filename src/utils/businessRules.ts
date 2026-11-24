import type {
  DailyChallenge,
  Meeting,
  OperationalIndicators,
  Ticket,
} from '../types';
import { getTodayWeekdayNames, normalizeWeekdayKey } from './datetime';

export const NOT_INFORMED_BY_GLPI = 'Não informado pelo GLPI';
export const VERTICAL_PLANTONISTA_NAME = 'Vertical | Plantonista';

export function glpiFieldOrFallback(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NOT_INFORMED_BY_GLPI;
}

export function isVerticalPlantonistaTicket(ticket: Ticket): boolean {
  return ticket.groups.some(
    (g) => g.name.trim().toLowerCase() === VERTICAL_PLANTONISTA_NAME.toLowerCase(),
  );
}

export function hasNominalTechnician(ticket: Ticket): boolean {
  return Array.isArray(ticket.technicians) && ticket.technicians.some((t) => Boolean(t?.name?.trim()));
}

/**
 * GLPI closed (6), solved (5), or deleted/unknown outside 1..4 do not enter the open operational portfolio.
 */
export function isOpenOperationalTicket(ticket: Ticket): boolean {
  return ticket.status === 1 || ticket.status === 2 || ticket.status === 3 || ticket.status === 4;
}

export function getGlpiStatusDisplay(status: number, rawLabel?: string | null): string {
  switch (status) {
    case 1:
      return 'Novo';
    case 2:
    case 3:
      return 'Em atendimento';
    case 4:
      return 'Pendente';
    case 5:
      return 'Solucionado';
    case 6:
      return 'Fechado';
    default:
      return glpiFieldOrFallback(rawLabel);
  }
}

export function isCriticalPriority(ticket: Ticket): boolean {
  const label = (ticket.priorityLabel ?? '').toLowerCase();
  return (
    ticket.priority >= 5 ||
    label.includes('crític') ||
    label.includes('critic') ||
    label.includes('muito alta') ||
    label.includes('urgent')
  );
}

export function isTicketPendingUpdate(ticket: Ticket, thresholdHours: number): boolean {
  if (!isOpenOperationalTicket(ticket)) return false;
  if (ticket.isStale) return true;
  if (typeof ticket.hoursWithoutUpdate === 'number' && Number.isFinite(ticket.hoursWithoutUpdate)) {
    return ticket.hoursWithoutUpdate > thresholdHours;
  }
  return false;
}

export interface StaleBoardSummary {
  totalStale: number;
  technicianCounts: Array<{
    technicianId: string;
    name: string;
    count: number;
  }>;
  unassignedQueue: {
    total: number;
    oldestThree: Ticket[];
    remainingCount: number;
  };
  plantonistaQueue: {
    total: number;
    oldestThree: Ticket[];
    remainingCount: number;
  };
}

export function computePendingUpdateBoard(
  tickets: Ticket[],
  thresholdHours: number,
): StaleBoardSummary {
  const openTickets = tickets.filter(isOpenOperationalTicket);
  const staleTickets = openTickets.filter((t) => isTicketPendingUpdate(t, thresholdHours));

  const techMap = new Map<string, { technicianId: string; name: string; count: number }>();
  const unassignedStale: Ticket[] = [];
  const plantonistaStale: Ticket[] = [];

  for (const ticket of staleTickets) {
    const isPlantonista = isVerticalPlantonistaTicket(ticket);
    const hasTech = hasNominalTechnician(ticket);

    if (hasTech) {
      for (const tech of ticket.technicians) {
        const cleanName = tech.name?.trim();
        if (!cleanName) continue;
        const key = String(tech.id ?? cleanName);
        const existing = techMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          techMap.set(key, {
            technicianId: key,
            name: cleanName,
            count: 1,
          });
        }
      }
    }

    if (isPlantonista) {
      plantonistaStale.push(ticket);
    } else if (!hasTech) {
      unassignedStale.push(ticket);
    }
  }

  const sortByOldestHoursDesc = (a: Ticket, b: Ticket) => {
    const hoursA = a.hoursWithoutUpdate ?? -1;
    const hoursB = b.hoursWithoutUpdate ?? -1;
    if (hoursB !== hoursA) return hoursB - hoursA;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    return dateA - dateB;
  };

  unassignedStale.sort(sortByOldestHoursDesc);
  plantonistaStale.sort(sortByOldestHoursDesc);

  const technicianCounts = Array.from(techMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  return {
    totalStale: staleTickets.length,
    technicianCounts,
    unassignedQueue: {
      total: unassignedStale.length,
      oldestThree: unassignedStale.slice(0, 3),
      remainingCount: Math.max(0, unassignedStale.length - 3),
    },
    plantonistaQueue: {
      total: plantonistaStale.length,
      oldestThree: plantonistaStale.slice(0, 3),
      remainingCount: Math.max(0, plantonistaStale.length - 3),
    },
  };
}

/**
 * Alerts for new tickets (status 1) WITHOUT a nominal technician.
 * Note: Vertical | Plantonista has no nominal technician unless assigned, or follows explicit rule:
 * "Mostrar alerta visual para chamado novo sem técnico nominal."
 */
export function getNewUnassignedAlertTickets(tickets: Ticket[]): Ticket[] {
  return tickets
    .filter((t) => t.status === 1 && !hasNominalTechnician(t))
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
}

export function deriveOperationalIndicators(
  tickets: Ticket[],
  thresholdHours: number,
  backendIndicators?: OperationalIndicators | null,
): OperationalIndicators {
  if (backendIndicators) {
    return backendIndicators;
  }

  const open = tickets.filter(isOpenOperationalTicket);
  return {
    activeCount: open.length,
    inProgressCount: open.filter((t) => t.status === 2 || t.status === 3).length,
    pendingCount: open.filter((t) => t.status === 4).length,
    criticalCount: open.filter(isCriticalPriority).length,
    staleCount: open.filter((t) => isTicketPendingUpdate(t, thresholdHours)).length,
    newCount: open.filter((t) => t.status === 1).length,
    solvedTodayCount: null,
    staleThresholdHours: thresholdHours,
  };
}

export function findTodayChallenge(alignment: Meeting | null): DailyChallenge | null {
  if (!alignment || !alignment.active || alignment.status !== 'finalizada') {
    return null;
  }
  const { normalized } = getTodayWeekdayNames();
  const challenges = alignment.payload?.challenges ?? [];
  return (
    challenges.find((ch) => normalizeWeekdayKey(ch.weekday) === normalized) ?? null
  );
}
