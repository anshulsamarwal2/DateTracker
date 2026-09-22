import { describe, it, expect, vi, afterEach } from 'vitest';
import { pruneFiredKeys, notificationPermission, NOTIFY_EXPLAINER, showReminderNotification } from '../src/notifications.js';

const DAY = 86400000;
const fakeStorage = (entries) => {
  const m = new Map(entries);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => m.delete(k),
    getItem: (k) => m.get(k) ?? null,
    _m: m,
  };
};

describe('pruneFiredKeys', () => {
  it('drops fired keys whose occurrence is older than 400 days and keeps the rest', () => {
    const now = 1000 * DAY;
    const s = fakeStorage([
      [`fired:a:${now - 401 * DAY}`, '1'],
      [`fired:b:${now - 10 * DAY}`, '1'],
      ['fired:c:garbage', '1'],
      ['dt:prefs', '{}'],
    ]);
    expect(pruneFiredKeys(s, now)).toBe(2);
    expect([...s._m.keys()].sort()).toEqual(['dt:prefs', `fired:b:${now - 10 * DAY}`]);
  });
  it('never throws on a broken storage', () => {
    expect(pruneFiredKeys({ get length() { throw new Error('x'); } }, 0)).toBe(0);
  });
});

describe('permission & copy', () => {
  it('reports unsupported in Node', () => {
    expect(notificationPermission()).toBe('unsupported');
  });
  it('explains the limitation in two sentences', () => {
    expect(NOTIFY_EXPLAINER.split('. ').length).toBe(2);
  });
});

describe('showReminderNotification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to the entry link, but accepts a url override for entries that have none', async () => {
    const calls = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(title, options) { calls.push({ title, options }); }
    }
    vi.stubGlobal('Notification', FakeNotification);
    vi.stubGlobal('navigator', {});

    await showReminderNotification({ id: 'e1', title: 'Car insurance', reminder: null });
    expect(calls[0].options.data.url).toBe('./#/entry/e1');

    await showReminderNotification({ id: 'test', title: 'DateTracker', reminder: null }, './#/reminders');
    expect(calls[1].options.data.url).toBe('./#/reminders');
  });
});
