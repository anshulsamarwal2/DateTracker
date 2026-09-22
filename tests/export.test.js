import { describe, it, expect } from 'vitest';
import { buildJSONExport, buildCSVExport, exportFilename } from '../src/io/export.js';

const e = { id: 'e1', title: 'Trip, to Jaipur', date: '2026-09-18', notes: 'fun\nsun', categoryId: 'c1', starred: true, reminder: { kind: 'yearly', time: '09:00' }, deletedAt: null, createdAt: 1, updatedAt: 1 };
const c = { id: 'c1', name: 'Travel', color: '#4A8FD4', order: 0, createdAt: 0 };

describe('buildJSONExport', () => {
  it('wraps with version 2 and timestamp', () => {
    const j = JSON.parse(buildJSONExport([e], [c], new Date(Date.UTC(2026, 8, 22))));
    expect(j.version).toBe(2);
    expect(j.app).toBe('DateTracker');
    expect(j.exportedAt).toBe('2026-09-22T00:00:00.000Z');
    expect(j.entries[0].id).toBe('e1');
    expect(j.categories[0].name).toBe('Travel');
  });
});

describe('buildCSVExport', () => {
  it('writes the documented columns', () => {
    const csv = buildCSVExport([e, { ...e, id: 'e2', categoryId: null, starred: false, reminder: null }], new Map([['c1', c]]));
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('date,title,category,notes,starred,reminder');
    expect(lines[1]).toBe('2026-09-18,"Trip, to Jaipur",Travel,"fun\nsun",yes,Every year · 09:00');
    expect(lines[2]).toBe('2026-09-18,"Trip, to Jaipur",,"fun\nsun",,');
  });
});

describe('buildCSVExport formula injection guard', () => {
  it('prefixes a quote to title/category/notes cells that start with a formula trigger; dates are untouched', () => {
    const risky = { ...e, title: '=HYPERLINK("http://evil")', notes: '+cmd|/c calc' };
    const riskyCat = { ...c, name: '@SUM(1,1)' };
    const csv = buildCSVExport([risky], new Map([['c1', riskyCat]]));
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('2026-09-18,"\'=HYPERLINK(""http://evil"")","\'@SUM(1,1)",\'+cmd|/c calc,yes,Every year · 09:00');
  });
});

describe('exportFilename', () => {
  it('uses the local date', () => {
    expect(exportFilename('json', new Date(2026, 8, 22, 23, 0))).toBe('DateTracker-2026-09-22.json');
  });
});
