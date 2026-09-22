import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db.js', () => ({}));
vi.mock('../src/router.js', () => ({}));
vi.mock('../src/ui/sheet.js', () => ({}));
vi.mock('../src/ui/toast.js', () => ({}));
vi.mock('../src/ui/backup.js', () => ({}));

const { withKnownCategories } = await import('../src/ui/settings-data.js');

describe('withKnownCategories', () => {
  it('clears unknown category ids and keeps known ones', () => {
    const out = withKnownCategories([{ id: 'a', categoryId: 'c1' }, { id: 'b', categoryId: 'zz' }, { id: 'c', categoryId: null }], new Set(['c1']));
    expect(out.map((e) => e.categoryId)).toEqual(['c1', null, null]);
  });
});
