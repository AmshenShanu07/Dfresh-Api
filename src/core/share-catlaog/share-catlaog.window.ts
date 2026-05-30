import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const IST_TZ = 'Asia/Kolkata';
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
