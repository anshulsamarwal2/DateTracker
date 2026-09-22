import { describe, it, expect } from 'vitest';
import {
  pad2, toISODate, todayISO, isValidISODate, parseISODate, fromParts,
  yearOf, monthKey, dayNumber, sameMonthDay, daysBetween,
  formatLong, formatShort, formatMonthYear, formatDayMonth, formatWeekday,
  parseTime, anniversaryOn, nextAnniversary, relativeDayLabel,
  toDateTimeLocal, parseDateTimeLocal,
} from '../src/dates.js';

describe('basics', () => {
  it('pads', () => { expect(pad2(3)).toBe('03'); expect(pad2(12)).toBe('12'); });
  it('toISODate uses local calendar day', () => {
    expect(toISODate(new Date(2026, 8, 18, 23, 59))).toBe('2026-09-18');
    expect(toISODate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
  it('todayISO takes an injectable now', () => {
    expect(todayISO(new Date(2026, 8, 22, 1, 0))).toBe('2026-09-22');
  });
  it('validates ISO dates on a real calendar', () => {
    expect(isValidISODate('2026-09-18')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-9-8')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate('2026-09-18T00:00')).toBe(false);
  });
  it('parses to local midnight', () => {
    const d = parseISODate('2026-09-18');
    expect(d.getFullYear()).toBe(2026); expect(d.getMonth()).toBe(8); expect(d.getDate()).toBe(18); expect(d.getHours()).toBe(0);
    expect(parseISODate('nope')).toBeNull();
  });
  it('fromParts/yearOf/monthKey/dayNumber/sameMonthDay', () => {
    expect(fromParts(2026, 9, 8)).toBe('2026-09-08');
    expect(yearOf('2023-04-05')).toBe(2023);
    expect(monthKey('2023-04-05')).toBe('2023-04');
    expect(dayNumber('2023-04-05')).toBe('5');
    expect(sameMonthDay('2023-04-05', '2026-04-05')).toBe(true);
    expect(sameMonthDay('2023-04-05', '2026-04-06')).toBe(false);
  });
  it('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-09-18', '2026-09-21')).toBe(3);
    expect(daysBetween('2026-09-21', '2026-09-18')).toBe(-3);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(Number.isNaN(daysBetween('bad', '2026-04-01'))).toBe(true);
  });
});

describe('formatting (en-US for determinism)', () => {
  it('formats', () => {
    expect(formatLong('2026-09-18', 'en-US')).toBe('Friday, September 18, 2026');
    expect(formatShort('2026-09-18', 'en-US')).toBe('Sep 18, 2026');
    expect(formatMonthYear('2026-09-18', 'en-US')).toBe('September 2026');
    expect(formatDayMonth('2026-09-18', 'en-US')).toBe('September 18');
    expect(formatWeekday('2026-09-18', 'en-US')).toBe('Fri');
  });
  it('returns empty string for invalid input', () => {
    expect(formatLong('garbage', 'en-US')).toBe('');
  });
});

describe('time and anniversaries', () => {
  it('parseTime defaults to 09:00', () => {
    expect(parseTime('14:05')).toEqual({ h: 14, m: 5 });
    expect(parseTime('')).toEqual({ h: 9, m: 0 });
    expect(parseTime(undefined)).toEqual({ h: 9, m: 0 });
    expect(parseTime('25:00')).toEqual({ h: 9, m: 0 });
  });
  it('anniversaryOn keeps month/day and applies time', () => {
    const d = anniversaryOn('2019-09-18', 2026, '10:30');
    expect(toISODate(d)).toBe('2026-09-18'); expect(d.getHours()).toBe(10); expect(d.getMinutes()).toBe(30);
  });
  it('Feb 29 anniversaries fall on Feb 28 in non-leap years', () => {
    expect(toISODate(anniversaryOn('2020-02-29', 2026, '09:00'))).toBe('2026-02-28');
    expect(toISODate(anniversaryOn('2020-02-29', 2028, '09:00'))).toBe('2028-02-29');
  });
  it('nextAnniversary is strictly after now', () => {
    const now = new Date(2026, 8, 18, 9, 0);
    expect(toISODate(nextAnniversary('2019-09-18', '09:00', now))).toBe('2027-09-18');
    expect(toISODate(nextAnniversary('2019-09-18', '09:01', now))).toBe('2026-09-18');
    expect(toISODate(nextAnniversary('2019-12-25', '09:00', now))).toBe('2026-12-25');
    expect(toISODate(nextAnniversary('2019-01-05', '09:00', now))).toBe('2027-01-05');
    expect(nextAnniversary('bad', '09:00', now)).toBeNull();
  });
});

describe('relative labels (en-US)', () => {
  const now = new Date(2026, 8, 22, 15, 0);
  const at = (y, m, d) => new Date(y, m - 1, d, 9, 0);
  it('day granularity under a week', () => {
    expect(relativeDayLabel(at(2026, 9, 22), now, 'en-US')).toBe('Today');
    expect(relativeDayLabel(at(2026, 9, 23), now, 'en-US')).toBe('Tomorrow');
    expect(relativeDayLabel(at(2026, 9, 21), now, 'en-US')).toBe('Yesterday');
    expect(relativeDayLabel(at(2026, 9, 25), now, 'en-US')).toBe('in 3 days');
    expect(relativeDayLabel(at(2026, 9, 20), now, 'en-US')).toBe('2 days ago');
  });
  it('weeks, months, years beyond that', () => {
    expect(relativeDayLabel(at(2026, 10, 2), now, 'en-US')).toBe('in 1 week');
    expect(relativeDayLabel(at(2026, 11, 6), now, 'en-US')).toBe('in 2 months');
    expect(relativeDayLabel(at(2027, 10, 27), now, 'en-US')).toBe('in 1 year');
    expect(relativeDayLabel(at(2024, 9, 22), now, 'en-US')).toBe('2 years ago');
  });
});

describe('datetime-local', () => {
  it('round-trips', () => {
    const d = new Date(2026, 8, 18, 7, 5);
    expect(toDateTimeLocal(d)).toBe('2026-09-18T07:05');
    const p = parseDateTimeLocal('2026-09-18T07:05');
    expect(p.getTime()).toBe(d.getTime());
    expect(parseDateTimeLocal('2026-09-18T07:05:00')).not.toBeNull();
    expect(parseDateTimeLocal('2026-02-30T07:05')).toBeNull();
    expect(parseDateTimeLocal('')).toBeNull();
  });
});
