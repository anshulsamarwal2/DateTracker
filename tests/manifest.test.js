import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('manifest.webmanifest', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  it('has the installability fields', () => {
    expect(m).toMatchObject({ name: 'DateTracker', short_name: 'DateTracker', start_url: './', scope: './', display: 'standalone' });
    expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it('lists 192, 512 and a maskable icon that exist with the declared sizes', () => {
    const purposes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const i of m.icons) {
      expect(existsSync(i.src)).toBe(true);
      expect(pngSize(i.src).join('x')).toBe(i.sizes);
    }
  });
  it('has an apple-touch-icon of 180 px', () => {
    expect(pngSize('assets/icons/apple-touch-icon.png')).toEqual([180, 180]);
  });
});
