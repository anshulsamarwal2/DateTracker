import { describe, it, expect, vi, beforeEach } from 'vitest';

const fx = vi.hoisted(() => ({ metaExists: false, categoriesEmpty: true, batches: [], snapshotHandlers: [] }));

vi.mock('../src/firebase.js', () => ({ db: { kind: 'db' } }));
vi.mock('../vendor/firebase/firebase-firestore.js', () => {
  const ref = (path) => ({ path });
  return {
    collection: (_db, ...segs) => ref(segs.join('/')),
    doc: (parent, ...segs) => ref(parent && parent.path ? `${parent.path}/${segs.join('/')}` : segs.join('/')),
    getDoc: vi.fn(async () => ({ exists: () => fx.metaExists })),
    getDocs: vi.fn(async () => ({ empty: fx.categoriesEmpty })),
    query: (c) => c,
    limit: () => null,
    onSnapshot: vi.fn((target, _opts, next, error) => { fx.snapshotHandlers.push({ target, next, error }); return () => {}; }),
    setDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    writeBatch: () => {
      const b = { ops: [], commit: vi.fn(async () => {}) };
      b.set = (r, d) => { b.ops.push(['set', r.path, d]); return b; };
      b.update = (r, d) => { b.ops.push(['update', r.path, d]); return b; };
      b.delete = (r) => { b.ops.push(['delete', r.path]); return b; };
      fx.batches.push(b);
      return b;
    },
  };
});

const fs = await import('../vendor/firebase/firebase-firestore.js');
const db = await import('../src/db.js');

beforeEach(() => {
  fx.metaExists = false; fx.categoriesEmpty = true; fx.batches.length = 0; fx.snapshotHandlers.length = 0;
  vi.clearAllMocks();
});

describe('ensureFirstRun', () => {
  it('does nothing when meta exists', async () => {
    fx.metaExists = true;
    expect(await db.ensureFirstRun('u', 5)).toBe(false);
    expect(fx.batches).toHaveLength(0);
  });
  it('writes meta and four categories in one batch on a fresh account', async () => {
    expect(await db.ensureFirstRun('u', 5)).toBe(true);
    expect(fx.batches).toHaveLength(1);
    const ops = fx.batches[0].ops;
    expect(ops[0]).toEqual(['set', 'users/u/meta/app', { schemaVersion: 2, createdAt: 5, lastBackupAt: null, backupNudgeDismissedAt: null }]);
    const cats = ops.slice(1);
    expect(cats).toHaveLength(4);
    expect(cats.map(o => o[2].name)).toEqual(['Travel', 'Milestones', 'Health', 'Family']);
    expect(cats.map(o => o[2].order)).toEqual([0, 1, 2, 3]);
    expect(cats.every(o => o[1].startsWith('users/u/categories/') && !('id' in o[2]))).toBe(true);
    expect(fx.batches[0].commit).toHaveBeenCalled();
  });
  it('never seeds categories over existing ones', async () => {
    fx.categoriesEmpty = false;
    await db.ensureFirstRun('u', 5);
    expect(fx.batches[0].ops.map(o => o[1])).toEqual(['users/u/meta/app']);
  });
});

describe('single-document writes', () => {
  it('addEntry stores the doc without its id under the id key', async () => {
    await db.addEntry('u', { id: 'e1', title: 'T' });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/u/entries/e1' }, { title: 'T' });
  });
  it('trash / restore / delete', async () => {
    await db.trashEntry('u', 'e1', 9);
    expect(fs.updateDoc).toHaveBeenLastCalledWith({ path: 'users/u/entries/e1' }, { deletedAt: 9, updatedAt: 9 });
    await db.restoreEntry('u', 'e1', 10);
    expect(fs.updateDoc).toHaveBeenLastCalledWith({ path: 'users/u/entries/e1' }, { deletedAt: null, updatedAt: 10 });
    await db.deleteEntryForever('u', 'e1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'users/u/entries/e1' });
  });
  it('updateMeta merges', async () => {
    await db.updateMeta('u', { lastBackupAt: 3 });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/u/meta/app' }, { lastBackupAt: 3 }, { merge: true });
  });
});

describe('batched writes', () => {
  it('emptyTrash chunks at 400 and commits every chunk', async () => {
    const ids = Array.from({ length: 850 }, (_, i) => `e${i}`);
    await db.emptyTrash('u', ids);
    expect(fx.batches.map(b => b.ops.length)).toEqual([400, 400, 50]);
    expect(fx.batches.every(b => b.commit.mock.calls.length === 1)).toBe(true);
    expect(fx.batches[2].ops[49]).toEqual(['delete', 'users/u/entries/e849']);
  });
  it('deleteCategory reassigns entries, then deletes the category', async () => {
    await db.deleteCategory('u', 'c1', ['e1', 'e2'], 'c2', 7);
    expect(fx.batches[0].ops).toEqual([
      ['update', 'users/u/entries/e1', { categoryId: 'c2', updatedAt: 7 }],
      ['update', 'users/u/entries/e2', { categoryId: 'c2', updatedAt: 7 }],
      ['delete', 'users/u/categories/c1'],
    ]);
  });
  it('reorderCategories writes order = index', async () => {
    await db.reorderCategories('u', ['b', 'a']);
    expect(fx.batches[0].ops).toEqual([
      ['update', 'users/u/categories/b', { order: 0 }],
      ['update', 'users/u/categories/a', { order: 1 }],
    ]);
  });
  it('importData sets categories and entries without ids', async () => {
    await db.importData('u', { categories: [{ id: 'c', name: 'X' }], entries: [{ id: 'e', title: 'T' }] });
    expect(fx.batches[0].ops).toEqual([
      ['set', 'users/u/categories/c', { name: 'X' }],
      ['set', 'users/u/entries/e', { title: 'T' }],
    ]);
  });
  it('an empty operation list commits nothing', async () => {
    await db.emptyTrash('u', []);
    expect(fx.batches).toHaveLength(0);
  });
});

describe('subscriptions', () => {
  it('normalises entries and reports pending writes', () => {
    const onData = vi.fn();
    db.subscribeEntries('u', onData, () => {});
    const h = fx.snapshotHandlers[0];
    expect(h.target.path).toBe('users/u/entries');
    h.next({ docs: [{ id: 'e1', data: () => ({ title: 'Hi', date: '2026-01-02' }) }], metadata: { hasPendingWrites: true } });
    expect(onData.mock.calls[0][0][0]).toMatchObject({ id: 'e1', title: 'Hi', date: '2026-01-02', starred: false });
    expect(onData.mock.calls[0][1]).toBe(true);
  });
  it('sorts categories by order then createdAt', () => {
    const onData = vi.fn();
    db.subscribeCategories('u', onData, () => {});
    fx.snapshotHandlers[0].next({
      docs: [
        { id: 'b', data: () => ({ name: 'B', color: '#111111', order: 1, createdAt: 1 }) },
        { id: 'a', data: () => ({ name: 'A', color: '#111111', order: 0, createdAt: 2 }) },
        { id: 'c', data: () => ({ name: 'C', color: '#111111', order: 1, createdAt: 0 }) },
      ],
      metadata: { hasPendingWrites: false },
    });
    expect(onData.mock.calls[0][0].map(c => c.id)).toEqual(['a', 'c', 'b']);
  });
  it('meta yields null when missing', () => {
    const onData = vi.fn();
    db.subscribeMeta('u', onData, () => {});
    fx.snapshotHandlers[0].next({ exists: () => false, data: () => undefined });
    expect(onData).toHaveBeenCalledWith(null);
  });
});
