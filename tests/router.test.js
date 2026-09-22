import { describe, it, expect } from 'vitest';
import { parseHash, entryHref, SETTINGS_SECTIONS } from '../src/router.js';

describe('parseHash', () => {
  it('maps the empty hash and #/ to the timeline', () => {
    expect(parseHash('')).toEqual({ name: 'timeline', params: {} });
    expect(parseHash('#')).toEqual({ name: 'timeline', params: {} });
    expect(parseHash('#/')).toEqual({ name: 'timeline', params: {} });
  });
  it('parses entry ids, decoding them', () => {
    expect(parseHash('#/entry/abc-123')).toEqual({ name: 'entry', params: { id: 'abc-123' } });
    expect(parseHash('#/entry/a%20b')).toEqual({ name: 'entry', params: { id: 'a b' } });
    expect(parseHash('#/entry/')).toEqual({ name: 'notfound', params: {} });
  });
  it('parses reminders and settings sections', () => {
    expect(parseHash('#/reminders')).toEqual({ name: 'reminders', params: {} });
    expect(parseHash('#/settings')).toEqual({ name: 'settings', params: { section: '' } });
    expect(parseHash('#/settings/')).toEqual({ name: 'settings', params: { section: '' } });
    for (const s of SETTINGS_SECTIONS) expect(parseHash(`#/settings/${s}`)).toEqual({ name: 'settings', params: { section: s } });
    expect(parseHash('#/settings/nope')).toEqual({ name: 'notfound', params: {} });
  });
  it('returns notfound for anything else', () => {
    expect(parseHash('#/wat')).toEqual({ name: 'notfound', params: {} });
    expect(parseHash('#/entry/a/b')).toEqual({ name: 'notfound', params: {} });
  });
});

describe('entryHref', () => {
  it('encodes and round-trips', () => {
    expect(entryHref('a b')).toBe('#/entry/a%20b');
    expect(parseHash(entryHref('x/y')).params.id).toBe('x/y');
  });
});
