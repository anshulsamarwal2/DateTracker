import { store } from '../store.js';
import { currentRoute, onRouteChange } from '../router.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { mountLanding, mountLoading, mountError } from './landing.js';

/** @typedef {(root: HTMLElement, params: { id?: string, section?: string }) => { unmount(): void }} MountFn */

/** Route name → screen. Tasks 20, 22, 23 and 24 add their screens here. @type {Record<string, MountFn>} */
const SCREENS = {
};

/** @type {MountFn} */
function mountNotFound(root) {
  setHTML(root, html`
    <main class="screen">
      <div class="empty">
        <h2>Nothing here.</h2>
        <p><a href="#/">Go to your journal</a></p>
      </div>
    </main>`);
  return { unmount() {} };
}

/**
 * Mount the right screen for the current status + route, and the banner layer.
 * @param {HTMLElement} root
 * @param {{ onRetry: () => void, onReload: () => void }} hooks
 */
export function startApp(root, { onRetry, onReload }) {
  setHTML(root, html`<div class="banner" id="banner"></div><div id="screen" tabindex="-1"></div>`);
  const bannerEl = /** @type {HTMLElement} */ (root.querySelector('#banner'));
  const screenEl = /** @type {HTMLElement} */ (root.querySelector('#screen'));
  /** @type {{ unmount(): void } | null} */
  let mounted = null;
  let mountedKey = '';
  /** @type {Map<string, number>} */
  const scrollMemory = new Map();

  function show() {
    const s = store.get();
    /** @type {string} */ let key;
    /** @type {(r: HTMLElement) => { unmount(): void }} */ let mount;
    if (s.status === 'loading') { key = 'loading'; mount = mountLoading; }
    else if (s.status === 'signedOut') { key = 'landing'; mount = mountLanding; }
    else if (s.status === 'error') { key = `error:${s.error}`; mount = (r) => mountError(r, { message: s.error, onRetry }); }
    else {
      const route = currentRoute();
      key = `route:${route.name}:${route.params.id || route.params.section || ''}`;
      mount = (r) => (SCREENS[route.name] || mountNotFound)(r, route.params);
    }
    if (key === mountedKey) return;

    const hadFocus = screenEl.contains(document.activeElement);
    if (mounted) { scrollMemory.set(mountedKey, window.scrollY); mounted.unmount(); }
    screenEl.replaceChildren();
    mountedKey = key;
    mounted = mount(screenEl);
    window.scrollTo(0, scrollMemory.get(key) || 0);
    screenEl.classList.remove('is-entering');
    void screenEl.offsetWidth;
    screenEl.classList.add('is-entering');
    if (hadFocus || document.activeElement === document.body) screenEl.focus({ preventScroll: true });
  }

  let bannerKey = '';
  function renderBanner() {
    const s = store.get();
    const key = `${s.online}|${s.updateReady}|${s.status}`;
    if (key === bannerKey) return;
    bannerKey = key;
    const signedIn = s.status === 'ready';
    setHTML(bannerEl, html`
      ${!s.online && signedIn ? html`<div class="pill">${icon('cloud-off', { cls: 'icon-sm' })}<span>Offline — changes will sync</span></div>` : ''}
      ${s.updateReady ? html`<div class="pill"><span>Update ready</span><span aria-hidden="true">·</span><button type="button" data-action="reload">Reload</button></div>` : ''}`);
  }
  delegate(bannerEl, 'click', { reload: () => onReload() });

  store.subscribe(() => { show(); renderBanner(); });
  onRouteChange(show);
  show();
  renderBanner();
}
