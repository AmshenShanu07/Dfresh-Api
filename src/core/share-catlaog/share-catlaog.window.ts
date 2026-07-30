import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { IST_TZ } from 'src/common/utils/date-range';

// Re-exported so the many existing importers of IST_TZ from this module keep
// working; the single definition now lives in common/utils/date-range.ts.
export { IST_TZ };

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function ymdToWeekday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export function computeCurrentWindowStart(
  now: Date,
  daysOfWeek: string[],
  startTime: string,
  endTime: string,
): Date | null {
  if (!daysOfWeek || daysOfWeek.length === 0) return null;

  const todayIST = formatInTimeZone(now, IST_TZ, 'yyyy-MM-dd');
  const nowTime = formatInTimeZone(now, IST_TZ, 'HH:mm');
  const todayDow = ymdToWeekday(todayIST);
  const days = new Set(daysOfWeek.map((d) => d.toLowerCase()));

  if (startTime < endTime) {
    if (days.has(todayDow) && nowTime >= startTime && nowTime < endTime) {
      return fromZonedTime(`${todayIST}T${startTime}:00`, IST_TZ);
    }
    return null;
  }

  // Overnight: endTime <= startTime. (Equality rejected by DTO.)
  if (days.has(todayDow) && nowTime >= startTime) {
    return fromZonedTime(`${todayIST}T${startTime}:00`, IST_TZ);
  }
  const yesterdayIST = shiftYmd(todayIST, -1);
  if (days.has(ymdToWeekday(yesterdayIST)) && nowTime < endTime) {
    return fromZonedTime(`${yesterdayIST}T${startTime}:00`, IST_TZ);
  }
  return null;
}

/** A weekly schedule window, as stored on a ShareCatalog. */
export interface ScheduleWindow {
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Expands a schedule into half-open [lo, hi) minute intervals on a weekly
 * timeline (Sun 00:00 = 0 .. Sat 23:59 = 10079). Overnight windows
 * (endTime <= startTime) spill into the next day and wrap Sat -> Sun.
 */
function expandToWeeklyIntervals(w: ScheduleWindow): [number, number][] {
  const s = toMinutes(w.startTime);
  const e = toMinutes(w.endTime);
  const intervals: [number, number][] = [];
  for (const code of w.daysOfWeek) {
    const dayIdx = WEEKDAYS.indexOf(code.toLowerCase() as (typeof WEEKDAYS)[number]);
    if (dayIdx < 0) continue;
    const base = dayIdx * MINUTES_PER_DAY;
    const lo = base + s;
    const hi = base + (e > s ? e : MINUTES_PER_DAY + e);
    if (hi <= MINUTES_PER_WEEK) {
      intervals.push([lo, hi]);
    } else {
      intervals.push([lo, MINUTES_PER_WEEK]);
      intervals.push([0, hi - MINUTES_PER_WEEK]);
    }
  }
  return intervals;
}

/**
 * True if two weekly schedule windows overlap in time on any shared occurrence.
 * Day-aware (different weekdays never conflict) and back-to-back safe: touching
 * edges (one ends 12:00, the next starts 12:00) do NOT count as an overlap.
 */
export function windowsOverlap(a: ScheduleWindow, b: ScheduleWindow): boolean {
  const intervalsA = expandToWeeklyIntervals(a);
  const intervalsB = expandToWeeklyIntervals(b);
  for (const [aLo, aHi] of intervalsA) {
    for (const [bLo, bHi] of intervalsB) {
      if (aLo < bHi && bLo < aHi) return true;
    }
  }
  return false;
}

export function computeNextWindowStart(
  now: Date,
  daysOfWeek: string[],
  startTime: string,
): Date | null {
  if (!daysOfWeek || daysOfWeek.length === 0) return null;
  const days = new Set(daysOfWeek.map((d) => d.toLowerCase()));
  const todayIST = formatInTimeZone(now, IST_TZ, 'yyyy-MM-dd');

  for (let i = 0; i < 8; i++) {
    const candidateYmd = shiftYmd(todayIST, i);
    if (!days.has(ymdToWeekday(candidateYmd))) continue;
    const candidate = fromZonedTime(`${candidateYmd}T${startTime}:00`, IST_TZ);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}
