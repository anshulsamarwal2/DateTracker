/**
 * All Firestore access lives here.
 *
 * Rules this module keeps:
 * - Every write touches one document, or a writeBatch of single-document ops.
 * - Nothing writes a whole collection from memory, and nothing writes defaults
 *   over existing data (ensureFirstRun only seeds when meta/app is missing and
 *   the categories collection is empty).
 * - Writes return promises, but the UI must not await them (offline, they only
 *   resolve when the server acknowledges). The onSnapshot listeners update the UI.
 */
import {
  collection, doc, getDoc, getDocs, query, limit, onSnapshot,
  setDoc, updateDoc, deleteDoc, writeBatch,
} from '../vendor/firebase/firebase-firestore.js';
import { db } from './firebase.js';
import { normalizeEntry, normalizeCategory, toDoc, buildCategory, DEFAULT_CATEGORIES } from './model.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */
/** @typedef {import('./store.js').Meta} Meta */

export const BATCH_LIMIT = 400;

/** @param {string} uid */
const entriesCol = (uid) => collection(db, 'users', uid, 'entries');
/** @param {string} uid */
const categoriesCol = (uid) => collection(db, 'users', uid, 'categories');
/** @param {string} uid */
const metaRef = (uid) => doc(db, 'users', uid, 'meta', 'app');
/** @param {string} uid @param {string} id */
const entryRef = (uid, id) => doc(entriesCol(uid), id);
/** @param {string} uid @param {string} id */
const categoryRef = (uid, id) => doc(categoriesCol(uid), id);

/**
 * Apply ops across as many batches as needed and commit them all.
 * @template T @param {T[]} ops @param {(batch: any, op: T) => void} apply
 */
function commitInChunks(ops, apply) {
  const commits = [];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) apply(batch, op);
    commits.push(batch.commit());
  }
  return Promise.all(commits).then(() => undefined);
}

/* ---------- First run ---------- */

/**
 * Create meta/app (and the default categories) for a brand-new account.
 * Awaits the reads; the write is fired without waiting for the server.
 * @param {string} uid @param {number} [now]
 * @returns {Promise<boolean>} true when it seeded
 */
export async function ensureFirstRun(uid, now = Date.now()) {
  const meta = await getDoc(metaRef(uid));
  if (meta.exists()) return false;
  const existingCategories = await getDocs(query(categoriesCol(uid), limit(1)));
  const batch = writeBatch(db);
  batch.set(metaRef(uid), { schemaVersion: 2, createdAt: now, lastBackupAt: null, backupNudgeDismissedAt: null });
  if (existingCategories.empty) {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      const cat = buildCategory({ name: c.name, color: c.color, order: i }, now);
      batch.set(categoryRef(uid, cat.id), toDoc(cat));
    });
  }
  batch.commit().catch((err) => console.error('first-run write failed', err));
  return true;
}

/* ---------- Subscriptions ---------- */

/**
 * @param {string} uid
 * @param {(entries: Entry[], pending: boolean) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeEntries(uid, onData, onError) {
  return onSnapshot(entriesCol(uid), { includeMetadataChanges: true }, (snap) => {
    onData(snap.docs.map((d) => normalizeEntry(d.id, d.data())), snap.metadata.hasPendingWrites);
  }, onError);
}

/**
 * @param {string} uid
 * @param {(categories: Category[], pending: boolean) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeCategories(uid, onData, onError) {
  return onSnapshot(categoriesCol(uid), { includeMetadataChanges: true }, (snap) => {
    const cats = snap.docs.map((d) => normalizeCategory(d.id, d.data()));
    cats.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    onData(cats, snap.metadata.hasPendingWrites);
  }, onError);
}

/**
 * @param {string} uid
 * @param {(meta: Meta|null) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeMeta(uid, onData, onError) {
  return onSnapshot(metaRef(uid), {}, (snap) => {
    onData(snap.exists() ? /** @type {Meta} */ (snap.data()) : null);
  }, onError);
}

/* ---------- Entries ---------- */

/** @param {string} uid @param {Entry} entry */
export function addEntry(uid, entry) {
  return setDoc(entryRef(uid, entry.id), toDoc(entry));
}

/** @param {string} uid @param {string} id @param {Partial<Entry>} patch */
export function updateEntry(uid, id, patch) {
  return updateDoc(entryRef(uid, id), patch);
}

/** @param {string} uid @param {string} id @param {number} [now] */
export function trashEntry(uid, id, now = Date.now()) {
  return updateEntry(uid, id, { deletedAt: now, updatedAt: now });
}

/** @param {string} uid @param {string} id @param {number} [now] */
export function restoreEntry(uid, id, now = Date.now()) {
  return updateEntry(uid, id, { deletedAt: null, updatedAt: now });
}

/** @param {string} uid @param {string} id */
export function deleteEntryForever(uid, id) {
  return deleteDoc(entryRef(uid, id));
}

/** Permanently delete the given (trashed) entries. @param {string} uid @param {string[]} ids */
export function emptyTrash(uid, ids) {
  return commitInChunks(ids, (b, id) => b.delete(entryRef(uid, id)));
}

/* ---------- Categories ---------- */

/** @param {string} uid @param {Category} category */
export function addCategory(uid, category) {
  return setDoc(categoryRef(uid, category.id), toDoc(category));
}

/** @param {string} uid @param {string} id @param {Partial<Category>} patch */
export function updateCategory(uid, id, patch) {
  return updateDoc(categoryRef(uid, id), patch);
}

/** @param {string} uid @param {string[]} orderedIds */
export function reorderCategories(uid, orderedIds) {
  return commitInChunks(orderedIds.map((id, order) => ({ id, order })), (b, op) => b.update(categoryRef(uid, op.id), { order: op.order }));
}

/**
 * Move a category's entries to another category (or none), then delete it.
 * @param {string} uid @param {string} id @param {string[]} entryIds
 * @param {string|null} reassignTo @param {number} [now]
 */
export function deleteCategory(uid, id, entryIds, reassignTo, now = Date.now()) {
  /** @type {({ kind: 'move', id: string } | { kind: 'delete' })[]} */
  const ops = entryIds.map((eid) => ({ kind: /** @type {'move'} */ ('move'), id: eid }));
  ops.push({ kind: 'delete' });
  return commitInChunks(ops, (b, op) => {
    if (op.kind === 'move') b.update(entryRef(uid, op.id), { categoryId: reassignTo, updatedAt: now });
    else b.delete(categoryRef(uid, id));
  });
}

/* ---------- Import & meta ---------- */

/** @param {string} uid @param {{ entries: Entry[], categories: Category[] }} data */
export function importData(uid, { entries, categories }) {
  const ops = [
    ...categories.map((c) => ({ ref: categoryRef(uid, c.id), data: toDoc(c) })),
    ...entries.map((e) => ({ ref: entryRef(uid, e.id), data: toDoc(e) })),
  ];
  return commitInChunks(ops, (b, op) => b.set(op.ref, op.data));
}

/** @param {string} uid @param {Partial<Meta>} patch */
export function updateMeta(uid, patch) {
  return setDoc(metaRef(uid), patch, { merge: true });
}
