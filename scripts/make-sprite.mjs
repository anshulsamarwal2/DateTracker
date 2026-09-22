// Build assets/icons/sprite.svg from lucide-static and splice it into index.html
// between <!-- sprite:start --> and <!-- sprite:end -->. Run from the repo root:
//   node scripts/make-sprite.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { ICON_NAMES } from '../src/ui/icons.js';

const VERSION = '0.460.0';
const BASE = `https://unpkg.com/lucide-static@${VERSION}`;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const symbols = [];
for (const name of ICON_NAMES) {
  const svg = await get(`${BASE}/icons/${name}.svg`);
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0" style="position:absolute">${symbols.join('')}</svg>`;
await writeFile('assets/icons/sprite.svg', sprite + '\n');
await writeFile('assets/icons/LICENSE-lucide.txt', await get(`${BASE}/LICENSE`));

const START = '<!-- sprite:start -->';
const END = '<!-- sprite:end -->';
const index = await readFile('index.html', 'utf8');
const a = index.indexOf(START);
const b = index.indexOf(END);
if (a < 0 || b < a) throw new Error('sprite markers not found in index.html');
await writeFile('index.html', index.slice(0, a + START.length) + sprite + index.slice(b));
console.log(`sprite: ${symbols.length} icons (lucide-static ${VERSION})`);
