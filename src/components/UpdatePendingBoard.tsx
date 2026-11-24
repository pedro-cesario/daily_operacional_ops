import { ShieldAlert, UserX, Users } from 'lucide-react';
import type { Ticket } from '../types';
import {
  computePendingUpdateBoard,
  glpiFieldOrFallback,
} from '../utils/businessRules';

interface UpdatePendingBoardProps {
  tickets: Ticket[];
  thresholdHours: number;
  hasLoadedOnce: boolean;
}

function formatHoursLabel(hours: number | null): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) {
    return 'Não informado pelo GLPI';
  }
  return `${Math.round(hours)}h`;
}

function SpecialQueueCard({
  title,
  subtitle,
  total,
  oldestThree,
  remainingCount,
  icon,
  tone,
}: {
  title: string;
  subtitle: string;
  total: number;
  oldestThree: Ticket[];
  remainingCount: number;
  icon: React.ReactNode;
  tone: 'amber' | 'sky';
}) {
  const countColor =
    total === 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-sky-700 dark:text-sky-400';

  return (
    <div className="flex min-h-0 flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="min-h-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-700/80 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
              {icon}
              <span className="truncate">{title}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          </div>
          <div className={`font-mono text-2xl font-extrabold tabular-nums shrink-0 ${countColor}`}>
            {total}
          </div>
        </div>

        {oldestThree.length === 0 ? (
          <div className="flex flex-1 items-center py-2 text-xs text-slate-500 dark:text-slate-400">
            Nenhum chamado pendente de atualização.
          </div>
        ) : (
          <ul className="mt-2 flex-1 space-y-1.5 overflow-hidden">
            {oldestThree.map((ticket) => (
              <li
                key={String(ticket.id)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    #{ticket.id}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-400 tabular-nums whitespace-nowrap">
                    {formatHoursLabel(ticket.hoursWithoutUpdate)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  {glpiFieldOrFallback(ticket.title)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {remainingCount > 0 && (
        <div className="mt-2 pt-1.5 border-t border-slate-200/80 dark:border-slate-700/80 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
          +{remainingCount} {remainingCount === 1 ? 'chamado' : 'chamados'}
        </div>
      )}
    </div>
  );
}

export function UpdatePendingBoard({
  tickets,
  thresholdHours,
  hasLoadedOnce,
}: UpdatePendingBoardProps) {
  const board = computePendingUpdateBoard(tickets, thresholdHours);

  return (
    <section
      aria-label="Chamados pendentes de atualização"
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-300 bg-white px-5 py-3.5 dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Prominent Board Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 pb-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 xl:text-2xl">
            Chamados pendentes de atualização
          </h2>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Atividade técnica efetiva acima de{' '}
            <span className="font-mono font-bold tabular-nums">{thresholdHours}</span>{' '}
            horas · automações não contam
          </p>
        </div>

        <div className="flex items-baseline gap-2.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Total geral
          </span>
          <span
            className={`font-mono text-4xl font-extrabold tracking-tight tabular-nums xl:text-5xl ${
              board.totalStale > 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {hasLoadedOnce ? board.totalStale : '—'}
          </span>
        </div>
      </div>

      {/* Main Content: Nominal Technicians + 2 Side-by-Side Special Queues */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Nominal Technicians Ranking */}
        <div className="flex min-h-0 flex-col lg:col-span-7">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <Users className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Técnicos nominais (maior para menor)</span>
            </h3>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {board.technicianCounts.length}{' '}
              {board.technicianCounts.length === 1 ? 'técnico' : 'técnicos'}
            </span>
          </div>

          {!hasLoadedOnce ? (
            <div className="flex flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              Conectando à fonte operacional para listar pendências por técnico...
            </div>
          ) : board.technicianCounts.length === 0 ? (
            <div className="flex flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
              Nenhum técnico nominal com chamados acima de {thresholdHours}h sem atualização efetiva.
            </div>
          ) : (
            (() => {
              const count = board.technicianCounts.length;
              const gridColsClass =
                count <= 6
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : count <= 12
                    ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';
              const cardPaddingClass =
                count <= 6
                  ? 'px-4 py-3'
                  : count <= 12
                    ? 'px-3.5 py-2'
                    : 'px-3 py-1.5';
              const nameSizeClass =
                count <= 6
                  ? 'text-base xl:text-lg'
                  : count <= 12
                    ? 'text-sm xl:text-base'
                    : 'text-xs xl:text-sm';
              const countSizeClass =
                count <= 6
                  ? 'text-2xl xl:text-3xl'
                  : count <= 12
                    ? 'text-xl xl:text-2xl'
                    : 'text-lg xl:text-xl';

              return (
                <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 ${gridColsClass}`}>
                  {board.technicianCounts.map((tech) => (
                    <div
                      key={tech.technicianId}
                      className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40 ${cardPaddingClass}`}
                    >
                      <span
                        className={`font-display font-bold text-slate-900 dark:text-slate-50 truncate ${nameSizeClass}`}
                      >
                        {tech.name}
                      </span>
                      <span
                        className={`font-mono font-extrabold tabular-nums shrink-0 ${countSizeClass} ${
                          tech.count >= 10
                            ? 'text-rose-700 dark:text-rose-400'
                            : tech.count >= 5
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {tech.count}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>

        {/* Right: Special Queues A & B Side-by-Side */}
        <div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-5">
          <SpecialQueueCard
            title="Sem técnico atribuído"
            subtitle="Exclui Vertical | Plantonista"
            total={board.unassignedQueue.total}
            oldestThree={board.unassignedQueue.oldestThree}
            remainingCount={board.unassignedQueue.remainingCount}
            icon={<UserX className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />}
            tone="amber"
          />

          <SpecialQueueCard
            title="Vertical | Plantonista"
            subtitle="Grupo técnico especial"
            total={board.plantonistaQueue.total}
            oldestThree={board.plantonistaQueue.oldestThree}
            remainingCount={board.plantonistaQueue.remainingCount}
            icon={<ShieldAlert className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />}
            tone="sky"
          />
        </div>
      </div>
    </section>
  );
}
