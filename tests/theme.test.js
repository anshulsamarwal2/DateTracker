import { describe, it, expect } from 'vitest';
import {
  ACCENTS, DEFAULT_PREFS, PREFS_KEY, isHex, loadPrefs, savePrefs,
  resolveTheme, relativeLuminance, contrastRatio, onAccent,
} from '../src/theme.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

describe('constants', () => {
  it('has 8 accents with copper first', () => {
    expect(ACCENTS).toHaveLength(8);
    expect(ACCENTS[0]).toEqual({ id: 'copper', name: 'Copper', color: '#C8956C' });
    expect(DEFAULT_PREFS).toEqual({ theme: 'system', accent: '#C8956C' });
  });
});

describe('prefs', () => {
  it('loads defaults when empty, broken or invalid', () => {
    expect(loadPrefs(memory())).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(memory({ [PREFS_KEY]: '{' }))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(memory({ [PREFS_KEY]: '{"theme":"neon","accent":"red"}' }))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs({ getItem() { throw new Error('blocked'); } })).toEqual(DEFAULT_PREFS);
  });
  it('round-trips valid prefs', () => {
    const s = memory();
    savePrefs({ theme: 'light', accent: '#123456' }, s);
    expect(loadPrefs(s)).toEqual({ theme: 'light', accent: '#123456' });
  });
  it('save never throws', () => {
    expect(() => savePrefs(DEFAULT_PREFS, { setItem() { throw new Error('quota'); } })).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('follows the OS only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('colour maths', () => {
  it('isHex', () => {
    expect(isHex('#AbC123')).toBe(true);
    expect(isHex('#abc')).toBe(false);
    expect(isHex(null)).toBe(false);
  });
  it('luminance and contrast match WCAG reference values', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
  it('onAccent picks the more readable foreground', () => {
    expect(onAccent('#C8956C')).toBe('#1A1410');
    expect(onAccent('#4A5BAD')).toBe('#FFFFFF');
  });
});
