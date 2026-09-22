import { store } from '../store.js';
import { back } from '../router.js';
import { restoreEntry, emptyTrash } from '../db.js';
import { trashedEntries } from '../selectors.js';
import { formatShort, relativeDayLabel } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { sectionScreen } from './settings-shared.js';

/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;

/** "Deleted today" / "Deleted yesterday" / "Deleted 3 days ago" @param {number} deletedAt @param {Date} now */
function deletedLabel(deletedAt, now) {
  const rel = relativeDayLabel(new Date(deletedAt), now);
  return `Deleted ${rel.charAt(0).toLowerCase()}${rel.slice(1)}`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  function render() {
    const now = new Date();
    const trashed = trashedEntries(store.get().entries);
    const markup = String(sectionScreen('Trash', trashed.length
      ? html`
        <p class="content secondary trash-intro">Deleted memories stay here until you empty the trash.</p>
        <ul class="list" aria-label="Trashed memories">
          ${trashed.map((e) => html`
            <li class="list-row">
              <span class="list-row-main">
                <span class="list-row-title">${e.title}</span>
                <span class="list-row-meta">${formatShort(e.date)} · ${deletedLabel(/** @type {number} */ (e.deletedAt), now)}</span>
              </span>
              <button type="button" class="btn btn-quiet" data-action="restore" data-id="${e.id}" aria-label="Restore ${e.title}">${icon('undo-2', { cls: 'icon-sm' })}Restore</button>
            </li>`)}
        </ul>
        <div class="content trash-actions">
          <button type="button" class="btn btn-danger" data-action="empty">${icon('trash-2')}Empty trash</button>
        </div>`
      : html`<div class="empty"><h2>Trash is empty.</h2><p>Deleted memories stay here until you empty the trash.</p></div>`));
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  const off = delegate(root, 'click', {
    back: () => back('#/settings'),
    restore: (el) => {
      const uid = store.get().user?.uid;
      if (!uid) return;
      guard(restoreEntry(uid, /** @type {string} */ (el.dataset.id)));
      toast('Restored');
    },
    empty: async () => {
      const s = store.get();
      const ids = trashedEntries(s.entries).map((e) => e.id);
      if (!ids.length || !s.user) return;
      const ok = await confirmSheet({
        title: 'Empty trash?',
        message: `${memories(ids.length)} will be deleted forever. This can't be undone.`,
        confirmLabel: 'Delete forever',
        danger: true,
      });
      if (ok) guard(emptyTrash(s.user.uid, ids));
    },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}
