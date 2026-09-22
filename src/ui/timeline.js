import { store, setUI } from '../store.js';
import {
  activeEntries, indexById, filterEntries, groupByMonth, onThisDay, upcomingReminders, shouldShowBackupNudge,
} from '../selectors.js';
import {
  todayISO, dayNumber, formatWeekday, formatDayMonth, formatLong, relativeDayLabel, parseISODate,
} from '../dates.js';
import { entryHref } from '../router.js';
import { updateMeta } from '../db.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { toast, guard } from './toast.js';
import { openCompose } from './compose.js';
import { exportJSONBackup } from './backup.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */
/** @typedef {import('../store.js').User} User */

const OTD_VISIBLE = 3;
const UPCOMING_VISIBLE = 5;
const DAY_MS = 86400000;
const yearsAgoFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

/** @param {User|null} user */
export function avatar(user) {
  if (user?.photoURL) return html`<img class="avatar" src="${user.photoURL}" alt="" referrerpolicy="no-referrer">`;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  return html`<span class="avatar avatar-fallback" aria-hidden="true">${initial}</span>`;
}

/** @param {Entry} e @param {Category|undefined} cat */
function entryRow(e, cat) {
  const firstLine = e.notes.split('\n').find((l) => l.trim()) || '';
  return html`
    <a class="entry-row" href="${entryHref(e.id)}">
      <span class="entry-day" aria-hidden="true">
        <span class="entry-daynum">${dayNumber(e.date)}</span>
        <span class="label">${formatWeekday(e.date)}</span>
      </span>
      <span class="entry-main">
        <span class="visually-hidden">${formatLong(e.date)}: </span>
        <span class="entry-title">${e.title}</span>
        ${cat || firstLine ? html`<span class="entry-sub">
          ${cat ? html`<span class="dot" style="--c:${cat.color}"></span><span class="entry-cat">${cat.name}</span>` : ''}
          ${cat && firstLine ? html`<span aria-hidden="true">·</span>` : ''}
          ${firstLine ? html`<span class="entry-note">${firstLine}</span>` : ''}
        </span>` : ''}
      </span>
      <span class="entry-flags">
        ${e.starred ? html`<span class="visually-hidden">Starred</span>${icon('star', { cls: 'icon-sm is-filled' })}` : ''}
        ${e.reminder ? html`<span class="visually-hidden">Has a reminder</span>${icon('bell', { cls: 'icon-sm' })}` : ''}
      </span>
    </a>`;
}

/** @param {{ key: string, label: string, entries: Entry[] }[]} groups @param {Map<string, Category>} catsById */
function monthGroups(groups, catsById) {
  return html`${groups.map((g) => html`
    <section class="month" id="m-${g.key}">
      <h2 class="month-head">
        <button type="button" class="month-btn label" data-action="jump" aria-label="${g.label}. Jump to another month">
          ${g.label}${icon('chevron-down', { cls: 'icon-sm' })}
        </button>
      </h2>
      <ul class="entries">
        ${g.entries.map((e) => html`<li>${entryRow(e, e.categoryId ? catsById.get(e.categoryId) : undefined)}</li>`)}
      </ul>
    </section>`)}`;
}

/** @param {import('../store.js').AppState} s @param {number} badge */
function mainHeader(s, badge) {
  const bellLabel = badge ? `Reminders, ${badge} in the next 14 days` : 'Reminders';
  return html`
    <header class="topbar">
      <span class="topbar-title wordmark">DateTracker</span>
      ${s.sync === 'pending' ? html`<span class="sync-dot is-pending" role="img" aria-label="Saving changes"></span>` : ''}
      ${s.sync === 'error' ? html`<button type="button" class="icon-btn" data-action="sync-info" aria-label="Sync problem"><span class="sync-dot is-error"></span></button>` : ''}
      <div class="topbar-actions">
        <button type="button" class="icon-btn" data-action="search" aria-label="Search" aria-keyshortcuts="/">${icon('search')}</button>
        <a class="icon-btn" href="#/reminders" aria-label="${bellLabel}">
          ${icon('bell')}${badge ? html`<span class="badge" aria-hidden="true">${badge > 9 ? '9+' : badge}</span>` : ''}
        </a>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${avatar(s.user)}</a>
      </div>
    </header>`;
}

function searchHeader() {
  return html`
    <header class="topbar topbar--search">
      <label class="search-field">
        ${icon('search', { cls: 'icon-sm' })}
        <input class="search-input" type="search" data-action="query" placeholder="Search memories"
          aria-label="Search memories" autocomplete="off" enterkeyhint="search">
      </label>
      <button type="button" class="btn btn-quiet" data-action="cancel-search">Cancel</button>
    </header>`;
}

