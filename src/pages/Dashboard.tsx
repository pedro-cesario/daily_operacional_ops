import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { DashboardSnapshot } from '../types';
import type { ConnectionDisplayState } from '../services/liveUpdates';
import {
  deriveOperationalIndicators,
  getNewUnassignedAlertTickets,
} from '../utils/businessRules';
import { formatDateTimeSaoPaulo } from '../utils/datetime';
import { playNewTicketAlertTone } from '../utils/soundAlert';
import { EvolutionBar } from '../components/EvolutionBar';
import { NewTicketsAlert } from '../components/NewTicketsAlert';
import { OperationalFocus } from '../components/OperationalFocus';
import { OperationalIndicators } from '../components/OperationalIndicators';
import { UpdatePendingBoard } from '../components/UpdatePendingBoard';
import { DailyAgenda } from '../components/DailyAgenda';

interface DashboardProps {
  snapshot: DashboardSnapshot;
  hasLoadedOnce: boolean;
  connectionStatus: ConnectionDisplayState;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function Dashboard({
  snapshot,
  hasLoadedOnce,
  connectionStatus,
  soundEnabled,
  onToggleSound,
}: DashboardProps) {
  const newUnassignedTickets = getNewUnassignedAlertTickets(snapshot.tickets);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const initializedAlertsRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedOnce) return;

    const currentIds = new Set(newUnassignedTickets.map((t) => String(t.id)));
    if (!initializedAlertsRef.current) {
      seenAlertIdsRef.current = currentIds;
      initializedAlertsRef.current = true;
      return;
    }

    let hasBrandNew = false;
    for (const id of currentIds) {
      if (!seenAlertIdsRef.current.has(id)) {
        hasBrandNew = true;
        break;
      }
    }
    seenAlertIdsRef.current = currentIds;

    if (hasBrandNew && soundEnabled) {
      playNewTicketAlertTone();
    }
  }, [hasLoadedOnce, newUnassignedTickets, soundEnabled]);

  const indicators = deriveOperationalIndicators(
    snapshot.tickets,
    snapshot.staleThresholdHours,
    snapshot.indicators,
  );

  const hasTicketData =
    hasLoadedOnce &&
    (snapshot.syncState.upstreamConfigured === true ||
      snapshot.tickets.length > 0 ||
      snapshot.indicators !== null);

  const showStaleNotice =
    hasLoadedOnce && (connectionStatus === 'stale' || snapshot.syncState.stale);

  return (
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 min-h-0 flex-col gap-2.5 px-4 py-2.5 lg:px-6">
      {showStaleNotice && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>
              Dados desatualizados — exibindo o último registro válido até restabelecer conexão com o HEAL Ops.
            </span>
          </div>
          <span className="font-mono tabular-nums">
            Última atualização: {formatDateTimeSaoPaulo(snapshot.syncState.lastSuccessfulUpdate)}
          </span>
        </div>
      )}

      {/* 1. Nossa Evolução */}
      <EvolutionBar periods={snapshot.evolution} />

      {/* 2. Alertas de novos chamados (aparece dinamicamente quando há chamados novos sem técnico) */}
      <NewTicketsAlert
        tickets={newUnassignedTickets}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
      />

      {/* 3. Foco Operacional do Dia + 4. Indicadores Operacionais */}
      <div className="grid shrink-0 grid-cols-1 items-stretch gap-2.5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <OperationalFocus activeWeeklyAlignment={snapshot.activeWeeklyAlignment} />
        </div>
        <div className="lg:col-span-7">
          <OperationalIndicators
            indicators={indicators}
            hasTicketData={hasTicketData}
          />
        </div>
      </div>

      {/* 5. Quadro principal: Chamados pendentes de atualização (ocupa dinamicamente o espaço restante) */}
      <UpdatePendingBoard
        tickets={snapshot.tickets}
        thresholdHours={snapshot.staleThresholdHours}
        hasLoadedOnce={hasLoadedOnce}
      />

      {/* 6. Pauta Objetiva da Daily (grade fixa de 6 colunas no rodapé) */}
      <DailyAgenda agenda={snapshot.dailyAgenda} />
    </main>
  );
}
