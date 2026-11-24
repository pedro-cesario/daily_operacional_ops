export const SAO_PAULO_TZ = 'America/Sao_Paulo';

const WEEKDAYS_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

export function getSaoPauloParts(dateInput: Date | string = new Date()): {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
  weekdayName: string;
  hour: number;
  minute: number;
} {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekdayShort = get('weekday').toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekdayIndex = weekdayMap[weekdayShort.slice(0, 3)] ?? date.getDay();

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekdayIndex,
    weekdayName: WEEKDAYS_PT[weekdayIndex] ?? '',
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

export function formatHeaderDate(dateInput: Date | string = new Date()): {
  dateLabel: string;
  weekdayLabel: string;
} {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  const { weekdayName } = getSaoPauloParts(date);
  return {
    dateLabel,
    weekdayLabel: weekdayName,
  };
}

export function formatTimeSaoPaulo(isoString: string | null | undefined): string {
  if (!isoString) return 'Não informado pelo GLPI';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return 'Não informado pelo GLPI';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatDateTimeSaoPaulo(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatShortDateSaoPaulo(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  // Handle pure YYYY-MM-DD safely without UTC shift
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoOrDate.trim());
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}`;
  }
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
  }).format(parsed);
}

/**
 * Formats an evolution range strictly as "15/11 à 21/11" in pt-BR / America/Sao_Paulo.
 */
export function formatEvolutionRange(startDate: string, endDate: string): string {
  return `${formatShortDateSaoPaulo(startDate)} à ${formatShortDateSaoPaulo(endDate)}`;
}

export function formatFullDateSaoPaulo(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoOrDate.trim());
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  }
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function normalizeWeekdayKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace('-feira', '')
    .trim();
}

export function getTodayWeekdayNames(): {
  full: string;
  normalized: string;
} {
  const { weekdayName } = getSaoPauloParts(new Date());
  return {
    full: weekdayName,
    normalized: normalizeWeekdayKey(weekdayName),
  };
}
