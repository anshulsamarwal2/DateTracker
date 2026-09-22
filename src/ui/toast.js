import { html, setHTML } from './dom.js';

/** @type {{ dismiss: () => void } | null} */
let current = null;

/**
 * Show a toast. Only one is visible at a time; a new one replaces the old.
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [opts]
 */
export function toast(message, { actionLabel, onAction, duration } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return undefined;
  current?.dismiss();

  const el = document.createElement('div');
  el.className = 'toast';
  setHTML(el, html`<span class="toast-text">${message}</span>${actionLabel ? html`<button type="button" class="toast-action">${actionLabel}</button>` : ''}`);
  host.append(el);

  const ms = duration ?? (actionLabel ? 6000 : 3000);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const start = () => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };
  const pause = () => clearTimeout(timer);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
    if (current === handle) current = null;
  }
  const handle = { dismiss };

  el.querySelector('.toast-action')?.addEventListener('click', () => { dismiss(); onAction?.(); });
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', start);
  el.addEventListener('pointerenter', pause);
  el.addEventListener('pointerleave', start);

  requestAnimationFrame(() => el.classList.add('is-visible'));
  start();
  current = handle;
  return handle;
}

/**
 * Report a failed Firestore write without blocking the UI on it.
 * @param {Promise<unknown>} promise
 * @param {string} [message]
 */
export function guard(promise, message = "Couldn't save. Check your connection and try again.") {
  promise.catch((err) => {
    console.error(err);
    toast(message);
  });
}
