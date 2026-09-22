// @ts-check
/**
 * Theme mode (system / light / dark) and accent colour, stored per device.
 * index.html runs a tiny inline script that reads the same PREFS_KEY to set
 * data-theme before first paint; keep the two in sync.
 *
 * @typedef {{ theme: 'system'|'light'|'dark', accent: string }} Prefs
 */

export const ACCENTS = [
  { id: 'copper', name: 'Copper', color: '#C8956C' },
  { id: 'coral', name: 'Coral', color: '#E0806B' },
  { id: 'gold', name: 'Gold', color: '#C9A84C' },
  { id: 'sage', name: 'Sage', color: '#7FA57A' },
  { id: 'teal', name: 'Teal', color: '#3A9E8F' },
  { id: 'blue', name: 'Blue', color: '#5595D9' },
  { id: 'violet', name: 'Violet', color: '#8A63C9' },
  { id: 'rose', name: 'Rose', color: '#D46E9E' },
];
export const THEME_MODES = ['system', 'light', 'dark'];
export const PREFS_KEY = 'dt:prefs';
/** @type {Prefs} */
export const DEFAULT_PREFS = { theme: 'system', accent: '#C8956C' };

const BG = { dark: '#0F0E0D', light: '#FAF8F5' };

/** @param {unknown} s */
export function isHex(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

/** @param {any} [storage] @returns {Prefs} */
export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const p = JSON.parse(storage.getItem(PREFS_KEY) || 'null');
    return {
      theme: THEME_MODES.includes(p?.theme) ? p.theme : DEFAULT_PREFS.theme,
      accent: isHex(p?.accent) ? p.accent : DEFAULT_PREFS.accent,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** @param {Prefs} prefs @param {any} [storage] */
export function savePrefs(prefs, storage = globalThis.localStorage) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode or quota: keep in memory only */ }
}

/** @param {string} mode @param {boolean} prefersDark @returns {'light'|'dark'} */
export function resolveTheme(mode, prefersDark) {
  if (mode === 'light' || mode === 'dark') return mode;
  return prefersDark ? 'dark' : 'light';
}

/** WCAG relative luminance. @param {string} hex */
export function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** @param {string} a @param {string} b */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour to draw on an accent fill. @param {string} hex */
export function onAccent(hex) {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#1A1410') ? '#FFFFFF' : '#1A1410';
}

function prefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** @param {Prefs} prefs */
export function applyTheme(prefs) {
  const root = document.documentElement;
  const resolved = resolveTheme(prefs.theme, prefersDark());
  root.dataset.theme = resolved;
  root.style.setProperty('--accent', prefs.accent);
  root.style.setProperty('--on-accent', onAccent(prefs.accent));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BG[resolved]);
}

/** Apply saved prefs and follow OS changes while in system mode. */
export function initTheme() {
  const prefs = loadPrefs();
  applyTheme(prefs);
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadPrefs()));
  }
  return prefs;
}

/** @param {Partial<Prefs>} patch */
export function updatePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  savePrefs(next);
  applyTheme(next);
  return next;
}
