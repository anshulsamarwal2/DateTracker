import { describe, it, expect } from 'vitest';
import {
  PALETTE, DEFAULT_CATEGORIES, LIMITS, newId, validateEntry, normalizeReminder,
  buildEntry, entryPatch, normalizeEntry, normalizeCategory, toDoc,
  buildCategory, nextPaletteColor, validateCategoryName,
} from '../src/model.js';

const good = { title: '  Trip to Jaipur ', date: '2026-09-18', notes: 'Three days', categoryId: 'c1', starred: true, reminder: null };

describe('constants', () => {
  it('has a 20-colour palette and 4 default categories', () => {
    expect(PALETTE).toHaveLength(20);
    expect(PALETTE.every(c => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
    expect(DEFAULT_CATEGORIES.map(c => c.name)).toEqual(['Travel', 'Milestones', 'Health', 'Family']);
    expect(LIMITS).toEqual({ title: 200, notes: 5000, categoryName: 40 });
  });
  it('newId is a uuid', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(newId());
  });
});

describe('validateEntry', () => {
  it('accepts a good entry', () => { expect(validateEntry(good)).toEqual({}); });
  it('requires a title and a valid date', () => {
    expect(validateEntry({ ...good, title: '   ' }).title).toBe('Give this memory a title.');
    expect(validateEntry({ ...good, date: '2026-02-30' }).date).toBe('Pick a valid date.');
    expect(validateEntry({ ...good, title: 'x'.repeat(201) }).title).toBe('Keep the title under 200 characters.');
    expect(validateEntry({ ...good, notes: 'x'.repeat(5001) }).notes).toBe('Notes are limited to 5000 characters.');
  });
  it('validates reminders', () => {
    expect(validateEntry({ ...good, reminder: { kind: 'once', at: '2026-09-18T09:00' } })).toEqual({});
    expect(validateEntry({ ...good, reminder: { kind: 'once', at: '' } }).reminder).toBe('Pick a date and time for the reminder.');
    expect(validateEntry({ ...good, reminder: { kind: 'yearly', time: '09:00' } })).toEqual({});
    expect(validateEntry({ ...good, reminder: { kind: 'yearly', time: '9am' } }).reminder).toBe('Pick a time for the reminder.');
    expect(validateEntry({ ...good, reminder: { kind: 'weekly', time: '09:00' } }).reminder).toBe('Unknown reminder type.');
  });
});

describe('normalizeReminder', () => {
  it('keeps valid shapes and drops the rest', () => {
    expect(normalizeReminder({ kind: 'once', at: '2026-09-18T09:00:00' })).toEqual({ kind: 'once', at: '2026-09-18T09:00' });
    expect(normalizeReminder({ kind: 'yearly', time: '07:30' })).toEqual({ kind: 'yearly', time: '07:30' });
    expect(normalizeReminder({ kind: 'yearly', time: 'x' })).toEqual({ kind: 'yearly', time: '09:00' });
    expect(normalizeReminder({ kind: 'once', at: 'nope' })).toBeNull();
    expect(normalizeReminder({ kind: 'daily', time: '09:00' })).toBeNull();
    expect(normalizeReminder(null)).toBeNull();
    expect(normalizeReminder('once')).toBeNull();
  });
});

describe('buildEntry / entryPatch', () => {
  it('trims, defaults and stamps', () => {
    const e = buildEntry(good, 1000, 'id1');
    expect(e).toEqual({ id: 'id1', title: 'Trip to Jaipur', date: '2026-09-18', notes: 'Three days', categoryId: 'c1', starred: true, reminder: null, deletedAt: null, createdAt: 1000, updatedAt: 1000 });
    expect(buildEntry({ title: 'x', date: '2026-01-01' }, 5).categoryId).toBeNull();
    expect(buildEntry({ title: 'x', date: '2026-01-01' }, 5).notes).toBe('');
  });
  it('entryPatch has no id/createdAt/deletedAt', () => {
    const p = entryPatch(good, 2000);
    expect(Object.keys(p).sort()).toEqual(['categoryId', 'date', 'notes', 'reminder', 'starred', 'title', 'updatedAt']);
    expect(p.updatedAt).toBe(2000);
  });
});

describe('normalizeEntry / normalizeCategory / toDoc', () => {
  it('fills defaults for sparse or bad documents', () => {
    const e = normalizeEntry('a', { title: '', date: 'bad', starred: 'yes', reminder: { kind: 'once', at: '2026-01-01T08:00' } });
    expect(e.id).toBe('a'); expect(e.title).toBe('Untitled'); expect(/^\d{4}-\d{2}-\d{2}$/.test(e.date)).toBe(true);
    expect(e.starred).toBe(false); expect(e.notes).toBe(''); expect(e.categoryId).toBeNull(); expect(e.deletedAt).toBeNull();
    expect(e.reminder).toEqual({ kind: 'once', at: '2026-01-01T08:00' });
    expect(normalizeEntry('b', null).title).toBe('Untitled');
  });
  it('normalizes categories', () => {
    expect(normalizeCategory('c', { name: ' Travel ', color: 'red' })).toEqual({ id: 'c', name: 'Travel', color: PALETTE[0], order: 0, createdAt: 0 });
    expect(normalizeCategory('c', { name: 'X', color: '#ABCDEF', order: 3, createdAt: 9 }).color).toBe('#ABCDEF');
  });
  it('toDoc strips id', () => {
    expect(toDoc({ id: 'x', a: 1 })).toEqual({ a: 1 });
  });
});

describe('categories', () => {
  it('buildCategory trims and stamps', () => {
    expect(buildCategory({ name: ' Work ', color: '#111111', order: 2 }, 7, 'k')).toEqual({ id: 'k', name: 'Work', color: '#111111', order: 2, createdAt: 7 });
  });
  it('nextPaletteColor picks the least-used colour, first on ties', () => {
    expect(nextPaletteColor([])).toBe(PALETTE[0]);
    expect(nextPaletteColor([{ color: PALETTE[0] }])).toBe(PALETTE[1]);
    expect(nextPaletteColor(PALETTE.map(color => ({ color })))).toBe(PALETTE[0]);
    expect(nextPaletteColor([{ color: PALETTE[0].toLowerCase() }])).toBe(PALETTE[1]);
  });
  it('validateCategoryName', () => {
    const cats = [{ id: '1', name: 'Travel' }];
    expect(validateCategoryName('Health', cats)).toBeNull();
    expect(validateCategoryName('', cats)).toBe('Give the category a name.');
    expect(validateCategoryName('travel', cats)).toBe('You already have a category with that name.');
    expect(validateCategoryName('travel', cats, '1')).toBeNull();
    expect(validateCategoryName('x'.repeat(41), cats)).toBe('Keep it under 40 characters.');
  });
});
