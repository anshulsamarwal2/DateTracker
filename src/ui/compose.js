import { store } from '../store.js';
import { addEntry, updateEntry, addCategory } from '../db.js';
import {
  validateEntry, buildEntry, entryPatch, buildCategory, nextPaletteColor, validateCategoryName, LIMITS,
} from '../model.js';
import { todayISO, parseISODate, toDateTimeLocal, formatDayMonth } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { guard, toast } from './toast.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

let formSeq = 0;

/** Once-reminder default: the entry date at 09:00 if that is still ahead, otherwise tomorrow 09:00. @param {string} dateISO */
function defaultOnceAt(dateISO, now = new Date()) {
  const d = parseISODate(dateISO);
  if (d) {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
    if (at.getTime() > now.getTime()) return toDateTimeLocal(at);
  }
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return toDateTimeLocal(t);
}

/** @param {{ entry?: Entry }} [opts] */
export function openCompose({ entry } = {}) {
  const s = store.get();
  if (!s.user) return;
  const uid = s.user.uid;
  const n = ++formSeq;
  const ids = { form: `c-form-${n}`, title: `c-title-${n}`, date: `c-date-${n}`, notes: `c-notes-${n}`, cats: `c-cats-${n}`, rem: `c-rem-${n}` };

  const r = entry?.reminder;
  const state = {
    title: entry?.title ?? '',
    date: entry?.date ?? todayISO(),
    categoryId: entry ? entry.categoryId : (s.ui.categoryId !== 'all' ? s.ui.categoryId : null),
    notes: entry?.notes ?? '',
    starred: entry?.starred ?? false,
    reminderOn: Boolean(r),
    reminderKind: r?.kind ?? 'yearly',
    onceAt: r?.kind === 'once' ? r.at : '',
    yearlyTime: r?.kind === 'yearly' ? r.time : '09:00',
  };
  const initial = JSON.stringify(state);
  /** @type {Category|null} */
  let pendingCategory = null;
  let newCatOpen = false;
  /** @type {Record<string, string>} */
  let errors = {};

  const allCategories = () => (pendingCategory ? [...store.get().categories, pendingCategory] : store.get().categories);

  openSheet({
    title: entry ? 'Edit memory' : 'New memory',
    isDirty: () => JSON.stringify(state) !== initial || pendingCategory !== null,
    render(content, api) {
      setHTML(content, html`
        <form class="sheet-body compose" id="${ids.form}" data-action="submit" novalidate>
          <div class="field">
            <label class="field-label" for="${ids.title}">Title</label>
            <input class="input" id="${ids.title}" name="title" data-action="field" maxlength="${LIMITS.title}"
              placeholder="What happened?" autocomplete="off" required autofocus value="${state.title}"
              aria-describedby="${ids.title}-err">
            <p class="field-error" id="${ids.title}-err" hidden></p>
          </div>
          <div class="field">
            <label class="field-label" for="${ids.date}">Date</label>
            <input class="input" id="${ids.date}" name="date" data-action="field" type="date" required value="${state.date}"
              aria-describedby="${ids.date}-err">
            <p class="field-error" id="${ids.date}-err" hidden></p>
          </div>
          <div class="field">
            <span class="field-label" id="${ids.cats}-label">Category</span>
            <div class="chips is-wrapping" id="${ids.cats}" role="group" aria-labelledby="${ids.cats}-label"></div>
          </div>
          <div class="field">
            <label class="field-label" for="${ids.notes}">Notes</label>
            <textarea class="textarea" id="${ids.notes}" name="notes" data-action="field" maxlength="${LIMITS.notes}" rows="3"
              placeholder="Details, cost, who was there…" aria-describedby="${ids.notes}-err">${state.notes}</textarea>
            <p class="field-error" id="${ids.notes}-err" hidden></p>
          </div>
          <label class="switch-row">
            <span>${icon('star')} Star this memory</span>
            <input type="checkbox" role="switch" name="starred" data-action="field" ${state.starred ? 'checked' : ''}>
          </label>
          <div id="${ids.rem}"></div>
        </form>
        <div class="sheet-foot">
          <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" form="${ids.form}">Save</button>
        </div>`);

      const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (content.querySelector(sel));
      const notesEl = /** @type {HTMLTextAreaElement} */ ($(`#${ids.notes}`));
      const grow = () => { notesEl.style.height = 'auto'; notesEl.style.height = `${notesEl.scrollHeight}px`; };
      requestAnimationFrame(grow);

      let lastCats = '';
      function renderCategories() {
        const cats = allCategories();
        const markup = String(html`
          ${cats.map((c) => html`<button type="button" class="chip" data-action="cat" data-id="${c.id}"
              aria-pressed="${String(state.categoryId === c.id)}" style="--c:${c.color}"><span class="dot"></span>${c.name}</button>`)}
          ${newCatOpen
            ? html`<span class="newcat">
                <input class="input" name="newCategory" placeholder="Category name" maxlength="${LIMITS.categoryName}"
                  aria-label="New category name" autocomplete="off" data-action="newcat-key">
                <button type="button" class="btn btn-secondary" data-action="newcat-add">Add</button>
              </span>
              ${errors.newCategory ? html`<p class="field-error" role="alert">${errors.newCategory}</p>` : ''}`
            : html`<button type="button" class="chip" data-action="newcat-open">${icon('plus', { cls: 'icon-sm' })}New</button>`}`);
        if (markup === lastCats) return;
        const typed = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'))?.value ?? '';
        lastCats = markup;
        setHTML($(`#${ids.cats}`), markup);
        const input = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'));
        if (input) { input.value = typed; }
      }

      function renderReminder() {
        const box = $(`#${ids.rem}`);
        if (!state.reminderOn) {
          setHTML(box, html`<button type="button" class="reminder-toggle" data-action="reminder-open">${icon('bell')}<span>Add a reminder</span></button>`);
          return;
        }
        setHTML(box, html`
          <div class="field reminder-box">
            <div class="reminder-head">
              <span class="field-label" id="${ids.rem}-label">Reminder</span>
              <button type="button" class="btn btn-quiet" data-action="reminder-remove">Remove</button>
            </div>
            <div class="segmented" role="group" aria-labelledby="${ids.rem}-label">
              <button type="button" data-action="kind" data-kind="once" aria-pressed="${String(state.reminderKind === 'once')}">Once</button>
              <button type="button" data-action="kind" data-kind="yearly" aria-pressed="${String(state.reminderKind === 'yearly')}">${icon('repeat', { cls: 'icon-sm' })}Every year</button>
            </div>
            ${state.reminderKind === 'once'
              ? html`<input class="input" type="datetime-local" name="onceAt" data-action="field" value="${state.onceAt}"
                  aria-label="Reminder date and time" aria-describedby="${ids.rem}-err">`
              : html`<input class="input" type="time" name="yearlyTime" data-action="field" value="${state.yearlyTime}"
                  aria-label="Reminder time" aria-describedby="${ids.rem}-hint ${ids.rem}-err">
                <p class="field-hint" id="${ids.rem}-hint">Every year on ${formatDayMonth(state.date) || 'the memory’s date'}.</p>`}
            <p class="field-error" id="${ids.rem}-err" hidden></p>
          </div>`);
      }

      /** Show or clear the error line for a field. @param {string} key @param {string} id */
      function showError(key, id) {
        const line = /** @type {HTMLElement|null} */ (content.querySelector(`#${id}-err`));
        const input = content.querySelector(`[aria-describedby~="${id}-err"]`);
        if (line) { line.textContent = errors[key] || ''; line.hidden = !errors[key]; }
        if (input) input.setAttribute('aria-invalid', String(Boolean(errors[key])));
      }
      function showAllErrors() {
        showError('title', ids.title);
        showError('date', ids.date);
        showError('notes', ids.notes);
        showError('reminder', ids.rem);
      }

      function addNewCategory() {
        const input = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'));
        const name = input?.value ?? '';
        const msg = validateCategoryName(name, allCategories());
        if (msg) { errors = { ...errors, newCategory: msg }; renderCategories(); /** @type {HTMLElement} */ (content.querySelector('input[name="newCategory"]')).focus(); return; }
        const cats = allCategories();
        pendingCategory = buildCategory({ name, color: nextPaletteColor(cats), order: cats.length });
        state.categoryId = pendingCategory.id;
        newCatOpen = false;
        delete errors.newCategory;
        renderCategories();
        /** @type {HTMLElement|null} */ (content.querySelector(`[data-id="${pendingCategory.id}"]`))?.focus();
      }

      function save() {
        const input = {
          title: state.title,
          date: state.date,
          notes: state.notes,
          categoryId: state.categoryId,
          starred: state.starred,
          reminder: !state.reminderOn ? null
            : state.reminderKind === 'once' ? { kind: 'once', at: state.onceAt } : { kind: 'yearly', time: state.yearlyTime },
        };
        errors = validateEntry(input);
        showAllErrors();
        const firstBad = content.querySelector('[aria-invalid="true"]');
        if (firstBad) { /** @type {HTMLElement} */ (firstBad).focus(); return; }

        if (pendingCategory && input.categoryId === pendingCategory.id) guard(addCategory(uid, pendingCategory));
        if (entry) guard(updateEntry(uid, entry.id, entryPatch(input)));
        else guard(addEntry(uid, buildEntry(input)));
        api.close();
        toast(entry ? 'Changes saved' : 'Memory saved');
      }

      renderCategories();
      renderReminder();
      const unsub = store.subscribe(renderCategories);

      const offs = [
        delegate(content, 'input', {
          field: (el) => {
            const f = /** @type {HTMLInputElement} */ (el);
            if (f.type === 'checkbox') /** @type {any} */ (state)[f.name] = f.checked;
            else /** @type {any} */ (state)[f.name] = f.value;
            if (f.name === 'notes') grow();
            if (f.name === 'date' && state.reminderOn && state.reminderKind === 'yearly') {
              const hint = content.querySelector(`#${ids.rem}-hint`);
              if (hint) hint.textContent = `Every year on ${formatDayMonth(state.date) || 'the memory’s date'}.`;
            }
          },
        }),
        delegate(content, 'change', {
          field: (el) => { const f = /** @type {HTMLInputElement} */ (el); if (f.type === 'checkbox') state.starred = f.checked; },
        }),
        delegate(content, 'keydown', {
          'newcat-key': (_el, ev) => {
            const k = /** @type {KeyboardEvent} */ (ev);
            if (k.key === 'Enter') { k.preventDefault(); addNewCategory(); }
            if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); newCatOpen = false; delete errors.newCategory; renderCategories(); }
          },
        }),
        delegate(content, 'submit', { submit: (_el, ev) => { ev.preventDefault(); save(); } }),
        delegate(content, 'click', {
          cancel: () => api.requestClose(),
          cat: (el) => {
            const id = el.dataset.id || null;
            state.categoryId = state.categoryId === id ? null : id;
            renderCategories();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-id="${id}"]`))?.focus();
          },
          'newcat-open': () => {
            newCatOpen = true;
            renderCategories();
            /** @type {HTMLElement} */ (content.querySelector('input[name="newCategory"]')).focus();
          },
          'newcat-add': () => addNewCategory(),
          'reminder-open': () => {
            state.reminderOn = true;
            if (!state.onceAt) state.onceAt = defaultOnceAt(state.date);
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector('[data-action="kind"][aria-pressed="true"]'))?.focus();
          },
          'reminder-remove': () => {
            state.reminderOn = false;
            delete errors.reminder;
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector('[data-action="reminder-open"]'))?.focus();
          },
          kind: (el) => {
            state.reminderKind = el.dataset.kind === 'once' ? 'once' : 'yearly';
            if (state.reminderKind === 'once' && !state.onceAt) state.onceAt = defaultOnceAt(state.date);
            delete errors.reminder;
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-kind="${state.reminderKind}"]`))?.focus();
          },
        }),
      ];
      return () => { unsub(); offs.forEach((off) => off()); };
    },
  });
}