/** @param {Category[]} categories @param {import('../store.js').UI} ui */
function filterStrip(categories, ui) {
  return html`
    <div class="filters">
      <div class="chips" role="toolbar" aria-label="Filter memories">
        <button type="button" class="chip" data-action="filter-all" aria-pressed="${String(ui.categoryId === 'all' && !ui.starredOnly)}">All</button>
        <button type="button" class="chip" data-action="filter-star" aria-pressed="${String(ui.starredOnly)}">${icon('star', { cls: 'icon-sm' })}Starred</button>
        ${categories.map((c) => html`<button type="button" class="chip" data-action="filter-cat" data-id="${c.id}"
          aria-pressed="${String(ui.categoryId === c.id)}" style="--c:${c.color}"><span class="dot"></span>${c.name}</button>`)}
      </div>
    </div>`;
}

/** @param {import('../store.js').Meta|null} meta @param {number} count @param {Date} now */
function backupNudge(meta, count, now) {
  if (!meta || !shouldShowBackupNudge(meta, count, now.getTime())) return '';
  const text = meta.lastBackupAt
    ? `${Math.floor((now.getTime() - meta.lastBackupAt) / DAY_MS)} days since your last backup`
    : 'Your journal has never been backed up';
  return html`
    <div class="nudge" role="note">
      ${icon('download', { cls: 'icon-sm' })}
      <span class="nudge-text">${text}</span>
      <button type="button" class="nudge-btn" data-action="backup">Export</button>
      <button type="button" class="nudge-btn is-quiet" data-action="dismiss-nudge">Dismiss</button>
    </div>`;
}

/** @param {Entry[]} active @param {Map<string, Category>} catsById @param {Date} now @param {boolean} expanded */
function otdCard(active, catsById, now, expanded) {
  const today = todayISO(now);
  const items = onThisDay(active, today);
  if (!items.length) return '';
  const shown = expanded ? items : items.slice(0, OTD_VISIBLE);
  const rest = items.length - shown.length;
  return html`
    <section class="card" aria-labelledby="otd-h">
      <div class="card-head"><h2 class="label" id="otd-h">On this day · ${formatDayMonth(today)}</h2></div>
      ${shown.map(({ entry, year, yearsAgo }) => {
        const cat = entry.categoryId ? catsById.get(entry.categoryId) : undefined;
        return html`<a class="card-row" href="${entryHref(entry.id)}">
          <span class="card-row-main">${year} · ${entry.title}${cat ? ` · ${cat.name}` : ''}</span>
          <span class="card-row-aside">${yearsAgoFmt.format(-yearsAgo, 'year')}</span>
        </a>`;
      })}
      ${rest > 0 ? html`<button type="button" class="card-row card-more" data-action="otd-more">and ${rest} more</button>` : ''}
    </section>`;
}

