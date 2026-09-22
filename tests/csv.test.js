import { describe, it, expect } from 'vitest';
import { parseCSV, toCSV } from '../src/io/csv.js';

describe('parseCSV', () => {
  it('parses simple comma CSV with CRLF and trims', () => {
    const r = parseCSV('Title, Date ,Notes\r\nTrip,2026-09-18, fun \r\n');
    expect(r.headers).toEqual(['Title', 'Date', 'Notes']);
    expect(r.rows).toEqual([['Trip', '2026-09-18', 'fun']]);
  });
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const r = parseCSV('a,b\n"x, y","say ""hi""\nsecond line"\n');
    expect(r.rows).toEqual([['x, y', 'say "hi"\nsecond line']]);
  });
  it('strips a BOM and drops blank rows', () => {
    const r = parseCSV('﻿a,b\n\n1,2\n , \n');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([['1', '2']]);
  });
  it('autodetects tabs', () => {
    const r = parseCSV('a\tb\n1\t2, with comma\n');
    expect(r.rows).toEqual([['1', '2, with comma']]);
  });
  it('returns empty for empty input', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] });
    expect(parseCSV(null)).toEqual({ headers: [], rows: [] });
  });
  it('keeps a trailing row without newline', () => {
    expect(parseCSV('a\n1').rows).toEqual([['1']]);
  });
});

describe('toCSV', () => {
  it('emits BOM, CRLF and quotes only when needed', () => {
    const out = toCSV([['date', 'title'], ['2026-09-18', 'Trip, to "Jaipur"'], ['2026-01-01', 'multi\nline'], ['x', null]]);
    expect(out.charCodeAt(0)).toBe(0xFEFF);
    expect(out.slice(1)).toBe('date,title\r\n2026-09-18,"Trip, to ""Jaipur"""\r\n2026-01-01,"multi\nline"\r\nx,\r\n');
  });
  it('round-trips through parseCSV', () => {
    const rows = [['h1', 'h2'], ['a "q"', 'b,c'], ['line\nbreak', '']];
    const back = parseCSV(toCSV(rows));
    expect(back.headers).toEqual(['h1', 'h2']);
    expect(back.rows).toEqual([['a "q"', 'b,c'], ['line\nbreak', '']]);
  });
});
