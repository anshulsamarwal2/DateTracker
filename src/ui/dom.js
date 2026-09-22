// @ts-check
/**
 * Tiny DOM toolkit. All markup is built with html``: every interpolated value
 * is escaped unless it is a Raw (produced by html`` itself, raw() or icon()).
 * raw() is for markup the app composed — never for user data.
 */

/** @type {Record<string, string>} */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export class Raw {
  /** @param {string} value */
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** @param {unknown} v */
export function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, ch => ESC[ch]);
}

/** Mark app-composed markup as trusted. @param {string} s */
export function raw(s) {
  return new Raw(String(s));
}

/** @param {unknown} v @returns {string} */
function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHTML(v);
}

/** Auto-escaping template tag. @param {TemplateStringsArray} strings @param {...unknown} values */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/** Escape text and turn http(s) URLs into links that open in a new tab. @param {string} text */
export function linkify(text) {
  const s = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    const start = /** @type {number} */ (m.index);
    out += escapeHTML(s.slice(last, start));
    out += `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a>`;
    last = start + url.length;
  }
  return new Raw(out + escapeHTML(s.slice(last)));
}

/** @param {Element} el @param {Raw|string} markup */
export function setHTML(el, markup) {
  el.innerHTML = String(markup);
}

/**
 * Event delegation on data-action attributes.
 * @param {Element} root @param {string} type
 * @param {Record<string, (el: HTMLElement, ev: Event) => void>} handlers
 * @returns {() => void}
 */
export function delegate(root, type, handlers) {
  /** @param {Event} ev */
  const listener = (ev) => {
    const t = /** @type {any} */ (ev.target);
    const el = t && typeof t.closest === 'function' ? t.closest('[data-action]') : null;
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.getAttribute('data-action') || ''];
    if (fn) fn(el, ev);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus [autofocus] or the first focusable element. @param {Element} container */
export function focusFirst(container) {
  const el = container.querySelector('[autofocus]') || container.querySelector(FOCUSABLE);
  if (el && 'focus' in el) /** @type {HTMLElement} */ (el).focus();
}
