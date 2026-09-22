import { describe, it, expect, vi } from 'vitest';
import { createStore, initialState, INITIAL_UI, store, setUI } from '../src/store.js';

describe('createStore', () => {
  it('merges patches and notifies subscribers', () => {
    const s = createStore({ a: 1, b: 2 });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ a: 5 });
    expect(s.get()).toEqual({ a: 5, b: 2 });
    expect(fn).toHaveBeenCalledWith({ a: 5, b: 2 });
    s.set(prev => ({ b: prev.b + 1 }));
    expect(s.get().b).toBe(3);
    off();
    s.set({ a: 0 });
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('replaces state immutably', () => {
    const s = createStore({ a: 1 });
    const before = s.get();
    s.set({ a: 2 });
    expect(before).toEqual({ a: 1 });
  });
  it('tolerates unsubscribing during notification', () => {
    const s = createStore({ a: 1 });
    const second = vi.fn();
    const off = s.subscribe(() => off());
    s.subscribe(second);
    s.set({ a: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('app store', () => {
  it('starts loading with empty data', () => {
    const st = initialState();
    expect(st).toMatchObject({ status: 'loading', user: null, entries: [], categories: [], meta: null, sync: 'clean', error: '', signInError: '', updateReady: false, tick: 0 });
    expect(st.ui).toEqual(INITIAL_UI);
  });
  it('setUI merges into ui only', () => {
    setUI({ query: 'goa' });
    expect(store.get().ui).toEqual({ ...INITIAL_UI, query: 'goa' });
    expect(store.get().status).toBe('loading');
  });
});
