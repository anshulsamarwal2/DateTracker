// @ts-check
/**
 * Local-calendar date helpers.
 *
 * An entry date is always a 'YYYY-MM-DD' string meaning a calendar day in the
 * user's local timezone. Never derive a calendar day from Date#toISOString()
 * — that is UTC and is wrong for anyone east of Greenwich after midnight.
 */

export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DT_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MS_DAY = 86400000;

/** @param {number} n */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local calendar day of a Date. @param {Date} d */
export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** @param {Date} [now] */
export function todayISO(now = new Date()) {
  return toISODate(now);
}

/** True only for a real calendar date in 'YYYY-MM-DD' form. @param {unknown} s */
export function isValidISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** Local midnight for an ISO date, or null. @param {string} s */
export function parseISODate(s) {
  if (!isValidISODate(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

/** @param {number} y @param {number} m 1–12 @param {number} d */
export function fromParts(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** @param {string} iso */
export function yearOf(iso) {
  return Number(iso.slice(0, 4));
}

/** @param {string} iso */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** Day of month without leading zero. @param {string} iso */
export function dayNumber(iso) {
  return String(Number(iso.slice(8, 10)));
}

/** @param {string} a @param {string} b */
export function sameMonthDay(a, b) {
  return a.slice(5, 10) === b.slice(5, 10);
}

/** Whole calendar days from a to b (b − a). NaN if either is invalid. */
export function daysBetween(a, b) {
  const da = parseISODate(a), db = parseISODate(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const fmtCache = new Map();
/** @param {string|undefined} locale @param {Intl.DateTimeFormatOptions} opts */
function formatter(locale, opts) {
  const key = `${locale || ''}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); fmtCache.set(key, f); }
  return f;
}
/** @param {string} iso @param {string|undefined} locale @param {Intl.DateTimeFormatOptions} opts */
function fmt(iso, locale, opts) {
  const d = parseISODate(iso);
  return d ? formatter(locale, opts).format(d) : '';
}

/** "Friday, September 18, 2026" */
export function formatLong(iso, locale = undefined) {
  return fmt(iso, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
/** "Sep 18, 2026" */
export function formatShort(iso, locale = undefined) {
  return fmt(iso, locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
/** "September 2026" */
export function formatMonthYear(iso, locale = undefined) {
  return fmt(iso, locale, { month: 'long', year: 'numeric' });
}
/** "September 18" */
export function formatDayMonth(iso, locale = undefined) {
  return fmt(iso, locale, { day: 'numeric', month: 'long' });
}
/** "Fri" */
export function formatWeekday(iso, locale = undefined) {
  return fmt(iso, locale, { weekday: 'short' });
}

/** 'HH:MM' → {h, m}; anything invalid → 09:00. @param {string} [hhmm] */
export function parseTime(hhmm) {
  const m = TIME_RE.exec(hhmm || '');
  if (!m) return { h: 9, m: 0 };
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return { h: 9, m: 0 };
  return { h, m: mi };
}

/**
 * The anniversary of `iso` in `year` at `time`. A Feb 29 anniversary lands on
 * Feb 28 in non-leap years.
 * @param {string} iso @param {number} year @param {string} time
 */
export function anniversaryOn(iso, year, time) {
  const src = parseISODate(iso);
  if (!src) return null;
  const { h, m } = parseTime(time);
  const month = src.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(src.getDate(), lastDay), h, m, 0, 0);
}

/** First anniversary strictly after `now`. @param {string} iso @param {string} time @param {Date} [now] */
export function nextAnniversary(iso, time, now = new Date()) {
  const y = now.getFullYear();
  const thisYear = anniversaryOn(iso, y, time);
  if (!thisYear) return null;
  return thisYear.getTime() > now.getTime() ? thisYear : anniversaryOn(iso, y + 1, time);
}

/**
 * Human relative label by calendar-day distance: Today / Tomorrow / Yesterday /
 * "in 3 days" / "2 days ago" / "in 2 weeks" / "in 3 months" / "in 1 year".
 * @param {Date} target @param {Date} [now] @param {string} [locale]
 */
export function relativeDayLabel(target, now = new Date(), locale = undefined) {
  const days = daysBetween(toISODate(now), toISODate(target));
  // 'auto' only for days (Today / Tomorrow / Yesterday); weeks and beyond stay
  // numeric so we get "in 1 week", never "next week".
  const byDay = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const numeric = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const abs = Math.abs(days);
  let label;
  if (abs < 7) label = byDay.format(days, 'day');
  else if (abs < 30) label = numeric.format(Math.round(days / 7), 'week');
  else if (abs < 365) label = numeric.format(Math.round(days / 30), 'month');
  else label = numeric.format(Math.round(days / 365), 'year');
  // Capitalise word-only labels (today/tomorrow/yesterday); leave "in 3 days" as is.
  return /\d/.test(label) ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

/** Value for <input type="datetime-local">. @param {Date} d */
export function toDateTimeLocal(d) {
  return `${toISODate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse 'YYYY-MM-DDTHH:MM[:SS]' as local time. @param {string} s */
export function parseDateTimeLocal(s) {
  const m = DT_LOCAL_RE.exec(s || '');
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidISODate(date)) return null;
  const h = Number(m[4]), mi = Number(m[5]);
  if (h > 23 || mi > 59) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi, 0, 0);
}
