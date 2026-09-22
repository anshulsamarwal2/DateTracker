// @ts-check
/**
 * Minimal, forgiving CSV/TSV parser and RFC 4180 serialiser.
 */

/**
 * Parse CSV or TSV text. Handles a UTF-8 BOM, CRLF, quoted fields with
 * embedded delimiters, doubled quotes and newlines. The delimiter is a tab
 * when the first line has more tabs than commas. Cells are trimmed; rows
 * with no content are dropped; the first remaining row is the header.
 * @param {string|null|undefined} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  if (!s.trim()) return { headers: [], rows: [] };
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';

  /** @type {string[][]} */ const rows = [];
  /** @type {string[]} */ let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const [headers, ...data] = nonEmpty;
  return { headers, rows: data };
}

/**
 * Serialise rows with CRLF line endings and a UTF-8 BOM (so Excel opens it
 * correctly). Cells are quoted only when they contain a quote, comma or newline.
 * @param {(string|number|null|undefined)[][]} rows
 */
export function toCSV(rows) {
  const cell = (v) => {
    const str = v == null ? '' : String(v);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
