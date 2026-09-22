import { store } from '../store.js';
import { back } from '../router.js';
import { updateEntry, trashEntry, restoreEntry } from '../db.js';
import { nextFireTime, scheduleLabel, toICS } from '../reminders.js';
import { formatLong, formatShort, toISODate } from '../dates.js';
import { downloadText } from '../io/export.js';
import { html, setHTML, delegate, linkify } from './dom.js';
import { icon } from './icons.js';
import { openCompose } from './compose.js';
import { toast, guard } from './toast.js';

/** "car-insurance-renewal.ics" @param {string} title */
export function icsFilename(title) {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'reminder'}.ics`;
}

/** @param {HTMLElement} root @param {{ id?: string }} params */
export function mount(root, { id = '' }) {
  let lastMarkup = '';

  function render() {
    const s = store.get();
    const entry = s.entries.find((e) => e.id === id && e.deletedAt == null);
    const cat = entry?.categoryId ? s.categories.find((c) => c.id === entry.categoryId) : undefined;
    let markup;
    if (!entry) {
      markup = html`
        <main class="screen">
          <header class="topbar">
            <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          </header>
          <div class="empty"><h2>This memory isn't here.</h2><p>It may have been moved to the Trash.</p></div>
        </main>`;
    } else {
      const r = entry.reminder;
      const next = r ? nextFireTime(entry, new Date()) : null;
      const isPast = r?.kind === 'once' && next && next.getTime() <= Date.now();
      markup = html`
        <main class="screen detail">
          <header class="topbar">
            <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
            <span class="topbar-title"></span>
            <button type="button" class="icon-btn" data-action="star" aria-pressed="${String(entry.starred)}" aria-label="Star">
              ${icon('star', { cls: entry.starred ? 'is-filled' : '' })}
            </button>
          </header>
          <article class="content detail-body">
            <p class="detail-date">${formatLong(entry.date)}</p>
            <h1 class="detail-title">${entry.title}</h1>
            ${cat ? html`<span class="cat-chip" style="--c:${cat.color}"><span class="dot"></span>${cat.name}</span>` : ''}
            ${entry.notes ? html`<div class="detail-notes">${linkify(entry.notes)}</div>` : ''}
            ${r ? html`
              <section class="card detail-reminder" aria-label="Reminder">
                <p class="reminder-line">
                  ${icon(r.kind === 'yearly' ? 'repeat' : 'bell')}
                  <span>
                    ${scheduleLabel(entry)}${r.kind === 'yearly' && next ? ` · next: ${formatShort(toISODate(next))}` : ''}${isPast ? ' · passed' : ''}
                  </span>
                </p>
                <button type="button" class="btn btn-secondary" data-action="ics">${icon('calendar-plus')}Add to calendar</button>
              </section>` : ''}
            <div class="detail-actions">
              <button type="button" class="btn btn-primary" data-action="edit">${icon('pencil')}Edit</button>
              <button type="button" class="btn btn-danger" data-action="delete">${icon('trash-2')}Delete</button>
            </div>
          </article>
        </main>`;
    }
    const str = String(markup);
    if (str !== lastMarkup) {
      const active = document.activeElement;
      const focusedAction = active && root.contains(active) ? active.closest('[data-action]')?.getAttribute('data-action') : null;
      setHTML(root, str);
      lastMarkup = str;
      if (focusedAction) /** @type {HTMLElement|null} */ (root.querySelector(`[data-action="${focusedAction}"]`))?.focus();
    }
  }

  /** @returns {import('../model.js').Entry|undefined} */
  const current = () => store.get().entries.find((e) => e.id === id && e.deletedAt == null);

  const off = delegate(root, 'click', {
    back: () => back('#/'),
    star: () => {
      const e = current();
      const uid = store.get().user?.uid;
      if (!e || !uid) return;
      guard(updateEntry(uid, e.id, { starred: !e.starred, updatedAt: Date.now() }));
    },
    edit: () => { const e = current(); if (e) openCompose({ entry: e }); },
    ics: () => {
      const e = current();
      if (!e) return;
      const cat = e.categoryId ? store.get().categories.find((c) => c.id === e.categoryId) : null;
      downloadText(icsFilename(e.title), toICS(e, cat || null), 'text/calendar');
    },
    delete: () => {
      const e = current();
      const uid = store.get().user?.uid;
      if (!e || !uid) return;
      guard(trashEntry(uid, e.id));
      back('#/');
      toast('Moved to Trash', {
        actionLabel: 'Undo',
        onAction: () => guard(restoreEntry(uid, e.id)),
      });
    },
  });

  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}
