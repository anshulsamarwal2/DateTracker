import { describe, it, expect, vi } from 'vitest';
import {
  nextFireTime, reminderState, dueOccurrence, occurrenceKey, findDue,
  scheduleLabel, toICS, startScheduler,
} from '../src/reminders.js';
import { toISODate } from '../src/dates.js';

const base = { id: 'e1', title: 'Car insurance', date: '2019-09-18', notes: 'Renew online', categoryId: null, starred: false, deletedAt: null, createdAt: 0, updatedAt: 0 };
const once = { ...base, reminder: { kind: 'once', at: '2026-09-25T09:00' } };
const yearly = { ...base, reminder: { kind: 'yearly', time: '09:00' } };
const none = { ...base, reminder: null };

describe('nextFireTime / reminderState', () => {
  const now = new Date(2026, 8, 22, 12, 0);
  it('once returns its time even when past', () => {
    expect(nextFireTime(once, now).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    const past = { ...base, reminder: { kind: 'once', at: '2026-09-01T09:00' } };
    expect(reminderState(past, now)).toEqual({ next: new Date(2026, 8, 1, 9, 0), isPast: true });
    expect(reminderState(once, now).isPast).toBe(false);
  });
  it('yearly returns the next anniversary', () => {
    expect(toISODate(nextFireTime(yearly, now))).toBe('2027-09-18');
    expect(toISODate(nextFireTime(yearly, new Date(2026, 8, 10)))).toBe('2026-09-18');
  });
  it('null without a reminder', () => {
    expect(nextFireTime(none, now)).toBeNull();
    expect(reminderState(none, now)).toBeNull();
  });
});

describe('dueOccurrence', () => {
  it('is null before the time and after the day', () => {
    expect(dueOccurrence(once, new Date(2026, 8, 25, 8, 59))).toBeNull();
    expect(dueOccurrence(once, new Date(2026, 8, 26, 9, 0))).toBeNull();
  });
  it('is the occurrence any time later that day', () => {
    expect(dueOccurrence(once, new Date(2026, 8, 25, 9, 0)).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    expect(dueOccurrence(once, new Date(2026, 8, 25, 23, 30)).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
  });
  it('works for anniversaries', () => {
    expect(dueOccurrence(yearly, new Date(2026, 8, 18, 14, 0)).getTime()).toBe(new Date(2026, 8, 18, 9, 0).getTime());
    expect(dueOccurrence(yearly, new Date(2026, 8, 19, 14, 0))).toBeNull();
  });
});

describe('findDue + keys', () => {
  it('skips fired, trashed and reminder-less entries', () => {
    const now = new Date(2026, 8, 25, 10, 0);
    const trashed = { ...once, id: 'e2', deletedAt: 1 };
    const fired = new Set([occurrenceKey('e1', new Date(2026, 8, 25, 9, 0))]);
    expect(findDue([once, trashed, none], now, k => fired.has(k))).toEqual([]);
    const due = findDue([once, trashed, none], now, () => false);
    expect(due).toHaveLength(1);
    expect(due[0].entry.id).toBe('e1');
    expect(due[0].key).toBe(`fired:e1:${new Date(2026, 8, 25, 9, 0).getTime()}`);
  });
});

describe('scheduleLabel', () => {
  it('formats both kinds', () => {
    expect(scheduleLabel(yearly)).toBe('Every year · 09:00');
    expect(scheduleLabel(once, 'en-US')).toBe('Sep 25, 2026 · 09:00');
    expect(scheduleLabel(none)).toBe('');
  });
});

describe('toICS', () => {
  const now = new Date(Date.UTC(2026, 8, 22, 10, 0, 0));
  it('emits a yearly VEVENT with RRULE and alarm', () => {
    const ics = toICS(yearly, { name: 'Finance' }, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20190918T090000');
    expect(ics).toContain('RRULE:FREQ=YEARLY');
    expect(ics).toContain('SUMMARY:Car insurance');
    expect(ics).toContain('DESCRIPTION:Renew online\\nCategory: Finance');
    expect(ics).toContain('DTSTAMP:20260922T100000Z');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('uses a BYMONTH/BYMONTHDAY=-1 RRULE for a Feb 29 anniversary, so it fires Feb 28/29 every year', () => {
    const feb29 = { ...yearly, date: '2020-02-29' };
    const ics = toICS(feb29, null, now);
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    expect(ics).not.toMatch(/RRULE:FREQ=YEARLY\r\n/);
  });
  it('emits a once VEVENT without RRULE and escapes text', () => {
    const e = { ...once, title: 'Semi; colon, comma', notes: '' };
    const ics = toICS(e, null, now);
    expect(ics).toContain('DTSTART:20260925T090000');
    expect(ics).not.toContain('RRULE');
    expect(ics).toContain('SUMMARY:Semi\\; colon\\, comma');
    // No event DESCRIPTION without notes/category (the VALARM keeps its required one).
    expect(ics.split('BEGIN:VALARM')[0]).not.toContain('DESCRIPTION:');
  });
  it('folds long lines at 72 chars', () => {
    const e = { ...once, notes: 'x'.repeat(200) };
    const lines = toICS(e, null, now).split('\r\n');
    expect(lines.every(l => l.length <= 73)).toBe(true);
    expect(lines.some(l => l.startsWith(' '))).toBe(true);
  });
  it('returns empty string without a reminder', () => { expect(toICS(none)).toBe(''); });
});

describe('startScheduler', () => {
  it('fires each due occurrence once and polls', () => {
    vi.useFakeTimers();
    const fired = new Set();
    const notify = vi.fn();
    let now = new Date(2026, 8, 25, 9, 0);
    const stop = startScheduler({ getEntries: () => [once], hasFired: k => fired.has(k), markFired: k => fired.add(k), notify, now: () => now, intervalMs: 1000 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].id).toBe('e1');
    vi.advanceTimersByTime(3000);
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });
});
