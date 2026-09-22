import { store } from '../store.js';
import { back, entryHref } from '../router.js';
import { activeEntries, reminderSections, indexById } from '../selectors.js';
import { scheduleLabel } from '../reminders.js';
import { relativeDayLabel } from '../dates.js';
import { notificationPermission, requestNotifications, NOTIFY_EXPLAINER } from '../notifications.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';

const STATUS = {
  granted: { text: 'Notifications are on for this device.', action: '' },
  default: { text: 'Notifications are off.', action: 'Turn on' },
  denied: { text: 'Notifications are blocked in your browser settings.', action: '' },
  unsupported: { text: "This browser can't show notifications.", action: '' },
};

/** Status line + explanation; the "Turn on" button uses data-action="enable-notifications". */
export function notificationStatusBlock() {
  const st = STATUS[notificationPermission()];
  return html`
    <div class="notif-status">
      <p class="notif-line">
        ${icon('bell')}
        <span>${st.text}</span>
        ${st.action ? html`<button type="button" class="btn btn-secondary" data-action="enable-notifications">${st.action}</button>` : ''}
      </p>
      <p class="field-hint">${NOTIFY_EXPLAINER}</p>
    </div>`;
}

/** @param {{ entry: import('../model.js').Entry, next: Date }[]} items @param {Map<string, import('../model.js').Category>} cats @param {Date} now */
function rows(items, cats, now) {
  return html`${items.map(({ entry, next }) => {
    const cat = entry.categoryId ? cats.get(entry.categoryId) : undefined;
    return html`
      <a class="list-row" href="${entryHref(entry.id)}">
        <span class="when-chip">${relativeDayLabel(next, now)}</span>
        <span class="list-row-main">
          <span class="list-row-title">${entry.title}</span>
          <span class="list-row-meta">${cat ? `${cat.name} · ` : ''}${scheduleLabel(entry)}</span>
        </span>
        ${icon('chevron-right')}
      </a>`;
  })}`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  let alive = true;
  function render() {
    const s = store.get();
    const now = new Date();
    const { upcoming, past } = reminderSections(activeEntries(s.entries), now);
    const cats = indexById(s.categories);
    const markup = String(html`
      <main class="screen reminders">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          <h1 class="topbar-title">Reminders</h1>
        </header>
        <div class="content">${notificationStatusBlock()}</div>
        ${!upcoming.length && !past.length
          ? html`<div class="empty"><p>No reminders yet. Add one from any memory.</p></div>`
          : html`
            ${upcoming.length ? html`<h2 class="label list-title">Upcoming</h2><div class="list">${rows(upcoming, cats, now)}</div>` : ''}
            ${past.length ? html`<h2 class="label list-title">Past</h2><div class="list">${rows(past, cats, now)}</div>` : ''}`}
      </main>`);
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  const off = delegate(root, 'click', {
    back: () => back('#/'),
    'enable-notifications': async () => { await requestNotifications(); if (!alive) return; last = ''; render(); },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { alive = false; unsub(); off(); } };
}