/** @param {{ entry: Entry, next: Date }[]} upcoming @param {Date} now */
function upcomingCard(upcoming, now) {
  if (!upcoming.length) return '';
  return html`
    <section class="card" aria-labelledby="up-h">
      <div class="card-head">
        <h2 class="label" id="up-h">Upcoming</h2>
        <a href="#/reminders">See all${icon('chevron-right', { cls: 'icon-sm' })}</a>
      </div>
      ${upcoming.slice(0, UPCOMING_VISIBLE).map(({ entry, next }) => html`
        <a class="card-row" href="${entryHref(entry.id)}">
          <span class="card-when">${relativeDayLabel(next, now)}</span>
          <span class="card-row-main">${entry.title}</span>
        </a>`)}
    </section>`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  setHTML(root, html`
    <main class="screen timeline">
      <div id="tl-head"></div>
      <div id="tl-filters"></div>
      <div id="tl-body"></div>
    </main>
    <button type="button" class="fab" data-action="compose" aria-label="Add a memory">${icon('plus')}</button>`);
  const main = /** @type {HTMLElement} */ (root.querySelector('.timeline'));
  const headEl = /** @type {HTMLElement} */ (root.querySelector('#tl-head'));
  const filtersEl = /** @type {HTMLElement} */ (root.querySelector('#tl-filters'));
  const bodyEl = /** @type {HTMLElement} */ (root.querySelector('#tl-body'));
  const last = { head: '', filters: '', body: '' };
  let otdExpanded = false;
  let firstRender = true;
  /** @type {{ key: string, label: string, entries: Entry[] }[]} */
  let lastGroups = [];

  function render() {
    const s = store.get();
    const now = new Date();
    const active = activeEntries(s.entries);
    const catsById = indexById(s.categories);
    const upcoming = upcomingReminders(active, now, 14);

    const head = String(s.ui.searching ? searchHeader() : mainHeader(s, upcoming.length));
    if (head !== last.head) {
      const enteringSearch = s.ui.searching && !last.head.includes('search-input');
      setHTML(headEl, head);
      last.head = head;
      const input = /** @type {HTMLInputElement|null} */ (headEl.querySelector('.search-input'));
      if (input) {
        input.value = s.ui.query;
        if (enteringSearch && !firstRender) input.focus();
      }
    }

    const filters = active.length ? String(filterStrip(s.categories, s.ui)) : '';
    if (filters !== last.filters) {
      const strip = filtersEl.querySelector('.chips');
      const scrollLeft = strip ? strip.scrollLeft : 0;
      setHTML(filtersEl, filters);
      last.filters = filters;
      const next = filtersEl.querySelector('.chips');
      if (next) next.scrollLeft = scrollLeft;
    }
    main.classList.toggle('has-filters', Boolean(filters));

    const q = s.ui.searching ? s.ui.query.trim() : '';
    const list = filterEntries(active, { categoryId: s.ui.categoryId, starredOnly: s.ui.starredOnly, query: q, categoriesById: catsById });
    lastGroups = groupByMonth(list);
    let body;
    if (!active.length) {
      body = html`
        <div class="empty">
          <h2>Your journal is empty.</h2>
          <p>Tap + to record your first memory — a trip, a purchase, a milestone. Anything worth remembering.</p>
        </div>`;
    } else if (s.ui.searching) {
      body = q && !list.length
        ? html`<div class="empty"><p>No memories match ‘${q}’.</p></div>`
        : monthGroups(lastGroups, catsById);
    } else {
      body = html`
        ${backupNudge(s.meta, active.length, now)}
        ${otdCard(active, catsById, now, otdExpanded)}
        ${upcomingCard(upcoming, now)}
        ${list.length ? monthGroups(lastGroups, catsById) : html`<div class="empty"><p>No memories match this filter.</p></div>`}`;
    }
    const bodyStr = String(body);
    if (bodyStr !== last.body) { setHTML(bodyEl, bodyStr); last.body = bodyStr; }
    firstRender = false;
  }

  function openJumper() {
    /** @type {Map<string, { key: string, label: string }[]>} */
    const byYear = new Map();
    for (const g of lastGroups) {
      const y = g.key.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      /** @type {{ key: string, label: string }[]} */ (byYear.get(y)).push(g);
    }
    openSheet({
      title: 'Jump to month',
      render(content, api) {
        setHTML(content, html`
          <div class="sheet-body jumper">
            ${[...byYear].map(([year, months]) => html`
              <h3 class="label">${year}</h3>
              <div class="jumper-grid">
                ${months.map((m) => html`<button type="button" class="chip" data-action="go" data-key="${m.key}" aria-label="${m.label}">
                  ${monthShortFmt.format(/** @type {Date} */ (parseISODate(`${m.key}-01`)))}</button>`)}
              </div>`)}
          </div>`);
        return delegate(content, 'click', {
          go: (el) => {
            const key = el.dataset.key;
            api.close().then(() => {
              const target = document.getElementById(`m-${key}`);
              target?.scrollIntoView({ block: 'start' });
              /** @type {HTMLElement|null} */ (target?.querySelector('.entry-row'))?.focus({ preventScroll: true });
            });
          },
        });
      },
    });
  }

  const cancelSearch = () => setUI({ searching: false, query: '' });

  const offs = [
    delegate(root, 'click', {
      compose: () => openCompose(),
      search: () => setUI({ searching: true }),
      'cancel-search': cancelSearch,
      'sync-info': () => toast("Changes aren't syncing right now. Reload the app to reconnect."),
      'filter-all': () => setUI({ categoryId: 'all', starredOnly: false }),
      'filter-star': () => setUI({ starredOnly: !store.get().ui.starredOnly }),
      'filter-cat': (el) => {
        const id = el.dataset.id || 'all';
        setUI({ categoryId: store.get().ui.categoryId === id ? 'all' : id });
      },
      'otd-more': () => { otdExpanded = true; render(); },
      backup: () => exportJSONBackup(),
      'dismiss-nudge': () => {
        const uid = store.get().user?.uid;
        if (uid) guard(updateMeta(uid, { backupNudgeDismissedAt: Date.now() }));
      },
      jump: () => openJumper(),
    }),
    delegate(root, 'input', { query: (el) => setUI({ query: /** @type {HTMLInputElement} */ (el).value }) }),
    delegate(root, 'keydown', {
      query: (_el, ev) => { if (/** @type {KeyboardEvent} */ (ev).key === 'Escape') { ev.preventDefault(); cancelSearch(); } },
    }),
  ];

  /** @param {KeyboardEvent} ev */
  const onSlash = (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = /** @type {HTMLElement} */ (ev.target);
    if (t.closest('input, textarea, select, [contenteditable="true"], .sheet-layer')) return;
    ev.preventDefault();
    if (store.get().ui.searching) /** @type {HTMLElement|null} */ (headEl.querySelector('.search-input'))?.focus();
    else setUI({ searching: true });
  };
  document.addEventListener('keydown', onSlash);

  const unsub = store.subscribe(render);
  render();
  return {
    unmount() {
      unsub();
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onSlash);
    },
  };
}
