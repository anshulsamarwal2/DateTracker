// @ts-check
/**
 * A tiny observable store. State is replaced (shallow merge) on every set();
 * subscribers are called synchronously with the new state.
 *
 * @typedef {import('./model.js').Entry} Entry
 * @typedef {import('./model.js').Category} Category
 * @typedef {{ schemaVersion: number, createdAt: number, lastBackupAt: number|null, backupNudgeDismissedAt: number|null }} Meta
 * @typedef {{ uid: string, name: string, email: string, photoURL: string }} User
 * @typedef {{ categoryId: string, starredOnly: boolean, query: string, searching: boolean }} UI
 * @typedef {{ status: 'loading'|'signedOut'|'ready'|'error', user: User|null, entries: Entry[], categories: Category[],
 *             meta: Meta|null, sync: 'clean'|'pending'|'error', error: string, online: boolean,
 *             updateReady: boolean, tick: number, ui: UI }} AppState
 */

/**
 * @template S
 * @param {S} initial
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<(s: S) => void>} */
  const subs = new Set();
  return {
    /** @returns {S} */
    get: () => state,
    /** @param {Partial<S> | ((s: S) => Partial<S>)} patch */
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const fn of [...subs]) if (subs.has(fn)) fn(state);
    },
    /** @param {(s: S) => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/** @type {UI} */
export const INITIAL_UI = { categoryId: 'all', starredOnly: false, query: '', searching: false };

/** @returns {AppState} */
export function initialState() {
  return {
    status: 'loading',
    user: null,
    entries: [],
    categories: [],
    meta: null,
    sync: 'clean',
    error: '',
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    updateReady: false,
    tick: 0,
    ui: { ...INITIAL_UI },
  };
}

export const store = createStore(initialState());

/** @param {Partial<UI>} patch */
export function setUI(patch) {
  store.set(s => ({ ui: { ...s.ui, ...patch } }));
}
