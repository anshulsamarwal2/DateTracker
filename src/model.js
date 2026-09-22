// @ts-check
import { isValidISODate, todayISO } from './dates.js';

/**
 * @typedef {{ kind: 'once', at: string } | { kind: 'yearly', time: string }} Reminder
 * @typedef {{ id: string, title: string, date: string, notes: string, categoryId: string|null,
 *             starred: boolean, reminder: Reminder|null, deletedAt: number|null,
 *             createdAt: number, updatedAt: number }} Entry
 * @typedef {{ id: string, name: string, color: string, order: number, createdAt: number }} Category
 */

export const PALETTE = [
  '#CF6679', '#E07B39', '#C9A84C', '#5BA85A', '#3A9E8F', '#4A8FD4', '#8A63C9', '#D46E9E',
  '#4AABB8', '#A0784E', '#5C8CA8', '#E0806B', '#6DB56D', '#E09540', '#7B6EBD', '#3DA891',
  '#5595D9', '#C04545', '#6A9E4A', '#4A5BAD',
];

export const DEFAULT_CATEGORIES = [
  { name: 'Travel', color: '#4A8FD4' },
  { name: 'Milestones', color: '#C9A84C' },
  { name: 'Health', color: '#5BA85A' },
  { name: 'Family', color: '#D46E9E' },
];

export const LIMITS = { title: 200, notes: 5000, categoryName: 40 };
export const REMINDER_KINDS = ['once', 'yearly'];

const DT_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function newId() {
  return crypto.randomUUID();
}

/**
 * Validate compose input. Returns an object of field → message; empty when valid.
 * @param {any} input
 * @returns {{ title?: string, date?: string, notes?: string, reminder?: string }}
 */
export function validateEntry(input) {
  /** @type {{ title?: string, date?: string, notes?: string, reminder?: string }} */
  const errors = {};
  const title = String(input?.title ?? '').trim();
  if (!title) errors.title = 'Give this memory a title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!isValidISODate(input?.date)) errors.date = 'Pick a valid date.';
  if (String(input?.notes ?? '').length > LIMITS.notes) errors.notes = `Notes are limited to ${LIMITS.notes} characters.`;
  const r = input?.reminder;
  if (r) {
    if (r.kind === 'once') { if (!DT_LOCAL_RE.test(String(r.at ?? '').slice(0, 16))) errors.reminder = 'Pick a date and time for the reminder.'; }
    else if (r.kind === 'yearly') { if (!TIME_RE.test(String(r.time ?? ''))) errors.reminder = 'Pick a time for the reminder.'; }
    else errors.reminder = 'Unknown reminder type.';
  }
  return errors;
}

/** @param {any} r @returns {Reminder|null} */
export function normalizeReminder(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.kind === 'once') {
    const at = String(r.at ?? '').slice(0, 16);
    return DT_LOCAL_RE.test(at) ? { kind: 'once', at } : null;
  }
  if (r.kind === 'yearly') {
    const time = String(r.time ?? '');
    return { kind: 'yearly', time: TIME_RE.test(time) ? time : '09:00' };
  }
  return null;
}

/** @param {any} input @param {number} [now] @param {string} [id] @returns {Entry} */
export function buildEntry(input, now = Date.now(), id = newId()) {
  return {
    id,
    title: String(input.title ?? '').trim().slice(0, LIMITS.title),
    date: input.date,
    notes: String(input.notes ?? '').slice(0, LIMITS.notes),
    categoryId: input.categoryId ? String(input.categoryId) : null,
    starred: Boolean(input.starred),
    reminder: normalizeReminder(input.reminder),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Fields to update on an existing entry from compose input. @param {any} input @param {number} [now] */
export function entryPatch(input, now = Date.now()) {
  const e = buildEntry(input, now, 'patch');
  return { title: e.title, date: e.date, notes: e.notes, categoryId: e.categoryId, starred: e.starred, reminder: e.reminder, updatedAt: now };
}

/** Coerce a Firestore document into an Entry with safe defaults. @param {string} id @param {any} raw @returns {Entry} */
export function normalizeEntry(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id,
    title: typeof r.title === 'string' && r.title.trim() ? r.title : 'Untitled',
    date: isValidISODate(r.date) ? r.date : todayISO(),
    notes: typeof r.notes === 'string' ? r.notes : '',
    categoryId: typeof r.categoryId === 'string' && r.categoryId ? r.categoryId : null,
    starred: r.starred === true,
    reminder: normalizeReminder(r.reminder),
    deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

/** @param {string} id @param {any} raw @returns {Category} */
export function normalizeCategory(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Untitled',
    color: HEX_RE.test(String(r.color ?? '')) ? r.color : PALETTE[0],
    order: typeof r.order === 'number' ? r.order : 0,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
  };
}

/** Strip the in-memory `id` before writing (the id is the document key). @param {any} obj */
export function toDoc(obj) {
  const { id, ...rest } = obj;
  return rest;
}

/** @param {{ name: string, color: string, order?: number }} input @param {number} [now] @param {string} [id] @returns {Category} */
export function buildCategory({ name, color, order }, now = Date.now(), id = newId()) {
  return { id, name: String(name).trim().slice(0, LIMITS.categoryName), color, order: order ?? 0, createdAt: now };
}

/** Least-used palette colour among existing categories; first on ties. @param {{color: string}[]} categories */
export function nextPaletteColor(categories) {
  const used = new Map();
  for (const c of categories) { const k = c.color.toUpperCase(); used.set(k, (used.get(k) || 0) + 1); }
  let best = PALETTE[0], bestN = Infinity;
  for (const col of PALETTE) { const n = used.get(col.toUpperCase()) || 0; if (n < bestN) { best = col; bestN = n; } }
  return best;
}

/** null when OK, otherwise a message. @param {unknown} name @param {{id: string, name: string}[]} categories @param {string|null} [exceptId] */
export function validateCategoryName(name, categories, exceptId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Give the category a name.';
  if (n.length > LIMITS.categoryName) return `Keep it under ${LIMITS.categoryName} characters.`;
  if (categories.some(c => c.id !== exceptId && c.name.toLowerCase() === n.toLowerCase())) return 'You already have a category with that name.';
  return null;
}
