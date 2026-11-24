import type { DailyAgendaData } from '../types';
import { glpiFieldOrFallback } from '../utils/businessRules';
import { formatFullDateSaoPaulo } from '../utils/datetime';

interface DailyAgendaProps {
  agenda: DailyAgendaData | null;
}

export function DailyAgenda({ agenda }: DailyAgendaProps) {
  const priorityTickets = agenda?.priorityTickets ?? [];
  const pendingAndDecisions = agenda?.pendingAndDecisions ?? [];
  const opportunities = agenda?.opportunitiesOfDay ?? [];
  const countingInGoal = agenda?.ticketsCountingInGoal ?? [];
  const sameDayExcluded = agenda?.sameDayExcludedTickets ?? [];
  const directives = agenda?.operationalDirectives ?? [];

  return (
    <section aria-label="Pauta Objetiva da Daily" className="shrink-0">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {/* 1. Chamados prioritários */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-1.5 dark:border-slate-800 truncate">
            Chamados prioritários
          </h3>
          {priorityTickets.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhum prioritário registrado.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {priorityTickets.slice(0, 3).map((item, idx) => (
                <li key={`${item.ticketId ?? item.title}-${idx}`} className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.ticketId ? (
                      <span className="mr-1 font-mono text-[11px] text-sky-700 dark:text-sky-400 tabular-nums">
                        #{item.ticketId}
                      </span>
                    ) : null}
                    {item.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {item.owner} · {formatFullDateSaoPaulo(item.dueDate)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 2. Pendências e decisões */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-1.5 dark:border-slate-800 truncate">
            Pendências e decisões
          </h3>
          {pendingAndDecisions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhuma pendência ou decisão.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {pendingAndDecisions.slice(0, 3).map((item) => (
                <li key={item.id} className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  <span className="mr-1 font-bold text-slate-500 dark:text-slate-400">
                    {item.kind === 'decisao' ? 'Decisão ·' : 'Pend. ·'}
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Oportunidades do dia */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-1.5 dark:border-slate-800 truncate">
            Oportunidades do dia
          </h3>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhuma oportunidade registrada.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {opportunities.slice(0, 3).map((opp, idx) => (
                <li key={idx} className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  {opp}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 4. Chamados que contam na meta */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
            <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              Contam na meta
            </h3>
            <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400 tabular-nums">
              {countingInGoal.length}
            </span>
          </div>
          {countingInGoal.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhum chamado elegível.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {countingInGoal.slice(0, 3).map((t) => (
                <li key={String(t.id)} className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  <span className="mr-1 font-mono text-[11px] font-bold tabular-nums">
                    #{t.id}
                  </span>
                  {glpiFieldOrFallback(t.title)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 5. Excluídos da meta (abertura e fechamento no mesmo dia) */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
            <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              Excluídos (mesmo dia)
            </h3>
            <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {sameDayExcluded.length}
            </span>
          </div>
          {sameDayExcluded.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhum excluído no mesmo dia.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {sameDayExcluded.slice(0, 3).map((t) => (
                <li key={String(t.id)} className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  <span className="mr-1 font-mono text-[11px] font-bold tabular-nums">
                    #{t.id}
                  </span>
                  {glpiFieldOrFallback(t.title)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 6. Direcionamentos operacionais */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-1.5 dark:border-slate-800 truncate">
            Direcionamentos
          </h3>
          {directives.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nenhum direcionamento publicado.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {directives.slice(0, 3).map((dir, idx) => (
                <li key={idx} className="text-xs text-slate-800 dark:text-slate-200 truncate">
                  {dir}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
