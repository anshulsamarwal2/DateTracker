import { store } from '../store.js';
import { back } from '../router.js';
import { ACCENTS, loadPrefs, updatePrefs, isHex } from '../theme.js';
import { signOutUser } from '../firebase.js';
import { activeEntries, trashedEntries } from '../selectors.js';
import { notificationPermission, requestNotifications, showReminderNotification } from '../notifications.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './timeline.js';
import { logoMark } from './landing.js';
import { notificationStatusBlock } from './reminders-view.js';
import { confirmSheet } from './sheet.js';
import { toast } from './toast.js';
import { sectionScreen, lastBackupLabel } from './settings-shared.js';
import { mount as mountCategories } from './settings-categories.js';

export const APP_VERSION = '9.0.0';

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
const PERMISSION_LABEL = { granted: 'On', default: 'Off', denied: 'Blocked', unsupported: 'Not supported' };

/* ---------- Index ---------- */

/** @param {HTMLElement} root */
function mountIndex(root) {
  let last = '';
  function render() {
    const s = store.get();
    const active = activeEntries(s.entries);
    const trashed = trashedEntries(s.entries);
    const prefs = loadPrefs();
    const accent = ACCENTS.find((a) => a.color.toLowerCase() === prefs.accent.toLowerCase());
    const markup = String(html`
      <main class="screen settings">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          <h1 class="topbar-title">Settings</h1>
        </header>
        <section class="account" aria-label="Account">
          ${avatar(s.user)}
          <div class="account-text">
            <p class="account-name">${s.user?.name || 'Signed in'}</p>
            <p class="secondary">${s.user?.email || ''}</p>
            <p class="muted">${plural(active.length, 'memory', 'memories')} across ${plural(s.categories.length, 'category', 'categories')}.</p>
          </div>
        </section>
        <nav class="list" aria-label="Settings">
          ${row('#/settings/appearance', 'sun', 'Appearance', `${THEME_LABEL[prefs.theme]} · ${accent ? accent.name : 'Custom'}`)}
          ${row('#/settings/categories', 'tag', 'Categories', plural(s.categories.length, 'category', 'categories'))}
          ${row('#/settings/notifications', 'bell', 'Notifications', PERMISSION_LABEL[notificationPermission()])}
          ${row('#/settings/data', 'download', 'Data', lastBackupLabel(s.meta))}
          ${row('#/settings/trash', 'trash-2', 'Trash', trashed.length ? plural(trashed.length, 'memory', 'memories') : 'Empty')}
          ${row('#/settings/about', 'info', 'About', `Version ${APP_VERSION}`)}
        </nav>
        <div class="list">
          <button type="button" class="list-row" data-action="signout">${icon('log-out')}<span class="list-row-main">Sign out</span></button>
        </div>
      </main>`);
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  /** @param {string} href @param {string} ic @param {string} title @param {string} meta */
  function row(href, ic, title, meta) {
    return html`
      <a class="list-row" href="${href}">
        ${icon(ic)}
        <span class="list-row-main"><span class="list-row-title">${title}</span><span class="list-row-meta">${meta}</span></span>
        ${icon('chevron-right')}
      </a>`;
  }
  const off = delegate(root, 'click', {
    back: () => back('#/'),
    signout: async () => {
      const ok = await confirmSheet({ title: 'Sign out?', message: 'Your journal stays safe in your account. Sign in again any time.', confirmLabel: 'Sign out' });
      if (ok) signOutUser().catch(() => toast("Couldn't sign out. Try again."));
    },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}

/* ---------- Appearance ---------- */

/** @param {HTMLElement} root */
function mountAppearance(root) {
  function render() {
    const prefs = loadPrefs();
    const isPreset = ACCENTS.some((a) => a.color.toLowerCase() === prefs.accent.toLowerCase());
    setHTML(root, sectionScreen('Appearance', html`
      <h2 class="label list-title" id="theme-label">Theme</h2>
      <div class="content">
        <div class="segmented" role="group" aria-labelledby="theme-label">
          ${[['system', 'monitor'], ['light', 'sun'], ['dark', 'moon']].map(([mode, ic]) => html`
            <button type="button" data-action="theme" data-mode="${mode}" aria-pressed="${String(prefs.theme === mode)}">
              ${icon(ic, { cls: 'icon-sm' })}${THEME_LABEL[/** @type {'system'|'light'|'dark'} */ (mode)]}
            </button>`)}
        </div>
      </div>
      <h2 class="label list-title" id="accent-label">Accent</h2>
      <div class="content swatches" role="group" aria-labelledby="accent-label">
        ${ACCENTS.map((a) => html`
          <button type="button" class="swatch" data-action="accent" data-color="${a.color}" style="--c:${a.color}"
            aria-pressed="${String(a.color.toLowerCase() === prefs.accent.toLowerCase())}" aria-label="${a.name}">
            ${icon('check', { cls: 'swatch-check' })}
          </button>`)}
        <label class="swatch swatch-custom" style="--c:${isPreset ? 'transparent' : prefs.accent}" data-pressed="${String(!isPreset)}">
          <span class="visually-hidden">Custom colour</span>
          <input type="color" data-action="custom-accent" value="${prefs.accent}">
          ${icon('plus', { cls: 'icon-sm' })}
        </label>
      </div>
      <p class="content field-hint">Saved on this device only.</p>`));
  }
  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      theme: (el) => { updatePrefs({ theme: /** @type {any} */ (el.dataset.mode) }); render(); /** @type {HTMLElement|null} */ (root.querySelector(`[data-mode="${el.dataset.mode}"]`))?.focus(); },
      accent: (el) => { updatePrefs({ accent: /** @type {string} */ (el.dataset.color) }); render(); /** @type {HTMLElement|null} */ (root.querySelector(`[data-color="${el.dataset.color}"]`))?.focus(); },
    }),
    delegate(root, 'change', {
      'custom-accent': (el) => {
        const v = /** @type {HTMLInputElement} */ (el).value.toUpperCase();
        if (isHex(v)) { updatePrefs({ accent: v }); render(); }
      },
    }),
  ];
  render();
  return { unmount() { offs.forEach((off) => off()); } };
}

