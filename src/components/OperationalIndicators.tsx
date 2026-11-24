import type { OperationalIndicators as OperationalIndicatorsType } from '../types';

interface OperationalIndicatorsProps {
  indicators: OperationalIndicatorsType;
  hasTicketData: boolean;
}

interface IndicatorCardItem {
  key: string;
  label: string;
  sublabel: string;
  value: number;
  tone: 'neutral' | 'sky' | 'amber' | 'rose' | 'emerald';
}

export function OperationalIndicators({
  indicators,
  hasTicketData,
}: OperationalIndicatorsProps) {
  const cards: IndicatorCardItem[] = [
    {
      key: 'active',
      label: 'Chamados ativos',
      sublabel: 'Carteira aberta',
      value: indicators.activeCount,
      tone: 'neutral',
    },
    {
      key: 'inProgress',
      label: 'Em atendimento',
      sublabel: 'Status 2 + 3',
      value: indicators.inProgressCount,
      tone: 'sky',
    },
    {
      key: 'pending',
      label: 'Pendentes',
      sublabel: 'Status 4 GLPI',
      value: indicators.pendingCount,
      tone: 'amber',
    },
    {
      key: 'critical',
      label: 'Críticos',
      sublabel: 'Prioridade crítica',
      value: indicators.criticalCount,
      tone: indicators.criticalCount > 0 ? 'rose' : 'neutral',
    },
    {
      key: 'stale',
      label: 'Sem atualização',
      sublabel: `Acima de ${indicators.staleThresholdHours}h`,
      value: indicators.staleCount,
      tone: indicators.staleCount > 0 ? 'rose' : 'neutral',
    },
    {
      key: 'new',
      label: 'Novos chamados',
      sublabel: 'Status novo',
      value: indicators.newCount,
      tone: indicators.newCount > 0 ? 'amber' : 'neutral',
    },
  ];

  if (typeof indicators.solvedTodayCount === 'number') {
    cards.push({
      key: 'solvedToday',
      label: 'Solucionados hoje',
      sublabel: 'Encerrados no dia',
      value: indicators.solvedTodayCount,
      tone: 'emerald',
    });
  }

  const toneValueClasses: Record<IndicatorCardItem['tone'], string> = {
    neutral: 'text-slate-900 dark:text-slate-50',
    sky: 'text-sky-700 dark:text-sky-400',
    amber: 'text-amber-700 dark:text-amber-400',
    rose: 'text-rose-700 dark:text-rose-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
  };

  return (
    <section aria-label="Indicadores Operacionais" className="flex h-full flex-col">
      <div
        className={`grid flex-1 gap-2.5 ${
          cards.length >= 7
            ? 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-7'
            : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
        }`}
      >
        {cards.map((card) => (
          <div
            key={card.key}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {card.label}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {card.sublabel}
              </div>
            </div>
            <div
              className={`mt-2 font-mono text-3xl font-extrabold tracking-tight tabular-nums xl:text-4xl ${toneValueClasses[card.tone]}`}
            >
              {hasTicketData ? card.value : '—'}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
