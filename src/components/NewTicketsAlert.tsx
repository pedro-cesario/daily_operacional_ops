import { AlertCircle, Volume2, VolumeX } from 'lucide-react';
import type { Ticket } from '../types';
import { formatTimeSaoPaulo } from '../utils/datetime';
import { glpiFieldOrFallback } from '../utils/businessRules';

interface NewTicketsAlertProps {
  tickets: Ticket[];
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function NewTicketsAlert({
  tickets,
  soundEnabled,
  onToggleSound,
}: NewTicketsAlertProps) {
  if (tickets.length === 0) {
    return null;
  }

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Alertas de novos chamados sem técnico nominal"
      className="shrink-0 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <AlertCircle
            className="h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400"
            aria-hidden="true"
          />
          <span className="text-xs font-bold text-rose-900 dark:text-rose-100 whitespace-nowrap shrink-0">
            Novos sem técnico ({tickets.length}):
          </span>

          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
            {tickets.slice(0, 4).map((ticket) => (
              <div key={String(ticket.id)} className="flex items-baseline gap-1.5 text-xs">
                <span className="font-mono font-bold text-rose-800 dark:text-rose-300 tabular-nums">
                  #{ticket.id}
                </span>
                <span className="font-medium text-rose-950 dark:text-rose-50 max-w-[240px] truncate">
                  {glpiFieldOrFallback(ticket.title)}
                </span>
                <span className="font-mono text-rose-700 dark:text-rose-300 tabular-nums">
                  · {formatTimeSaoPaulo(ticket.createdAt)}
                </span>
              </div>
            ))}
            {tickets.length > 4 && (
              <span className="font-mono text-xs font-bold text-rose-800 dark:text-rose-300 tabular-nums">
                +{tickets.length - 4} chamados
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleSound}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-900 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-900 whitespace-nowrap shrink-0"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="h-3.5 w-3.5" />
              <span>Silenciar som</span>
            </>
          ) : (
            <>
              <VolumeX className="h-3.5 w-3.5" />
              <span>Ativar som</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
