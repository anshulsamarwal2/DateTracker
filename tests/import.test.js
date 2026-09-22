import { describe, it, expect } from 'vitest';
import { CSV_FIELDS, guessMapping, normaliseDate, csvRowsToEntries, parseJSONExport, planMerge } from '../src/io/import.js';
import { PALETTE } from '../src/model.js';

describe('guessMapping', () => {
  it('maps common headers and skips the rest, one column per field', () => {
    expect(guessMapping(['Event', 'When', 'Notes', 'Tag', 'Cost'])).toEqual({ 0: 'title', 1: 'date', 2: 'notes', 3: 'category', 4: 'skip' });
    expect(guessMapping(['Title', 'Name'])).toEqual({ 0: 'title', 1: 'skip' });
    expect(CSV_FIELDS.map(f => f.id)).toEqual(['title', 'date', 'notes', 'category', 'skip']);
  });
});

describe('normaliseDate', () => {
  it('accepts ISO and ISO with time', () => {
    expect(normaliseDate('2026-09-18')).toBe('2026-09-18');
    expect(normaliseDate('2026/9/8')).toBe('2026-09-08');
    expect(normaliseDate('2026-09-18T10:00:00Z')).toBe('2026-09-18');
  });
  it('accepts month names either side', () => {
    expect(normaliseDate('18 Sep 2026')).toBe('2026-09-18');
    expect(normaliseDate('18-September-2026')).toBe('2026-09-18');
    expect(normaliseDate('Sept 18, 2026')).toBe('2026-09-18');
    expect(normaliseDate('March 3rd 2024')).toBe('2024-03-03');
  });
  it('resolves numeric dates with dayFirst, but never invents an impossible one', () => {
    expect(normaliseDate('03/04/2026')).toBe('2026-04-03');
    expect(normaliseDate('03/04/2026', { dayFirst: false })).toBe('2026-03-04');
    expect(normaliseDate('25/04/2026', { dayFirst: false })).toBe('2026-04-25');
    expect(normaliseDate('04/25/2026')).toBe('2026-04-25');
    expect(normaliseDate('18.09.26')).toBe('2026-09-18');
  });
  it('returns empty for junk or impossible dates', () => {
    expect(normaliseDate('')).toBe('');
    expect(normaliseDate('yesterday')).toBe('');
    expect(normaliseDate('31/02/2026')).toBe('');
    expect(normaliseDate(null)).toBe('');
  });
});

describe('csvRowsToEntries', () => {
  const mapping = { 0: 'title', 1: 'date', 2: 'notes', 3: 'category' };
  const rows = [
    ['Trip', '18/09/2026', 'fun', 'Travel'],
    ['', '', '', ''],
    ['Dentist', '2026-09-20', '', 'health'],
    ['No date', '', 'n', ''],
    ['', '2026-01-01', 'date only', 'Travel'],
  ];
  it('builds entries, creates categories once by name (case-insensitive), skips empty rows', () => {
    const existing = [{ id: 'c1', name: 'Health', color: PALETTE[3], order: 0, createdAt: 0 }];
    const r = csvRowsToEntries(rows, mapping, { categories: existing, now: 1000 });
    expect(r.skipped).toBe(1);
    expect(r.entries).toHaveLength(4);
    expect(r.entries[0]).toMatchObject({ title: 'Trip', date: '2026-09-18', notes: 'fun' });
    expect(r.entries[1]).toMatchObject({ title: 'Dentist', categoryId: 'c1' });
    expect(r.entries[2].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.entries[3].title).toBe('Memory from 2026-01-01');
    expect(r.newCategories).toHaveLength(1);
    expect(r.newCategories[0].name).toBe('Travel');
    expect(r.entries[0].categoryId).toBe(r.newCategories[0].id);
    expect(r.entries[3].categoryId).toBe(r.newCategories[0].id);
    expect(r.entries.map(e => e.createdAt)).toEqual([1000, 1002, 1003, 1004]);
  });
  it('honours dayFirst=false', () => {
    const r = csvRowsToEntries([['x', '03/04/2026', '', '']], mapping, { dayFirst: false });
    expect(r.entries[0].date).toBe('2026-03-04');
  });
});

describe('parseJSONExport', () => {
  it('accepts a version-2 export and normalises', () => {
    const text = JSON.stringify({ version: 2, categories: [{ id: 'c', name: 'X', color: '#123456' }], entries: [{ id: 'e', title: 'T', date: '2026-01-01', deletedAt: 5 }] });
    const r = parseJSONExport(text);
    expect(r.categories[0]).toMatchObject({ id: 'c', name: 'X', color: '#123456' });
    expect(r.entries[0]).toMatchObject({ id: 'e', title: 'T', deletedAt: 5, starred: false });
  });
  it('rejects non-JSON and non-exports with friendly messages', () => {
    expect(() => parseJSONExport('{')).toThrow('That file is not valid JSON.');
    expect(() => parseJSONExport('{"entries":[]}')).toThrow('That file is not a DateTracker export.');
    expect(() => parseJSONExport('{"version":1,"entries":[],"categories":[]}')).toThrow('That file is not a DateTracker export.');
  });
});

describe('planMerge', () => {
  it('skips ids that already exist', () => {
    const existingE = [{ id: 'e1' }], existingC = [{ id: 'c1' }];
    const incoming = { entries: [{ id: 'e1' }, { id: 'e2' }], categories: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] };
    const p = planMerge(existingE, existingC, incoming);
    expect(p.entriesToAdd.map(e => e.id)).toEqual(['e2']);
    expect(p.categoriesToAdd.map(c => c.id)).toEqual(['c2', 'c3']);
    expect(p.skippedEntries).toBe(1); expect(p.skippedCategories).toBe(1);
  });
});
