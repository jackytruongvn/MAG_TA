/**
 * Date-only helpers.
 *
 * DOB and Starting Date are ALWAYS handled as plain "yyyy-MM-dd" strings
 * (never `new Date(string)` on a date-only value) so they can never shift
 * by one day because of timezone conversion.
 */

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const daysInMonth = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse a date-only input into ISO "yyyy-MM-dd". Returns null when invalid.
 * Accepted formats: dd/MM/yyyy, d/M/yyyy, dd-MM-yyyy, dd-MMM-yyyy, yyyy-MM-dd,
 * yyyy/MM/dd, dd.MM.yyyy and Excel serial numbers (e.g. "45123").
 */
export function parseDateOnly(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  // yyyy-MM-dd or yyyy/MM/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }

  // dd/MM/yyyy, d/M/yyyy, dd-MM-yyyy, dd.MM.yyyy  (day-first, VN convention)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }

  // dd-MMM-yyyy or dd MMM yyyy (e.g. 05-Aug-2025)
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    const [d, y] = [Number(m[1]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }

  // Excel serial number (days since 1899-12-30)
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    if (serial >= 5000 && serial <= 110000) {
      const ms = (serial - 25569) * 86400 * 1000; // 25569 = days 1899-12-30 -> 1970-01-01
      const dt = new Date(ms); // safe: computed in UTC
      return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }

  return null;
}

/** Format an ISO "yyyy-MM-dd" as "dd/MM/yyyy" using pure string ops (no Date). */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** True if the value parses to a valid date-only value. */
export function isValidDateInput(input: string | null | undefined): boolean {
  return parseDateOnly(input) !== null;
}

// ---------------------------------------------------------------------------
// Timezone-aware wall-clock helpers (used by the scheduler; these deal with
// real instants, not with date-only fields).
// ---------------------------------------------------------------------------

/** Offset (minutes) of `tz` relative to UTC at the given instant. */
export function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Wall-clock parts of an instant in a timezone. */
export function wallClockInTz(tz: string, date: Date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    hh: Number(parts.hour === '24' ? '0' : parts.hour), mm: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

/** Convert a wall-clock time in `tz` to a real UTC instant. */
export function wallTimeToUtc(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
  // First guess assuming UTC, then correct by the zone offset (two passes
  // handles DST edges; VN has no DST so one correction is exact).
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(tz, guess);
    guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0) - offset * 60000);
  }
  return guess;
}

/** Today's date-only ISO string in a timezone. */
export function todayIsoInTz(tz: string): string {
  const { y, m, d } = wallClockInTz(tz, new Date());
  return toIso(y, m, d);
}

export const VN_TZ = 'Asia/Ho_Chi_Minh';
