import { describe, it, expect } from 'vitest';
import {
  activeEntries, trashedEntries, sortNewestFirst, indexById, filterEntries,
  groupByMonth, onThisDay, upcomingReminders, reminderSections, categoryCounts,
  shouldShowBackupNudge,
} from '../src/selectors.js';

const mk = (id, date, extra = {}) => ({ id, title: `T${id}`, date, notes: '', categoryId: null, starred: false, reminder: null, deletedAt: null, createdAt: 0, updatedAt: 0, ...extra });
const cats = new Map([['c1', { id: 'c1', name: 'Travel' }]]);

describe('active/trash/sort/index', () => {
  it('splits and sorts', () => {
    const a = mk('a', '2026-09-18'), b = mk('b', '2026-09-20', { deletedAt: 5 }), c = mk('c', '2026-09-20', { createdAt: 9 }), d = mk('d', '2026-09-20', { createdAt: 1, deletedAt: 9 });
    expect(activeEntries([a, b, c]).map(e => e.id)).toEqual(['a', 'c']);
    expect(trashedEntries([a, b, d]).map(e => e.id)).toEqual(['d', 'b']);
    expect(sortNewestFirst([a, c, mk('e', '2026-09-20', { createdAt: 3 })]).map(e => e.id)).toEqual(['c', 'e', 'a']);
    expect(indexById([a, c]).get('c')).toBe(c);
  });
});

describe('filterEntries', () => {
  const list = [
    mk('a', '2026-09-18', { title: 'Trip to Jaipur', categoryId: 'c1' }),
    mk('b', '2026-09-19', { title: 'Dentist', notes: 'root canal', starred: true }),
    mk('c', '2026-09-20', { title: 'Bought iPhone', categoryId: 'c1', starred: true }),
  ];
  it('by category', () => { expect(filterEntries(list, { categoryId: 'c1' }).map(e => e.id)).toEqual(['a', 'c']); });
  it('by star', () => { expect(filterEntries(list, { starredOnly: true }).map(e => e.id)).toEqual(['b', 'c']); });
  it('combines', () => { expect(filterEntries(list, { categoryId: 'c1', starredOnly: true }).map(e => e.id)).toEqual(['c']); });
  it('searches title, notes and category name, case-insensitively', () => {
    expect(filterEntries(list, { query: 'CANAL' }).map(e => e.id)).toEqual(['b']);
    expect(filterEntries(list, { query: 'travel', categoriesById: cats }).map(e => e.id)).toEqual(['a', 'c']);
    expect(filterEntries(list, { query: '  ' })).toHaveLength(3);
  });
});

describe('groupByMonth', () => {
  it('groups newest first with labels', () => {
    const g = groupByMonth([mk('a', '2026-08-02'), mk('b', '2026-09-18'), mk('c', '2026-09-01')], 'en-US');
    expect(g.map(x => x.key)).toEqual(['2026-09', '2026-08']);
    expect(g[0].label).toBe('September 2026');
    expect(g[0].entries.map(e => e.id)).toEqual(['b', 'c']);
  });
  it('is empty for no entries', () => { expect(groupByMonth([])).toEqual([]); });
});

describe('onThisDay', () => {
  it('finds same month/day in earlier years, most recent first', () => {
    const list = [mk('a', '2023-09-22'), mk('b', '2019-09-22'), mk('c', '2026-09-22'), mk('d', '2024-09-23')];
    const r = onThisDay(list, '2026-09-22');
    expect(r.map(x => x.entry.id)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ year: 2023, yearsAgo: 3 });
  });
});

describe('upcomingReminders / reminderSections', () => {
  const now = new Date(2026, 8, 22, 12, 0);
  const soon = mk('s', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-25T09:00' } });
  const today = mk('t', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-22T08:00' } });
  const far = mk('f', '2020-01-01', { reminder: { kind: 'once', at: '2026-12-25T09:00' } });
  const past = mk('p', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-01T09:00' } });
  const yearly = mk('y', '2019-09-30', { reminder: { kind: 'yearly', time: '09:00' } });
  it('upcoming within 14 days includes today, sorted', () => {
    expect(upcomingReminders([far, soon, today, past, yearly], now).map(x => x.entry.id)).toEqual(['t', 's', 'y']);
    expect(upcomingReminders([far], now, 120).map(x => x.entry.id)).toEqual(['f']);
  });
  it('sections split past from upcoming', () => {
    const s = reminderSections([far, soon, today, past, yearly], now);
    expect(s.upcoming.map(x => x.entry.id)).toEqual(['t', 's', 'y', 'f']);
    expect(s.past.map(x => x.entry.id)).toEqual(['p']);
  });
});

describe('categoryCounts', () => {
  it('counts including uncategorised', () => {
    const m = categoryCounts([mk('a', '2026-01-01', { categoryId: 'c1' }), mk('b', '2026-01-01'), mk('c', '2026-01-01', { categoryId: 'c1' })]);
    expect(m.get('c1')).toBe(2); expect(m.get('')).toBe(1);
  });
});

describe('shouldShowBackupNudge', () => {
  const DAY = 86400000;
  const now = 100 * DAY;
  it('needs a meta doc and at least one entry', () => {
    expect(shouldShowBackupNudge(null, 5, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: null, backupNudgeDismissedAt: null }, 0, now)).toBe(false);
  });
  it('shows 30 days after the latest of created / backup / dismissed', () => {
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: null, backupNudgeDismissedAt: null }, 1, now)).toBe(true);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: now - 29 * DAY, backupNudgeDismissedAt: null }, 1, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: now - 40 * DAY, backupNudgeDismissedAt: now - DAY }, 1, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: now - 10 * DAY, lastBackupAt: null, backupNudgeDismissedAt: null }, 1, now)).toBe(false);
  });
});
