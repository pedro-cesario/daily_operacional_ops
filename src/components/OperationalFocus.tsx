import { Target } from 'lucide-react';
import type { Meeting } from '../types';
import { findTodayChallenge } from '../utils/businessRules';
import { formatFullDateSaoPaulo, getTodayWeekdayNames } from '../utils/datetime';

interface OperationalFocusProps {
  activeWeeklyAlignment: Meeting | null;
}

export function OperationalFocus({ activeWeeklyAlignment }: OperationalFocusProps) {
  const { full: todayWeekday } = getTodayWeekdayNames();
  const todayChallenge = findTodayChallenge(activeWeeklyAlignment);
  const priorities = activeWeeklyAlignment?.payload?.priorities ?? [];

  return (
    <section
      aria-label="Foco Operacional do Dia"
      className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">
            Foco Operacional do Dia
          </h2>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {todayWeekday}
        </span>
      </div>

      {!activeWeeklyAlignment ? (
        <div className="flex flex-1 items-center py-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          Sem meta vinculada
        </div>
      ) : (
        <div className="mt-2.5 grid flex-1 grid-cols-1 gap-3 md:grid-cols-12">
          {/* Today Challenge */}
          <div className="md:col-span-7 flex flex-col justify-center">
            {!todayChallenge ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                Nenhuma meta foi programada para este dia no Alinhamento Semanal.
              </div>
            ) : (
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 dark:border-sky-900/60 dark:bg-sky-950/30">
                <div className="font-display text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                  {todayChallenge.title}
                </div>
                <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-200 line-clamp-2">
                  {todayChallenge.objective}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>
                    Resp.: <strong className="font-semibold text-slate-900 dark:text-slate-100">{todayChallenge.owner || 'Não informado'}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Prazo: <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{formatFullDateSaoPaulo(todayChallenge.dueDate)}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Weekly Priorities */}
          <div className="md:col-span-5 border-t border-slate-100 pt-2 md:border-t-0 md:border-l md:pt-0 md:pl-3 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Prioridades da semana
            </div>
            {priorities.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sem prioridades registradas.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {priorities.slice(0, 3).map((p, idx) => (
                  <li
                    key={`${p.ticketId ?? p.title}-${idx}`}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {p.ticketId ? (
                        <span className="mr-1 font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                          #{p.ticketId}
                        </span>
                      ) : null}
                      {p.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                      {p.owner}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
