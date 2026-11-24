import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from 'lucide-react';
import type { EvolutionPeriod } from '../types';
import { formatEvolutionRange } from '../utils/datetime';

interface EvolutionBarProps {
  periods: EvolutionPeriod[];
}

export function EvolutionBar({ periods }: EvolutionBarProps) {
  return (
    <section
      aria-label="Nossa Evolução"
      className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-baseline gap-2 shrink-0">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Nossa Evolução
          </h2>
        </div>

        {periods.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Aguardando registros de evolução operacional da API HEAL Ops.
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-2.5 lg:grid-cols-4">
            {periods.slice(0, 4).map((period) => {
              const rangeLabel = formatEvolutionRange(period.startDate, period.endDate);
              const StatusIcon =
                period.goalStatus === 'atingida'
                  ? CheckCircle2
                  : period.goalStatus === 'abaixo'
                    ? AlertTriangle
                    : period.goalStatus === 'em_andamento'
                      ? Clock3
                      : HelpCircle;

              const statusColor =
                period.goalStatus === 'atingida'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : period.goalStatus === 'abaixo'
                    ? 'text-rose-700 dark:text-rose-400'
                    : period.goalStatus === 'em_andamento'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-600 dark:text-slate-400';

              return (
                <div
                  key={period.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {rangeLabel}
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-50 tabular-nums truncate">
                      {period.resultText}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${statusColor}`}>
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="whitespace-nowrap">{period.goalStatusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
