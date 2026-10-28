// Formats for the execution screen: step durations and times of day.
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';

const MISSING = '—';

const timeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: COMPANY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// 180000 → "3 min", 200500 → "3 min 20 s", 3900000 → "1 h 5 min". Seconds are rounded down.
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return MISSING;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
  return `${seconds} s`;
}

// "2026-10-27T13:05:00.000Z" → "10:05", in Buenos Aires time.
export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return MISSING;
  return timeFormat.format(date);
}
