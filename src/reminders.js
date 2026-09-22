// @ts-check
import {
  parseDateTimeLocal, parseISODate, anniversaryOn, nextAnniversary,
  toISODate, formatShort, parseTime, pad2,
} from './dates.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */

/**
 * When the reminder fires next. For `once` this is its own time, even if it
 * has passed (the Reminders screen lists those under "Past").
 * @param {Entry} entry @param {Date} [now]
 */
export function nextFireTime(entry, now = new Date()) {
  const r = entry.reminder;
  if (!r) return null;
  if (r.kind === 'once') return parseDateTimeLocal(r.at);
  if (r.kind === 'yearly') return nextAnniversary(entry.date, r.time, now);
  return null;
}

/** @param {Entry} entry @param {Date} [now] @returns {{ next: Date, isPast: boolean } | null} */
export function reminderState(entry, now = new Date()) {
  const next = nextFireTime(entry, now);
  if (!next) return null;
  return { next, isPast: next.getTime() <= now.getTime() };
}

/**
 * The occurrence that is due today and has already been reached, or null.
 * Opening the app any time later the same day still counts.
 * @param {Entry} entry @param {Date} [now]
 */
export function dueOccurrence(entry, now = new Date()) {
  const r = entry.reminder;
  if (!r) return null;
  let occ = null;
  if (r.kind === 'once') occ = parseDateTimeLocal(r.at);
  else if (r.kind === 'yearly') occ = anniversaryOn(entry.date, now.getFullYear(), r.time);
  if (!occ) return null;
  if (occ.getTime() > now.getTime()) return null;
  return toISODate(occ) === toISODate(now) ? occ : null;
}

/** localStorage key that marks an occurrence as fired. @param {string} entryId @param {Date} occurrence */
export function occurrenceKey(entryId, occurrence) {
  return `fired:${entryId}:${occurrence.getTime()}`;
}

/**
 * Entries whose reminder is due now and has not been fired yet.
 * @param {Entry[]} entries @param {Date} now @param {(key: string) => boolean} hasFired
 */
export function findDue(entries, now, hasFired) {
  const out = [];
  for (const entry of entries) {
    if (entry.deletedAt != null) continue;
    const occurrence = dueOccurrence(entry, now);
    if (!occurrence) continue;
    const key = occurrenceKey(entry.id, occurrence);
    if (!hasFired(key)) out.push({ entry, occurrence, key });
  }
  return out;
}

/** 'Every year · 09:00' or 'Sep 25, 2026 · 09:00'. @param {Entry} entry @param {string} [locale] */
export function scheduleLabel(entry, locale = undefined) {
  const r = entry.reminder;
  if (!r) return '';
  if (r.kind === 'yearly') return `Every year · ${r.time}`;
  const d = parseDateTimeLocal(r.at);
  if (!d) return 'Once';
  return `${formatShort(toISODate(d), locale)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Poll for due reminders. Calls notify(entry) once per occurrence.
 * @param {{ getEntries: () => Entry[], hasFired: (k: string) => boolean, markFired: (k: string) => void,
 *           notify: (e: Entry) => void, now?: () => Date, intervalMs?: number }} opts
 * @returns {() => void} stop
 */
export function startScheduler({ getEntries, hasFired, markFired, notify, now = () => new Date(), intervalMs = 60000 }) {
  const tick = () => {
    for (const { entry, key } of findDue(getEntries(), now(), hasFired)) {
      markFired(key);
      notify(entry);
    }
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

/* ---------- iCalendar ---------- */

/** @param {string} s */
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** RFC 5545 line folding at 72 octets (ASCII-safe approximation). @param {string} line */
function icsFold(line) {
  const out = [];
  let s = line;
  while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); }
  out.push(s);
  return out.join('\r\n');
}
/** @param {Date} d */
function icsLocal(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}
/** @param {Date} d */
function icsUTC(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build an .ics file for the entry's reminder. Yearly reminders carry
 * RRULE:FREQ=YEARLY. Times are floating local times.
 * @param {Entry} entry @param {Category|null} [category] @param {Date} [now]
 */
export function toICS(entry, category = null, now = new Date()) {
  const r = entry.reminder;
  if (!r) return '';
  let start = null;
  if (r.kind === 'once') start = parseDateTimeLocal(r.at);
  else {
    const { h, m } = parseTime(r.time);
    const d = parseISODate(entry.date);
    start = d && new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  }
  if (!start) return '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DateTracker//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${entry.id}@datetracker`,
    `DTSTAMP:${icsUTC(now)}`,
    `DTSTART:${icsLocal(start)}`,
    `SUMMARY:${icsEscape(entry.title)}`,
  ];
  const desc = [entry.notes, category ? `Category: ${category.name}` : ''].filter(Boolean).join('\n');
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (r.kind === 'yearly') lines.push('RRULE:FREQ=YEARLY');
  lines.push('BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(entry.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
