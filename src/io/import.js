// @ts-check
import { isValidISODate, fromParts, todayISO } from '../dates.js';
import { buildEntry, buildCategory, nextPaletteColor, normalizeEntry, normalizeCategory, newId, LIMITS } from '../model.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

export const CSV_FIELDS = [
  { id: 'title', label: 'Title' },
  { id: 'date', label: 'Date' },
  { id: 'notes', label: 'Notes' },
  { id: 'category', label: 'Category' },
  { id: 'skip', label: '— Skip —' },
];

const HINTS = {
  title: ['title', 'event', 'name', 'what', 'subject', 'memory'],
  date: ['date', 'when', 'day', 'timestamp', 'on'],
  notes: ['notes', 'note', 'comment', 'comments', 'details', 'description', 'body', 'text'],
  category: ['category', 'cat', 'tag', 'tags', 'label', 'type', 'group'],
};

/** Guess a column → field mapping from header names. Each field is used at most once. @param {string[]} headers */
export function guessMapping(headers) {
  /** @type {Record<number, string>} */ const map = {};
  const taken = new Set();
  headers.forEach((h, i) => {
    const key = String(h).toLowerCase().replace(/[^a-z]/g, '');
    let field = 'skip';
    for (const [f, words] of Object.entries(HINTS)) {
      if (!taken.has(f) && words.includes(key)) { field = f; taken.add(f); break; }
    }
    map[i] = field;
  });
  return map;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** @param {string} word */
function monthFromWord(word) {
  const w = word.toLowerCase();
  return MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)] ?? 0;
}
/** @param {number} y @param {number} m @param {number} d */
function checked(y, m, d) {
  const iso = fromParts(y, m, d);
  return isValidISODate(iso) ? iso : '';
}

/**
 * Normalise many date spellings to 'YYYY-MM-DD'. Numeric day/month order is
 * ambiguous ("03/04/2026"); `dayFirst` decides, unless one part can only be a day.
 * @param {unknown} str @param {{ dayFirst?: boolean }} [opts]
 */
export function normaliseDate(str, { dayFirst = true } = {}) {
  const s = String(str ?? '').trim();
  if (!s) return '';
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return checked(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([a-zA-Z]{3,})[-/.\s,]+(\d{4})$/.exec(s))) { const mo = monthFromWord(m[2]); return mo ? checked(+m[3], mo, +m[1]) : ''; }
  if ((m = /^([a-zA-Z]{3,})[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?[-/.\s,]+(\d{4})$/.exec(s))) { const mo = monthFromWord(m[1]); return mo ? checked(+m[3], mo, +m[2]) : ''; }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) return checked(y, b, a);
    if (b > 12 && a <= 12) return checked(y, a, b);
    return dayFirst ? checked(y, b, a) : checked(y, a, b);
  }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(s))) {
    const a = +m[1], b = +m[2], y = 2000 + +m[3];
    return dayFirst ? checked(y, b, a) : checked(y, a, b);
  }
  return '';
}

/**
 * Turn mapped CSV rows into new entries. Categories are matched by name
 * (case-insensitive) against `categories` and created when missing.
 * @param {string[][]} rows
 * @param {Record<number, string>} mapping
 * @param {{ dayFirst?: boolean, categories?: Category[], now?: number }} [opts]
 * @returns {{ entries: Entry[], newCategories: Category[], skipped: number }}
 */
export function csvRowsToEntries(rows, mapping, { dayFirst = true, categories = [], now = Date.now() } = {}) {
  const col = (field) => { const k = Object.keys(mapping).find(k => mapping[Number(k)] === field); return k == null ? -1 : Number(k); };
  const tC = col('title'), dC = col('date'), nC = col('notes'), cC = col('category');
  const cats = [...categories];
  /** @type {Category[]} */ const newCategories = [];
  const byName = new Map(cats.map(c => [c.name.toLowerCase(), c]));
  /** @type {Entry[]} */ const entries = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    const title = tC >= 0 ? String(row[tC] ?? '').trim() : '';
    const date = dC >= 0 ? normaliseDate(row[dC], { dayFirst }) : '';
    const notes = nC >= 0 ? String(row[nC] ?? '') : '';
    const catName = cC >= 0 ? String(row[cC] ?? '').trim() : '';
    if (!title && !date) { skipped++; return; }
    let categoryId = null;
    if (catName) {
      let c = byName.get(catName.toLowerCase());
      if (!c) {
        c = buildCategory({ name: catName, color: nextPaletteColor(cats), order: cats.length }, now);
        cats.push(c); newCategories.push(c); byName.set(catName.toLowerCase(), c);
      }
      categoryId = c.id;
    }
    entries.push(buildEntry({
      title: title || `Memory from ${date}`,
      date: date || todayISO(new Date(now)),
      notes, categoryId, starred: false, reminder: null,
    }, now + i));
  });
  return { entries, newCategories, skipped };
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** An id from an imported file, replaced with a fresh one when it isn't a safe Firestore document-id shape. @param {unknown} id */
function safeId(id) {
  const s = String(id ?? '');
  return SAFE_ID_RE.test(s) ? s : newId();
}

/**
 * Parse a DateTracker JSON export (version 2). Throws with a user-facing message otherwise.
 * Ids that aren't a safe document-id shape are replaced; a replaced category id
 * is remapped on any entry that pointed at it. Text fields are clamped to the
 * same limits compose enforces.
 * @param {string} text
 * @returns {{ entries: Entry[], categories: Category[] }}
 */
export function parseJSONExport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!data || data.version !== 2 || !Array.isArray(data.entries) || !Array.isArray(data.categories)) {
    throw new Error('That file is not a DateTracker export.');
  }
  /** @type {Map<string, string>} old category id -> replacement id */
  const categoryIdMap = new Map();
  const categories = data.categories.map((c) => {
    const rawId = String(c?.id ?? '');
    const id = safeId(rawId);
    if (id !== rawId) categoryIdMap.set(rawId, id);
    const cat = normalizeCategory(id, c);
    cat.name = cat.name.slice(0, LIMITS.categoryName);
    return cat;
  });
  const entries = data.entries.map((e) => {
    const id = safeId(e?.id);
    const rawCategoryId = e && typeof e === 'object' ? e.categoryId : undefined;
    const source = typeof rawCategoryId === 'string' && categoryIdMap.has(rawCategoryId)
      ? { ...e, categoryId: categoryIdMap.get(rawCategoryId) }
      : e;
    const entry = normalizeEntry(id, source);
    entry.title = entry.title.slice(0, LIMITS.title);
    entry.notes = entry.notes.slice(0, LIMITS.notes);
    return entry;
  });
  return { entries, categories };
}

/**
 * Decide what an import adds: anything whose id already exists is skipped.
 * @template {{id: string}} E @template {{id: string}} C
 * @param {E[]} existingEntries @param {C[]} existingCategories @param {{ entries: E[], categories: C[] }} incoming
 */
export function planMerge(existingEntries, existingCategories, incoming) {
  const eIds = new Set(existingEntries.map(e => e.id));
  const cIds = new Set(existingCategories.map(c => c.id));
  const entriesToAdd = incoming.entries.filter(e => !eIds.has(e.id));
  const categoriesToAdd = incoming.categories.filter(c => !cIds.has(c.id));
  return {
    entriesToAdd, categoriesToAdd,
    skippedEntries: incoming.entries.length - entriesToAdd.length,
    skippedCategories: incoming.categories.length - categoriesToAdd.length,
  };
}
