// @ts-check
import { monthKey, formatMonthYear, yearOf, sameMonthDay } from './dates.js';
import { nextFireTime, dueOccurrence, reminderState } from './reminders.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */

/** @param {Entry[]} entries */
export function activeEntries(entries) {
  return entries.filter(e => e.deletedAt == null);
}

/** Newest deletion first. @param {Entry[]} entries */
export function trashedEntries(entries) {
  return entries.filter(e => e.deletedAt != null).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}

/** Date desc, then createdAt desc. @param {Entry[]} entries */
export function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

/** @template {{id: string}} T @param {T[]} list @returns {Map<string, T>} */
export function indexById(list) {
  return new Map(list.map(x => [x.id, x]));
}

/**
 * @param {Entry[]} entries
 * @param {{ categoryId?: string, starredOnly?: boolean, query?: string, categoriesById?: Map<string, Category> }} [opts]
 */
export function filterEntries(entries, { categoryId = 'all', starredOnly = false, query = '', categoriesById = new Map() } = {}) {
  const q = query.trim().toLowerCase();
  return entries.filter(e => {
    if (categoryId !== 'all' && e.categoryId !== categoryId) return false;
    if (starredOnly && !e.starred) return false;
    if (q) {
      const cat = e.categoryId ? categoriesById.get(e.categoryId) : null;
      const hay = `${e.title}\n${e.notes}\n${cat ? cat.name : ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** @param {Entry[]} entries @param {string} [locale] */
export function groupByMonth(entries, locale = undefined) {
  /** @type {{ key: string, label: string, entries: Entry[] }[]} */
  const groups = [];
  let cur = null;
  for (const e of sortNewestFirst(entries)) {
    const key = monthKey(e.date);
    if (!cur || cur.key !== key) { cur = { key, label: formatMonthYear(e.date, locale), entries: [] }; groups.push(cur); }
    cur.entries.push(e);
  }
  return groups;
}

/** Entries from earlier years sharing today's month/day, most recent year first. @param {Entry[]} entries @param {string} todayISO */
export function onThisDay(entries, todayISO) {
  const ty = yearOf(todayISO);
  return entries
    .filter(e => sameMonthDay(e.date, todayISO) && yearOf(e.date) < ty)
    .map(e => ({ entry: e, year: yearOf(e.date), yearsAgo: ty - yearOf(e.date) }))
    .sort((a, b) => b.year - a.year);
}

/** Reminders firing within `withinDays` (including ones already due today), soonest first. @param {Entry[]} entries @param {Date} now @param {number} [withinDays] */
export function upcomingReminders(entries, now, withinDays = 14) {
  const limit = now.getTime() + withinDays * 86400000;
  return entries
    .map(e => ({ entry: e, next: dueOccurrence(e, now) || nextFireTime(e, now) }))
    .filter(x => x.next && x.next.getTime() <= limit && (x.next.getTime() >= now.getTime() || dueOccurrence(x.entry, now)))
    .sort((a, b) => /** @type {Date} */ (a.next).getTime() - /** @type {Date} */ (b.next).getTime());
}

/** @param {Entry[]} entries @param {Date} now */
export function reminderSections(entries, now) {
  /** @type {{entry: Entry, next: Date}[]} */ const upcoming = [];
  /** @type {{entry: Entry, next: Date}[]} */ const past = [];
  for (const e of entries) {
    const due = dueOccurrence(e, now);
    if (due) { upcoming.push({ entry: e, next: due }); continue; }
    const s = reminderState(e, now);
    if (!s) continue;
    (s.isPast ? past : upcoming).push({ entry: e, next: s.next });
  }
  upcoming.sort((a, b) => a.next.getTime() - b.next.getTime());
  past.sort((a, b) => b.next.getTime() - a.next.getTime());
  return { upcoming, past };
}

/** @param {Entry[]} entries @returns {Map<string, number>} */
export function categoryCounts(entries) {
  const m = new Map();
  for (const e of entries) { const k = e.categoryId || ''; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

export const BACKUP_NUDGE_DAYS = 30;

/**
 * Spec §3: a one-line nudge once every 30 days without a backup.
 * @param {{ createdAt?: number, lastBackupAt?: number|null, backupNudgeDismissedAt?: number|null } | null} meta
 * @param {number} activeCount @param {number} now ms epoch
 */
export function shouldShowBackupNudge(meta, activeCount, now) {
  if (!meta || activeCount < 1) return false;
  const since = Math.max(meta.createdAt || 0, meta.lastBackupAt || 0, meta.backupNudgeDismissedAt || 0);
  return now - since >= BACKUP_NUDGE_DAYS * 86400000;
}
