// @ts-check
import { startScheduler, scheduleLabel } from './reminders.js';
import { activeEntries } from './selectors.js';
import { store } from './store.js';

/** @typedef {import('./model.js').Entry} Entry */

export const NOTIFY_EXPLAINER =
  "DateTracker can only show a notification while it is open or was used recently — a free web app can't wake itself up at a set time. " +
  'For reminders you can rely on, use Add to calendar on a memory and let your calendar app alert you.';

const FIRED_PREFIX = 'fired:';
const KEEP_MS = 400 * 86400000;

/** @returns {'granted'|'denied'|'default'|'unsupported'} */
export function notificationPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Ask for permission (must be called from a user gesture). */
export async function requestNotifications() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/** @param {string} key */
function hasFired(key) {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}
/** @param {string} key */
function markFired(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* storage unavailable: may repeat once */ }
}

/**
 * Remove fired-reminder markers whose occurrence is more than 400 days old.
 * @param {any} [storage] @param {number} [now]
 */
export function pruneFiredKeys(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(FIRED_PREFIX)) continue;
      const at = Number(key.slice(key.lastIndexOf(':') + 1));
      if (!Number.isFinite(at) || now - at > KEEP_MS) stale.push(key);
    }
    stale.forEach((k) => storage.removeItem(k));
    return stale.length;
  } catch {
    return 0;
  }
}

/** @param {Entry} entry @param {string} [url] link to open on click; defaults to the entry's own detail page */
export async function showReminderNotification(entry, url = `./#/entry/${encodeURIComponent(entry.id)}`) {
  if (notificationPermission() !== 'granted') return;
  const options = {
    body: scheduleLabel(entry) || 'Reminder',
    tag: `dt-${entry.id}`,
    icon: './assets/icons/icon-192.png',
    data: { url },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(entry.title, options); return; }
  } catch { /* fall through */ }
  try { new Notification(entry.title, options); } catch { /* e.g. Android without a worker */ }
}

/** Start the in-app scheduler for the signed-in session. @returns {() => void} stop */
export function startReminderScheduler() {
  pruneFiredKeys();
  return startScheduler({
    getEntries: () => activeEntries(store.get().entries),
    hasFired: (key) => notificationPermission() !== 'granted' || hasFired(key),
    markFired,
    notify: (entry) => { showReminderNotification(entry); },
  });
}
