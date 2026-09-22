import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');
const block = /const SHELL = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? '';
const shell = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);

/** @param {string} dir */
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p.replace(/\\/g, '/')];
});

describe('sw.js precache', () => {
  it('has a VERSION', () => {
    expect(sw).toMatch(/const VERSION = '[^']+';/);
  });
  it('lists only files that exist', () => {
    for (const p of shell) {
      if (p === './') continue;
      expect(existsSync(p), p).toBe(true);
    }
  });
  it('includes every app module, stylesheet and vendored SDK file', () => {
    const needed = [...walk('src'), ...walk('styles'), ...walk('vendor/firebase')]
      .filter((p) => /\.(js|css)$/.test(p))
      .map((p) => `./${p}`);
    for (const p of needed) expect(shell, p).toContain(p);
  });
  it('includes the shell document, manifest, font and icons', () => {
    for (const p of ['./', './index.html', './manifest.webmanifest', './assets/fonts/Outfit-latin.woff2', './assets/icons/icon-192.png', './assets/icons/favicon.svg']) {
      expect(shell).toContain(p);
    }
  });
});
