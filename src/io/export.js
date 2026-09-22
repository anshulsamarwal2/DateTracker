// @ts-check
import { toCSV } from './csv.js';
import { toISODate } from '../dates.js';
import { scheduleLabel } from '../reminders.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

/** Full backup, including trashed entries. @param {Entry[]} entries @param {Category[]} categories @param {Date} [now] */
export function buildJSONExport(entries, categories, now = new Date()) {
  return JSON.stringify({ version: 2, app: 'DateTracker', exportedAt: now.toISOString(), categories, entries }, null, 2);
}

/** Spreadsheet-friendly export. Caller decides which entries (normally active, newest first). @param {Entry[]} entries @param {Map<string, Category>} categoriesById */
export function buildCSVExport(entries, categoriesById) {
  const rows = [['date', 'title', 'category', 'notes', 'starred', 'reminder']];
  for (const e of entries) {
    const cat = e.categoryId ? categoriesById.get(e.categoryId) : null;
    rows.push([e.date, e.title, cat ? cat.name : '', e.notes, e.starred ? 'yes' : '', scheduleLabel(e)]);
  }
  return toCSV(rows);
}

/** @param {string} ext @param {Date} [now] */
export function exportFilename(ext, now = new Date()) {
  return `DateTracker-${toISODate(now)}.${ext}`;
}

/** Trigger a browser download of text content. @param {string} filename @param {string} text @param {string} [mime] */
export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
