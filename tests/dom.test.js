import { describe, it, expect, vi } from 'vitest';
import { Raw, escapeHTML, raw, html, linkify, delegate } from '../src/ui/dom.js';

describe('escapeHTML', () => {
  it('escapes markup and quote characters', () => {
    expect(escapeHTML(`<a href="x" onclick='y'>&\`</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;');
  });
  it('renders null/undefined as empty and stringifies numbers', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
    expect(escapeHTML(0)).toBe('0');
  });
});

describe('html', () => {
  it('escapes interpolations, including inside attributes', () => {
    const evil = '"><img src=x onerror=alert(1)>';
    const out = html`<input value="${evil}">`;
    expect(out).toBeInstanceOf(Raw);
    expect(String(out)).toBe('<input value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">');
  });
  it('passes Raw and nested html through unescaped', () => {
    expect(String(html`<p>${raw('<b>ok</b>')}</p>`)).toBe('<p><b>ok</b></p>');
    expect(String(html`<ul>${html`<li>${'<x>'}</li>`}</ul>`)).toBe('<ul><li>&lt;x&gt;</li></ul>');
  });
  it('joins arrays and drops null/undefined/booleans', () => {
    expect(String(html`${['a', html`<i>b</i>`, '<c>']}`)).toBe('a<i>b</i>&lt;c&gt;');
    expect(String(html`[${null}${undefined}${false}${true}${0}]`)).toBe('[0]');
  });
});

describe('linkify', () => {
  it('links http(s) URLs and escapes the rest', () => {
    expect(String(linkify('See https://example.com/a?b=1&c=2. <ok>'))).toBe(
      'See <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1&amp;c=2</a>. &lt;ok&gt;');
  });
  it('never links other schemes', () => {
    expect(String(linkify('javascript:alert(1)'))).toBe('javascript:alert(1)');
  });
  it('handles text without links and empty input', () => {
    expect(String(linkify('line 1\nline 2'))).toBe('line 1\nline 2');
    expect(String(linkify(''))).toBe('');
  });
});

describe('delegate', () => {
  it('dispatches to the handler named by the closest data-action', () => {
    let listener = null;
    const root = { addEventListener: (_t, fn) => { listener = fn; }, removeEventListener: vi.fn(), contains: () => true };
    const btn = { getAttribute: () => 'save' };
    const target = { closest: () => btn };
    const save = vi.fn();
    const off = delegate(root, 'click', { save });
    listener({ target });
    expect(save).toHaveBeenCalledWith(btn, { target });
    off();
    expect(root.removeEventListener).toHaveBeenCalled();
  });
  it('ignores events without an action or outside the root', () => {
    let listener = null;
    const root = { addEventListener: (_t, fn) => { listener = fn; }, removeEventListener() {}, contains: () => false };
    const save = vi.fn();
    delegate(root, 'click', { save });
    listener({ target: { closest: () => ({ getAttribute: () => 'save' }) } });
    listener({ target: { closest: () => null } });
    listener({ target: null });
    expect(save).not.toHaveBeenCalled();
  });
});
