import { store, setUI } from '../store.js';
import { back } from '../router.js';
import { addCategory, updateCategory, reorderCategories, deleteCategory } from '../db.js';
import { buildCategory, nextPaletteColor, validateCategoryName, PALETTE, LIMITS } from '../model.js';
import { categoryCounts } from '../selectors.js';
import { isHex } from '../theme.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet, confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { sectionScreen } from './settings-shared.js';

/** @typedef {import('../model.js').Category} Category */

/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;
const uid = () => /** @type {string} */ (store.get().user?.uid);

/** @param {Category} cat */
function openEditor(cat) {
  const state = { name: cat.name, color: cat.color };
  const initial = JSON.stringify(state);
  let error = '';
  openSheet({
    title: 'Edit category',
    isDirty: () => JSON.stringify(state) !== initial,
    render(content, api) {
      function render() {
        const custom = !PALETTE.some((p) => p.toLowerCase() === state.color.toLowerCase());
        setHTML(content, html`
          <form class="sheet-body" data-action="save" novalidate id="cat-form">
            <div class="field">
              <label class="field-label" for="cat-name">Name</label>
              <input class="input" id="cat-name" name="name" data-action="name" maxlength="${LIMITS.categoryName}" autocomplete="off"
                value="${state.name}" aria-invalid="${String(Boolean(error))}" aria-describedby="cat-name-err" autofocus>
              <p class="field-error" id="cat-name-err" ${error ? '' : 'hidden'}>${error}</p>
            </div>
            <div class="field">
              <span class="field-label" id="cat-color-label">Colour</span>
              <div class="swatches small" role="group" aria-labelledby="cat-color-label">
                ${PALETTE.map((c) => html`<button type="button" class="swatch" data-action="color" data-color="${c}" style="--c:${c}"
                  aria-pressed="${String(c.toLowerCase() === state.color.toLowerCase())}" aria-label="Colour ${c}">${icon('check', { cls: 'swatch-check' })}</button>`)}
                <label class="swatch swatch-custom" style="--c:${custom ? state.color : 'transparent'}" data-pressed="${String(custom)}">
                  <span class="visually-hidden">Custom colour</span>
                  <input type="color" data-action="custom" value="${state.color}">
                  ${icon('plus', { cls: 'icon-sm' })}
                </label>
              </div>
            </div>
            <button type="button" class="btn btn-danger" data-action="delete">${icon('trash-2')}Delete category</button>
          </form>
          <div class="sheet-foot">
            <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" form="cat-form">Save</button>
          </div>`);
      }
      render();
      const offs = [
        delegate(content, 'input', { name: (el) => { state.name = /** @type {HTMLInputElement} */ (el).value; } }),
        delegate(content, 'change', {
          custom: (el) => {
            const v = /** @type {HTMLInputElement} */ (el).value.toUpperCase();
            if (isHex(v)) { state.color = v; render(); }
          },
        }),
        delegate(content, 'click', {
          cancel: () => api.requestClose(),
          color: (el) => { state.color = /** @type {string} */ (el.dataset.color); render(); /** @type {HTMLElement|null} */ (content.querySelector(`[data-color="${state.color}"]`))?.focus(); },
          delete: () => { api.close().then(() => confirmDelete(cat)); },
        }),
        delegate(content, 'submit', {
          save: (_el, ev) => {
            ev.preventDefault();
            const msg = validateCategoryName(state.name, store.get().categories, cat.id);
            if (msg) { error = msg; render(); /** @type {HTMLElement} */ (content.querySelector('#cat-name')).focus(); return; }
            guard(updateCategory(uid(), cat.id, { name: state.name.trim(), color: state.color }));
            api.close();
          },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {Category} cat */
async function confirmDelete(cat) {
  const s = store.get();
  const entryIds = s.entries.filter((e) => e.categoryId === cat.id).map((e) => e.id);
  const finish = (/** @type {string|null} */ target) => {
    guard(deleteCategory(uid(), cat.id, entryIds, target));
    if (store.get().ui.categoryId === cat.id) setUI({ categoryId: 'all' });
    toast(`Deleted “${cat.name}”`);
  };
  if (!entryIds.length) {
    const ok = await confirmSheet({ title: `Delete “${cat.name}”?`, confirmLabel: 'Delete', danger: true });
    if (ok) finish(null);
    return;
  }
  const others = s.categories.filter((c) => c.id !== cat.id);
  let target = '';
  openSheet({
    title: `Delete “${cat.name}”?`,
    className: 'sheet--confirm',
    render(content, api) {
      setHTML(content, html`
        <div class="sheet-body">
          <p class="secondary">${memories(entryIds.length)} use this category. Move them to:</p>
          <div class="radio-list" role="radiogroup" aria-label="Move memories to">
            ${others.map((c) => html`<label class="radio-row"><input type="radio" name="target" value="${c.id}" data-action="target"><span class="dot" style="--c:${c.color}"></span>${c.name}</label>`)}
            <label class="radio-row"><input type="radio" name="target" value="" data-action="target" checked><span class="dot"></span>No category</label>
          </div>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn btn-secondary" data-action="cancel" autofocus>Cancel</button>
          <button type="button" class="btn btn-danger" data-action="confirm">Delete category</button>
        </div>`);
      const offs = [
        delegate(content, 'change', { target: (el) => { target = /** @type {HTMLInputElement} */ (el).value; } }),
        delegate(content, 'click', {
          cancel: () => api.close(),
          confirm: () => { api.close().then(() => finish(target || null)); },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {HTMLElement} root */
export function mount(root) {
  let error = '';
  let last = '';
  function render() {
    const s = store.get();
    const counts = categoryCounts(s.entries.filter((e) => e.deletedAt == null));
    const cats = s.categories;
    const markup = String(sectionScreen('Categories', html`
      ${cats.length ? html`
        <ul class="list" aria-label="Categories">
          ${cats.map((c, i) => html`
            <li class="list-row cat-row">
              <span class="dot" style="--c:${c.color}"></span>
              <button type="button" class="cat-open" data-action="edit" data-id="${c.id}">
                <span class="list-row-title">${c.name}</span>
                <span class="list-row-meta">${memories(counts.get(c.id) || 0)}</span>
              </button>
              <button type="button" class="icon-btn" data-action="up" data-id="${c.id}" aria-label="Move ${c.name} up" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
              <button type="button" class="icon-btn" data-action="down" data-id="${c.id}" aria-label="Move ${c.name} down" ${i === cats.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
            </li>`)}
        </ul>` : html`<div class="empty"><p>No categories yet.</p></div>`}
      <form class="content add-cat" data-action="add" novalidate>
        <label class="field-label" for="new-cat">Add a category</label>
        <div class="newcat">
          <input class="input" id="new-cat" name="name" maxlength="${LIMITS.categoryName}" placeholder="e.g. Work" autocomplete="off"
            aria-invalid="${String(Boolean(error))}" aria-describedby="new-cat-err">
          <button type="submit" class="btn btn-secondary">${icon('plus', { cls: 'icon-sm' })}Add</button>
        </div>
        <p class="field-error" id="new-cat-err" ${error ? '' : 'hidden'}>${error}</p>
      </form>`));
    if (markup === last) return;
    const input = /** @type {HTMLInputElement|null} */ (root.querySelector('#new-cat'));
    const typed = input?.value ?? '';
    const hadFocus = input !== null && document.activeElement === input;
    const focusedMove = /** @type {HTMLElement|null} */ (document.activeElement)?.closest?.('[data-action="up"],[data-action="down"]');
    const moveKey = focusedMove && root.contains(focusedMove) ? `[data-action="${focusedMove.dataset.action}"][data-id="${focusedMove.dataset.id}"]` : '';
    setHTML(root, markup);
    last = markup;
    const next = /** @type {HTMLInputElement} */ (root.querySelector('#new-cat'));
    next.value = typed;
    if (hadFocus) next.focus();
    if (moveKey) {
      const btn = /** @type {HTMLButtonElement|null} */ (root.querySelector(moveKey));
      if (btn && !btn.disabled) btn.focus();
      else /** @type {HTMLElement|null} */ (root.querySelector(`[data-action="edit"][data-id="${focusedMove?.dataset.id}"]`))?.focus();
    }
  }

  /** @param {string} id @param {-1|1} delta */
  function move(id, delta) {
    const ids = store.get().categories.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    guard(reorderCategories(uid(), ids));
  }

  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      edit: (el) => { const c = store.get().categories.find((x) => x.id === el.dataset.id); if (c) openEditor(c); },
      up: (el) => move(/** @type {string} */ (el.dataset.id), -1),
      down: (el) => move(/** @type {string} */ (el.dataset.id), 1),
    }),
    delegate(root, 'submit', {
      add: (_el, ev) => {
        ev.preventDefault();
        const input = /** @type {HTMLInputElement} */ (root.querySelector('#new-cat'));
        const cats = store.get().categories;
        const msg = validateCategoryName(input.value, cats);
        error = msg || '';
        if (msg) { render(); input.focus(); return; }
        const order = cats.reduce((m, c) => Math.max(m, c.order), -1) + 1;
        guard(addCategory(uid(), buildCategory({ name: input.value, color: nextPaletteColor(cats), order })));
        input.value = '';
        render();
      },
    }),
  ];
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); offs.forEach((off) => off()); } };
}
