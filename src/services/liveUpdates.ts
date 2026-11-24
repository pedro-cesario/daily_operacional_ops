import type { LiveUpdateEvent } from '../types';
import { getAuthToken } from './api';

export type ConnectionDisplayState = 'connected' | 'reconnecting' | 'stale';

export interface LiveUpdatesHandlers {
  onEvent: (event: LiveUpdateEvent) => void;
  onStatusChange: (status: ConnectionDisplayState) => void;
  onUnauthorized: () => void;
}

const HEARTBEAT_STALE_TIMEOUT_MS = 35000;

export function connectLiveUpdates(handlers: LiveUpdatesHandlers): () => void {
  let closed = false;
  let retryAttempt = 0;
  let abortController: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  let hasReceivedDataOnce = false;

  const clearTimers = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (staleTimer) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  };

  const armStaleWatchdog = () => {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      if (!closed && hasReceivedDataOnce) {
        handlers.onStatusChange('stale');
      }
    }, HEARTBEAT_STALE_TIMEOUT_MS);
  };

  const scheduleReconnect = () => {
    if (closed) return;
    retryAttempt += 1;
    handlers.onStatusChange(hasReceivedDataOnce && retryAttempt > 2 ? 'stale' : 'reconnecting');
    const delayMs = Math.min(15000, 1000 * Math.pow(1.6, Math.min(retryAttempt - 1, 5)));
    retryTimer = setTimeout(() => {
      void startStream();
    }, delayMs);
  };

  const parseSseBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawJson = dataLines.join('\n');
    try {
      const parsed = JSON.parse(rawJson) as LiveUpdateEvent;
      hasReceivedDataOnce = true;
      armStaleWatchdog();
      if (parsed.type === 'sync:status') {
        const statusPayload = parsed.payload as { stale?: boolean } | undefined;
        if (statusPayload?.stale) {
          handlers.onStatusChange('stale');
        } else {
          handlers.onStatusChange('connected');
        }
      } else {
        handlers.onStatusChange('connected');
      }
      handlers.onEvent({
        ...parsed,
        type: (parsed.type ?? eventName) as LiveUpdateEvent['type'],
      });
    } catch {
      // Ignore malformed chunk gracefully
    }
  };

  const startStream = async () => {
    if (closed) return;
    const token = getAuthToken();
    if (!token) {
      handlers.onUnauthorized();
      return;
    }

    abortController = new AbortController();
    try {
      const response = await fetch('/api/events', {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        signal: abortController.signal,
      });

      if (response.status === 401) {
        handlers.onUnauthorized();
        return;
      }

      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      retryAttempt = 0;
      handlers.onStatusChange('connected');
      armStaleWatchdog();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          parseSseBlock(block);
        }
      }

      if (!closed) {
        scheduleReconnect();
      }
    } catch {
      if (!closed) {
        scheduleReconnect();
      }
    }
  };

  void startStream();

  return () => {
    closed = true;
    clearTimers();
    abortController?.abort();
  };
}
