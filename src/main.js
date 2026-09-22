/**
 * Boot: theme → router → auth → first run → live subscriptions → screens.
 */
import { initTheme } from './theme.js';
import { store, initialState } from './store.js';
import { startRouter } from './router.js';
import { watchAuth, completeRedirect } from './firebase.js';
import { ensureFirstRun, subscribeEntries, subscribeCategories, subscribeMeta } from './db.js';
import { startApp } from './ui/app.js';
import { toast } from './ui/toast.js';

history.scrollRestoration = 'manual';
initTheme();
startRouter();

/** @type {() => void} */
let stopSession = () => {};
/** @type {any} */
let currentUser = null;

/** @param {any} u */
function toUser(u) {
  return { uid: u.uid, name: u.displayName || '', email: u.email || '', photoURL: u.photoURL || '' };
}

/** @param {unknown} err */
function failBoot(err) {
  console.error(err);
  store.set({
    status: 'error',
    error: navigator.onLine
      ? 'Check your connection and try again.'
      : "You're offline, and this device hasn't loaded your journal yet. Connect and try again.",
  });
}

/** @param {any} fbUser */
async function startSession(fbUser) {
  stopSession();
  const user = toUser(fbUser);
  store.set({ ...initialState(), status: 'loading', user });

  /** @type {(() => void)[]} */
  const unsubs = [];
  let cancelled = false;
  stopSession = () => { cancelled = true; unsubs.splice(0).forEach((u) => u()); };

  try {
    await ensureFirstRun(user.uid);
  } catch (err) {
    if (!cancelled) failBoot(err);
    return;
  }
  if (cancelled) return;

  let gotEntries = false;
  let gotCategories = false;
  let pendingEntries = false;
  let pendingCategories = false;
  const sync = () => (pendingEntries || pendingCategories ? 'pending' : 'clean');
  const maybeReady = () => {
    if (gotEntries && gotCategories && store.get().status === 'loading') store.set({ status: 'ready' });
  };
  /** @param {unknown} err */
  const onError = (err) => {
    if (store.get().status !== 'ready') { failBoot(err); return; }
    console.error(err);
    store.set({ sync: 'error' });
    toast('Sync stopped. Reload the app to reconnect.');
  };

  unsubs.push(subscribeEntries(user.uid, (entries, pending) => {
    gotEntries = true;
    pendingEntries = pending;
    store.set({ entries, sync: store.get().sync === 'error' ? 'error' : sync() });
    maybeReady();
  }, onError));
  unsubs.push(subscribeCategories(user.uid, (categories, pending) => {
    gotCategories = true;
    pendingCategories = pending;
    store.set({ categories, sync: store.get().sync === 'error' ? 'error' : sync() });
    maybeReady();
  }, onError));
  unsubs.push(subscribeMeta(user.uid, (meta) => store.set({ meta }), onError));
}

startApp(/** @type {HTMLElement} */ (document.getElementById('app')), {
  onRetry: () => { if (currentUser) startSession(currentUser); },
  onReload: () => location.reload(),
});

completeRedirect();
watchAuth((u) => {
  if (u && currentUser && u.uid === currentUser.uid && store.get().status !== 'signedOut') return;
  currentUser = u;
  if (u) startSession(u);
  else { stopSession(); store.set({ ...initialState(), status: 'signedOut' }); }
});

window.addEventListener('online', () => store.set({ online: true }));
window.addEventListener('offline', () => store.set({ online: false }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') store.set((s) => ({ tick: s.tick + 1 }));
});