/* ---------- Notifications ---------- */

/** @param {HTMLElement} root */
function mountNotifications(root) {
  function render() {
    setHTML(root, sectionScreen('Notifications', html`
      <div class="content">
        ${notificationStatusBlock()}
        ${notificationPermission() === 'granted'
          ? html`<button type="button" class="btn btn-secondary" data-action="test">Send a test notification</button>` : ''}
        <h2 class="label list-title flush">Calendar alerts</h2>
        <p class="secondary">Open any memory with a reminder and choose ${icon('calendar-plus', { cls: 'icon-sm inline-icon' })} <strong>Add to calendar</strong>. Anniversaries repeat every year in your calendar, with an alert.</p>
      </div>`));
  }
  const off = delegate(root, 'click', {
    back: () => back('#/settings'),
    'enable-notifications': async () => { await requestNotifications(); render(); },
    test: () => showReminderNotification(/** @type {any} */ ({ id: 'test', title: 'DateTracker', reminder: null })),
  });
  render();
  return { unmount: off };
}

/* ---------- About ---------- */

/** @param {HTMLElement} root */
function mountAbout(root) {
  setHTML(root, sectionScreen('About', html`
    <div class="content about">
      ${logoMark()}
      <p class="about-name">DateTracker</p>
      <p class="muted">Version ${APP_VERSION}</p>
      <p>Built by Anshul Samarwal.</p>
      <p><a class="btn btn-secondary" href="https://github.com/anshulsamarwal2/DateTracker" target="_blank" rel="noopener noreferrer">${icon('external-link', { cls: 'icon-sm' })}Source on GitHub</a></p>
      <h2 class="label list-title flush">Licences</h2>
      <p class="secondary">Icons: <a href="./assets/icons/LICENSE-lucide.txt" target="_blank" rel="noopener">Lucide</a> (ISC licence).</p>
      <p class="secondary">Typeface: <a href="./assets/fonts/OFL.txt" target="_blank" rel="noopener">Outfit</a> (SIL Open Font License 1.1).</p>
    </div>`));
  const off = delegate(root, 'click', { back: () => back('#/settings') });
  return { unmount: off };
}

/* ---------- Router ---------- */

/** Section name → mount. Tasks 25–27 add categories, data and trash. @type {Record<string, (root: HTMLElement) => { unmount(): void }>} */
const SECTIONS = {
  appearance: mountAppearance,
  categories: mountCategories,
  notifications: mountNotifications,
  about: mountAbout,
};

/** @param {HTMLElement} root @param {{ section?: string }} params */
export function mount(root, { section = '' }) {
  if (!section) return mountIndex(root);
  const m = SECTIONS[section];
  if (m) return m(root);
  setHTML(root, sectionScreen('Settings', html`<div class="empty"><p>This section isn't available yet.</p></div>`));
  const off = delegate(root, 'click', { back: () => back('#/settings') });
  return { unmount: off };
}
