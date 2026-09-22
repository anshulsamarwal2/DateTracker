// @ts-check
/**
 * Hash router.
 *   #/                    timeline
 *   #/entry/:id           entry detail
 *   #/reminders           reminders
 *   #/settings            settings index
 *   #/settings/:section   a settings section
 *
 * @typedef {{ name: 'timeline'|'entry'|'reminders'|'settings'|'notfound', params: { id?: string, section?: string } }} Route
 */

export const SETTINGS_SECTIONS = ['appearance', 'categories', 'notifications', 'data', 'trash', 'about'];

/** @param {string} p */
function decode(p) {
  try { return decodeURIComponent(p); } catch { return p; }
}

/** @param {string} hash @returns {Route} */
export function parseHash(hash) {
  const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  const parts = path ? path.split('/').map(decode) : [];
  if (parts.length === 0) return { name: 'timeline', params: {} };
  const [head, arg] = parts;
  if (head === 'entry' && parts.length === 2 && arg) return { name: 'entry', params: { id: arg } };
  if (head === 'reminders' && parts.length === 1) return { name: 'reminders', params: {} };
  if (head === 'settings' && parts.length === 1) return { name: 'settings', params: { section: '' } };
  if (head === 'settings' && parts.length === 2 && SETTINGS_SECTIONS.includes(arg)) return { name: 'settings', params: { section: arg } };
  return { name: 'notfound', params: {} };
}

/** @param {string} id */
export function entryHref(id) {
  return `#/entry/${encodeURIComponent(id)}`;
}

/** @returns {Route} */
export function currentRoute() {
  return parseHash(location.hash);
}

function depth() {
  return Number(history.state?.dtDepth) || 0;
}

function fireHashChange() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** @param {string} hash @param {{ replace?: boolean }} [opts] */
export function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) return;
  if (replace) history.replaceState({ dtDepth: depth() }, '', hash);
  else history.pushState({ dtDepth: depth() + 1 }, '', hash);
  fireHashChange();
}

/** Go back inside the app, or to `fallback` when there is nothing to go back to. @param {string} [fallback] */
export function back(fallback = '#/') {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** @param {(r: Route) => void} cb */
export function onRouteChange(cb) {
  const h = () => cb(currentRoute());
  window.addEventListener('hashchange', h);
  return () => window.removeEventListener('hashchange', h);
}

/** Route same-document "#/…" anchor clicks through navigate(). */
export function startRouter() {
  /** @param {MouseEvent} ev */
  const onClick = (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="#/"]') : null;
    if (!a || a.getAttribute('target')) return;
    ev.preventDefault();
    navigate(/** @type {string} */ (a.getAttribute('href')));
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
