import { html, setHTML, delegate, focusFirst, FOCUSABLE } from './dom.js';
import { icon } from './icons.js';

/**
 * @typedef {{ id: number, el: HTMLElement, content: HTMLElement, close: () => Promise<void>,
 *             requestClose: () => void, setTitle: (t: string) => void }} SheetAPI
 */

let seq = 0;
/** Open sheets, topmost last. @type {(SheetAPI & { _onPop: () => void })[]} */
const stack = [];
/** Resolvers waiting for the popstate caused by our own history.back(). @type {(() => void)[]} */
const backWaiters = [];

window.addEventListener('popstate', () => {
  if (backWaiters.length) { /** @type {() => void} */ (backWaiters.shift())(); return; }
  stack[stack.length - 1]?._onPop();
});

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {{ title: string, render: (content: HTMLElement, api: SheetAPI) => (void | (() => void)),
 *           isDirty?: () => boolean, className?: string, onClose?: () => void }} opts
 * @returns {SheetAPI}
 */
export function openSheet({ title, render, isDirty = () => false, className = '', onClose }) {
  const id = ++seq;
  const opener = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  setHTML(layer, html`
    <div class="sheet-backdrop" data-action="dismiss"></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-labelledby="sheet-title-${id}">
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 id="sheet-title-${id}">${title}</h2>
        <button type="button" class="icon-btn" data-action="dismiss" aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-content"></div>
      <div class="sheet-discard" hidden>
        <p>Discard changes?</p>
        <button type="button" class="btn btn-secondary" data-action="keep">Keep editing</button>
        <button type="button" class="btn btn-danger" data-action="discard">Discard</button>
      </div>
    </section>`);

  const sheetEl = /** @type {HTMLElement} */ (layer.querySelector('.sheet'));
  const content = /** @type {HTMLElement} */ (layer.querySelector('.sheet-content'));
  const discardBar = /** @type {HTMLElement} */ (layer.querySelector('.sheet-discard'));
  let closed = false;
  /** @type {void | (() => void)} */
  let cleanup;

  function showDiscard() {
    discardBar.hidden = false;
    /** @type {HTMLElement} */ (discardBar.querySelector('[data-action="keep"]')).focus();
  }

  /** @param {{ historyDone?: boolean }} [o] */
  function close({ historyDone = false } = {}) {
    if (closed) return Promise.resolve();
    closed = true;
    stack.splice(stack.indexOf(api), 1);
    offClick();
    layer.removeEventListener('keydown', onKey);
    if (typeof cleanup === 'function') cleanup();
    layer.classList.remove('is-open');
    setTimeout(() => layer.remove(), reducedMotion() ? 0 : 260);
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();

    const settled = historyDone || history.state?.dtSheet !== id
      ? Promise.resolve()
      : new Promise((resolve) => {
        const done = () => { clearTimeout(t); resolve(undefined); };
        const t = setTimeout(() => { const i = backWaiters.indexOf(done); if (i >= 0) backWaiters.splice(i, 1); resolve(undefined); }, 400);
        backWaiters.push(done);
        history.back();
      });
    return settled.then(() => { onClose?.(); });
  }

  function requestClose() {
    if (isDirty()) showDiscard();
    else close();
  }

  /** Back button while this sheet is on top. The sheet's history entry is already gone. */
  function onPop() {
    if (isDirty()) {
      history.pushState({ ...(history.state || {}), dtSheet: id }, '');
      showDiscard();
    } else {
      close({ historyDone: true });
    }
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (stack[stack.length - 1] !== api) return;
    if (ev.key === 'Escape') { ev.preventDefault(); requestClose(); return; }
    if (ev.key !== 'Tab') return;
    const items = [...sheetEl.querySelectorAll(FOCUSABLE)].filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null);
    if (!items.length) return;
    const first = /** @type {HTMLElement} */ (items[0]);
    const last = /** @type {HTMLElement} */ (items[items.length - 1]);
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  const offClick = delegate(layer, 'click', {
    dismiss: () => requestClose(),
    keep: () => { discardBar.hidden = true; focusFirst(content); },
    discard: () => close(),
  });
  layer.addEventListener('keydown', onKey);

  const api = {
    id,
    el: sheetEl,
    content,
    close: () => close(),
    requestClose,
    /** @param {string} t */
    setTitle: (t) => { /** @type {HTMLElement} */ (layer.querySelector(`#sheet-title-${id}`)).textContent = t; },
    _onPop: onPop,
  };

  /** @type {HTMLElement} */ (document.getElementById('sheets')).append(layer);
  history.pushState({ ...(history.state || {}), dtSheet: id }, '');
  stack.push(api);
  cleanup = render(content, api);
  requestAnimationFrame(() => {
    layer.classList.add('is-open');
    if (content.querySelector('[autofocus]') || content.querySelector(FOCUSABLE)) focusFirst(content);
    else /** @type {HTMLElement} */ (layer.querySelector('[data-action="dismiss"].icon-btn')).focus();
  });
  return api;
}

/**
 * A small confirm dialog. Resolves after the sheet has fully closed.
 * @param {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmSheet({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title,
      className: 'sheet--confirm',
      onClose: () => resolve(result),
      render(content, api) {
        setHTML(content, html`
          ${message ? html`<div class="sheet-body"><p>${message}</p></div>` : ''}
          <div class="sheet-foot">
            <button type="button" class="btn btn-secondary" data-action="cancel" ${danger ? 'autofocus' : ''}>${cancelLabel}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="ok" ${danger ? '' : 'autofocus'}>${confirmLabel}</button>
          </div>`);
        return delegate(content, 'click', {
          cancel: () => api.close(),
          ok: () => { result = true; api.close(); },
        });
      },
    });
  });
}
