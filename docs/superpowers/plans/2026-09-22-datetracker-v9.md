# DateTracker v9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild DateTracker as a private, offline-capable, installable journal of memorable events — one entry type, a timeline home, per-entry Firestore documents with live sync — as a set of zero-build ES modules that replace the v8.2 single-file app.

**Architecture:** Plain HTML + CSS + native ES modules, no bundler and no framework. A tiny observable store holds `{user, entries, categories, meta, ui}`; screens are functions `mount(root, params) → { unmount }` that render an auto-escaping `html` template into `#app` and bind events by delegation. Only `src/db.js` talks to Firestore (vendored SDK, persistent local cache, `onSnapshot` listeners). A hash router drives screens; bottom sheets push history entries so Back closes them. A service worker precaches the shell.

**Tech Stack:** HTML5, CSS (custom properties, `color-mix`), ES2022 modules, Firebase JS SDK 10.12.2 (Auth + Firestore, vendored ESM), Lucide icons (sprite), Outfit font (self-hosted), Vitest 5 for pure-module tests, GitHub Pages hosting, GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-09-21-datetracker-v9-design.md` — read it first; every task below cites the section it implements.

## Global Constraints

- **Zero-build.** The app runs from a static server with no compile step. `npm` is used only for `vitest` (dev). Never add a bundler, transpiler, or runtime framework.
- **Relative URLs everywhere** (`./src/...`, `../assets/...`). The app is served from `https://anshulsamarwal2.github.io/DateTracker/`, a sub-path.
- **No inline event handlers** (`onclick=""`), **no `window.*` globals**, no `eval`. Events bind via `delegate()` on `data-action` attributes.
- **Every interpolated value is escaped.** All markup is built with the `html` tagged template from `src/ui/dom.js`. `raw()` is only for markup the app itself composed (icons, nested templates) — never for user data.
- **Dates:** an entry `date` is the string `'YYYY-MM-DD'` meaning a local calendar day. Never derive a calendar day from `Date#toISOString()`. All date logic lives in `src/dates.js`.
- **Reminders** have exactly two kinds: `{ kind: 'once', at: 'YYYY-MM-DDTHH:MM' }` and `{ kind: 'yearly', time: 'HH:MM' }`.
- **Trash is manual-empty only.** Nothing auto-purges. Delete = set `deletedAt`; the toast offers Undo.
- **Only `src/db.js` and `src/firebase.js` import the Firebase SDK.** Every write is one document (or a `writeBatch` of ≤ 400 single-document ops). Nothing ever writes a whole collection from memory. No code path writes defaults over existing data.
- **Do not `await` Firestore writes to gate UI flow** — with the persistent cache, offline writes only resolve when the server acknowledges. Fire the write, `.catch()` it into a toast, and let the `onSnapshot` listener update the UI.
- **Typography:** base 16 px; sizes only from `--fs-1..5` (12/14/16/20/28). Nothing renders below 12 px. Text contrast ≥ 4.5:1 in both themes.
- **Touch targets ≥ 44 px.** Real `<button>`/`<a>` for every interactive element; icon-only buttons carry `aria-label`.
- **No `window.confirm` / `alert` / `prompt`.** Use `confirmSheet()` from `src/ui/sheet.js`.
- **Pure modules start with `// @ts-check`** and JSDoc every export. UI modules may omit `@ts-check`.
- **Commit after every task** on branch `v9-redesign` with the message shown in the task. Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests:** `npm test` must pass at the end of every task that touches `src/` (excluding `src/ui/*` screens, which are exercised by the manual checklist in Task 30).
- Copy strings are exactly as written in the spec/plan (e.g. empty state: "Your journal is empty. Tap + to record your first memory — a trip, a purchase, a milestone. Anything worth remembering.").
- **Working directory for every command:** `C:\Users\anshu\Downloads\Datetracker\DateTracker` (Git Bash path `/c/Users/anshu/Downloads/Datetracker/DateTracker`). Shell steps are Git Bash unless marked PowerShell.
- **Git on this machine:** the repo is owned by another Windows account, so git needs `-c safe.directory=C:/Users/anshu/Downloads/Datetracker/DateTracker` on every command (or a one-time `git config --global --add safe.directory …` if the user agrees). Plan steps write plain `git …` for readability.
- **No Python on this machine.** Local serving is `npm run serve` (Node, `scripts/serve.mjs`, Task 1).

---

## File map

| Path | Responsibility |
|---|---|
| `index.html` | Shell: `<head>` (meta, manifest, styles), inline icon sprite, `#app`, `#sheets`, `#toasts`, module script |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker: versioned precache of the shell |
| `firestore.rules` | Security rules (checked in for reference) |
| `package.json`, `package-lock.json`, `vitest.config.js` | Dev-only test tooling |
| `scripts/vendor-firebase.sh` | Downloads + rewrites Firebase ESM into `vendor/firebase/` |
| `scripts/make-sprite.mjs` | Downloads Lucide icons → `assets/icons/sprite.svg` and splices into `index.html` |
| `scripts/make-app-icons.ps1` | Rasterises PWA icons with System.Drawing |
| `assets/fonts/Outfit-latin.woff2`, `assets/fonts/OFL.txt` | Self-hosted font |
| `assets/icons/*` | favicon.svg, PNG app icons, sprite.svg, Lucide licence |
| `vendor/firebase/*.js` | firebase-app / firebase-auth / firebase-firestore (10.12.2) |
| `styles/tokens.css` | Colour, type, spacing tokens; dark default, light override |
| `styles/base.css` | Reset, `@font-face`, typography, focus rings, reduced motion |
| `styles/components.css` | Buttons, icon buttons, inputs, chips, segmented, toggle, sheet, confirm, toast, cards, list rows, empty state |
| `styles/screens.css` | Landing, app frame/topbar, timeline, detail, compose, reminders, settings |
| `src/main.js` | Boot: theme → auth → first-run → subscriptions → app |
| `src/config.js` | `firebaseConfig` |
| `src/firebase.js` | SDK init (auth + firestore with persistent cache); re-exports auth helpers |
| `src/store.js` | `createStore`, the singleton `store`, `setUI` |
| `src/selectors.js` | Derived data: filtering, grouping, on-this-day, upcoming, counts |
| `src/db.js` | Firestore reads/writes/subscriptions, first-run seed |
| `src/model.js` | Entry/category factories, validation, normalisation, palette, limits |
| `src/dates.js` | Local-date helpers, formatting, anniversaries, relative labels |
| `src/reminders.js` | nextFireTime, due detection, scheduler, ICS |
| `src/router.js` | Hash routes, `navigate`, `back`, `onRouteChange` |
| `src/theme.js` | Theme mode + accent, persisted in localStorage |
| `src/io/csv.js` | CSV parse/serialise |
| `src/io/import.js` | Column mapping, date normalising, CSV→entries, JSON export parsing, merge planning |
| `src/io/export.js` | JSON/CSV builders, filenames, browser download |
| `src/ui/dom.js` | `html`, `raw`, `escapeHTML`, `delegate`, `setHTML`, `linkify`, `focusFirst` |
| `src/ui/icons.js` | `icon(name)` |
| `src/ui/sheet.js` | `openSheet`, `confirmSheet` |
| `src/ui/toast.js` | `toast` |
| `src/ui/app.js` | Screen switcher driven by the router |
| `src/ui/landing.js` | Landing, loading, error screens |
| `src/ui/timeline.js` | Home screen |
| `src/ui/compose.js` | New/edit sheet |
| `src/ui/entry-detail.js` | Entry screen |
| `src/notifications.js` | Notification permission, showing a notification, fired-key storage, scheduler start |
| `src/ui/reminders-view.js` | Reminders screen |
| `src/ui/settings.js` | Settings index + Account, Appearance, Notifications, About, Sign out; dispatches to the section modules below |
| `src/ui/settings-categories.js` | Categories section (list, add, rename/recolour, reorder, delete with reassignment) |
| `src/ui/settings-data.js` | Data section (export JSON/CSV, import JSON, import CSV mapping flow) |
| `src/ui/settings-trash.js` | Trash section (restore, empty trash) |
| `tests/*.test.js` | Vitest unit tests for pure modules |
| `.github/workflows/test.yml` | CI |
| `README.md`, `CHANGELOG.md` | Docs |

---

## Phase 0 — Scaffold

### Task 1: Tag the legacy app and scaffold the repo

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `tests/smoke.test.js`, `scripts/serve.mjs`
- Create (empty dirs via `.gitkeep`): `src/ui/`, `src/io/`, `styles/`, `assets/fonts/`, `assets/icons/`, `vendor/firebase/`, `scripts/`

**Interfaces:**
- Produces: `npm test` runs Vitest over `tests/**/*.test.js`; `npm run serve` serves the repo root at `http://localhost:8080/` (no Python needed — this machine has none).

- [ ] **Step 1: Tag the current `main` as the legacy release**

```bash
git tag -a v8.2-legacy 14e5e78 -m "Last single-file release before the v9 rewrite"
git tag -l
```
Expected: `v8.2-legacy` listed. (Do not push.)

- [ ] **Step 2: Create package.json**

```json
{
  "name": "datetracker",
  "version": "9.0.0",
  "private": true,
  "type": "module",
  "description": "A private journal of memorable events. Zero-build web app.",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "node scripts/serve.mjs 8080"
  },
  "devDependencies": {
    "vitest": "^5.0.1"
  }
}
```

- [ ] **Step 3: Create vitest.config.js**

```js
export default {
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
};
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.superpowers/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 5: Create the folder skeleton and a smoke test**

```bash
mkdir -p src/ui src/io styles assets/fonts assets/icons vendor/firebase scripts tests
touch src/ui/.gitkeep src/io/.gitkeep styles/.gitkeep assets/fonts/.gitkeep assets/icons/.gitkeep vendor/firebase/.gitkeep scripts/.gitkeep
```

`tests/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5b: Create the dev server**

ES modules do not load over `file://`, so local runs need a static server. This one has no dependencies.

`scripts/serve.mjs`:
```js
// Minimal static file server for local development.
//   node scripts/serve.mjs [port]      (or: npm run serve)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    let file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(PORT, () => console.log(`DateTracker dev server: http://localhost:${PORT}/`));
```

- [ ] **Step 6: Install and run**

```bash
npm install
npm test
```
Expected: `1 passed`. A `package-lock.json` now exists — commit it.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js .gitignore tests/smoke.test.js src styles assets vendor scripts
git commit -m "$(cat <<'EOF'
chore: scaffold v9 repo with vitest

Adds package.json (vitest only), vitest config, .gitignore and the
folder skeleton for the zero-build ES module layout.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — Pure modules (TDD, no DOM)

### Task 2: `src/dates.js` — local-calendar date helpers

Implements spec §6 (date = local calendar string), §4.3/§4.4 formatting, §9 anniversaries (Feb 29 → Feb 28), §4.6 relative labels.

**Files:**
- Create: `src/dates.js`
- Test: `tests/dates.test.js`

**Interfaces:**
- Produces:
  - `pad2(n:number): string`
  - `toISODate(d:Date): string` — local `'YYYY-MM-DD'`
  - `todayISO(now?:Date): string`
  - `isValidISODate(s:unknown): boolean`
  - `parseISODate(s:string): Date|null` — local midnight
  - `fromParts(y:number, m:number, d:number): string`
  - `yearOf(iso): number`, `monthKey(iso): 'YYYY-MM'`, `dayNumber(iso): string`, `sameMonthDay(a, b): boolean`
  - `daysBetween(aISO, bISO): number` — whole calendar days, b − a
  - `formatLong(iso, locale?)`, `formatShort(iso, locale?)`, `formatMonthYear(iso, locale?)`, `formatDayMonth(iso, locale?)`, `formatWeekday(iso, locale?)`
  - `parseTime(hhmm?: string): {h:number, m:number}` — defaults to 09:00
  - `anniversaryOn(iso, year, time): Date|null`
  - `nextAnniversary(iso, time, now?:Date): Date|null` — strictly after `now`
  - `relativeDayLabel(target:Date, now?:Date, locale?): string`
  - `toDateTimeLocal(d:Date): 'YYYY-MM-DDTHH:MM'`, `parseDateTimeLocal(s): Date|null`

- [ ] **Step 1: Write the failing tests**

`tests/dates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  pad2, toISODate, todayISO, isValidISODate, parseISODate, fromParts,
  yearOf, monthKey, dayNumber, sameMonthDay, daysBetween,
  formatLong, formatShort, formatMonthYear, formatDayMonth, formatWeekday,
  parseTime, anniversaryOn, nextAnniversary, relativeDayLabel,
  toDateTimeLocal, parseDateTimeLocal,
} from '../src/dates.js';

describe('basics', () => {
  it('pads', () => { expect(pad2(3)).toBe('03'); expect(pad2(12)).toBe('12'); });
  it('toISODate uses local calendar day', () => {
    expect(toISODate(new Date(2026, 8, 18, 23, 59))).toBe('2026-09-18');
    expect(toISODate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
  it('todayISO takes an injectable now', () => {
    expect(todayISO(new Date(2026, 8, 22, 1, 0))).toBe('2026-09-22');
  });
  it('validates ISO dates on a real calendar', () => {
    expect(isValidISODate('2026-09-18')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-9-8')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate('2026-09-18T00:00')).toBe(false);
  });
  it('parses to local midnight', () => {
    const d = parseISODate('2026-09-18');
    expect(d.getFullYear()).toBe(2026); expect(d.getMonth()).toBe(8); expect(d.getDate()).toBe(18); expect(d.getHours()).toBe(0);
    expect(parseISODate('nope')).toBeNull();
  });
  it('fromParts/yearOf/monthKey/dayNumber/sameMonthDay', () => {
    expect(fromParts(2026, 9, 8)).toBe('2026-09-08');
    expect(yearOf('2023-04-05')).toBe(2023);
    expect(monthKey('2023-04-05')).toBe('2023-04');
    expect(dayNumber('2023-04-05')).toBe('5');
    expect(sameMonthDay('2023-04-05', '2026-04-05')).toBe(true);
    expect(sameMonthDay('2023-04-05', '2026-04-06')).toBe(false);
  });
  it('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-09-18', '2026-09-21')).toBe(3);
    expect(daysBetween('2026-09-21', '2026-09-18')).toBe(-3);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(Number.isNaN(daysBetween('bad', '2026-04-01'))).toBe(true);
  });
});

describe('formatting (en-US for determinism)', () => {
  it('formats', () => {
    expect(formatLong('2026-09-18', 'en-US')).toBe('Friday, September 18, 2026');
    expect(formatShort('2026-09-18', 'en-US')).toBe('Sep 18, 2026');
    expect(formatMonthYear('2026-09-18', 'en-US')).toBe('September 2026');
    expect(formatDayMonth('2026-09-18', 'en-US')).toBe('September 18');
    expect(formatWeekday('2026-09-18', 'en-US')).toBe('Fri');
  });
  it('returns empty string for invalid input', () => {
    expect(formatLong('garbage', 'en-US')).toBe('');
  });
});

describe('time and anniversaries', () => {
  it('parseTime defaults to 09:00', () => {
    expect(parseTime('14:05')).toEqual({ h: 14, m: 5 });
    expect(parseTime('')).toEqual({ h: 9, m: 0 });
    expect(parseTime(undefined)).toEqual({ h: 9, m: 0 });
    expect(parseTime('25:00')).toEqual({ h: 9, m: 0 });
  });
  it('anniversaryOn keeps month/day and applies time', () => {
    const d = anniversaryOn('2019-09-18', 2026, '10:30');
    expect(toISODate(d)).toBe('2026-09-18'); expect(d.getHours()).toBe(10); expect(d.getMinutes()).toBe(30);
  });
  it('Feb 29 anniversaries fall on Feb 28 in non-leap years', () => {
    expect(toISODate(anniversaryOn('2020-02-29', 2026, '09:00'))).toBe('2026-02-28');
    expect(toISODate(anniversaryOn('2020-02-29', 2028, '09:00'))).toBe('2028-02-29');
  });
  it('nextAnniversary is strictly after now', () => {
    const now = new Date(2026, 8, 18, 9, 0);
    expect(toISODate(nextAnniversary('2019-09-18', '09:00', now))).toBe('2027-09-18');
    expect(toISODate(nextAnniversary('2019-09-18', '09:01', now))).toBe('2026-09-18');
    expect(toISODate(nextAnniversary('2019-12-25', '09:00', now))).toBe('2026-12-25');
    expect(toISODate(nextAnniversary('2019-01-05', '09:00', now))).toBe('2027-01-05');
    expect(nextAnniversary('bad', '09:00', now)).toBeNull();
  });
});

describe('relative labels (en-US)', () => {
  const now = new Date(2026, 8, 22, 15, 0);
  const at = (y, m, d) => new Date(y, m - 1, d, 9, 0);
  it('day granularity under a week', () => {
    expect(relativeDayLabel(at(2026, 9, 22), now, 'en-US')).toBe('Today');
    expect(relativeDayLabel(at(2026, 9, 23), now, 'en-US')).toBe('Tomorrow');
    expect(relativeDayLabel(at(2026, 9, 21), now, 'en-US')).toBe('Yesterday');
    expect(relativeDayLabel(at(2026, 9, 25), now, 'en-US')).toBe('in 3 days');
    expect(relativeDayLabel(at(2026, 9, 20), now, 'en-US')).toBe('2 days ago');
  });
  it('weeks, months, years beyond that', () => {
    expect(relativeDayLabel(at(2026, 10, 2), now, 'en-US')).toBe('in 1 week');
    expect(relativeDayLabel(at(2026, 11, 6), now, 'en-US')).toBe('in 2 months');
    expect(relativeDayLabel(at(2027, 10, 27), now, 'en-US')).toBe('in 1 year');
    expect(relativeDayLabel(at(2024, 9, 22), now, 'en-US')).toBe('2 years ago');
  });
});

describe('datetime-local', () => {
  it('round-trips', () => {
    const d = new Date(2026, 8, 18, 7, 5);
    expect(toDateTimeLocal(d)).toBe('2026-09-18T07:05');
    const p = parseDateTimeLocal('2026-09-18T07:05');
    expect(p.getTime()).toBe(d.getTime());
    expect(parseDateTimeLocal('2026-09-18T07:05:00')).not.toBeNull();
    expect(parseDateTimeLocal('2026-02-30T07:05')).toBeNull();
    expect(parseDateTimeLocal('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dates.test.js`
Expected: FAIL — `Failed to resolve import "../src/dates.js"`.

- [ ] **Step 3: Implement `src/dates.js`**

```js
// @ts-check
/**
 * Local-calendar date helpers.
 *
 * An entry date is always a 'YYYY-MM-DD' string meaning a calendar day in the
 * user's local timezone. Never derive a calendar day from Date#toISOString()
 * — that is UTC and is wrong for anyone east of Greenwich after midnight.
 */

export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DT_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MS_DAY = 86400000;

/** @param {number} n */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local calendar day of a Date. @param {Date} d */
export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** @param {Date} [now] */
export function todayISO(now = new Date()) {
  return toISODate(now);
}

/** True only for a real calendar date in 'YYYY-MM-DD' form. @param {unknown} s */
export function isValidISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** Local midnight for an ISO date, or null. @param {string} s */
export function parseISODate(s) {
  if (!isValidISODate(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

/** @param {number} y @param {number} m 1–12 @param {number} d */
export function fromParts(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** @param {string} iso */
export function yearOf(iso) {
  return Number(iso.slice(0, 4));
}

/** @param {string} iso */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** Day of month without leading zero. @param {string} iso */
export function dayNumber(iso) {
  return String(Number(iso.slice(8, 10)));
}

/** @param {string} a @param {string} b */
export function sameMonthDay(a, b) {
  return a.slice(5, 10) === b.slice(5, 10);
}

/** Whole calendar days from a to b (b − a). NaN if either is invalid. */
export function daysBetween(a, b) {
  const da = parseISODate(a), db = parseISODate(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const fmtCache = new Map();
/** @param {string|undefined} locale @param {Intl.DateTimeFormatOptions} opts */
function formatter(locale, opts) {
  const key = `${locale || ''}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); fmtCache.set(key, f); }
  return f;
}
/** @param {string} iso @param {string|undefined} locale @param {Intl.DateTimeFormatOptions} opts */
function fmt(iso, locale, opts) {
  const d = parseISODate(iso);
  return d ? formatter(locale, opts).format(d) : '';
}

/** "Friday, September 18, 2026" */
export function formatLong(iso, locale = undefined) {
  return fmt(iso, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
/** "Sep 18, 2026" */
export function formatShort(iso, locale = undefined) {
  return fmt(iso, locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
/** "September 2026" */
export function formatMonthYear(iso, locale = undefined) {
  return fmt(iso, locale, { month: 'long', year: 'numeric' });
}
/** "September 18" */
export function formatDayMonth(iso, locale = undefined) {
  return fmt(iso, locale, { day: 'numeric', month: 'long' });
}
/** "Fri" */
export function formatWeekday(iso, locale = undefined) {
  return fmt(iso, locale, { weekday: 'short' });
}

/** 'HH:MM' → {h, m}; anything invalid → 09:00. @param {string} [hhmm] */
export function parseTime(hhmm) {
  const m = TIME_RE.exec(hhmm || '');
  if (!m) return { h: 9, m: 0 };
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return { h: 9, m: 0 };
  return { h, m: mi };
}

/**
 * The anniversary of `iso` in `year` at `time`. A Feb 29 anniversary lands on
 * Feb 28 in non-leap years.
 * @param {string} iso @param {number} year @param {string} time
 */
export function anniversaryOn(iso, year, time) {
  const src = parseISODate(iso);
  if (!src) return null;
  const { h, m } = parseTime(time);
  const month = src.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(src.getDate(), lastDay), h, m, 0, 0);
}

/** First anniversary strictly after `now`. @param {string} iso @param {string} time @param {Date} [now] */
export function nextAnniversary(iso, time, now = new Date()) {
  const y = now.getFullYear();
  const thisYear = anniversaryOn(iso, y, time);
  if (!thisYear) return null;
  return thisYear.getTime() > now.getTime() ? thisYear : anniversaryOn(iso, y + 1, time);
}

/**
 * Human relative label by calendar-day distance: Today / Tomorrow / Yesterday /
 * "in 3 days" / "2 days ago" / "in 2 weeks" / "in 3 months" / "in 1 year".
 * @param {Date} target @param {Date} [now] @param {string} [locale]
 */
export function relativeDayLabel(target, now = new Date(), locale = undefined) {
  const days = daysBetween(toISODate(now), toISODate(target));
  // 'auto' only for days (Today / Tomorrow / Yesterday); weeks and beyond stay
  // numeric so we get "in 1 week", never "next week".
  const byDay = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const numeric = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const abs = Math.abs(days);
  let label;
  if (abs < 7) label = byDay.format(days, 'day');
  else if (abs < 30) label = numeric.format(Math.round(days / 7), 'week');
  else if (abs < 365) label = numeric.format(Math.round(days / 30), 'month');
  else label = numeric.format(Math.round(days / 365), 'year');
  // Capitalise word-only labels (today/tomorrow/yesterday); leave "in 3 days" as is.
  return /\d/.test(label) ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

/** Value for <input type="datetime-local">. @param {Date} d */
export function toDateTimeLocal(d) {
  return `${toISODate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse 'YYYY-MM-DDTHH:MM[:SS]' as local time. @param {string} s */
export function parseDateTimeLocal(s) {
  const m = DT_LOCAL_RE.exec(s || '');
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidISODate(date)) return null;
  const h = Number(m[4]), mi = Number(m[5]);
  if (h > 23 || mi > 59) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi, 0, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/dates.test.js`
Expected: all green. If a `relativeDayLabel` expectation differs only by ICU wording, check Node's output with `node -e "console.log(new Intl.RelativeTimeFormat('en-US',{numeric:'auto'}).format(3,'day'))"` and fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/dates.js tests/dates.test.js
git commit -m "$(cat <<'EOF'
feat: add local-calendar date helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `src/model.js` — entry & category shapes, validation, palette

Implements spec §6 (data model) and §4.5 validation copy.

**Files:**
- Create: `src/model.js`
- Test: `tests/model.test.js`

**Interfaces:**
- Consumes: `isValidISODate`, `todayISO` from `src/dates.js`.
- Produces:
  - `PALETTE: string[]` (20 hex), `DEFAULT_CATEGORIES: {name, color}[]` (Travel, Milestones, Health, Family), `LIMITS = { title: 200, notes: 5000, categoryName: 40 }`, `REMINDER_KINDS = ['once','yearly']`
  - `newId(): string`
  - `validateEntry(input): { title?, date?, notes?, reminder? }` — `{}` means valid
  - `normalizeReminder(r): Reminder|null`
  - `buildEntry(input, now?, id?): Entry`
  - `entryPatch(input, now?): Partial<Entry>` — for updates (no id/createdAt/deletedAt)
  - `normalizeEntry(id, raw): Entry`, `normalizeCategory(id, raw): Category`
  - `toDoc(obj): object` — strips `id`
  - `buildCategory({name, color, order}, now?, id?): Category`
  - `nextPaletteColor(categories): string`
  - `validateCategoryName(name, categories, exceptId?): string|null`
  - Types: `Entry = { id, title, date, notes, categoryId, starred, reminder, deletedAt, createdAt, updatedAt }`, `Category = { id, name, color, order, createdAt }`

- [ ] **Step 1: Write the failing tests**

`tests/model.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  PALETTE, DEFAULT_CATEGORIES, LIMITS, newId, validateEntry, normalizeReminder,
  buildEntry, entryPatch, normalizeEntry, normalizeCategory, toDoc,
  buildCategory, nextPaletteColor, validateCategoryName,
} from '../src/model.js';

const good = { title: '  Trip to Jaipur ', date: '2026-09-18', notes: 'Three days', categoryId: 'c1', starred: true, reminder: null };

describe('constants', () => {
  it('has a 20-colour palette and 4 default categories', () => {
    expect(PALETTE).toHaveLength(20);
    expect(PALETTE.every(c => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
    expect(DEFAULT_CATEGORIES.map(c => c.name)).toEqual(['Travel', 'Milestones', 'Health', 'Family']);
    expect(LIMITS).toEqual({ title: 200, notes: 5000, categoryName: 40 });
  });
  it('newId is a uuid', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(newId());
  });
});

describe('validateEntry', () => {
  it('accepts a good entry', () => { expect(validateEntry(good)).toEqual({}); });
  it('requires a title and a valid date', () => {
    expect(validateEntry({ ...good, title: '   ' }).title).toBe('Give this memory a title.');
    expect(validateEntry({ ...good, date: '2026-02-30' }).date).toBe('Pick a valid date.');
    expect(validateEntry({ ...good, title: 'x'.repeat(201) }).title).toBe('Keep the title under 200 characters.');
    expect(validateEntry({ ...good, notes: 'x'.repeat(5001) }).notes).toBe('Notes are limited to 5000 characters.');
  });
  it('validates reminders', () => {
    expect(validateEntry({ ...good, reminder: { kind: 'once', at: '2026-09-18T09:00' } })).toEqual({});
    expect(validateEntry({ ...good, reminder: { kind: 'once', at: '' } }).reminder).toBe('Pick a date and time for the reminder.');
    expect(validateEntry({ ...good, reminder: { kind: 'yearly', time: '09:00' } })).toEqual({});
    expect(validateEntry({ ...good, reminder: { kind: 'yearly', time: '9am' } }).reminder).toBe('Pick a time for the reminder.');
    expect(validateEntry({ ...good, reminder: { kind: 'weekly', time: '09:00' } }).reminder).toBe('Unknown reminder type.');
  });
});

describe('normalizeReminder', () => {
  it('keeps valid shapes and drops the rest', () => {
    expect(normalizeReminder({ kind: 'once', at: '2026-09-18T09:00:00' })).toEqual({ kind: 'once', at: '2026-09-18T09:00' });
    expect(normalizeReminder({ kind: 'yearly', time: '07:30' })).toEqual({ kind: 'yearly', time: '07:30' });
    expect(normalizeReminder({ kind: 'yearly', time: 'x' })).toEqual({ kind: 'yearly', time: '09:00' });
    expect(normalizeReminder({ kind: 'once', at: 'nope' })).toBeNull();
    expect(normalizeReminder({ kind: 'daily', time: '09:00' })).toBeNull();
    expect(normalizeReminder(null)).toBeNull();
    expect(normalizeReminder('once')).toBeNull();
  });
});

describe('buildEntry / entryPatch', () => {
  it('trims, defaults and stamps', () => {
    const e = buildEntry(good, 1000, 'id1');
    expect(e).toEqual({ id: 'id1', title: 'Trip to Jaipur', date: '2026-09-18', notes: 'Three days', categoryId: 'c1', starred: true, reminder: null, deletedAt: null, createdAt: 1000, updatedAt: 1000 });
    expect(buildEntry({ title: 'x', date: '2026-01-01' }, 5).categoryId).toBeNull();
    expect(buildEntry({ title: 'x', date: '2026-01-01' }, 5).notes).toBe('');
  });
  it('entryPatch has no id/createdAt/deletedAt', () => {
    const p = entryPatch(good, 2000);
    expect(Object.keys(p).sort()).toEqual(['categoryId', 'date', 'notes', 'reminder', 'starred', 'title', 'updatedAt']);
    expect(p.updatedAt).toBe(2000);
  });
});

describe('normalizeEntry / normalizeCategory / toDoc', () => {
  it('fills defaults for sparse or bad documents', () => {
    const e = normalizeEntry('a', { title: '', date: 'bad', starred: 'yes', reminder: { kind: 'once', at: '2026-01-01T08:00' } });
    expect(e.id).toBe('a'); expect(e.title).toBe('Untitled'); expect(/^\d{4}-\d{2}-\d{2}$/.test(e.date)).toBe(true);
    expect(e.starred).toBe(false); expect(e.notes).toBe(''); expect(e.categoryId).toBeNull(); expect(e.deletedAt).toBeNull();
    expect(e.reminder).toEqual({ kind: 'once', at: '2026-01-01T08:00' });
    expect(normalizeEntry('b', null).title).toBe('Untitled');
  });
  it('normalizes categories', () => {
    expect(normalizeCategory('c', { name: ' Travel ', color: 'red' })).toEqual({ id: 'c', name: 'Travel', color: PALETTE[0], order: 0, createdAt: 0 });
    expect(normalizeCategory('c', { name: 'X', color: '#ABCDEF', order: 3, createdAt: 9 }).color).toBe('#ABCDEF');
  });
  it('toDoc strips id', () => {
    expect(toDoc({ id: 'x', a: 1 })).toEqual({ a: 1 });
  });
});

describe('categories', () => {
  it('buildCategory trims and stamps', () => {
    expect(buildCategory({ name: ' Work ', color: '#111111', order: 2 }, 7, 'k')).toEqual({ id: 'k', name: 'Work', color: '#111111', order: 2, createdAt: 7 });
  });
  it('nextPaletteColor picks the least-used colour, first on ties', () => {
    expect(nextPaletteColor([])).toBe(PALETTE[0]);
    expect(nextPaletteColor([{ color: PALETTE[0] }])).toBe(PALETTE[1]);
    expect(nextPaletteColor(PALETTE.map(color => ({ color })))).toBe(PALETTE[0]);
    expect(nextPaletteColor([{ color: PALETTE[0].toLowerCase() }])).toBe(PALETTE[1]);
  });
  it('validateCategoryName', () => {
    const cats = [{ id: '1', name: 'Travel' }];
    expect(validateCategoryName('Health', cats)).toBeNull();
    expect(validateCategoryName('', cats)).toBe('Give the category a name.');
    expect(validateCategoryName('travel', cats)).toBe('You already have a category with that name.');
    expect(validateCategoryName('travel', cats, '1')).toBeNull();
    expect(validateCategoryName('x'.repeat(41), cats)).toBe('Keep it under 40 characters.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/model.test.js`
Expected: FAIL — cannot resolve `../src/model.js`.

- [ ] **Step 3: Implement `src/model.js`**

```js
// @ts-check
import { isValidISODate, todayISO } from './dates.js';

/**
 * @typedef {{ kind: 'once', at: string } | { kind: 'yearly', time: string }} Reminder
 * @typedef {{ id: string, title: string, date: string, notes: string, categoryId: string|null,
 *             starred: boolean, reminder: Reminder|null, deletedAt: number|null,
 *             createdAt: number, updatedAt: number }} Entry
 * @typedef {{ id: string, name: string, color: string, order: number, createdAt: number }} Category
 */

export const PALETTE = [
  '#CF6679', '#E07B39', '#C9A84C', '#5BA85A', '#3A9E8F', '#4A8FD4', '#8A63C9', '#D46E9E',
  '#4AABB8', '#A0784E', '#5C8CA8', '#E0806B', '#6DB56D', '#E09540', '#7B6EBD', '#3DA891',
  '#5595D9', '#C04545', '#6A9E4A', '#4A5BAD',
];

export const DEFAULT_CATEGORIES = [
  { name: 'Travel', color: '#4A8FD4' },
  { name: 'Milestones', color: '#C9A84C' },
  { name: 'Health', color: '#5BA85A' },
  { name: 'Family', color: '#D46E9E' },
];

export const LIMITS = { title: 200, notes: 5000, categoryName: 40 };
export const REMINDER_KINDS = ['once', 'yearly'];

const DT_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function newId() {
  return crypto.randomUUID();
}

/**
 * Validate compose input. Returns an object of field → message; empty when valid.
 * @param {any} input
 * @returns {{ title?: string, date?: string, notes?: string, reminder?: string }}
 */
export function validateEntry(input) {
  /** @type {{ title?: string, date?: string, notes?: string, reminder?: string }} */
  const errors = {};
  const title = String(input?.title ?? '').trim();
  if (!title) errors.title = 'Give this memory a title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!isValidISODate(input?.date)) errors.date = 'Pick a valid date.';
  if (String(input?.notes ?? '').length > LIMITS.notes) errors.notes = `Notes are limited to ${LIMITS.notes} characters.`;
  const r = input?.reminder;
  if (r) {
    if (r.kind === 'once') { if (!DT_LOCAL_RE.test(String(r.at ?? '').slice(0, 16))) errors.reminder = 'Pick a date and time for the reminder.'; }
    else if (r.kind === 'yearly') { if (!TIME_RE.test(String(r.time ?? ''))) errors.reminder = 'Pick a time for the reminder.'; }
    else errors.reminder = 'Unknown reminder type.';
  }
  return errors;
}

/** @param {any} r @returns {Reminder|null} */
export function normalizeReminder(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.kind === 'once') {
    const at = String(r.at ?? '').slice(0, 16);
    return DT_LOCAL_RE.test(at) ? { kind: 'once', at } : null;
  }
  if (r.kind === 'yearly') {
    const time = String(r.time ?? '');
    return { kind: 'yearly', time: TIME_RE.test(time) ? time : '09:00' };
  }
  return null;
}

/** @param {any} input @param {number} [now] @param {string} [id] @returns {Entry} */
export function buildEntry(input, now = Date.now(), id = newId()) {
  return {
    id,
    title: String(input.title ?? '').trim().slice(0, LIMITS.title),
    date: input.date,
    notes: String(input.notes ?? '').slice(0, LIMITS.notes),
    categoryId: input.categoryId ? String(input.categoryId) : null,
    starred: Boolean(input.starred),
    reminder: normalizeReminder(input.reminder),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Fields to update on an existing entry from compose input. @param {any} input @param {number} [now] */
export function entryPatch(input, now = Date.now()) {
  const e = buildEntry(input, now, 'patch');
  return { title: e.title, date: e.date, notes: e.notes, categoryId: e.categoryId, starred: e.starred, reminder: e.reminder, updatedAt: now };
}

/** Coerce a Firestore document into an Entry with safe defaults. @param {string} id @param {any} raw @returns {Entry} */
export function normalizeEntry(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id,
    title: typeof r.title === 'string' && r.title.trim() ? r.title : 'Untitled',
    date: isValidISODate(r.date) ? r.date : todayISO(),
    notes: typeof r.notes === 'string' ? r.notes : '',
    categoryId: typeof r.categoryId === 'string' && r.categoryId ? r.categoryId : null,
    starred: r.starred === true,
    reminder: normalizeReminder(r.reminder),
    deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

/** @param {string} id @param {any} raw @returns {Category} */
export function normalizeCategory(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Untitled',
    color: HEX_RE.test(String(r.color ?? '')) ? r.color : PALETTE[0],
    order: typeof r.order === 'number' ? r.order : 0,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
  };
}

/** Strip the in-memory `id` before writing (the id is the document key). @param {any} obj */
export function toDoc(obj) {
  const { id, ...rest } = obj;
  return rest;
}

/** @param {{ name: string, color: string, order?: number }} input @param {number} [now] @param {string} [id] @returns {Category} */
export function buildCategory({ name, color, order }, now = Date.now(), id = newId()) {
  return { id, name: String(name).trim().slice(0, LIMITS.categoryName), color, order: order ?? 0, createdAt: now };
}

/** Least-used palette colour among existing categories; first on ties. @param {{color: string}[]} categories */
export function nextPaletteColor(categories) {
  const used = new Map();
  for (const c of categories) { const k = c.color.toUpperCase(); used.set(k, (used.get(k) || 0) + 1); }
  let best = PALETTE[0], bestN = Infinity;
  for (const col of PALETTE) { const n = used.get(col.toUpperCase()) || 0; if (n < bestN) { best = col; bestN = n; } }
  return best;
}

/** null when OK, otherwise a message. @param {unknown} name @param {{id: string, name: string}[]} categories @param {string|null} [exceptId] */
export function validateCategoryName(name, categories, exceptId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Give the category a name.';
  if (n.length > LIMITS.categoryName) return `Keep it under ${LIMITS.categoryName} characters.`;
  if (categories.some(c => c.id !== exceptId && c.name.toLowerCase() === n.toLowerCase())) return 'You already have a category with that name.';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/model.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/model.js tests/model.test.js
git commit -m "$(cat <<'EOF'
feat: add entry/category model, validation and palette

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: `src/reminders.js` — next occurrence, due detection, scheduler, ICS

Implements spec §9 (in-app scheduler that fires once per occurrence, Add-to-calendar `.ics`) and §4.6 schedule labels.

**Files:**
- Create: `src/reminders.js`
- Test: `tests/reminders.test.js`

**Interfaces:**
- Consumes: `parseDateTimeLocal`, `parseISODate`, `anniversaryOn`, `nextAnniversary`, `toISODate`, `formatShort`, `parseTime`, `pad2` from `src/dates.js`.
- Produces:
  - `nextFireTime(entry, now?): Date|null` — once: its `at` (even if past); yearly: next anniversary strictly after now
  - `reminderState(entry, now?): { next: Date, isPast: boolean } | null`
  - `dueOccurrence(entry, now?): Date|null` — the occurrence that is due *today* and already reached
  - `occurrenceKey(entryId, occurrence: Date): string` — `fired:<id>:<ms>`
  - `findDue(entries, now, hasFired: (key)=>boolean): { entry, occurrence, key }[]`
  - `scheduleLabel(entry, locale?): string` — `'Every year · 09:00'` or `'Sep 18, 2026 · 09:00'`
  - `toICS(entry, category?, now?): string`
  - `startScheduler({ getEntries, hasFired, markFired, notify, now?, intervalMs? }): () => void`

- [ ] **Step 1: Write the failing tests**

`tests/reminders.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import {
  nextFireTime, reminderState, dueOccurrence, occurrenceKey, findDue,
  scheduleLabel, toICS, startScheduler,
} from '../src/reminders.js';
import { toISODate } from '../src/dates.js';

const base = { id: 'e1', title: 'Car insurance', date: '2019-09-18', notes: 'Renew online', categoryId: null, starred: false, deletedAt: null, createdAt: 0, updatedAt: 0 };
const once = { ...base, reminder: { kind: 'once', at: '2026-09-25T09:00' } };
const yearly = { ...base, reminder: { kind: 'yearly', time: '09:00' } };
const none = { ...base, reminder: null };

describe('nextFireTime / reminderState', () => {
  const now = new Date(2026, 8, 22, 12, 0);
  it('once returns its time even when past', () => {
    expect(nextFireTime(once, now).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    const past = { ...base, reminder: { kind: 'once', at: '2026-09-01T09:00' } };
    expect(reminderState(past, now)).toEqual({ next: new Date(2026, 8, 1, 9, 0), isPast: true });
    expect(reminderState(once, now).isPast).toBe(false);
  });
  it('yearly returns the next anniversary', () => {
    expect(toISODate(nextFireTime(yearly, now))).toBe('2027-09-18');
    expect(toISODate(nextFireTime(yearly, new Date(2026, 8, 10)))).toBe('2026-09-18');
  });
  it('null without a reminder', () => {
    expect(nextFireTime(none, now)).toBeNull();
    expect(reminderState(none, now)).toBeNull();
  });
});

describe('dueOccurrence', () => {
  it('is null before the time and after the day', () => {
    expect(dueOccurrence(once, new Date(2026, 8, 25, 8, 59))).toBeNull();
    expect(dueOccurrence(once, new Date(2026, 8, 26, 9, 0))).toBeNull();
  });
  it('is the occurrence any time later that day', () => {
    expect(dueOccurrence(once, new Date(2026, 8, 25, 9, 0)).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    expect(dueOccurrence(once, new Date(2026, 8, 25, 23, 30)).getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime());
  });
  it('works for anniversaries', () => {
    expect(dueOccurrence(yearly, new Date(2026, 8, 18, 14, 0)).getTime()).toBe(new Date(2026, 8, 18, 9, 0).getTime());
    expect(dueOccurrence(yearly, new Date(2026, 8, 19, 14, 0))).toBeNull();
  });
});

describe('findDue + keys', () => {
  it('skips fired, trashed and reminder-less entries', () => {
    const now = new Date(2026, 8, 25, 10, 0);
    const trashed = { ...once, id: 'e2', deletedAt: 1 };
    const fired = new Set([occurrenceKey('e1', new Date(2026, 8, 25, 9, 0))]);
    expect(findDue([once, trashed, none], now, k => fired.has(k))).toEqual([]);
    const due = findDue([once, trashed, none], now, () => false);
    expect(due).toHaveLength(1);
    expect(due[0].entry.id).toBe('e1');
    expect(due[0].key).toBe(`fired:e1:${new Date(2026, 8, 25, 9, 0).getTime()}`);
  });
});

describe('scheduleLabel', () => {
  it('formats both kinds', () => {
    expect(scheduleLabel(yearly)).toBe('Every year · 09:00');
    expect(scheduleLabel(once, 'en-US')).toBe('Sep 25, 2026 · 09:00');
    expect(scheduleLabel(none)).toBe('');
  });
});

describe('toICS', () => {
  const now = new Date(Date.UTC(2026, 8, 22, 10, 0, 0));
  it('emits a yearly VEVENT with RRULE and alarm', () => {
    const ics = toICS(yearly, { name: 'Finance' }, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20190918T090000');
    expect(ics).toContain('RRULE:FREQ=YEARLY');
    expect(ics).toContain('SUMMARY:Car insurance');
    expect(ics).toContain('DESCRIPTION:Renew online\\nCategory: Finance');
    expect(ics).toContain('DTSTAMP:20260922T100000Z');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('emits a once VEVENT without RRULE and escapes text', () => {
    const e = { ...once, title: 'Semi; colon, comma', notes: '' };
    const ics = toICS(e, null, now);
    expect(ics).toContain('DTSTART:20260925T090000');
    expect(ics).not.toContain('RRULE');
    expect(ics).toContain('SUMMARY:Semi\\; colon\\, comma');
    // No event DESCRIPTION without notes/category (the VALARM keeps its required one).
    expect(ics.split('BEGIN:VALARM')[0]).not.toContain('DESCRIPTION:');
  });
  it('folds long lines at 72 chars', () => {
    const e = { ...once, notes: 'x'.repeat(200) };
    const lines = toICS(e, null, now).split('\r\n');
    expect(lines.every(l => l.length <= 73)).toBe(true);
    expect(lines.some(l => l.startsWith(' '))).toBe(true);
  });
  it('returns empty string without a reminder', () => { expect(toICS(none)).toBe(''); });
});

describe('startScheduler', () => {
  it('fires each due occurrence once and polls', () => {
    vi.useFakeTimers();
    const fired = new Set();
    const notify = vi.fn();
    let now = new Date(2026, 8, 25, 9, 0);
    const stop = startScheduler({ getEntries: () => [once], hasFired: k => fired.has(k), markFired: k => fired.add(k), notify, now: () => now, intervalMs: 1000 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].id).toBe('e1');
    vi.advanceTimersByTime(3000);
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/reminders.test.js`
Expected: FAIL — cannot resolve `../src/reminders.js`.

- [ ] **Step 3: Implement `src/reminders.js`**

```js
// @ts-check
import {
  parseDateTimeLocal, parseISODate, anniversaryOn, nextAnniversary,
  toISODate, formatShort, parseTime, pad2,
} from './dates.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */

/**
 * When the reminder fires next. For `once` this is its own time, even if it
 * has passed (the Reminders screen lists those under "Past").
 * @param {Entry} entry @param {Date} [now]
 */
export function nextFireTime(entry, now = new Date()) {
  const r = entry.reminder;
  if (!r) return null;
  if (r.kind === 'once') return parseDateTimeLocal(r.at);
  if (r.kind === 'yearly') return nextAnniversary(entry.date, r.time, now);
  return null;
}

/** @param {Entry} entry @param {Date} [now] @returns {{ next: Date, isPast: boolean } | null} */
export function reminderState(entry, now = new Date()) {
  const next = nextFireTime(entry, now);
  if (!next) return null;
  return { next, isPast: next.getTime() <= now.getTime() };
}

/**
 * The occurrence that is due today and has already been reached, or null.
 * Opening the app any time later the same day still counts.
 * @param {Entry} entry @param {Date} [now]
 */
export function dueOccurrence(entry, now = new Date()) {
  const r = entry.reminder;
  if (!r) return null;
  let occ = null;
  if (r.kind === 'once') occ = parseDateTimeLocal(r.at);
  else if (r.kind === 'yearly') occ = anniversaryOn(entry.date, now.getFullYear(), r.time);
  if (!occ) return null;
  if (occ.getTime() > now.getTime()) return null;
  return toISODate(occ) === toISODate(now) ? occ : null;
}

/** localStorage key that marks an occurrence as fired. @param {string} entryId @param {Date} occurrence */
export function occurrenceKey(entryId, occurrence) {
  return `fired:${entryId}:${occurrence.getTime()}`;
}

/**
 * Entries whose reminder is due now and has not been fired yet.
 * @param {Entry[]} entries @param {Date} now @param {(key: string) => boolean} hasFired
 */
export function findDue(entries, now, hasFired) {
  const out = [];
  for (const entry of entries) {
    if (entry.deletedAt != null) continue;
    const occurrence = dueOccurrence(entry, now);
    if (!occurrence) continue;
    const key = occurrenceKey(entry.id, occurrence);
    if (!hasFired(key)) out.push({ entry, occurrence, key });
  }
  return out;
}

/** 'Every year · 09:00' or 'Sep 25, 2026 · 09:00'. @param {Entry} entry @param {string} [locale] */
export function scheduleLabel(entry, locale = undefined) {
  const r = entry.reminder;
  if (!r) return '';
  if (r.kind === 'yearly') return `Every year · ${r.time}`;
  const d = parseDateTimeLocal(r.at);
  if (!d) return 'Once';
  return `${formatShort(toISODate(d), locale)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Poll for due reminders. Calls notify(entry) once per occurrence.
 * @param {{ getEntries: () => Entry[], hasFired: (k: string) => boolean, markFired: (k: string) => void,
 *           notify: (e: Entry) => void, now?: () => Date, intervalMs?: number }} opts
 * @returns {() => void} stop
 */
export function startScheduler({ getEntries, hasFired, markFired, notify, now = () => new Date(), intervalMs = 60000 }) {
  const tick = () => {
    for (const { entry, key } of findDue(getEntries(), now(), hasFired)) {
      markFired(key);
      notify(entry);
    }
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

/* ---------- iCalendar ---------- */

/** @param {string} s */
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** RFC 5545 line folding at 72 octets (ASCII-safe approximation). @param {string} line */
function icsFold(line) {
  const out = [];
  let s = line;
  while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); }
  out.push(s);
  return out.join('\r\n');
}
/** @param {Date} d */
function icsLocal(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}
/** @param {Date} d */
function icsUTC(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build an .ics file for the entry's reminder. Yearly reminders carry
 * RRULE:FREQ=YEARLY. Times are floating local times.
 * @param {Entry} entry @param {Category|null} [category] @param {Date} [now]
 */
export function toICS(entry, category = null, now = new Date()) {
  const r = entry.reminder;
  if (!r) return '';
  let start = null;
  if (r.kind === 'once') start = parseDateTimeLocal(r.at);
  else {
    const { h, m } = parseTime(r.time);
    const d = parseISODate(entry.date);
    start = d && new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  }
  if (!start) return '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DateTracker//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${entry.id}@datetracker`,
    `DTSTAMP:${icsUTC(now)}`,
    `DTSTART:${icsLocal(start)}`,
    `SUMMARY:${icsEscape(entry.title)}`,
  ];
  const desc = [entry.notes, category ? `Category: ${category.name}` : ''].filter(Boolean).join('\n');
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (r.kind === 'yearly') lines.push('RRULE:FREQ=YEARLY');
  lines.push('BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(entry.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/reminders.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/reminders.js tests/reminders.test.js
git commit -m "$(cat <<'EOF'
feat: add reminder occurrence logic, scheduler and ICS export

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `src/selectors.js` — derived views of the store

Implements spec §4.3 (filtering, month grouping, On This Day, Upcoming), §4.6 (reminder sections), §4.7 (category counts).

**Files:**
- Create: `src/selectors.js`
- Test: `tests/selectors.test.js`

**Interfaces:**
- Consumes: `monthKey`, `formatMonthYear`, `yearOf`, `sameMonthDay` from `src/dates.js`; `nextFireTime`, `dueOccurrence`, `reminderState` from `src/reminders.js`.
- Produces:
  - `activeEntries(entries): Entry[]` (not trashed), `trashedEntries(entries): Entry[]` (newest deletion first)
  - `sortNewestFirst(entries): Entry[]` — by `date` desc, then `createdAt` desc
  - `indexById(list): Map<string, T>`
  - `filterEntries(entries, { categoryId='all', starredOnly=false, query='', categoriesById=new Map() }): Entry[]`
  - `groupByMonth(entries, locale?): { key: 'YYYY-MM', label: string, entries: Entry[] }[]`
  - `onThisDay(entries, todayISO): { entry, year, yearsAgo }[]` (most recent year first)
  - `upcomingReminders(entries, now, withinDays=14): { entry, next }[]` — includes reminders due today
  - `reminderSections(entries, now): { upcoming: {entry,next}[], past: {entry,next}[] }`
  - `categoryCounts(entries): Map<string, number>` — key `''` for uncategorised
  - `shouldShowBackupNudge(meta, activeCount, now): boolean` — spec §3: once every 30 days without a backup; needs ≥ 1 entry; the reference time is the latest of `lastBackupAt`, `backupNudgeDismissedAt`, `createdAt`
  - `BACKUP_NUDGE_DAYS = 30`

- [ ] **Step 1: Write the failing tests**

`tests/selectors.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  activeEntries, trashedEntries, sortNewestFirst, indexById, filterEntries,
  groupByMonth, onThisDay, upcomingReminders, reminderSections, categoryCounts,
  shouldShowBackupNudge,
} from '../src/selectors.js';

const mk = (id, date, extra = {}) => ({ id, title: `T${id}`, date, notes: '', categoryId: null, starred: false, reminder: null, deletedAt: null, createdAt: 0, updatedAt: 0, ...extra });
const cats = new Map([['c1', { id: 'c1', name: 'Travel' }]]);

describe('active/trash/sort/index', () => {
  it('splits and sorts', () => {
    const a = mk('a', '2026-09-18'), b = mk('b', '2026-09-20', { deletedAt: 5 }), c = mk('c', '2026-09-20', { createdAt: 9 }), d = mk('d', '2026-09-20', { createdAt: 1, deletedAt: 9 });
    expect(activeEntries([a, b, c]).map(e => e.id)).toEqual(['a', 'c']);
    expect(trashedEntries([a, b, d]).map(e => e.id)).toEqual(['d', 'b']);
    expect(sortNewestFirst([a, c, mk('e', '2026-09-20', { createdAt: 3 })]).map(e => e.id)).toEqual(['c', 'e', 'a']);
    expect(indexById([a, c]).get('c')).toBe(c);
  });
});

describe('filterEntries', () => {
  const list = [
    mk('a', '2026-09-18', { title: 'Trip to Jaipur', categoryId: 'c1' }),
    mk('b', '2026-09-19', { title: 'Dentist', notes: 'root canal', starred: true }),
    mk('c', '2026-09-20', { title: 'Bought iPhone', categoryId: 'c1', starred: true }),
  ];
  it('by category', () => { expect(filterEntries(list, { categoryId: 'c1' }).map(e => e.id)).toEqual(['a', 'c']); });
  it('by star', () => { expect(filterEntries(list, { starredOnly: true }).map(e => e.id)).toEqual(['b', 'c']); });
  it('combines', () => { expect(filterEntries(list, { categoryId: 'c1', starredOnly: true }).map(e => e.id)).toEqual(['c']); });
  it('searches title, notes and category name, case-insensitively', () => {
    expect(filterEntries(list, { query: 'CANAL' }).map(e => e.id)).toEqual(['b']);
    expect(filterEntries(list, { query: 'travel', categoriesById: cats }).map(e => e.id)).toEqual(['a', 'c']);
    expect(filterEntries(list, { query: '  ' })).toHaveLength(3);
  });
});

describe('groupByMonth', () => {
  it('groups newest first with labels', () => {
    const g = groupByMonth([mk('a', '2026-08-02'), mk('b', '2026-09-18'), mk('c', '2026-09-01')], 'en-US');
    expect(g.map(x => x.key)).toEqual(['2026-09', '2026-08']);
    expect(g[0].label).toBe('September 2026');
    expect(g[0].entries.map(e => e.id)).toEqual(['b', 'c']);
  });
  it('is empty for no entries', () => { expect(groupByMonth([])).toEqual([]); });
});

describe('onThisDay', () => {
  it('finds same month/day in earlier years, most recent first', () => {
    const list = [mk('a', '2023-09-22'), mk('b', '2019-09-22'), mk('c', '2026-09-22'), mk('d', '2024-09-23')];
    const r = onThisDay(list, '2026-09-22');
    expect(r.map(x => x.entry.id)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ year: 2023, yearsAgo: 3 });
  });
});

describe('upcomingReminders / reminderSections', () => {
  const now = new Date(2026, 8, 22, 12, 0);
  const soon = mk('s', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-25T09:00' } });
  const today = mk('t', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-22T08:00' } });
  const far = mk('f', '2020-01-01', { reminder: { kind: 'once', at: '2026-12-25T09:00' } });
  const past = mk('p', '2020-01-01', { reminder: { kind: 'once', at: '2026-09-01T09:00' } });
  const yearly = mk('y', '2019-09-30', { reminder: { kind: 'yearly', time: '09:00' } });
  it('upcoming within 14 days includes today, sorted', () => {
    expect(upcomingReminders([far, soon, today, past, yearly], now).map(x => x.entry.id)).toEqual(['t', 's', 'y']);
    expect(upcomingReminders([far], now, 120).map(x => x.entry.id)).toEqual(['f']);
  });
  it('sections split past from upcoming', () => {
    const s = reminderSections([far, soon, today, past, yearly], now);
    expect(s.upcoming.map(x => x.entry.id)).toEqual(['t', 's', 'y', 'f']);
    expect(s.past.map(x => x.entry.id)).toEqual(['p']);
  });
});

describe('categoryCounts', () => {
  it('counts including uncategorised', () => {
    const m = categoryCounts([mk('a', '2026-01-01', { categoryId: 'c1' }), mk('b', '2026-01-01'), mk('c', '2026-01-01', { categoryId: 'c1' })]);
    expect(m.get('c1')).toBe(2); expect(m.get('')).toBe(1);
  });
});

describe('shouldShowBackupNudge', () => {
  const DAY = 86400000;
  const now = 100 * DAY;
  it('needs a meta doc and at least one entry', () => {
    expect(shouldShowBackupNudge(null, 5, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: null, backupNudgeDismissedAt: null }, 0, now)).toBe(false);
  });
  it('shows 30 days after the latest of created / backup / dismissed', () => {
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: null, backupNudgeDismissedAt: null }, 1, now)).toBe(true);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: now - 29 * DAY, backupNudgeDismissedAt: null }, 1, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: 0, lastBackupAt: now - 40 * DAY, backupNudgeDismissedAt: now - DAY }, 1, now)).toBe(false);
    expect(shouldShowBackupNudge({ createdAt: now - 10 * DAY, lastBackupAt: null, backupNudgeDismissedAt: null }, 1, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/selectors.test.js`
Expected: FAIL — cannot resolve `../src/selectors.js`.

- [ ] **Step 3: Implement `src/selectors.js`**

```js
// @ts-check
import { monthKey, formatMonthYear, yearOf, sameMonthDay } from './dates.js';
import { nextFireTime, dueOccurrence, reminderState } from './reminders.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */

/** @param {Entry[]} entries */
export function activeEntries(entries) {
  return entries.filter(e => e.deletedAt == null);
}

/** Newest deletion first. @param {Entry[]} entries */
export function trashedEntries(entries) {
  return entries.filter(e => e.deletedAt != null).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}

/** Date desc, then createdAt desc. @param {Entry[]} entries */
export function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

/** @template {{id: string}} T @param {T[]} list @returns {Map<string, T>} */
export function indexById(list) {
  return new Map(list.map(x => [x.id, x]));
}

/**
 * @param {Entry[]} entries
 * @param {{ categoryId?: string, starredOnly?: boolean, query?: string, categoriesById?: Map<string, Category> }} [opts]
 */
export function filterEntries(entries, { categoryId = 'all', starredOnly = false, query = '', categoriesById = new Map() } = {}) {
  const q = query.trim().toLowerCase();
  return entries.filter(e => {
    if (categoryId !== 'all' && e.categoryId !== categoryId) return false;
    if (starredOnly && !e.starred) return false;
    if (q) {
      const cat = e.categoryId ? categoriesById.get(e.categoryId) : null;
      const hay = `${e.title}\n${e.notes}\n${cat ? cat.name : ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** @param {Entry[]} entries @param {string} [locale] */
export function groupByMonth(entries, locale = undefined) {
  /** @type {{ key: string, label: string, entries: Entry[] }[]} */
  const groups = [];
  let cur = null;
  for (const e of sortNewestFirst(entries)) {
    const key = monthKey(e.date);
    if (!cur || cur.key !== key) { cur = { key, label: formatMonthYear(e.date, locale), entries: [] }; groups.push(cur); }
    cur.entries.push(e);
  }
  return groups;
}

/** Entries from earlier years sharing today's month/day, most recent year first. @param {Entry[]} entries @param {string} todayISO */
export function onThisDay(entries, todayISO) {
  const ty = yearOf(todayISO);
  return entries
    .filter(e => sameMonthDay(e.date, todayISO) && yearOf(e.date) < ty)
    .map(e => ({ entry: e, year: yearOf(e.date), yearsAgo: ty - yearOf(e.date) }))
    .sort((a, b) => b.year - a.year);
}

/** Reminders firing within `withinDays` (including ones already due today), soonest first. @param {Entry[]} entries @param {Date} now @param {number} [withinDays] */
export function upcomingReminders(entries, now, withinDays = 14) {
  const limit = now.getTime() + withinDays * 86400000;
  return entries
    .map(e => ({ entry: e, next: dueOccurrence(e, now) || nextFireTime(e, now) }))
    .filter(x => x.next && x.next.getTime() <= limit && (x.next.getTime() >= now.getTime() || dueOccurrence(x.entry, now)))
    .sort((a, b) => /** @type {Date} */ (a.next).getTime() - /** @type {Date} */ (b.next).getTime());
}

/** @param {Entry[]} entries @param {Date} now */
export function reminderSections(entries, now) {
  /** @type {{entry: Entry, next: Date}[]} */ const upcoming = [];
  /** @type {{entry: Entry, next: Date}[]} */ const past = [];
  for (const e of entries) {
    const due = dueOccurrence(e, now);
    if (due) { upcoming.push({ entry: e, next: due }); continue; }
    const s = reminderState(e, now);
    if (!s) continue;
    (s.isPast ? past : upcoming).push({ entry: e, next: s.next });
  }
  upcoming.sort((a, b) => a.next.getTime() - b.next.getTime());
  past.sort((a, b) => b.next.getTime() - a.next.getTime());
  return { upcoming, past };
}

/** @param {Entry[]} entries @returns {Map<string, number>} */
export function categoryCounts(entries) {
  const m = new Map();
  for (const e of entries) { const k = e.categoryId || ''; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

export const BACKUP_NUDGE_DAYS = 30;

/**
 * Spec §3: a one-line nudge once every 30 days without a backup.
 * @param {{ createdAt?: number, lastBackupAt?: number|null, backupNudgeDismissedAt?: number|null } | null} meta
 * @param {number} activeCount @param {number} now ms epoch
 */
export function shouldShowBackupNudge(meta, activeCount, now) {
  if (!meta || activeCount < 1) return false;
  const since = Math.max(meta.createdAt || 0, meta.lastBackupAt || 0, meta.backupNudgeDismissedAt || 0);
  return now - since >= BACKUP_NUDGE_DAYS * 86400000;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/selectors.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/selectors.js tests/selectors.test.js
git commit -m "$(cat <<'EOF'
feat: add store selectors for timeline, on-this-day and reminders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: `src/io/csv.js` — CSV parse and serialise

Implements spec §10 (RFC 4180 quoting, BOM, tab autodetect, embedded newlines).

**Files:**
- Create: `src/io/csv.js`
- Test: `tests/csv.test.js`

**Interfaces:**
- Produces:
  - `parseCSV(text): { headers: string[], rows: string[][] }` — first non-empty row is headers; cells trimmed; blank rows dropped
  - `toCSV(rows: (string|number|null|undefined)[][]): string` — UTF-8 BOM + CRLF, quotes only when needed

- [ ] **Step 1: Write the failing tests**

`tests/csv.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/csv.test.js`
Expected: FAIL — cannot resolve `../src/io/csv.js`.

- [ ] **Step 3: Implement `src/io/csv.js`**

```js
// @ts-check
/**
 * Minimal, forgiving CSV/TSV parser and RFC 4180 serialiser.
 */

/**
 * Parse CSV or TSV text. Handles a UTF-8 BOM, CRLF, quoted fields with
 * embedded delimiters, doubled quotes and newlines. The delimiter is a tab
 * when the first line has more tabs than commas. Cells are trimmed; rows
 * with no content are dropped; the first remaining row is the header.
 * @param {string|null|undefined} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  if (!s.trim()) return { headers: [], rows: [] };
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';

  /** @type {string[][]} */ const rows = [];
  /** @type {string[]} */ let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const [headers, ...data] = nonEmpty;
  return { headers, rows: data };
}

/**
 * Serialise rows with CRLF line endings and a UTF-8 BOM (so Excel opens it
 * correctly). Cells are quoted only when they contain a quote, comma or newline.
 * @param {(string|number|null|undefined)[][]} rows
 */
export function toCSV(rows) {
  const cell = (v) => {
    const str = v == null ? '' : String(v);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/csv.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/io/csv.js tests/csv.test.js
git commit -m "$(cat <<'EOF'
feat: add CSV parser and serialiser

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `src/io/import.js` — column mapping, date normalising, JSON export parsing, merge planning

Implements spec §10 (Import JSON always merges; CSV column mapping; DD/MM ↔ MM/DD switch, day-first default; categories created by name).

**Files:**
- Create: `src/io/import.js`
- Test: `tests/import.test.js`

**Interfaces:**
- Consumes: `isValidISODate`, `fromParts`, `todayISO` from `src/dates.js`; `buildEntry`, `buildCategory`, `nextPaletteColor`, `normalizeEntry`, `normalizeCategory`, `newId` from `src/model.js`.
- Produces:
  - `CSV_FIELDS: { id: 'title'|'date'|'notes'|'category'|'skip', label: string }[]`
  - `guessMapping(headers: string[]): Record<number, string>` — column index → field id
  - `normaliseDate(str, { dayFirst = true }): string` — ISO or `''`
  - `csvRowsToEntries(rows, mapping, { dayFirst=true, categories=[], now=Date.now() }): { entries: Entry[], newCategories: Category[], skipped: number }`
  - `parseJSONExport(text): { entries: Entry[], categories: Category[] }` — throws `Error` with a user-facing message
  - `planMerge(existingEntries, existingCategories, incoming): { entriesToAdd, categoriesToAdd, skippedEntries, skippedCategories }`

- [ ] **Step 1: Write the failing tests**

`tests/import.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { CSV_FIELDS, guessMapping, normaliseDate, csvRowsToEntries, parseJSONExport, planMerge } from '../src/io/import.js';
import { PALETTE } from '../src/model.js';

describe('guessMapping', () => {
  it('maps common headers and skips the rest, one column per field', () => {
    expect(guessMapping(['Event', 'When', 'Notes', 'Tag', 'Cost'])).toEqual({ 0: 'title', 1: 'date', 2: 'notes', 3: 'category', 4: 'skip' });
    expect(guessMapping(['Title', 'Name'])).toEqual({ 0: 'title', 1: 'skip' });
    expect(CSV_FIELDS.map(f => f.id)).toEqual(['title', 'date', 'notes', 'category', 'skip']);
  });
});

describe('normaliseDate', () => {
  it('accepts ISO and ISO with time', () => {
    expect(normaliseDate('2026-09-18')).toBe('2026-09-18');
    expect(normaliseDate('2026/9/8')).toBe('2026-09-08');
    expect(normaliseDate('2026-09-18T10:00:00Z')).toBe('2026-09-18');
  });
  it('accepts month names either side', () => {
    expect(normaliseDate('18 Sep 2026')).toBe('2026-09-18');
    expect(normaliseDate('18-September-2026')).toBe('2026-09-18');
    expect(normaliseDate('Sept 18, 2026')).toBe('2026-09-18');
    expect(normaliseDate('March 3rd 2024')).toBe('2024-03-03');
  });
  it('resolves numeric dates with dayFirst, but never invents an impossible one', () => {
    expect(normaliseDate('03/04/2026')).toBe('2026-04-03');
    expect(normaliseDate('03/04/2026', { dayFirst: false })).toBe('2026-03-04');
    expect(normaliseDate('25/04/2026', { dayFirst: false })).toBe('2026-04-25');
    expect(normaliseDate('04/25/2026')).toBe('2026-04-25');
    expect(normaliseDate('18.09.26')).toBe('2026-09-18');
  });
  it('returns empty for junk or impossible dates', () => {
    expect(normaliseDate('')).toBe('');
    expect(normaliseDate('yesterday')).toBe('');
    expect(normaliseDate('31/02/2026')).toBe('');
    expect(normaliseDate(null)).toBe('');
  });
});

describe('csvRowsToEntries', () => {
  const mapping = { 0: 'title', 1: 'date', 2: 'notes', 3: 'category' };
  const rows = [
    ['Trip', '18/09/2026', 'fun', 'Travel'],
    ['', '', '', ''],
    ['Dentist', '2026-09-20', '', 'health'],
    ['No date', '', 'n', ''],
    ['', '2026-01-01', 'date only', 'Travel'],
  ];
  it('builds entries, creates categories once by name (case-insensitive), skips empty rows', () => {
    const existing = [{ id: 'c1', name: 'Health', color: PALETTE[3], order: 0, createdAt: 0 }];
    const r = csvRowsToEntries(rows, mapping, { categories: existing, now: 1000 });
    expect(r.skipped).toBe(1);
    expect(r.entries).toHaveLength(4);
    expect(r.entries[0]).toMatchObject({ title: 'Trip', date: '2026-09-18', notes: 'fun' });
    expect(r.entries[1]).toMatchObject({ title: 'Dentist', categoryId: 'c1' });
    expect(r.entries[2].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.entries[3].title).toBe('Memory from 2026-01-01');
    expect(r.newCategories).toHaveLength(1);
    expect(r.newCategories[0].name).toBe('Travel');
    expect(r.entries[0].categoryId).toBe(r.newCategories[0].id);
    expect(r.entries[3].categoryId).toBe(r.newCategories[0].id);
    expect(r.entries.map(e => e.createdAt)).toEqual([1000, 1002, 1003, 1004]);
  });
  it('honours dayFirst=false', () => {
    const r = csvRowsToEntries([['x', '03/04/2026', '', '']], mapping, { dayFirst: false });
    expect(r.entries[0].date).toBe('2026-03-04');
  });
});

describe('parseJSONExport', () => {
  it('accepts a version-2 export and normalises', () => {
    const text = JSON.stringify({ version: 2, categories: [{ id: 'c', name: 'X', color: '#123456' }], entries: [{ id: 'e', title: 'T', date: '2026-01-01', deletedAt: 5 }] });
    const r = parseJSONExport(text);
    expect(r.categories[0]).toMatchObject({ id: 'c', name: 'X', color: '#123456' });
    expect(r.entries[0]).toMatchObject({ id: 'e', title: 'T', deletedAt: 5, starred: false });
  });
  it('rejects non-JSON and non-exports with friendly messages', () => {
    expect(() => parseJSONExport('{')).toThrow('That file is not valid JSON.');
    expect(() => parseJSONExport('{"entries":[]}')).toThrow('That file is not a DateTracker export.');
    expect(() => parseJSONExport('{"version":1,"entries":[],"categories":[]}')).toThrow('That file is not a DateTracker export.');
  });
});

describe('planMerge', () => {
  it('skips ids that already exist', () => {
    const existingE = [{ id: 'e1' }], existingC = [{ id: 'c1' }];
    const incoming = { entries: [{ id: 'e1' }, { id: 'e2' }], categories: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] };
    const p = planMerge(existingE, existingC, incoming);
    expect(p.entriesToAdd.map(e => e.id)).toEqual(['e2']);
    expect(p.categoriesToAdd.map(c => c.id)).toEqual(['c2', 'c3']);
    expect(p.skippedEntries).toBe(1); expect(p.skippedCategories).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/import.test.js`
Expected: FAIL — cannot resolve `../src/io/import.js`.

- [ ] **Step 3: Implement `src/io/import.js`**

```js
// @ts-check
import { isValidISODate, fromParts, todayISO } from '../dates.js';
import { buildEntry, buildCategory, nextPaletteColor, normalizeEntry, normalizeCategory, newId } from '../model.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

export const CSV_FIELDS = [
  { id: 'title', label: 'Title' },
  { id: 'date', label: 'Date' },
  { id: 'notes', label: 'Notes' },
  { id: 'category', label: 'Category' },
  { id: 'skip', label: '— Skip —' },
];

const HINTS = {
  title: ['title', 'event', 'name', 'what', 'subject', 'memory'],
  date: ['date', 'when', 'day', 'timestamp', 'on'],
  notes: ['notes', 'note', 'comment', 'comments', 'details', 'description', 'body', 'text'],
  category: ['category', 'cat', 'tag', 'tags', 'label', 'type', 'group'],
};

/** Guess a column → field mapping from header names. Each field is used at most once. @param {string[]} headers */
export function guessMapping(headers) {
  /** @type {Record<number, string>} */ const map = {};
  const taken = new Set();
  headers.forEach((h, i) => {
    const key = String(h).toLowerCase().replace(/[^a-z]/g, '');
    let field = 'skip';
    for (const [f, words] of Object.entries(HINTS)) {
      if (!taken.has(f) && words.includes(key)) { field = f; taken.add(f); break; }
    }
    map[i] = field;
  });
  return map;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** @param {string} word */
function monthFromWord(word) {
  const w = word.toLowerCase();
  return MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)] ?? 0;
}
/** @param {number} y @param {number} m @param {number} d */
function checked(y, m, d) {
  const iso = fromParts(y, m, d);
  return isValidISODate(iso) ? iso : '';
}

/**
 * Normalise many date spellings to 'YYYY-MM-DD'. Numeric day/month order is
 * ambiguous ("03/04/2026"); `dayFirst` decides, unless one part can only be a day.
 * @param {unknown} str @param {{ dayFirst?: boolean }} [opts]
 */
export function normaliseDate(str, { dayFirst = true } = {}) {
  const s = String(str ?? '').trim();
  if (!s) return '';
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return checked(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([a-zA-Z]{3,})[-/.\s,]+(\d{4})$/.exec(s))) { const mo = monthFromWord(m[2]); return mo ? checked(+m[3], mo, +m[1]) : ''; }
  if ((m = /^([a-zA-Z]{3,})[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?[-/.\s,]+(\d{4})$/.exec(s))) { const mo = monthFromWord(m[1]); return mo ? checked(+m[3], mo, +m[2]) : ''; }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) return checked(y, b, a);
    if (b > 12 && a <= 12) return checked(y, a, b);
    return dayFirst ? checked(y, b, a) : checked(y, a, b);
  }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(s))) {
    const a = +m[1], b = +m[2], y = 2000 + +m[3];
    return dayFirst ? checked(y, b, a) : checked(y, a, b);
  }
  return '';
}

/**
 * Turn mapped CSV rows into new entries. Categories are matched by name
 * (case-insensitive) against `categories` and created when missing.
 * @param {string[][]} rows
 * @param {Record<number, string>} mapping
 * @param {{ dayFirst?: boolean, categories?: Category[], now?: number }} [opts]
 * @returns {{ entries: Entry[], newCategories: Category[], skipped: number }}
 */
export function csvRowsToEntries(rows, mapping, { dayFirst = true, categories = [], now = Date.now() } = {}) {
  const col = (field) => { const k = Object.keys(mapping).find(k => mapping[Number(k)] === field); return k == null ? -1 : Number(k); };
  const tC = col('title'), dC = col('date'), nC = col('notes'), cC = col('category');
  const cats = [...categories];
  /** @type {Category[]} */ const newCategories = [];
  const byName = new Map(cats.map(c => [c.name.toLowerCase(), c]));
  /** @type {Entry[]} */ const entries = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    const title = tC >= 0 ? String(row[tC] ?? '').trim() : '';
    const date = dC >= 0 ? normaliseDate(row[dC], { dayFirst }) : '';
    const notes = nC >= 0 ? String(row[nC] ?? '') : '';
    const catName = cC >= 0 ? String(row[cC] ?? '').trim() : '';
    if (!title && !date) { skipped++; return; }
    let categoryId = null;
    if (catName) {
      let c = byName.get(catName.toLowerCase());
      if (!c) {
        c = buildCategory({ name: catName, color: nextPaletteColor(cats), order: cats.length }, now);
        cats.push(c); newCategories.push(c); byName.set(catName.toLowerCase(), c);
      }
      categoryId = c.id;
    }
    entries.push(buildEntry({
      title: title || `Memory from ${date}`,
      date: date || todayISO(new Date(now)),
      notes, categoryId, starred: false, reminder: null,
    }, now + i));
  });
  return { entries, newCategories, skipped };
}

/**
 * Parse a DateTracker JSON export (version 2). Throws with a user-facing message otherwise.
 * @param {string} text
 * @returns {{ entries: Entry[], categories: Category[] }}
 */
export function parseJSONExport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!data || data.version !== 2 || !Array.isArray(data.entries) || !Array.isArray(data.categories)) {
    throw new Error('That file is not a DateTracker export.');
  }
  return {
    entries: data.entries.map(e => normalizeEntry(String(e?.id || newId()), e)),
    categories: data.categories.map(c => normalizeCategory(String(c?.id || newId()), c)),
  };
}

/**
 * Decide what an import adds: anything whose id already exists is skipped.
 * @template {{id: string}} E @template {{id: string}} C
 * @param {E[]} existingEntries @param {C[]} existingCategories @param {{ entries: E[], categories: C[] }} incoming
 */
export function planMerge(existingEntries, existingCategories, incoming) {
  const eIds = new Set(existingEntries.map(e => e.id));
  const cIds = new Set(existingCategories.map(c => c.id));
  const entriesToAdd = incoming.entries.filter(e => !eIds.has(e.id));
  const categoriesToAdd = incoming.categories.filter(c => !cIds.has(c.id));
  return {
    entriesToAdd, categoriesToAdd,
    skippedEntries: incoming.entries.length - entriesToAdd.length,
    skippedCategories: incoming.categories.length - categoriesToAdd.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/import.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/io/import.js tests/import.test.js
git commit -m "$(cat <<'EOF'
feat: add CSV/JSON import mapping, date normalising and merge planning

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `src/io/export.js` — JSON/CSV builders and download

Implements spec §10 (Export JSON includes trash; Export CSV columns `date, title, category, notes, starred, reminder`).

**Files:**
- Create: `src/io/export.js`
- Test: `tests/export.test.js`

**Interfaces:**
- Consumes: `toCSV` from `src/io/csv.js`; `toISODate` from `src/dates.js`; `scheduleLabel` from `src/reminders.js`.
- Produces:
  - `buildJSONExport(entries, categories, now?): string`
  - `buildCSVExport(entries, categoriesById: Map): string`
  - `exportFilename(ext, now?): string` — `DateTracker-YYYY-MM-DD.ext`
  - `downloadText(filename, text, mime?)` — browser only, not unit-tested

- [ ] **Step 1: Write the failing tests**

`tests/export.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildJSONExport, buildCSVExport, exportFilename } from '../src/io/export.js';

const e = { id: 'e1', title: 'Trip, to Jaipur', date: '2026-09-18', notes: 'fun\nsun', categoryId: 'c1', starred: true, reminder: { kind: 'yearly', time: '09:00' }, deletedAt: null, createdAt: 1, updatedAt: 1 };
const c = { id: 'c1', name: 'Travel', color: '#4A8FD4', order: 0, createdAt: 0 };

describe('buildJSONExport', () => {
  it('wraps with version 2 and timestamp', () => {
    const j = JSON.parse(buildJSONExport([e], [c], new Date(Date.UTC(2026, 8, 22))));
    expect(j.version).toBe(2);
    expect(j.app).toBe('DateTracker');
    expect(j.exportedAt).toBe('2026-09-22T00:00:00.000Z');
    expect(j.entries[0].id).toBe('e1');
    expect(j.categories[0].name).toBe('Travel');
  });
});

describe('buildCSVExport', () => {
  it('writes the documented columns', () => {
    const csv = buildCSVExport([e, { ...e, id: 'e2', categoryId: null, starred: false, reminder: null }], new Map([['c1', c]]));
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('date,title,category,notes,starred,reminder');
    expect(lines[1]).toBe('2026-09-18,"Trip, to Jaipur",Travel,"fun\nsun",yes,Every year · 09:00');
    expect(lines[2]).toBe('2026-09-18,"Trip, to Jaipur",,"fun\nsun",,');
  });
});

describe('exportFilename', () => {
  it('uses the local date', () => {
    expect(exportFilename('json', new Date(2026, 8, 22, 23, 0))).toBe('DateTracker-2026-09-22.json');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/export.test.js`
Expected: FAIL — cannot resolve `../src/io/export.js`.

- [ ] **Step 3: Implement `src/io/export.js`**

```js
// @ts-check
import { toCSV } from './csv.js';
import { toISODate } from '../dates.js';
import { scheduleLabel } from '../reminders.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

/** Full backup, including trashed entries. @param {Entry[]} entries @param {Category[]} categories @param {Date} [now] */
export function buildJSONExport(entries, categories, now = new Date()) {
  return JSON.stringify({ version: 2, app: 'DateTracker', exportedAt: now.toISOString(), categories, entries }, null, 2);
}

/** Spreadsheet-friendly export. Caller decides which entries (normally active, newest first). @param {Entry[]} entries @param {Map<string, Category>} categoriesById */
export function buildCSVExport(entries, categoriesById) {
  const rows = [['date', 'title', 'category', 'notes', 'starred', 'reminder']];
  for (const e of entries) {
    const cat = e.categoryId ? categoriesById.get(e.categoryId) : null;
    rows.push([e.date, e.title, cat ? cat.name : '', e.notes, e.starred ? 'yes' : '', scheduleLabel(e)]);
  }
  return toCSV(rows);
}

/** @param {string} ext @param {Date} [now] */
export function exportFilename(ext, now = new Date()) {
  return `DateTracker-${toISODate(now)}.${ext}`;
}

/** Trigger a browser download of text content. @param {string} filename @param {string} text @param {string} [mime] */
export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/export.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/io/export.js tests/export.test.js
git commit -m "$(cat <<'EOF'
feat: add JSON/CSV export builders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Browser foundations (still unit-tested)

### Task 9: `src/ui/dom.js` — escaping templates and event delegation

Implements spec §12 Conventions (auto-escaping `html` template, `raw()`, delegation on `data-action`) and §4.4 (links auto-detected, `rel="noopener"`).

**Files:**
- Create: `src/ui/dom.js`
- Test: `tests/dom.test.js`

**Interfaces:**
- Produces:
  - `class Raw { value: string }` — trusted markup wrapper
  - `escapeHTML(v: unknown): string` — escapes `& < > " ' \``; `null`/`undefined` → `''`
  - `raw(s: string): Raw`
  - `html(strings, ...values): Raw` — `Raw` values pass through; arrays are rendered item by item and joined; `null`/`undefined`/`true`/`false` render as `''`; everything else is escaped. So `${cond && html`…`}` is safe.
  - `linkify(text: string): Raw` — escaped text with `http(s)://` URLs wrapped in `<a href target="_blank" rel="noopener noreferrer">`; trailing `.,;:!?)]` excluded from the link
  - `setHTML(el: Element, markup: Raw|string): void`
  - `delegate(root, type: string, handlers: Record<string, (el: HTMLElement, ev: Event) => void>): () => void` — calls `handlers[action]` for the closest `[data-action]` ancestor of the event target inside `root`; returns an unbinder
  - `FOCUSABLE: string` (selector), `focusFirst(container: Element): void` — focuses `[autofocus]` or the first focusable element

- [ ] **Step 1: Write the failing tests**

`tests/dom.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/dom.test.js`
Expected: FAIL — cannot resolve `../src/ui/dom.js`.

- [ ] **Step 3: Implement `src/ui/dom.js`**

```js
// @ts-check
/**
 * Tiny DOM toolkit. All markup is built with html``: every interpolated value
 * is escaped unless it is a Raw (produced by html`` itself, raw() or icon()).
 * raw() is for markup the app composed — never for user data.
 */

/** @type {Record<string, string>} */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export class Raw {
  /** @param {string} value */
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** @param {unknown} v */
export function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, ch => ESC[ch]);
}

/** Mark app-composed markup as trusted. @param {string} s */
export function raw(s) {
  return new Raw(String(s));
}

/** @param {unknown} v @returns {string} */
function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHTML(v);
}

/** Auto-escaping template tag. @param {TemplateStringsArray} strings @param {...unknown} values */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/** Escape text and turn http(s) URLs into links that open in a new tab. @param {string} text */
export function linkify(text) {
  const s = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    const start = /** @type {number} */ (m.index);
    out += escapeHTML(s.slice(last, start));
    out += `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a>`;
    last = start + url.length;
  }
  return new Raw(out + escapeHTML(s.slice(last)));
}

/** @param {Element} el @param {Raw|string} markup */
export function setHTML(el, markup) {
  el.innerHTML = String(markup);
}

/**
 * Event delegation on data-action attributes.
 * @param {Element} root @param {string} type
 * @param {Record<string, (el: HTMLElement, ev: Event) => void>} handlers
 * @returns {() => void}
 */
export function delegate(root, type, handlers) {
  /** @param {Event} ev */
  const listener = (ev) => {
    const t = /** @type {any} */ (ev.target);
    const el = t && typeof t.closest === 'function' ? t.closest('[data-action]') : null;
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.getAttribute('data-action') || ''];
    if (fn) fn(el, ev);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus [autofocus] or the first focusable element. @param {Element} container */
export function focusFirst(container) {
  const el = container.querySelector('[autofocus]') || container.querySelector(FOCUSABLE);
  if (el && 'focus' in el) /** @type {HTMLElement} */ (el).focus();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/dom.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dom.js tests/dom.test.js
git commit -m "$(cat <<'EOF'
feat: add escaping html template, linkify and event delegation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `src/store.js` — the observable state container

Implements spec §12 (single store; screens subscribe and re-render).

**Files:**
- Create: `src/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Produces:
  - `createStore(initial) → { get(): S, set(patch: Partial<S> | (s: S) => Partial<S>): void, subscribe(fn: (s: S) => void): () => void }` — shallow merge; subscribers run synchronously after every `set`
  - `INITIAL_UI = { categoryId: 'all', starredOnly: false, query: '', searching: false }`
  - `initialState(): AppState`
  - `store` — the app singleton, created from `initialState()`
  - `setUI(patch: Partial<typeof INITIAL_UI>): void`
  - `AppState = { status: 'loading'|'signedOut'|'ready'|'error', user: {uid, name, email, photoURL}|null, entries: Entry[], categories: Category[], meta: Meta|null, sync: 'clean'|'pending'|'error', error: string, online: boolean, updateReady: boolean, tick: number, ui: UI }`
  - `Meta = { schemaVersion: number, createdAt: number, lastBackupAt: number|null, backupNudgeDismissedAt: number|null }`

- [ ] **Step 1: Write the failing tests**

`tests/store.test.js`:
```js
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
    expect(st).toMatchObject({ status: 'loading', user: null, entries: [], categories: [], meta: null, sync: 'clean', error: '', updateReady: false, tick: 0 });
    expect(st.ui).toEqual(INITIAL_UI);
  });
  it('setUI merges into ui only', () => {
    setUI({ query: 'goa' });
    expect(store.get().ui).toEqual({ ...INITIAL_UI, query: 'goa' });
    expect(store.get().status).toBe('loading');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/store.test.js`
Expected: FAIL — cannot resolve `../src/store.js`.

- [ ] **Step 3: Implement `src/store.js`**

```js
// @ts-check
/**
 * A tiny observable store. State is replaced (shallow merge) on every set();
 * subscribers are called synchronously with the new state.
 *
 * @typedef {import('./model.js').Entry} Entry
 * @typedef {import('./model.js').Category} Category
 * @typedef {{ schemaVersion: number, createdAt: number, lastBackupAt: number|null, backupNudgeDismissedAt: number|null }} Meta
 * @typedef {{ uid: string, name: string, email: string, photoURL: string }} User
 * @typedef {{ categoryId: string, starredOnly: boolean, query: string, searching: boolean }} UI
 * @typedef {{ status: 'loading'|'signedOut'|'ready'|'error', user: User|null, entries: Entry[], categories: Category[],
 *             meta: Meta|null, sync: 'clean'|'pending'|'error', error: string, online: boolean,
 *             updateReady: boolean, tick: number, ui: UI }} AppState
 */

/**
 * @template S
 * @param {S} initial
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<(s: S) => void>} */
  const subs = new Set();
  return {
    /** @returns {S} */
    get: () => state,
    /** @param {Partial<S> | ((s: S) => Partial<S>)} patch */
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const fn of [...subs]) if (subs.has(fn)) fn(state);
    },
    /** @param {(s: S) => void} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/** @type {UI} */
export const INITIAL_UI = { categoryId: 'all', starredOnly: false, query: '', searching: false };

/** @returns {AppState} */
export function initialState() {
  return {
    status: 'loading',
    user: null,
    entries: [],
    categories: [],
    meta: null,
    sync: 'clean',
    error: '',
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    updateReady: false,
    tick: 0,
    ui: { ...INITIAL_UI },
  };
}

export const store = createStore(initialState());

/** @param {Partial<UI>} patch */
export function setUI(patch) {
  store.set(s => ({ ui: { ...s.ui, ...patch } }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/store.test.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "$(cat <<'EOF'
feat: add observable app store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `src/router.js` — hash routes and back behaviour

Implements spec §3 (routes, back button works, every screen linkable, sheets push a history entry).

**Design notes:**
- Every in-app navigation goes through `navigate()`, which uses `history.pushState` with `{ dtDepth }` so `back()` knows whether there is an in-app page to go back to. When the app was opened directly on `#/entry/x` (depth 0), `back()` replaces the entry with the fallback instead of leaving the site.
- `startRouter()` intercepts clicks on `<a href="#/…">` (no modifier keys) and routes them through `navigate()`, so plain anchors get the same depth tracking while still supporting "open in new tab".
- `pushState` does not fire `hashchange`, so `navigate()` dispatches one itself. Sheets (Task 18) push `{ dtSheet: true }` entries without changing the hash; closing them via Back fires `popstate` but no `hashchange`, so the router ignores them.

**Files:**
- Create: `src/router.js`
- Test: `tests/router.test.js`

**Interfaces:**
- Produces:
  - `SETTINGS_SECTIONS = ['appearance', 'categories', 'notifications', 'data', 'trash', 'about']`
  - `parseHash(hash: string): Route` — `Route = { name: 'timeline'|'entry'|'reminders'|'settings'|'notfound', params: { id?: string, section?: string } }`
  - `entryHref(id: string): string` — `#/entry/<encoded id>`
  - `currentRoute(): Route`
  - `navigate(hash: string, opts?: { replace?: boolean }): void`
  - `back(fallback?: string = '#/'): void`
  - `onRouteChange(cb: (r: Route) => void): () => void`
  - `startRouter(): () => void` — installs the anchor-click interceptor

- [ ] **Step 1: Write the failing tests**

`tests/router.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/router.test.js`
Expected: FAIL — cannot resolve `../src/router.js`.

- [ ] **Step 3: Implement `src/router.js`**

```js
// @ts-check
/**
 * Hash router.
 *   #/                    timeline
 *   #/entry/:id           entry detail
 *   #/reminders           reminders
 *   #/settings            settings index
 *   #/settings/:section   a settings section
 *
 * @typedef {{ name: 'timeline'|'entry'|'reminders'|'settings'|'notfound', params: { id?: string, section?: string } }} Route
 */

export const SETTINGS_SECTIONS = ['appearance', 'categories', 'notifications', 'data', 'trash', 'about'];

/** @param {string} p */
function decode(p) {
  try { return decodeURIComponent(p); } catch { return p; }
}

/** @param {string} hash @returns {Route} */
export function parseHash(hash) {
  const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  const parts = path ? path.split('/').map(decode) : [];
  if (parts.length === 0) return { name: 'timeline', params: {} };
  const [head, arg] = parts;
  if (head === 'entry' && parts.length === 2 && arg) return { name: 'entry', params: { id: arg } };
  if (head === 'reminders' && parts.length === 1) return { name: 'reminders', params: {} };
  if (head === 'settings' && parts.length === 1) return { name: 'settings', params: { section: '' } };
  if (head === 'settings' && parts.length === 2 && SETTINGS_SECTIONS.includes(arg)) return { name: 'settings', params: { section: arg } };
  return { name: 'notfound', params: {} };
}

/** @param {string} id */
export function entryHref(id) {
  return `#/entry/${encodeURIComponent(id)}`;
}

/** @returns {Route} */
export function currentRoute() {
  return parseHash(location.hash);
}

function depth() {
  return Number(history.state?.dtDepth) || 0;
}

function fireHashChange() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** @param {string} hash @param {{ replace?: boolean }} [opts] */
export function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) return;
  if (replace) history.replaceState({ dtDepth: depth() }, '', hash);
  else history.pushState({ dtDepth: depth() + 1 }, '', hash);
  fireHashChange();
}

/** Go back inside the app, or to `fallback` when there is nothing to go back to. @param {string} [fallback] */
export function back(fallback = '#/') {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** @param {(r: Route) => void} cb */
export function onRouteChange(cb) {
  const h = () => cb(currentRoute());
  window.addEventListener('hashchange', h);
  return () => window.removeEventListener('hashchange', h);
}

/** Route same-document "#/…" anchor clicks through navigate(). */
export function startRouter() {
  /** @param {MouseEvent} ev */
  const onClick = (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="#/"]') : null;
    if (!a || a.getAttribute('target')) return;
    ev.preventDefault();
    navigate(/** @type {string} */ (a.getAttribute('href')));
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/router.test.js`
Expected: all green (the tests only touch the pure `parseHash`/`entryHref`; the module never touches `window` at import time).

- [ ] **Step 5: Commit**

```bash
git add src/router.js tests/router.test.js
git commit -m "$(cat <<'EOF'
feat: add hash router with in-app back tracking

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `src/theme.js` — theme mode and accent

Implements spec §4.7 Appearance (System/Light/Dark; 8 accents + custom; per device) and §5 Colour (accent as CSS variable; contrast; `color-scheme` per theme).

**Files:**
- Create: `src/theme.js`
- Test: `tests/theme.test.js`

**Interfaces:**
- Produces:
  - `ACCENTS: { id, name, color }[]` — Copper `#C8956C` (default), Coral `#E0806B`, Gold `#C9A84C`, Sage `#7FA57A`, Teal `#3A9E8F`, Blue `#5595D9`, Violet `#8A63C9`, Rose `#D46E9E`
  - `THEME_MODES = ['system', 'light', 'dark']`, `PREFS_KEY = 'dt:prefs'`, `DEFAULT_PREFS = { theme: 'system', accent: '#C8956C' }`
  - `isHex(s): boolean`
  - `loadPrefs(storage?): Prefs`, `savePrefs(prefs, storage?): void` — `Prefs = { theme: 'system'|'light'|'dark', accent: '#RRGGBB' }`; both swallow storage errors
  - `resolveTheme(mode, prefersDark: boolean): 'light'|'dark'`
  - `relativeLuminance(hex): number`, `contrastRatio(a, b): number`, `onAccent(hex): '#FFFFFF'|'#1A1410'`
  - `applyTheme(prefs): void` — sets `<html data-theme>`, `--accent`, `--on-accent`, and `<meta name="theme-color">`
  - `initTheme(): Prefs` — apply now and follow OS changes while mode is `system`
  - `updatePrefs(patch: Partial<Prefs>): Prefs` — save + apply

- [ ] **Step 1: Write the failing tests**

`tests/theme.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/theme.test.js`
Expected: FAIL — cannot resolve `../src/theme.js`.

- [ ] **Step 3: Implement `src/theme.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/theme.test.js`
Expected: all green. If `onAccent('#C8956C')` differs, compute both ratios with `node -e` and fix the expectation only if the WCAG maths confirms the other colour is higher-contrast.

- [ ] **Step 5: Commit**

```bash
git add src/theme.js tests/theme.test.js
git commit -m "$(cat <<'EOF'
feat: add theme mode and accent preferences

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Shell, assets and design system

### Task 13: Vendor Firebase, self-host Outfit, add `config.js` and `firebase.js`

Implements spec §11 (Firebase SDK vendored so the shell works offline), §5 Typography (self-hosted Outfit, no Google Fonts request), §8 (persistent local cache, multi-tab), §4.1 (popup sign-in, redirect fallback when blocked or standalone), §12 (`config.js` is the one file a self-hoster edits).

**Files:**
- Create: `scripts/vendor-firebase.sh`, `vendor/firebase/firebase-app.js`, `vendor/firebase/firebase-auth.js`, `vendor/firebase/firebase-firestore.js`
- Create: `assets/fonts/Outfit-latin.woff2`, `assets/fonts/OFL.txt`
- Create: `src/config.js`, `src/firebase.js`
- Delete: `vendor/firebase/.gitkeep`, `assets/fonts/.gitkeep`

**Interfaces:**
- Produces (`src/firebase.js`):
  - `app`, `auth`, `db` — initialised SDK objects (`db` uses `persistentLocalCache` + `persistentMultipleTabManager`)
  - `signIn(): Promise<void>` — popup; falls back to redirect on `auth/popup-blocked`, `auth/operation-not-supported-in-this-environment`, `auth/web-storage-unsupported`, or when running standalone. Resolves quietly when the user closes the popup.
  - `completeRedirect(): Promise<unknown>` — consumes a pending redirect result; never rejects
  - `watchAuth(cb: (user: FirebaseUser|null) => void): () => void`
  - `signOutUser(): Promise<void>`
- Produces (`src/config.js`): `firebaseConfig`

- [ ] **Step 1: Write the vendoring script**

`scripts/vendor-firebase.sh`:
```bash
#!/usr/bin/env bash
# Download the Firebase ESM builds into vendor/firebase/ and make their
# cross-imports relative, so the app shell never fetches from gstatic.
set -euo pipefail
V=10.12.2
cd "$(dirname "$0")/../vendor/firebase"
for f in app auth firestore; do
  curl -fsSL "https://www.gstatic.com/firebasejs/$V/firebase-$f.js" -o "firebase-$f.js"
done
sed -i "s#https://www.gstatic.com/firebasejs/$V/firebase-app.js#./firebase-app.js#g" firebase-auth.js firebase-firestore.js
sed -i '/sourceMappingURL=/d' firebase-app.js firebase-auth.js firebase-firestore.js
if grep -nE "(from ?|import\\()['\"]https?://" firebase-*.js; then
  echo "absolute module imports remain" >&2
  exit 1
fi
ls -l firebase-*.js
```

- [ ] **Step 2: Run it**

```bash
rm -f vendor/firebase/.gitkeep
bash scripts/vendor-firebase.sh
grep -oE "from ?['\"][^'\"]+['\"]" vendor/firebase/firebase-auth.js | sort -u
```
Expected: three files listed (app ≈ 100 KB, auth ≈ 150 KB, firestore ≈ 440 KB); the grep prints only `from"./firebase-app.js"`.

- [ ] **Step 3: Self-host the font**

```bash
rm -f assets/fonts/.gitkeep
curl -fsSL "https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2" -o assets/fonts/Outfit-latin.woff2
curl -fsSL "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt" -o assets/fonts/OFL.txt
ls -l assets/fonts
head -3 assets/fonts/OFL.txt
```
Expected: the woff2 is ~32 KB (it is the variable-weight latin subset); OFL.txt starts with the Outfit copyright line.

- [ ] **Step 4: Create `src/config.js`**

```js
// @ts-check
/**
 * Firebase web app config — the one file to edit when you deploy your own copy.
 *
 * These values are not secrets. A Firebase web API key only identifies the
 * project; access is controlled by Firestore rules (firestore.rules) and the
 * list of authorised domains in Firebase Console → Authentication → Settings.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAnoBnWK6GQH7MBoSQQJHcc3N9IPu58hZA',
  authDomain: 'datetracker-f761b.firebaseapp.com',
  projectId: 'datetracker-f761b',
  storageBucket: 'datetracker-f761b.firebasestorage.app',
  messagingSenderId: '765314539884',
  appId: '1:765314539884:web:b788db73bdd99042635349',
};
```

- [ ] **Step 5: Create `src/firebase.js`**

```js
/**
 * Firebase initialisation. Together with db.js, the only module that imports the SDK.
 */
import { initializeApp } from '../vendor/firebase/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from '../vendor/firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from '../vendor/firebase/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const REDIRECT_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);
const DISMISSED_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
}

/** Sign in with Google: popup, or redirect when popups can't work. */
export async function signIn() {
  if (isStandalone()) return signInWithRedirect(auth, provider);
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    if (REDIRECT_CODES.has(code)) return signInWithRedirect(auth, provider);
    if (DISMISSED_CODES.has(code)) return;
    throw err;
  }
}

/** Finish a redirect sign-in if one is pending. Never rejects. */
export function completeRedirect() {
  return getRedirectResult(auth).catch(() => null);
}

/** @param {(user: any) => void} cb */
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function signOutUser() {
  return signOut(auth);
}
```

- [ ] **Step 6: Syntax-check the new modules**

```bash
node --check src/config.js && node --check vendor/firebase/firebase-app.js && echo OK
npm test
```
Expected: `OK`; the existing suite still passes. (`firebase.js` is exercised in the browser from Task 19 on.)

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor-firebase.sh vendor/firebase assets/fonts src/config.js src/firebase.js
git commit -m "$(cat <<'EOF'
feat: vendor Firebase 10.12.2, self-host Outfit, add Firebase init

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Icon sprite, `icons.js` and the `index.html` shell

Implements spec §5 Icons (inline Lucide sprite, ISC licence included, no emoji), §5 Accessibility (zoom allowed), §12 (`index.html` shell). This **replaces the v8 `index.html`** — v8 stays reachable through the `v8.2-legacy` tag.

**Files:**
- Create: `src/ui/icons.js`, `scripts/make-sprite.mjs`, `assets/icons/sprite.svg` (generated), `assets/icons/LICENSE-lucide.txt` (downloaded), `assets/icons/favicon.svg`
- Replace: `index.html`
- Test: `tests/icons.test.js`
- Delete: `assets/icons/.gitkeep`, `scripts/.gitkeep`, `src/ui/.gitkeep`

**Interfaces:**
- Produces:
  - `ICON_NAMES: string[]` — the Lucide icon names in the sprite (symbol ids are `i-<name>`)
  - `icon(name: string, opts?: { cls?: string }): Raw` — `<svg class="icon [cls]" aria-hidden="true" focusable="false"><use href="#i-name"></use></svg>`; throws on unknown names
  - `index.html` containers: `#app` (screens), `#sheets` (sheet layers), `#toasts` (`role="status"`, `aria-live="polite"`); sprite markers `<!-- sprite:start -->…<!-- sprite:end -->`
  - CSS classes the icon relies on (defined in Task 15): `.icon`, `.icon.is-filled`, `.icon-sm`

- [ ] **Step 1: Write the failing test**

`tests/icons.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { icon, ICON_NAMES } from '../src/ui/icons.js';
import { Raw } from '../src/ui/dom.js';

describe('icon', () => {
  it('references a sprite symbol and hides itself from assistive tech', () => {
    const out = icon('star', { cls: 'is-filled' });
    expect(out).toBeInstanceOf(Raw);
    expect(String(out)).toBe('<svg class="icon is-filled" aria-hidden="true" focusable="false"><use href="#i-star"></use></svg>');
    expect(String(icon('plus'))).toBe('<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-plus"></use></svg>');
  });
  it('throws on unknown names so typos fail loudly', () => {
    expect(() => icon('nope')).toThrow('Unknown icon: nope');
  });
});

describe('sprite', () => {
  it('contains every icon, both in sprite.svg and inlined in index.html', () => {
    expect(existsSync('assets/icons/sprite.svg')).toBe(true);
    const sprite = readFileSync('assets/icons/sprite.svg', 'utf8');
    const index = readFileSync('index.html', 'utf8');
    for (const n of ICON_NAMES) {
      expect(sprite).toContain(`id="i-${n}"`);
      expect(index).toContain(`id="i-${n}"`);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/icons.test.js`
Expected: FAIL — cannot resolve `../src/ui/icons.js`.

- [ ] **Step 3: Implement `src/ui/icons.js`**

```js
// @ts-check
import { raw, escapeHTML } from './dom.js';

/** Lucide icon names shipped in the inline sprite (see scripts/make-sprite.mjs). */
export const ICON_NAMES = [
  'plus', 'search', 'bell', 'settings', 'star', 'calendar', 'calendar-plus', 'clock', 'repeat', 'tag',
  'trash-2', 'undo-2', 'pencil', 'chevron-left', 'chevron-right', 'chevron-down', 'x', 'check',
  'download', 'upload', 'sun', 'moon', 'monitor', 'log-out', 'circle-alert', 'external-link',
  'arrow-up', 'arrow-down', 'info', 'cloud-off', 'user',
];

/**
 * An inline SVG that references a sprite symbol. Decorative by default:
 * the button or link around it carries the accessible name.
 * @param {string} name @param {{ cls?: string }} [opts]
 */
export function icon(name, { cls = '' } = {}) {
  if (!ICON_NAMES.includes(name)) throw new Error(`Unknown icon: ${name}`);
  const c = cls ? ` ${escapeHTML(cls)}` : '';
  return raw(`<svg class="icon${c}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`);
}
```

- [ ] **Step 4: Write the sprite builder**

`scripts/make-sprite.mjs`:
```js
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
```

- [ ] **Step 5: Replace `index.html` with the v9 shell**

`index.html`:
```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>DateTracker</title>
  <meta name="description" content="A private journal of memorable events.">
  <meta name="theme-color" content="#0F0E0D">
  <link rel="icon" href="./assets/icons/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png">
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="preload" href="./assets/fonts/Outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
  <script>
    /* Set the theme before first paint. Mirrors src/theme.js (key 'dt:prefs'). */
    try {
      var p = JSON.parse(localStorage.getItem('dt:prefs') || '{}');
      document.documentElement.dataset.theme = p.theme === 'light' || p.theme === 'dark'
        ? p.theme
        : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch (e) { /* keep dark */ }
  </script>
  <link rel="stylesheet" href="./styles/tokens.css">
  <link rel="stylesheet" href="./styles/base.css">
  <link rel="stylesheet" href="./styles/components.css">
  <link rel="stylesheet" href="./styles/screens.css">
  <script type="module" src="./src/main.js"></script>
</head>
<body>
  <!-- sprite:start --><!-- sprite:end -->
  <div id="app"></div>
  <div id="sheets"></div>
  <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
  <noscript><p style="padding:24px">DateTracker needs JavaScript to run.</p></noscript>
</body>
</html>
```

- [ ] **Step 6: Add the favicon**

`assets/icons/favicon.svg` — the app mark: a copper rounded square with a ring and a centre dot ("a moment"). The PNG icons in Task 28 draw the same geometry.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#C8956C"/><circle cx="32" cy="32" r="15" fill="none" stroke="#1A1410" stroke-width="5"/><circle cx="32" cy="32" r="5" fill="#1A1410"/></svg>
```

- [ ] **Step 7: Build the sprite and run the tests**

```bash
rm -f assets/icons/.gitkeep scripts/.gitkeep src/ui/.gitkeep
node scripts/make-sprite.mjs
npm test -- tests/icons.test.js
```
Expected: `sprite: 31 icons (lucide-static 0.460.0)`; tests green. `index.html` now has the sprite inlined between the markers.

- [ ] **Step 8: Commit**

```bash
git add index.html src/ui/icons.js tests/icons.test.js scripts/make-sprite.mjs assets/icons src/ui scripts
git commit -m "$(cat <<'EOF'
feat: replace v8 index.html with the v9 shell and Lucide icon sprite

The v8 single-file app remains available at the v8.2-legacy tag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `styles/tokens.css` and `styles/base.css`

Implements spec §5 Typography (16 px base; 12/14/16/20/28; weights 400/500/600; one label style; line heights), §5 Colour (tokens on `:root`, light override, `color-scheme` per theme, AA contrast), §5 Motion (reduced motion), §5 Surfaces (4 px grid, radii, 44 px targets, 680 px max width).

**Contrast check (already computed; keep these exact values):** dark `--text-3 #968D84` on `--surface-2 #24221F` = 4.9:1; light `--text-3 #6B635B` on `--surface-2 #F1ECE6` = 5.0:1; light `--danger #B3261E` on white = 6.5:1; dark `--danger #F2837A` on `--bg` = 7.5:1. Accent is never used for body-size text.

**Files:**
- Create: `styles/tokens.css`, `styles/base.css`
- Delete: `styles/.gitkeep`

**Interfaces:**
- Produces (CSS custom properties used by every later stylesheet): `--bg --surface-1 --surface-2 --hairline --text-1 --text-2 --text-3 --danger --warning --success --accent --on-accent --accent-soft --scrim --shadow-sheet --shadow-pop --card-border --font --fs-1..5 --fw-regular/medium/semibold --lh-body --lh-head --sp-1..12 --r-input --r-card --r-sheet --r-full --tap --content-max --gutter --topbar-h --dur-sheet --dur-push --dur-toast --ease-out`
- Produces (classes): `.icon`, `.icon.is-filled`, `.icon-sm`, `.label`, `.muted`, `.secondary`, `.visually-hidden`

- [ ] **Step 1: Create `styles/tokens.css`**

```css
/* Design tokens. Dark is the default; [data-theme="light"] overrides.
   --accent and --on-accent are set at runtime by src/theme.js. */
:root {
  color-scheme: dark;

  --bg: #0F0E0D;
  --surface-1: #1A1917;
  --surface-2: #24221F;
  --hairline: #2E2B28;
  --text-1: #EDE8E2;
  --text-2: #BDB5AC;
  --text-3: #968D84;
  --danger: #F2837A;
  --warning: #E6B450;
  --success: #6CC08B;
  --accent: #C8956C;
  --on-accent: #1A1410;
  --accent-soft: color-mix(in srgb, var(--accent) 18%, transparent);
  --scrim: rgb(0 0 0 / 0.55);
  --shadow-sheet: 0 -8px 32px rgb(0 0 0 / 0.45);
  --shadow-pop: 0 8px 24px rgb(0 0 0 / 0.4);
  --card-border: transparent;

  --font: 'Outfit', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --fs-1: 12px;
  --fs-2: 14px;
  --fs-3: 16px;
  --fs-4: 20px;
  --fs-5: 28px;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --lh-body: 1.5;
  --lh-head: 1.25;

  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-12: 48px;

  --r-input: 8px;
  --r-card: 12px;
  --r-sheet: 20px;
  --r-full: 999px;

  --tap: 44px;
  --content-max: 680px;
  --gutter: 16px;
  --topbar-h: 56px;

  --dur-sheet: 240ms;
  --dur-push: 200ms;
  --dur-toast: 200ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-theme="light"] {
  color-scheme: light;

  --bg: #FAF8F5;
  --surface-1: #FFFFFF;
  --surface-2: #F1ECE6;
  --hairline: #E3DCD4;
  --text-1: #1C1917;
  --text-2: #4A433D;
  --text-3: #6B635B;
  --danger: #B3261E;
  --warning: #8A5A00;
  --success: #2E7D4F;
  --scrim: rgb(28 25 23 / 0.4);
  --shadow-sheet: 0 -8px 32px rgb(28 25 23 / 0.14);
  --shadow-pop: 0 8px 24px rgb(28 25 23 / 0.12);
  --card-border: var(--hairline);
}
```

- [ ] **Step 2: Create `styles/base.css`**

```css
@font-face {
  font-family: 'Outfit';
  src: url('../assets/fonts/Outfit-latin.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text-1);
  font-family: var(--font);
  font-size: var(--fs-3);
  font-weight: var(--fw-regular);
  line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

h1, h2, h3, p, figure, blockquote { margin: 0; }
ul, ol { margin: 0; padding: 0; list-style: none; }
h1, h2, h3 { line-height: var(--lh-head); font-weight: var(--fw-semibold); }

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: 0; padding: 0; text-align: inherit; }
a { color: inherit; }
img, svg { display: block; max-width: 100%; }

:focus { outline: none; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

[hidden] { display: none !important; }

.icon {
  width: 20px;
  height: 20px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon.is-filled { fill: currentColor; }
.icon-sm { width: 16px; height: 16px; }

/* The one label style: month headers, card headers, section labels. */
.label {
  font-size: var(--fs-1);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.muted { color: var(--text-3); }
.secondary { color: var(--text-2); }

.visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Check the files parse**

```bash
rm -f styles/.gitkeep
touch styles/components.css styles/screens.css
node -e "for (const f of ['styles/tokens.css','styles/base.css']) { const s=require('fs').readFileSync(f,'utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; if(o!==c) throw new Error(f+': unbalanced braces'); } console.log('braces OK')"
```
Expected: `braces OK`. (Empty `components.css`/`screens.css` exist so `index.html` has no 404s; Tasks 16+ fill them.)

- [ ] **Step 4: Commit**

```bash
git add styles
git commit -m "$(cat <<'EOF'
feat: add design tokens and base styles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `styles/components.css` and a dev style guide

Implements spec §5 Surfaces & layout, Motion, Accessibility (44 px targets, `aria-pressed` chips, dialogs) for the shared components. `dev/styleguide.html` lets you check every component in both themes before any screen exists; it is not part of the app shell (the service worker never caches it).

**Files:**
- Modify: `styles/components.css` (fill)
- Create: `dev/styleguide.html`

**Interfaces:**
- Produces (classes used by all screens):
  - Layout: `.screen` (centred column, max 680 px), `.topbar`, `.topbar-title`, `.topbar-actions`, `.content`
  - Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-danger` (text-style danger), `.btn-block`, `.icon-btn`, `.fab`
  - Badges/dots: `.badge` (on `.icon-btn`), `.dot` (+ inline `style="--c:#hex"`), `.sync-dot.is-pending`, `.sync-dot.is-error`
  - Forms: `.field`, `.field-label`, `.input`, `.textarea`, `.field-error`, `.field-hint`, `.switch-row` (with `input[type=checkbox][role=switch]`)
  - Choice: `.chips` (horizontal, scrollable), `.chip[aria-pressed]` (+ `--c` for a category dot), `.segmented` with `button[aria-pressed]`
  - Surfaces: `.card`, `.card-head`, `.card-row`, `.list` (grouped settings list), `.list-row`, `.list-row-meta`, `.empty`
  - Overlays: `.sheet-layer`, `.sheet-backdrop`, `.sheet`, `.sheet-content` (display: contents), `.sheet-handle`, `.sheet-head`, `.sheet-body`, `.sheet-foot`, `.sheet-discard`, `.sheet--confirm`, `.toasts`, `.toast`, `.toast-action`
  - Misc: `.spinner`, `.pill` (offline / update banners), `.avatar`

- [ ] **Step 1: Fill `styles/components.css`**

```css
/* ---------- Layout ---------- */
.screen {
  max-width: var(--content-max);
  margin: 0 auto;
  min-height: 100dvh;
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}
.content { padding: 0 var(--gutter); }

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: var(--topbar-h);
  padding: env(safe-area-inset-top) var(--sp-2) 0;
  background: var(--bg);
}
.topbar-title {
  flex: 1;
  min-width: 0;
  padding: 0 var(--sp-2);
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-actions { display: flex; align-items: center; gap: var(--sp-1); }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: var(--tap);
  padding: 0 var(--sp-5);
  border-radius: var(--r-input);
  font-size: var(--fs-3);
  font-weight: var(--fw-medium);
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 120ms, opacity 120ms;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn-primary { background: var(--accent); color: var(--on-accent); }
.btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 88%, var(--text-1)); }
.btn-secondary { background: var(--surface-2); color: var(--text-1); }
.btn-secondary:hover:not(:disabled) { background: color-mix(in srgb, var(--surface-2) 85%, var(--text-1)); }
.btn-quiet { color: var(--text-2); padding: 0 var(--sp-3); }
.btn-quiet:hover:not(:disabled) { color: var(--text-1); background: var(--surface-2); }
.btn-danger { color: var(--danger); padding: 0 var(--sp-3); }
.btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 12%, transparent); }
.btn-block { width: 100%; }

.icon-btn {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  flex: none;
  border-radius: var(--r-full);
  color: var(--text-2);
  text-decoration: none;
}
.icon-btn:hover { background: var(--surface-2); color: var(--text-1); }
.icon-btn[aria-pressed="true"] { color: var(--accent); }

.badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--r-full);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-1);
  font-weight: var(--fw-semibold);
  line-height: 18px;
  text-align: center;
}

.fab {
  position: fixed;
  right: max(var(--gutter), calc((100vw - var(--content-max)) / 2 + var(--gutter)));
  bottom: calc(var(--sp-6) + env(safe-area-inset-bottom));
  z-index: 20;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--r-full);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-pop);
}
.fab .icon { width: 24px; height: 24px; }

/* ---------- Dots, avatar, sync ---------- */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: var(--r-full);
  background: var(--c, var(--text-3));
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--r-full);
  object-fit: cover;
  background: var(--surface-2);
}
.avatar-fallback {
  display: grid;
  place-items: center;
  font-size: var(--fs-2);
  font-weight: var(--fw-semibold);
  color: var(--text-2);
}
.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-full);
  margin: 0 var(--sp-2);
}
.sync-dot.is-pending { background: var(--warning); }
.sync-dot.is-error { background: var(--danger); }

/* ---------- Forms ---------- */
.field { display: grid; gap: var(--sp-2); margin-bottom: var(--sp-5); }
.field-label { font-size: var(--fs-2); font-weight: var(--fw-medium); color: var(--text-2); }
.input, .textarea, .select {
  width: 100%;
  min-height: var(--tap);
  padding: 10px var(--sp-3);
  border: 1px solid var(--hairline);
  border-radius: var(--r-input);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: var(--fs-3);
}
.input:focus-visible, .textarea:focus-visible, .select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  border-color: transparent;
}
.input::placeholder, .textarea::placeholder { color: var(--text-3); }
.textarea { resize: none; line-height: var(--lh-body); min-height: 96px; overflow: hidden; }
.input[aria-invalid="true"], .textarea[aria-invalid="true"] { border-color: var(--danger); }
.field-error { font-size: var(--fs-2); color: var(--danger); }
.field-hint { font-size: var(--fs-2); color: var(--text-3); }

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  min-height: var(--tap);
  margin-bottom: var(--sp-3);
  cursor: pointer;
}
.switch-row input[role="switch"] {
  appearance: none;
  position: relative;
  width: 44px;
  height: 26px;
  flex: none;
  margin: 0;
  border-radius: var(--r-full);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  cursor: pointer;
  transition: background-color 150ms;
}
.switch-row input[role="switch"]::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: var(--r-full);
  background: var(--text-2);
  transition: transform 150ms var(--ease-out), background-color 150ms;
}
.switch-row input[role="switch"]:checked { background: var(--accent); border-color: var(--accent); }
.switch-row input[role="switch"]:checked::after { transform: translateX(18px); background: var(--on-accent); }

/* ---------- Chips & segmented ---------- */
.chips {
  display: flex;
  gap: var(--sp-2);
  overflow-x: auto;
  scrollbar-width: none;
  padding: var(--sp-1) 0;
}
.chips::-webkit-scrollbar { display: none; }
.chips.is-wrapping { flex-wrap: wrap; overflow: visible; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  flex: none;
  min-height: 36px;
  padding: 0 var(--sp-3);
  border-radius: var(--r-input);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  position: relative;
}
/* Keep a 44 px hit area while the chip itself is 36 px tall. */
.chip::before { content: ''; position: absolute; inset: -4px 0; }
.chip[aria-pressed="true"] { background: var(--accent-soft); color: var(--text-1); box-shadow: inset 0 0 0 1px var(--accent); }
.chip .dot { background: var(--c, var(--text-3)); }

.segmented {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: calc(var(--r-input) + 3px);
  background: var(--surface-2);
}
.segmented button {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 38px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-input);
  color: var(--text-2);
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
}
.segmented button[aria-pressed="true"] { background: var(--surface-1); color: var(--text-1); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }

/* ---------- Cards & lists ---------- */
.card {
  margin: 0 var(--gutter) var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--surface-1);
  border: 1px solid var(--card-border);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  margin-bottom: var(--sp-1);
}
.card-head a, .card-head button { font-size: var(--fs-2); color: var(--text-2); text-decoration: none; display: inline-flex; align-items: center; gap: var(--sp-1); min-height: var(--tap); }
.card-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: var(--tap);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--hairline);
  text-decoration: none;
  color: inherit;
}
.card-head + .card-row { border-top: 0; }
.card-row-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-row-aside { flex: none; font-size: var(--fs-2); color: var(--text-3); }

.list { margin: 0 var(--gutter) var(--sp-6); border-radius: var(--r-card); background: var(--surface-1); border: 1px solid var(--card-border); overflow: hidden; }
.list-title { margin: var(--sp-6) var(--gutter) var(--sp-2); }
.list-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 52px;
  padding: var(--sp-2) var(--sp-4);
  border-top: 1px solid var(--hairline);
  color: inherit;
  text-decoration: none;
}
.list-row:first-child { border-top: 0; }
a.list-row:hover, button.list-row:hover { background: var(--surface-2); }
.list-row-main { flex: 1; min-width: 0; }
.list-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-row-meta { font-size: var(--fs-2); color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-row > .icon:last-child { color: var(--text-3); }

.empty {
  max-width: 420px;
  margin: var(--sp-12) auto;
  padding: 0 var(--gutter);
  text-align: center;
  color: var(--text-2);
}
.empty h2 { font-size: var(--fs-4); color: var(--text-1); margin-bottom: var(--sp-2); }

/* ---------- Sheets ---------- */
.sheet-layer { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
.sheet-backdrop {
  position: absolute;
  inset: 0;
  background: var(--scrim);
  opacity: 0;
  transition: opacity var(--dur-sheet) var(--ease-out);
}
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--content-max);
  max-height: calc(100dvh - 24px);
  border-radius: var(--r-sheet) var(--r-sheet) 0 0;
  background: var(--surface-1);
  box-shadow: var(--shadow-sheet);
  transform: translateY(100%);
  transition: transform var(--dur-sheet) var(--ease-out);
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet-layer.is-open .sheet-backdrop { opacity: 1; }
.sheet-layer.is-open .sheet { transform: none; }
.sheet-content { display: contents; }
.sheet-handle { width: 36px; height: 4px; margin: var(--sp-2) auto 0; border-radius: var(--r-full); background: var(--hairline); flex: none; }
.sheet-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-5); flex: none; }
.sheet-head h2 { flex: 1; font-size: var(--fs-4); }
.sheet-body { overflow-y: auto; padding: var(--sp-2) var(--sp-5) var(--sp-5); overscroll-behavior: contain; }
.sheet-foot { display: flex; gap: var(--sp-3); justify-content: flex-end; padding: var(--sp-3) var(--sp-5) var(--sp-5); border-top: 1px solid var(--hairline); flex: none; }
.sheet-discard {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: var(--sp-3) var(--sp-5);
  background: var(--surface-2);
  border-top: 1px solid var(--hairline);
  flex: none;
}
.sheet-discard p { flex: 1; font-weight: var(--fw-medium); }
.sheet--confirm .sheet-body p { color: var(--text-2); }

@media (min-width: 720px) {
  .sheet-layer { align-items: center; padding: var(--sp-6); }
  .sheet { max-width: 560px; border-radius: var(--r-sheet); transform: translateY(24px); opacity: 0; transition: transform var(--dur-sheet) var(--ease-out), opacity var(--dur-sheet) var(--ease-out); }
  .sheet-layer.is-open .sheet { opacity: 1; }
  .sheet-handle { display: none; }
  .sheet--confirm { max-width: 420px; }
}

/* ---------- Toasts & pills ---------- */
.toasts {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(96px + env(safe-area-inset-bottom));
  z-index: 60;
  display: grid;
  justify-items: center;
  padding: 0 var(--gutter);
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  max-width: 520px;
  min-height: 48px;
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
  border-radius: var(--r-card);
  background: var(--text-1);
  color: var(--bg);
  box-shadow: var(--shadow-pop);
  pointer-events: auto;
  transform: translateY(12px);
  opacity: 0;
  transition: transform var(--dur-toast) var(--ease-out), opacity var(--dur-toast) var(--ease-out);
}
.toast.is-visible { transform: none; opacity: 1; }
.toast-text { flex: 1; }
.toast-action {
  min-height: var(--tap);
  padding: 0 var(--sp-3);
  border-radius: var(--r-input);
  font-weight: var(--fw-semibold);
  color: var(--bg);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 36px;
  padding: var(--sp-1) var(--sp-4);
  border-radius: var(--r-full);
  font-size: var(--fs-2);
  color: var(--text-2);
  background: var(--surface-2);
  box-shadow: var(--shadow-pop);
}
.pill button { font-weight: var(--fw-semibold); color: var(--text-1); text-decoration: underline; text-underline-offset: 3px; min-height: var(--tap); }

/* ---------- Spinner ---------- */
.spinner {
  width: 28px;
  height: 28px;
  border-radius: var(--r-full);
  border: 3px solid var(--surface-2);
  border-top-color: var(--accent);
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 2: Create `dev/styleguide.html`**

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DateTracker — style guide</title>
  <link rel="stylesheet" href="../styles/tokens.css">
  <link rel="stylesheet" href="../styles/base.css">
  <link rel="stylesheet" href="../styles/components.css">
  <style>.sg { padding: 16px; display: grid; gap: 16px; } .sg-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }</style>
</head>
<body>
  <div id="sprite"></div>
  <div class="screen">
    <header class="topbar">
      <span class="topbar-title">Style guide</span>
      <div class="topbar-actions">
        <button class="icon-btn" id="theme" aria-label="Toggle theme"><svg class="icon"><use href="#i-sun"></use></svg></button>
        <a class="icon-btn" href="#" aria-label="Reminders"><svg class="icon"><use href="#i-bell"></use></svg><span class="badge">3</span></a>
      </div>
    </header>
    <div class="sg">
      <p class="label">Buttons</p>
      <div class="sg-row">
        <button class="btn btn-primary">Save</button>
        <button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-quiet">Quiet</button>
        <button class="btn btn-danger">Delete</button>
        <button class="btn btn-primary" disabled>Disabled</button>
      </div>
      <p class="label">Chips &amp; segmented</p>
      <div class="chips">
        <button class="chip" aria-pressed="true">All</button>
        <button class="chip" aria-pressed="false"><svg class="icon icon-sm"><use href="#i-star"></use></svg>Starred</button>
        <button class="chip" aria-pressed="false" style="--c:#4A8FD4"><span class="dot"></span>Travel</button>
        <button class="chip" aria-pressed="false" style="--c:#5BA85A"><span class="dot"></span>Health</button>
      </div>
      <div class="segmented"><button aria-pressed="true">Once</button><button aria-pressed="false">Every year</button></div>
      <p class="label">Fields</p>
      <label class="field"><span class="field-label">Title</span><input class="input" placeholder="What happened?"></label>
      <label class="field"><span class="field-label">Date</span><input class="input" type="date" aria-invalid="true"><span class="field-error">Pick a valid date.</span></label>
      <label class="switch-row"><span>Star this memory</span><input type="checkbox" role="switch" checked></label>
      <p class="label">Card</p>
    </div>
    <section class="card">
      <div class="card-head"><h2 class="label">On this day · 22 September</h2></div>
      <a class="card-row" href="#"><span class="card-row-main">2023 · Trip to Jaipur · Travel</span><span class="card-row-aside">3 years ago</span></a>
      <a class="card-row" href="#"><span class="card-row-main">2019 · First day at the new job</span><span class="card-row-aside">7 years ago</span></a>
    </section>
    <h2 class="label list-title">List</h2>
    <div class="list">
      <a class="list-row" href="#"><div class="list-row-main"><div class="list-row-title">Appearance</div><div class="list-row-meta">System · Copper</div></div><svg class="icon"><use href="#i-chevron-right"></use></svg></a>
      <a class="list-row" href="#"><div class="list-row-main"><div class="list-row-title">Categories</div><div class="list-row-meta">4 categories</div></div><svg class="icon"><use href="#i-chevron-right"></use></svg></a>
    </div>
    <div class="empty"><h2>Your journal is empty.</h2><p>Tap + to record your first memory — a trip, a purchase, a milestone. Anything worth remembering.</p></div>
    <div class="sg"><div class="spinner"></div></div>
  </div>
  <div class="toasts"><div class="toast is-visible"><span class="toast-text">Moved to Trash</span><button class="toast-action">Undo</button></div></div>
  <button class="fab" aria-label="Add a memory"><svg class="icon"><use href="#i-plus"></use></svg></button>
  <script type="module">
    document.getElementById('sprite').innerHTML = await (await fetch('../assets/icons/sprite.svg')).text();
    document.getElementById('theme').addEventListener('click', () => {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Look at it in both themes**

```bash
npm run serve
```
Open `http://localhost:8080/dev/styleguide.html`. Check, in dark and light (sun button): icons render; chips are one row, horizontally scrollable at 360 px width; the pressed chip shows an accent outline; the toast is readable; the FAB sits inside the 680 px column on a wide window; the date input's native picker matches the theme (`color-scheme`). Stop the server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add styles/components.css dev/styleguide.html
git commit -m "$(cat <<'EOF'
feat: add shared component styles and a dev style guide

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Data layer

### Task 17: `src/db.js` — Firestore reads, writes, subscriptions, first run

Implements spec §6 (per-user subcollections, `meta/app`), §7 (first run: write meta + seed four categories in one batch, only when `meta/app` does not exist), §8 (one `onSnapshot` per collection, `hasPendingWrites`, per-document writes, never write defaults over existing data), §4.7 (category delete reassigns entries; reorder), §10 (import merges via batches).

**Design notes:**
- Writes return the SDK promise but callers must **not** await them to drive UI (see Global Constraints) — wrap them in `guard()` from Task 18.
- Multi-document operations use `writeBatch` in chunks of ≤ 400 and commit all chunks in parallel (awaiting chunk N before building chunk N+1 would stall offline, because a commit only resolves when the server acknowledges).
- `ensureFirstRun` is the only read that is awaited. If it fails (typically: offline on a device that has never loaded this account), boot shows the error screen with Retry — it never falls through to an empty journal. If `meta/app` is missing but categories already exist (someone deleted meta by hand), it rewrites meta only and seeds nothing.

**Files:**
- Create: `src/db.js`
- Test: `tests/db.test.js` (mocks the SDK — no network)

**Interfaces:**
- Consumes: `db` from `src/firebase.js`; `normalizeEntry`, `normalizeCategory`, `toDoc`, `buildCategory`, `DEFAULT_CATEGORIES` from `src/model.js`.
- Produces:
  - `BATCH_LIMIT = 400`
  - `ensureFirstRun(uid, now?): Promise<boolean>` — `true` when it seeded
  - `subscribeEntries(uid, onData: (entries: Entry[], pending: boolean) => void, onError): () => void`
  - `subscribeCategories(uid, onData: (categories: Category[], pending: boolean) => void, onError): () => void` — sorted by `order`, then `createdAt`
  - `subscribeMeta(uid, onData: (meta: Meta|null) => void, onError): () => void`
  - `addEntry(uid, entry: Entry): Promise<void>`
  - `updateEntry(uid, id, patch: Partial<Entry>): Promise<void>`
  - `trashEntry(uid, id, now?)`, `restoreEntry(uid, id, now?)`, `deleteEntryForever(uid, id)`
  - `emptyTrash(uid, ids: string[]): Promise<void>`
  - `addCategory(uid, category: Category)`, `updateCategory(uid, id, patch)`
  - `reorderCategories(uid, orderedIds: string[])`
  - `deleteCategory(uid, id, entryIds: string[], reassignTo: string|null, now?)`
  - `importData(uid, { entries: Entry[], categories: Category[] })`
  - `updateMeta(uid, patch: Partial<Meta>)` — `setDoc(…, { merge: true })`

- [ ] **Step 1: Write the failing tests**

`tests/db.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fx = vi.hoisted(() => ({ metaExists: false, categoriesEmpty: true, batches: [], snapshotHandlers: [] }));

vi.mock('../src/firebase.js', () => ({ db: { kind: 'db' } }));
vi.mock('../vendor/firebase/firebase-firestore.js', () => {
  const ref = (path) => ({ path });
  return {
    collection: (_db, ...segs) => ref(segs.join('/')),
    doc: (parent, ...segs) => ref(parent && parent.path ? `${parent.path}/${segs.join('/')}` : segs.join('/')),
    getDoc: vi.fn(async () => ({ exists: () => fx.metaExists })),
    getDocs: vi.fn(async () => ({ empty: fx.categoriesEmpty })),
    query: (c) => c,
    limit: () => null,
    onSnapshot: vi.fn((target, _opts, next, error) => { fx.snapshotHandlers.push({ target, next, error }); return () => {}; }),
    setDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    writeBatch: () => {
      const b = { ops: [], commit: vi.fn(async () => {}) };
      b.set = (r, d) => { b.ops.push(['set', r.path, d]); return b; };
      b.update = (r, d) => { b.ops.push(['update', r.path, d]); return b; };
      b.delete = (r) => { b.ops.push(['delete', r.path]); return b; };
      fx.batches.push(b);
      return b;
    },
  };
});

const fs = await import('../vendor/firebase/firebase-firestore.js');
const db = await import('../src/db.js');

beforeEach(() => {
  fx.metaExists = false; fx.categoriesEmpty = true; fx.batches.length = 0; fx.snapshotHandlers.length = 0;
  vi.clearAllMocks();
});

describe('ensureFirstRun', () => {
  it('does nothing when meta exists', async () => {
    fx.metaExists = true;
    expect(await db.ensureFirstRun('u', 5)).toBe(false);
    expect(fx.batches).toHaveLength(0);
  });
  it('writes meta and four categories in one batch on a fresh account', async () => {
    expect(await db.ensureFirstRun('u', 5)).toBe(true);
    expect(fx.batches).toHaveLength(1);
    const ops = fx.batches[0].ops;
    expect(ops[0]).toEqual(['set', 'users/u/meta/app', { schemaVersion: 2, createdAt: 5, lastBackupAt: null, backupNudgeDismissedAt: null }]);
    const cats = ops.slice(1);
    expect(cats).toHaveLength(4);
    expect(cats.map(o => o[2].name)).toEqual(['Travel', 'Milestones', 'Health', 'Family']);
    expect(cats.map(o => o[2].order)).toEqual([0, 1, 2, 3]);
    expect(cats.every(o => o[1].startsWith('users/u/categories/') && !('id' in o[2]))).toBe(true);
    expect(fx.batches[0].commit).toHaveBeenCalled();
  });
  it('never seeds categories over existing ones', async () => {
    fx.categoriesEmpty = false;
    await db.ensureFirstRun('u', 5);
    expect(fx.batches[0].ops.map(o => o[1])).toEqual(['users/u/meta/app']);
  });
});

describe('single-document writes', () => {
  it('addEntry stores the doc without its id under the id key', async () => {
    await db.addEntry('u', { id: 'e1', title: 'T' });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/u/entries/e1' }, { title: 'T' });
  });
  it('trash / restore / delete', async () => {
    await db.trashEntry('u', 'e1', 9);
    expect(fs.updateDoc).toHaveBeenLastCalledWith({ path: 'users/u/entries/e1' }, { deletedAt: 9, updatedAt: 9 });
    await db.restoreEntry('u', 'e1', 10);
    expect(fs.updateDoc).toHaveBeenLastCalledWith({ path: 'users/u/entries/e1' }, { deletedAt: null, updatedAt: 10 });
    await db.deleteEntryForever('u', 'e1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ path: 'users/u/entries/e1' });
  });
  it('updateMeta merges', async () => {
    await db.updateMeta('u', { lastBackupAt: 3 });
    expect(fs.setDoc).toHaveBeenCalledWith({ path: 'users/u/meta/app' }, { lastBackupAt: 3 }, { merge: true });
  });
});

describe('batched writes', () => {
  it('emptyTrash chunks at 400 and commits every chunk', async () => {
    const ids = Array.from({ length: 850 }, (_, i) => `e${i}`);
    await db.emptyTrash('u', ids);
    expect(fx.batches.map(b => b.ops.length)).toEqual([400, 400, 50]);
    expect(fx.batches.every(b => b.commit.mock.calls.length === 1)).toBe(true);
    expect(fx.batches[2].ops[49]).toEqual(['delete', 'users/u/entries/e849']);
  });
  it('deleteCategory reassigns entries, then deletes the category', async () => {
    await db.deleteCategory('u', 'c1', ['e1', 'e2'], 'c2', 7);
    expect(fx.batches[0].ops).toEqual([
      ['update', 'users/u/entries/e1', { categoryId: 'c2', updatedAt: 7 }],
      ['update', 'users/u/entries/e2', { categoryId: 'c2', updatedAt: 7 }],
      ['delete', 'users/u/categories/c1'],
    ]);
  });
  it('reorderCategories writes order = index', async () => {
    await db.reorderCategories('u', ['b', 'a']);
    expect(fx.batches[0].ops).toEqual([
      ['update', 'users/u/categories/b', { order: 0 }],
      ['update', 'users/u/categories/a', { order: 1 }],
    ]);
  });
  it('importData sets categories and entries without ids', async () => {
    await db.importData('u', { categories: [{ id: 'c', name: 'X' }], entries: [{ id: 'e', title: 'T' }] });
    expect(fx.batches[0].ops).toEqual([
      ['set', 'users/u/categories/c', { name: 'X' }],
      ['set', 'users/u/entries/e', { title: 'T' }],
    ]);
  });
  it('an empty operation list commits nothing', async () => {
    await db.emptyTrash('u', []);
    expect(fx.batches).toHaveLength(0);
  });
});

describe('subscriptions', () => {
  it('normalises entries and reports pending writes', () => {
    const onData = vi.fn();
    db.subscribeEntries('u', onData, () => {});
    const h = fx.snapshotHandlers[0];
    expect(h.target.path).toBe('users/u/entries');
    h.next({ docs: [{ id: 'e1', data: () => ({ title: 'Hi', date: '2026-01-02' }) }], metadata: { hasPendingWrites: true } });
    expect(onData.mock.calls[0][0][0]).toMatchObject({ id: 'e1', title: 'Hi', date: '2026-01-02', starred: false });
    expect(onData.mock.calls[0][1]).toBe(true);
  });
  it('sorts categories by order then createdAt', () => {
    const onData = vi.fn();
    db.subscribeCategories('u', onData, () => {});
    fx.snapshotHandlers[0].next({
      docs: [
        { id: 'b', data: () => ({ name: 'B', color: '#111111', order: 1, createdAt: 1 }) },
        { id: 'a', data: () => ({ name: 'A', color: '#111111', order: 0, createdAt: 2 }) },
        { id: 'c', data: () => ({ name: 'C', color: '#111111', order: 1, createdAt: 0 }) },
      ],
      metadata: { hasPendingWrites: false },
    });
    expect(onData.mock.calls[0][0].map(c => c.id)).toEqual(['a', 'c', 'b']);
  });
  it('meta yields null when missing', () => {
    const onData = vi.fn();
    db.subscribeMeta('u', onData, () => {});
    fx.snapshotHandlers[0].next({ exists: () => false, data: () => undefined });
    expect(onData).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/db.test.js`
Expected: FAIL — cannot resolve `../src/db.js`.

- [ ] **Step 3: Implement `src/db.js`**

```js
/**
 * All Firestore access lives here.
 *
 * Rules this module keeps:
 * - Every write touches one document, or a writeBatch of single-document ops.
 * - Nothing writes a whole collection from memory, and nothing writes defaults
 *   over existing data (ensureFirstRun only seeds when meta/app is missing and
 *   the categories collection is empty).
 * - Writes return promises, but the UI must not await them (offline, they only
 *   resolve when the server acknowledges). The onSnapshot listeners update the UI.
 */
import {
  collection, doc, getDoc, getDocs, query, limit, onSnapshot,
  setDoc, updateDoc, deleteDoc, writeBatch,
} from '../vendor/firebase/firebase-firestore.js';
import { db } from './firebase.js';
import { normalizeEntry, normalizeCategory, toDoc, buildCategory, DEFAULT_CATEGORIES } from './model.js';

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Category} Category */
/** @typedef {import('./store.js').Meta} Meta */

export const BATCH_LIMIT = 400;

/** @param {string} uid */
const entriesCol = (uid) => collection(db, 'users', uid, 'entries');
/** @param {string} uid */
const categoriesCol = (uid) => collection(db, 'users', uid, 'categories');
/** @param {string} uid */
const metaRef = (uid) => doc(db, 'users', uid, 'meta', 'app');
/** @param {string} uid @param {string} id */
const entryRef = (uid, id) => doc(entriesCol(uid), id);
/** @param {string} uid @param {string} id */
const categoryRef = (uid, id) => doc(categoriesCol(uid), id);

/**
 * Apply ops across as many batches as needed and commit them all.
 * @template T @param {T[]} ops @param {(batch: any, op: T) => void} apply
 */
function commitInChunks(ops, apply) {
  const commits = [];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) apply(batch, op);
    commits.push(batch.commit());
  }
  return Promise.all(commits).then(() => undefined);
}

/* ---------- First run ---------- */

/**
 * Create meta/app (and the default categories) for a brand-new account.
 * Awaits the reads; the write is fired without waiting for the server.
 * @param {string} uid @param {number} [now]
 * @returns {Promise<boolean>} true when it seeded
 */
export async function ensureFirstRun(uid, now = Date.now()) {
  const meta = await getDoc(metaRef(uid));
  if (meta.exists()) return false;
  const existingCategories = await getDocs(query(categoriesCol(uid), limit(1)));
  const batch = writeBatch(db);
  batch.set(metaRef(uid), { schemaVersion: 2, createdAt: now, lastBackupAt: null, backupNudgeDismissedAt: null });
  if (existingCategories.empty) {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      const cat = buildCategory({ name: c.name, color: c.color, order: i }, now);
      batch.set(categoryRef(uid, cat.id), toDoc(cat));
    });
  }
  batch.commit().catch((err) => console.error('first-run write failed', err));
  return true;
}

/* ---------- Subscriptions ---------- */

/**
 * @param {string} uid
 * @param {(entries: Entry[], pending: boolean) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeEntries(uid, onData, onError) {
  return onSnapshot(entriesCol(uid), { includeMetadataChanges: true }, (snap) => {
    onData(snap.docs.map((d) => normalizeEntry(d.id, d.data())), snap.metadata.hasPendingWrites);
  }, onError);
}

/**
 * @param {string} uid
 * @param {(categories: Category[], pending: boolean) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeCategories(uid, onData, onError) {
  return onSnapshot(categoriesCol(uid), { includeMetadataChanges: true }, (snap) => {
    const cats = snap.docs.map((d) => normalizeCategory(d.id, d.data()));
    cats.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    onData(cats, snap.metadata.hasPendingWrites);
  }, onError);
}

/**
 * @param {string} uid
 * @param {(meta: Meta|null) => void} onData
 * @param {(err: Error) => void} onError
 */
export function subscribeMeta(uid, onData, onError) {
  return onSnapshot(metaRef(uid), {}, (snap) => {
    onData(snap.exists() ? /** @type {Meta} */ (snap.data()) : null);
  }, onError);
}

/* ---------- Entries ---------- */

/** @param {string} uid @param {Entry} entry */
export function addEntry(uid, entry) {
  return setDoc(entryRef(uid, entry.id), toDoc(entry));
}

/** @param {string} uid @param {string} id @param {Partial<Entry>} patch */
export function updateEntry(uid, id, patch) {
  return updateDoc(entryRef(uid, id), patch);
}

/** @param {string} uid @param {string} id @param {number} [now] */
export function trashEntry(uid, id, now = Date.now()) {
  return updateEntry(uid, id, { deletedAt: now, updatedAt: now });
}

/** @param {string} uid @param {string} id @param {number} [now] */
export function restoreEntry(uid, id, now = Date.now()) {
  return updateEntry(uid, id, { deletedAt: null, updatedAt: now });
}

/** @param {string} uid @param {string} id */
export function deleteEntryForever(uid, id) {
  return deleteDoc(entryRef(uid, id));
}

/** Permanently delete the given (trashed) entries. @param {string} uid @param {string[]} ids */
export function emptyTrash(uid, ids) {
  return commitInChunks(ids, (b, id) => b.delete(entryRef(uid, id)));
}

/* ---------- Categories ---------- */

/** @param {string} uid @param {Category} category */
export function addCategory(uid, category) {
  return setDoc(categoryRef(uid, category.id), toDoc(category));
}

/** @param {string} uid @param {string} id @param {Partial<Category>} patch */
export function updateCategory(uid, id, patch) {
  return updateDoc(categoryRef(uid, id), patch);
}

/** @param {string} uid @param {string[]} orderedIds */
export function reorderCategories(uid, orderedIds) {
  return commitInChunks(orderedIds.map((id, order) => ({ id, order })), (b, op) => b.update(categoryRef(uid, op.id), { order: op.order }));
}

/**
 * Move a category's entries to another category (or none), then delete it.
 * @param {string} uid @param {string} id @param {string[]} entryIds
 * @param {string|null} reassignTo @param {number} [now]
 */
export function deleteCategory(uid, id, entryIds, reassignTo, now = Date.now()) {
  /** @type {({ kind: 'move', id: string } | { kind: 'delete' })[]} */
  const ops = entryIds.map((eid) => ({ kind: /** @type {'move'} */ ('move'), id: eid }));
  ops.push({ kind: 'delete' });
  return commitInChunks(ops, (b, op) => {
    if (op.kind === 'move') b.update(entryRef(uid, op.id), { categoryId: reassignTo, updatedAt: now });
    else b.delete(categoryRef(uid, id));
  });
}

/* ---------- Import & meta ---------- */

/** @param {string} uid @param {{ entries: Entry[], categories: Category[] }} data */
export function importData(uid, { entries, categories }) {
  const ops = [
    ...categories.map((c) => ({ ref: categoryRef(uid, c.id), data: toDoc(c) })),
    ...entries.map((e) => ({ ref: entryRef(uid, e.id), data: toDoc(e) })),
  ];
  return commitInChunks(ops, (b, op) => b.set(op.ref, op.data));
}

/** @param {string} uid @param {Partial<Meta>} patch */
export function updateMeta(uid, patch) {
  return setDoc(metaRef(uid), patch, { merge: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/db.test.js`
Expected: all green. Then `npm test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "$(cat <<'EOF'
feat: add Firestore data layer with first-run seed and batched writes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Screens

UI modules below are verified in the browser rather than by unit tests (Global Constraints). Every screen task ends with a **Browser check** step: run `npm run serve`, open `http://localhost:8080/`, sign in (localhost is an authorised Firebase domain by default), and check exactly what the step lists at a 390 px wide viewport *and* a desktop window, in dark and light. Use DevTools → Console: there must be no errors.

### Task 18: `src/ui/sheet.js` and `src/ui/toast.js`

Implements spec §4.5 (bottom sheet on phones, centred dialog ≥ 720 px; dismissing a dirty form asks "Discard changes?" with *Keep editing* / *Discard* inline — never `window.confirm`), §3 (sheets push a history entry so Back closes them), §5 Accessibility (`role="dialog"`, `aria-modal`, focus trap, Esc closes, focus returns to the opener; toast is `role="status"` with a real Undo button), §5 Motion.

**Design notes:**
- `openSheet` pushes `{ ...history.state, dtSheet: id }` (keeping `dtDepth`, so the router's depth tracking is unaffected). Back fires `popstate` without `hashchange`; the module-level `popstate` listener asks the topmost sheet to close. If that sheet is dirty, the discard bar appears and the history entry is pushed again so the sheet stays "on the stack".
- Closing by button/Esc/backdrop consumes the sheet's history entry with `history.back()`. That is asynchronous, so `close()` returns a promise that resolves once the matching `popstate` has been seen (or after 400 ms as a safety net). `onClose` runs after that, so callers that navigate from `onClose` (or after `await confirmSheet(…)`) can never have their navigation undone by the pending Back.
- Reserved `data-action` names inside a sheet: `dismiss`, `keep`, `discard`. Content must not use them.

**Files:**
- Create: `src/ui/sheet.js`, `src/ui/toast.js`

**Interfaces:**
- Consumes: `html`, `setHTML`, `delegate`, `focusFirst`, `FOCUSABLE` (Task 9); `icon` (Task 14).
- Produces:
  - `openSheet(opts): SheetAPI` where `opts = { title: string, render: (content: HTMLElement, api: SheetAPI) => (void | (() => void)), isDirty?: () => boolean, className?: string, onClose?: () => void }`. `render` fills `content` with `<div class="sheet-body">…</div>` and optionally `<div class="sheet-foot">…</div>`, binds its own handlers, and may return a cleanup function.
  - `SheetAPI = { id: number, el: HTMLElement /* .sheet */, content: HTMLElement, close(): Promise<void> /* force, no dirty check */, requestClose(): void /* dirty-checked */, setTitle(t: string): void }`
  - `confirmSheet({ title, message?, confirmLabel?='Confirm', cancelLabel?='Cancel', danger?=false }): Promise<boolean>`
  - `toast(message: string, opts?: { actionLabel?: string, onAction?: () => void, duration?: number }): { dismiss(): void } | undefined` — one toast at a time; default duration 3 s, 6 s with an action; the timer pauses while the toast has focus or hover
  - `guard(promise: Promise<unknown>, message?: string): void` — logs and toasts write failures. Default message: "Couldn't save. Check your connection and try again."

- [ ] **Step 1: Implement `src/ui/toast.js`**

```js
import { html, setHTML } from './dom.js';

/** @type {{ dismiss: () => void } | null} */
let current = null;

/**
 * Show a toast. Only one is visible at a time; a new one replaces the old.
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [opts]
 */
export function toast(message, { actionLabel, onAction, duration } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return undefined;
  current?.dismiss();

  const el = document.createElement('div');
  el.className = 'toast';
  setHTML(el, html`<span class="toast-text">${message}</span>${actionLabel ? html`<button type="button" class="toast-action">${actionLabel}</button>` : ''}`);
  host.append(el);

  const ms = duration ?? (actionLabel ? 6000 : 3000);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const start = () => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };
  const pause = () => clearTimeout(timer);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
    if (current === handle) current = null;
  }
  const handle = { dismiss };

  el.querySelector('.toast-action')?.addEventListener('click', () => { dismiss(); onAction?.(); });
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', start);
  el.addEventListener('pointerenter', pause);
  el.addEventListener('pointerleave', start);

  requestAnimationFrame(() => el.classList.add('is-visible'));
  start();
  current = handle;
  return handle;
}

/**
 * Report a failed Firestore write without blocking the UI on it.
 * @param {Promise<unknown>} promise
 * @param {string} [message]
 */
export function guard(promise, message = "Couldn't save. Check your connection and try again.") {
  promise.catch((err) => {
    console.error(err);
    toast(message);
  });
}
```

- [ ] **Step 2: Implement `src/ui/sheet.js`**

```js
import { html, setHTML, delegate, focusFirst, FOCUSABLE } from './dom.js';
import { icon } from './icons.js';

/**
 * @typedef {{ id: number, el: HTMLElement, content: HTMLElement, close: () => Promise<void>,
 *             requestClose: () => void, setTitle: (t: string) => void }} SheetAPI
 */

let seq = 0;
/** Open sheets, topmost last. @type {(SheetAPI & { _onPop: () => void })[]} */
const stack = [];
/** Resolvers waiting for the popstate caused by our own history.back(). @type {(() => void)[]} */
const backWaiters = [];

window.addEventListener('popstate', () => {
  if (backWaiters.length) { /** @type {() => void} */ (backWaiters.shift())(); return; }
  stack[stack.length - 1]?._onPop();
});

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {{ title: string, render: (content: HTMLElement, api: SheetAPI) => (void | (() => void)),
 *           isDirty?: () => boolean, className?: string, onClose?: () => void }} opts
 * @returns {SheetAPI}
 */
export function openSheet({ title, render, isDirty = () => false, className = '', onClose }) {
  const id = ++seq;
  const opener = document.activeElement;
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  setHTML(layer, html`
    <div class="sheet-backdrop" data-action="dismiss"></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-labelledby="sheet-title-${id}">
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 id="sheet-title-${id}">${title}</h2>
        <button type="button" class="icon-btn" data-action="dismiss" aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-content"></div>
      <div class="sheet-discard" hidden>
        <p>Discard changes?</p>
        <button type="button" class="btn btn-secondary" data-action="keep">Keep editing</button>
        <button type="button" class="btn btn-danger" data-action="discard">Discard</button>
      </div>
    </section>`);

  const sheetEl = /** @type {HTMLElement} */ (layer.querySelector('.sheet'));
  const content = /** @type {HTMLElement} */ (layer.querySelector('.sheet-content'));
  const discardBar = /** @type {HTMLElement} */ (layer.querySelector('.sheet-discard'));
  let closed = false;
  /** @type {void | (() => void)} */
  let cleanup;

  function showDiscard() {
    discardBar.hidden = false;
    /** @type {HTMLElement} */ (discardBar.querySelector('[data-action="keep"]')).focus();
  }

  /** @param {{ historyDone?: boolean }} [o] */
  function close({ historyDone = false } = {}) {
    if (closed) return Promise.resolve();
    closed = true;
    stack.splice(stack.indexOf(api), 1);
    offClick();
    layer.removeEventListener('keydown', onKey);
    if (typeof cleanup === 'function') cleanup();
    layer.classList.remove('is-open');
    setTimeout(() => layer.remove(), reducedMotion() ? 0 : 260);
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();

    const settled = historyDone || history.state?.dtSheet !== id
      ? Promise.resolve()
      : new Promise((resolve) => {
        const done = () => { clearTimeout(t); resolve(undefined); };
        const t = setTimeout(() => { const i = backWaiters.indexOf(done); if (i >= 0) backWaiters.splice(i, 1); resolve(undefined); }, 400);
        backWaiters.push(done);
        history.back();
      });
    return settled.then(() => { onClose?.(); });
  }

  function requestClose() {
    if (isDirty()) showDiscard();
    else close();
  }

  /** Back button while this sheet is on top. The sheet's history entry is already gone. */
  function onPop() {
    if (isDirty()) {
      history.pushState({ ...(history.state || {}), dtSheet: id }, '');
      showDiscard();
    } else {
      close({ historyDone: true });
    }
  }

  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (stack[stack.length - 1] !== api) return;
    if (ev.key === 'Escape') { ev.preventDefault(); requestClose(); return; }
    if (ev.key !== 'Tab') return;
    const items = [...sheetEl.querySelectorAll(FOCUSABLE)].filter((el) => /** @type {HTMLElement} */ (el).offsetParent !== null);
    if (!items.length) return;
    const first = /** @type {HTMLElement} */ (items[0]);
    const last = /** @type {HTMLElement} */ (items[items.length - 1]);
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  const offClick = delegate(layer, 'click', {
    dismiss: () => requestClose(),
    keep: () => { discardBar.hidden = true; focusFirst(content); },
    discard: () => close(),
  });
  layer.addEventListener('keydown', onKey);

  const api = {
    id,
    el: sheetEl,
    content,
    close: () => close(),
    requestClose,
    /** @param {string} t */
    setTitle: (t) => { /** @type {HTMLElement} */ (layer.querySelector(`#sheet-title-${id}`)).textContent = t; },
    _onPop: onPop,
  };

  /** @type {HTMLElement} */ (document.getElementById('sheets')).append(layer);
  history.pushState({ ...(history.state || {}), dtSheet: id }, '');
  stack.push(api);
  cleanup = render(content, api);
  requestAnimationFrame(() => {
    layer.classList.add('is-open');
    if (content.querySelector('[autofocus]') || content.querySelector(FOCUSABLE)) focusFirst(content);
    else /** @type {HTMLElement} */ (layer.querySelector('[data-action="dismiss"].icon-btn')).focus();
  });
  return api;
}

/**
 * A small confirm dialog. Resolves after the sheet has fully closed.
 * @param {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmSheet({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title,
      className: 'sheet--confirm',
      onClose: () => resolve(result),
      render(content, api) {
        setHTML(content, html`
          ${message ? html`<div class="sheet-body"><p>${message}</p></div>` : ''}
          <div class="sheet-foot">
            <button type="button" class="btn btn-secondary" data-action="cancel" ${danger ? 'autofocus' : ''}>${cancelLabel}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="ok" ${danger ? '' : 'autofocus'}>${confirmLabel}</button>
          </div>`);
        return delegate(content, 'click', {
          cancel: () => api.close(),
          ok: () => { result = true; api.close(); },
        });
      },
    });
  });
}
```

Note on `${danger ? 'autofocus' : ''}` inside a tag: the interpolated string is escaped text (`autofocus`), which is a valid bare attribute. Only ever interpolate literal attribute names this way.

- [ ] **Step 3: Browser check (temporary harness)**

Create a throwaway file `dev/sheet-check.html` (do **not** commit it):
```html
<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="../styles/tokens.css"><link rel="stylesheet" href="../styles/base.css"><link rel="stylesheet" href="../styles/components.css"></head>
<body><div id="sprite"></div><div id="app" style="padding:16px;display:grid;gap:8px">
<button class="btn btn-primary" id="a">Open dirty sheet</button><button class="btn btn-secondary" id="b">Confirm</button><button class="btn btn-secondary" id="c">Toast with Undo</button><p id="out"></p></div>
<div id="sheets"></div><div id="toasts" class="toasts" role="status" aria-live="polite"></div>
<script type="module">
  import { openSheet, confirmSheet } from '../src/ui/sheet.js';
  import { toast } from '../src/ui/toast.js';
  document.getElementById('sprite').innerHTML = await (await fetch('../assets/icons/sprite.svg')).text();
  const out = document.getElementById('out');
  document.getElementById('a').onclick = () => openSheet({ title: 'Edit', isDirty: () => document.getElementById('t').value !== '',
    render(c) { c.innerHTML = '<div class="sheet-body"><label class="field"><span class="field-label">Title</span><input id="t" class="input" autofocus></label></div><div class="sheet-foot"><button class="btn btn-primary">Save</button></div>'; } });
  document.getElementById('b').onclick = async () => { out.textContent = 'confirmed: ' + await confirmSheet({ title: 'Empty trash?', message: 'This cannot be undone.', confirmLabel: 'Empty trash', danger: true }); };
  document.getElementById('c').onclick = () => toast('Moved to Trash', { actionLabel: 'Undo', onAction: () => { out.textContent = 'undone'; } });
</script></body></html>
```
Run `npm run serve`, open `http://localhost:8080/dev/sheet-check.html` and check:
1. "Open dirty sheet": the sheet slides up (centred dialog on a wide window); the Title input has focus; Tab/Shift+Tab stay inside the sheet.
2. With the input empty: Esc, backdrop click, the ✕ button and the browser Back button each close it, and focus returns to the opener button. After closing with ✕, pressing Back once does **not** reopen anything and does not leave the page.
3. Type something: Esc / backdrop / ✕ / browser Back each show "Discard changes?" instead of closing; *Keep editing* hides the bar; *Discard* closes. After Back → Keep editing → ✕ → Discard, one more Back leaves the page's previous history entry as expected (no stale sheet entries).
4. "Confirm": Cancel has focus; "Empty trash" prints `confirmed: true`, Cancel/Esc print `confirmed: false`.
5. "Toast with Undo": the toast appears above the bottom edge and disappears after ~6 s; Undo prints `undone`; a screen reader (or the Accessibility pane) shows the text in the `status` region.

Delete `dev/sheet-check.html` afterwards.

- [ ] **Step 4: Commit**

```bash
git add src/ui/sheet.js src/ui/toast.js
git commit -m "$(cat <<'EOF'
feat: add accessible bottom sheets, confirm dialog and toasts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Boot — `main.js`, `ui/app.js`, `ui/landing.js`

Implements spec §4.1 Landing (copy, Continue with Google, offline message, footer), §4.2 Loading (wordmark + spinner; error screen with Retry — never an empty journal), §7 First run, §8 (snapshot subscriptions, sync state, offline pill "Offline — changes will sync"), §3 Routing (screen switcher; Back returns to the Timeline at the same scroll position), §5 Motion (screen push 200 ms).

**Design notes:**
- `main.js` owns the session: on sign-in it awaits `ensureFirstRun`, then subscribes to entries, categories and meta. Status becomes `ready` only when both the entries and the categories snapshots have arrived. Any failure before `ready` → `status: 'error'`; a listener error after `ready` → `sync: 'error'` plus a toast (Firestore listeners stop after an error, so the message says to reload).
- `app.js` keeps a registry `SCREENS` (route name → mount function). Later tasks add one import and one registry line each. Routes with no registered screen render a small "Nothing here" screen.
- Each screen's `mount(root, params)` returns `{ unmount }`. `app.js` remounts only when the *key* changes (status, or the hash when ready), remembers `scrollY` per key, and restores it after mounting — this is what brings the Timeline back to the same place after Entry detail.
- The banner (offline pill, and later "Update ready") is a fixed layer centred under the header, outside the screens, so screens never have to render it.

**Files:**
- Create: `src/main.js`, `src/ui/app.js`, `src/ui/landing.js`
- Modify: `styles/screens.css` (landing, loading, error, banner, screen-enter)

**Interfaces:**
- Consumes: `initTheme` (T12); `store`, `initialState` (T10); `startRouter`, `currentRoute`, `onRouteChange` (T11); `watchAuth`, `completeRedirect`, `signIn` (T13); `ensureFirstRun`, `subscribeEntries`, `subscribeCategories`, `subscribeMeta` (T17); `toast` (T18); `html`, `setHTML`, `delegate` (T9); `icon` (T14).
- Produces:
  - `startApp(root: HTMLElement, hooks: { onRetry: () => void, onReload: () => void }): void` (`src/ui/app.js`)
  - `SCREENS` registry in `src/ui/app.js` (not exported; edited by Tasks 20, 22, 23, 24)
  - `mountLanding(root)`, `mountLoading(root)`, `mountError(root, { message, onRetry })`, `logoMark(): Raw` (`src/ui/landing.js`)
  - Screen contract used by every later screen: `(root: HTMLElement, params: { id?: string, section?: string }) => { unmount(): void }`

- [ ] **Step 1: Create `src/ui/landing.js`**

```js
import { html, raw, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { signIn } from '../firebase.js';

/** The app mark (same geometry as assets/icons/favicon.svg). */
export function logoMark() {
  return raw('<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--accent)"/><circle cx="32" cy="32" r="15" fill="none" stroke="var(--on-accent)" stroke-width="5"/><circle cx="32" cy="32" r="5" fill="var(--on-accent)"/></svg>');
}

/** @param {HTMLElement} root */
export function mountLanding(root) {
  let error = '';
  let busy = false;
  const render = () => setHTML(root, html`
    <main class="landing">
      ${logoMark()}
      <h1 class="landing-title">DateTracker</h1>
      <p class="landing-tagline">Moments worth remembering.</p>
      <ul class="landing-features">
        <li>${icon('calendar')}<span>A private journal of the moments that matter</span></li>
        <li>${icon('clock')}<span>On this day — what happened in years past</span></li>
        <li>${icon('bell')}<span>Reminders for renewals &amp; anniversaries</span></li>
      </ul>
      ${navigator.onLine
        ? html`<button type="button" class="btn btn-primary btn-block landing-cta" data-action="signin" ${busy ? 'disabled' : ''}>Continue with Google</button>`
        : html`<p class="landing-offline">${icon('cloud-off')}<span>You're offline — connect to sign in.</span></p>`}
      ${error ? html`<p class="field-error landing-error" role="alert">${error}</p>` : ''}
      <p class="landing-foot">Private · Free · No ads</p>
    </main>`);

  const off = delegate(root, 'click', {
    signin: () => {
      busy = true; error = ''; render();
      signIn()
        .catch((err) => { console.error(err); error = 'Sign-in failed. Please try again.'; })
        .finally(() => { busy = false; if (root.isConnected) render(); });
    },
  });
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
  return {
    unmount() {
      off();
      window.removeEventListener('online', render);
      window.removeEventListener('offline', render);
    },
  };
}

/** @param {HTMLElement} root */
export function mountLoading(root) {
  setHTML(root, html`
    <main class="boot" aria-busy="true">
      ${logoMark()}
      <p class="boot-title">DateTracker</p>
      <div class="spinner" role="progressbar" aria-label="Loading"></div>
    </main>`);
  return { unmount() {} };
}

/** @param {HTMLElement} root @param {{ message: string, onRetry: () => void }} opts */
export function mountError(root, { message, onRetry }) {
  setHTML(root, html`
    <main class="boot">
      ${icon('circle-alert', { cls: 'boot-alert' })}
      <h1 class="boot-title">Couldn't load your journal</h1>
      <p class="boot-message">${message}</p>
      <button type="button" class="btn btn-primary" data-action="retry">Retry</button>
    </main>`);
  const off = delegate(root, 'click', { retry: () => onRetry() });
  return { unmount: off };
}
```

- [ ] **Step 2: Create `src/ui/app.js`**

```js
import { store } from '../store.js';
import { currentRoute, onRouteChange } from '../router.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { mountLanding, mountLoading, mountError } from './landing.js';

/** @typedef {(root: HTMLElement, params: { id?: string, section?: string }) => { unmount(): void }} MountFn */

/** Route name → screen. Tasks 20, 22, 23 and 24 add their screens here. @type {Record<string, MountFn>} */
const SCREENS = {
};

/** @type {MountFn} */
function mountNotFound(root) {
  setHTML(root, html`
    <main class="screen">
      <div class="empty">
        <h2>Nothing here.</h2>
        <p><a href="#/">Go to your journal</a></p>
      </div>
    </main>`);
  return { unmount() {} };
}

/**
 * Mount the right screen for the current status + route, and the banner layer.
 * @param {HTMLElement} root
 * @param {{ onRetry: () => void, onReload: () => void }} hooks
 */
export function startApp(root, { onRetry, onReload }) {
  setHTML(root, html`<div class="banner" id="banner"></div><div id="screen" tabindex="-1"></div>`);
  const bannerEl = /** @type {HTMLElement} */ (root.querySelector('#banner'));
  const screenEl = /** @type {HTMLElement} */ (root.querySelector('#screen'));
  /** @type {{ unmount(): void } | null} */
  let mounted = null;
  let mountedKey = '';
  /** @type {Map<string, number>} */
  const scrollMemory = new Map();

  function show() {
    const s = store.get();
    /** @type {string} */ let key;
    /** @type {(r: HTMLElement) => { unmount(): void }} */ let mount;
    if (s.status === 'loading') { key = 'loading'; mount = mountLoading; }
    else if (s.status === 'signedOut') { key = 'landing'; mount = mountLanding; }
    else if (s.status === 'error') { key = `error:${s.error}`; mount = (r) => mountError(r, { message: s.error, onRetry }); }
    else {
      const route = currentRoute();
      key = `route:${route.name}:${route.params.id || route.params.section || ''}`;
      mount = (r) => (SCREENS[route.name] || mountNotFound)(r, route.params);
    }
    if (key === mountedKey) return;

    const hadFocus = screenEl.contains(document.activeElement);
    if (mounted) { scrollMemory.set(mountedKey, window.scrollY); mounted.unmount(); }
    screenEl.replaceChildren();
    mountedKey = key;
    mounted = mount(screenEl);
    window.scrollTo(0, scrollMemory.get(key) || 0);
    screenEl.classList.remove('is-entering');
    void screenEl.offsetWidth;
    screenEl.classList.add('is-entering');
    if (hadFocus || document.activeElement === document.body) screenEl.focus({ preventScroll: true });
  }

  let bannerKey = '';
  function renderBanner() {
    const s = store.get();
    const key = `${s.online}|${s.updateReady}|${s.status}`;
    if (key === bannerKey) return;
    bannerKey = key;
    const signedIn = s.status === 'ready';
    setHTML(bannerEl, html`
      ${!s.online && signedIn ? html`<div class="pill">${icon('cloud-off', { cls: 'icon-sm' })}<span>Offline — changes will sync</span></div>` : ''}
      ${s.updateReady ? html`<div class="pill"><span>Update ready</span><span aria-hidden="true">·</span><button type="button" data-action="reload">Reload</button></div>` : ''}`);
  }
  delegate(bannerEl, 'click', { reload: () => onReload() });

  store.subscribe(() => { show(); renderBanner(); });
  onRouteChange(show);
  show();
  renderBanner();
}
```

- [ ] **Step 3: Create `src/main.js`**

```js
/**
 * Boot: theme → router → auth → first run → live subscriptions → screens.
 */
import { initTheme } from './theme.js';
import { store, initialState } from './store.js';
import { startRouter } from './router.js';
import { watchAuth, completeRedirect } from './firebase.js';
import { ensureFirstRun, subscribeEntries, subscribeCategories, subscribeMeta } from './db.js';
import { startApp } from './ui/app.js';
import { toast } from './ui/toast.js';

history.scrollRestoration = 'manual';
initTheme();
startRouter();

/** @type {() => void} */
let stopSession = () => {};
/** @type {any} */
let currentUser = null;

/** @param {any} u */
function toUser(u) {
  return { uid: u.uid, name: u.displayName || '', email: u.email || '', photoURL: u.photoURL || '' };
}

/** @param {unknown} err */
function failBoot(err) {
  console.error(err);
  store.set({
    status: 'error',
    error: navigator.onLine
      ? 'Check your connection and try again.'
      : "You're offline, and this device hasn't loaded your journal yet. Connect and try again.",
  });
}

/** @param {any} fbUser */
async function startSession(fbUser) {
  stopSession();
  const user = toUser(fbUser);
  store.set({ ...initialState(), status: 'loading', user });

  /** @type {(() => void)[]} */
  const unsubs = [];
  let cancelled = false;
  stopSession = () => { cancelled = true; unsubs.splice(0).forEach((u) => u()); };

  try {
    await ensureFirstRun(user.uid);
  } catch (err) {
    if (!cancelled) failBoot(err);
    return;
  }
  if (cancelled) return;

  let gotEntries = false;
  let gotCategories = false;
  let pendingEntries = false;
  let pendingCategories = false;
  const sync = () => (pendingEntries || pendingCategories ? 'pending' : 'clean');
  const maybeReady = () => {
    if (gotEntries && gotCategories && store.get().status === 'loading') store.set({ status: 'ready' });
  };
  /** @param {unknown} err */
  const onError = (err) => {
    if (store.get().status !== 'ready') { failBoot(err); return; }
    console.error(err);
    store.set({ sync: 'error' });
    toast('Sync stopped. Reload the app to reconnect.');
  };

  unsubs.push(subscribeEntries(user.uid, (entries, pending) => {
    gotEntries = true;
    pendingEntries = pending;
    store.set({ entries, sync: store.get().sync === 'error' ? 'error' : sync() });
    maybeReady();
  }, onError));
  unsubs.push(subscribeCategories(user.uid, (categories, pending) => {
    gotCategories = true;
    pendingCategories = pending;
    store.set({ categories, sync: store.get().sync === 'error' ? 'error' : sync() });
    maybeReady();
  }, onError));
  unsubs.push(subscribeMeta(user.uid, (meta) => store.set({ meta }), onError));
}

startApp(/** @type {HTMLElement} */ (document.getElementById('app')), {
  onRetry: () => { if (currentUser) startSession(currentUser); },
  onReload: () => location.reload(),
});

completeRedirect();
watchAuth((u) => {
  if (u && currentUser && u.uid === currentUser.uid && store.get().status !== 'signedOut') return;
  currentUser = u;
  if (u) startSession(u);
  else { stopSession(); store.set({ ...initialState(), status: 'signedOut' }); }
});

window.addEventListener('online', () => store.set({ online: true }));
window.addEventListener('offline', () => store.set({ online: false }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') store.set((s) => ({ tick: s.tick + 1 }));
});
```

- [ ] **Step 4: Start `styles/screens.css`**

Replace the empty file with:
```css
/* ---------- Boot: landing, loading, error ---------- */
.logo-mark { width: 64px; height: 64px; }

.landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: calc(var(--sp-12) + env(safe-area-inset-top)) var(--sp-6) calc(var(--sp-8) + env(safe-area-inset-bottom));
  text-align: center;
}
.landing-title { margin-top: var(--sp-5); font-size: var(--fs-5); }
.landing-tagline { margin-top: var(--sp-2); font-size: var(--fs-4); color: var(--text-2); }
.landing-features { display: grid; gap: var(--sp-4); width: 100%; margin: var(--sp-12) 0; text-align: left; }
.landing-features li { display: flex; align-items: center; gap: var(--sp-4); color: var(--text-2); }
.landing-features .icon { color: var(--accent); width: 24px; height: 24px; }
.landing-cta { margin-top: auto; }
.landing-offline { display: flex; align-items: center; gap: var(--sp-2); margin-top: auto; color: var(--text-2); }
.landing-error { margin-top: var(--sp-3); }
.landing-foot { margin-top: var(--sp-6); font-size: var(--fs-2); color: var(--text-3); }

.boot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  min-height: 100dvh;
  padding: var(--sp-6);
  text-align: center;
}
.boot-title { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.boot-message { max-width: 360px; color: var(--text-2); }
.boot-alert { width: 32px; height: 32px; color: var(--danger); }

/* ---------- App frame ---------- */
#screen:focus { outline: none; }
#screen.is-entering { animation: screen-in var(--dur-push) var(--ease-out); }
@keyframes screen-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }

.banner {
  position: fixed;
  top: calc(env(safe-area-inset-top) + var(--topbar-h) + var(--sp-1));
  left: 0;
  right: 0;
  z-index: 15;
  display: grid;
  justify-items: center;
  gap: var(--sp-2);
  padding: 0 var(--gutter);
  pointer-events: none;
}
.banner .pill { pointer-events: auto; }
```

- [ ] **Step 5: Browser check**

`npm run serve`, open `http://localhost:8080/`:
1. Signed out: the landing shows the mark, "DateTracker", "Moments worth remembering.", three feature lines with accent icons, **Continue with Google**, and "Private · Free · No ads". DevTools → Network → Offline: the button is replaced by "You're offline — connect to sign in."; back online restores it.
2. Sign in (popup). The loading screen shows briefly, then the "Nothing here." screen (no screens are registered yet — expected).
3. Firebase console → Firestore: `users/<uid>/meta/app` exists with `schemaVersion: 2`, and `users/<uid>/categories` has Travel, Milestones, Health, Family with `order` 0–3. `users/<uid>/data/main` (v8) is untouched.
4. Reload: no second seed (still exactly 4 categories).
5. DevTools → Network → Offline while signed in: the "Offline — changes will sync" pill appears under the top edge; online hides it.
6. Console: no errors. Network: nothing is fetched from `gstatic.com` or `fonts.googleapis.com` (Google sign-in endpoints are expected).

- [ ] **Step 6: Commit**

```bash
git add src/main.js src/ui/app.js src/ui/landing.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: boot the app with auth, first-run seed, live sync and landing screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: `src/ui/compose.js` — the new/edit sheet

Implements spec §4.5 in full: field order (Title, Date, Category chips with `+ New`, Notes, Star, Reminder, Save/Cancel), placeholders, limits, reminder defaults (Once = entry date 09:00 if in the future, else tomorrow 09:00; Every year = 09:00 on the entry's month/day), inline validation under fields (never a toast), dirty dismiss → "Discard changes?".

**Design notes:**
- The form is rendered **once**; afterwards only three regions re-render: the category chips (`#c-cats-N`), the reminder box (`#c-rem-N`), and error lines. That keeps focus and caret stable while typing.
- `html` renders booleans as empty strings, so boolean attributes are written as `aria-pressed="${String(x)}"` or `${x ? 'checked' : ''}`. This applies to every UI task.
- A category made with `+ New` is kept in memory (`pendingCategory`) and only written on Save if the saved entry uses it. Its id is generated client-side, so the entry can reference it without waiting for the server.
- Writes are fired with `guard()` and the sheet closes immediately (offline-safe).

**Files:**
- Create: `src/ui/compose.js`
- Modify: `styles/screens.css` (append compose section)

**Interfaces:**
- Consumes: `openSheet` (T18); `guard`, `toast` (T18); `store` (T10); `addEntry`, `updateEntry`, `addCategory` (T17); `validateEntry`, `buildEntry`, `entryPatch`, `buildCategory`, `nextPaletteColor`, `validateCategoryName`, `LIMITS` (T3); `todayISO`, `parseISODate`, `toDateTimeLocal`, `formatDayMonth` (T2); `html`, `setHTML`, `delegate` (T9); `icon` (T14).
- Produces: `openCompose(opts?: { entry?: Entry }): void`

- [ ] **Step 1: Implement `src/ui/compose.js`**

```js
import { store } from '../store.js';
import { addEntry, updateEntry, addCategory } from '../db.js';
import {
  validateEntry, buildEntry, entryPatch, buildCategory, nextPaletteColor, validateCategoryName, LIMITS,
} from '../model.js';
import { todayISO, parseISODate, toDateTimeLocal, formatDayMonth } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { guard, toast } from './toast.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */

let formSeq = 0;

/** Once-reminder default: the entry date at 09:00 if that is still ahead, otherwise tomorrow 09:00. @param {string} dateISO */
function defaultOnceAt(dateISO, now = new Date()) {
  const d = parseISODate(dateISO);
  if (d) {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
    if (at.getTime() > now.getTime()) return toDateTimeLocal(at);
  }
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return toDateTimeLocal(t);
}

/** @param {{ entry?: Entry }} [opts] */
export function openCompose({ entry } = {}) {
  const s = store.get();
  if (!s.user) return;
  const uid = s.user.uid;
  const n = ++formSeq;
  const ids = { form: `c-form-${n}`, title: `c-title-${n}`, date: `c-date-${n}`, notes: `c-notes-${n}`, cats: `c-cats-${n}`, rem: `c-rem-${n}` };

  const r = entry?.reminder;
  const state = {
    title: entry?.title ?? '',
    date: entry?.date ?? todayISO(),
    categoryId: entry ? entry.categoryId : (s.ui.categoryId !== 'all' ? s.ui.categoryId : null),
    notes: entry?.notes ?? '',
    starred: entry?.starred ?? false,
    reminderOn: Boolean(r),
    reminderKind: r?.kind ?? 'yearly',
    onceAt: r?.kind === 'once' ? r.at : '',
    yearlyTime: r?.kind === 'yearly' ? r.time : '09:00',
  };
  const initial = JSON.stringify(state);
  /** @type {Category|null} */
  let pendingCategory = null;
  let newCatOpen = false;
  /** @type {Record<string, string>} */
  let errors = {};

  const allCategories = () => (pendingCategory ? [...store.get().categories, pendingCategory] : store.get().categories);

  openSheet({
    title: entry ? 'Edit memory' : 'New memory',
    isDirty: () => JSON.stringify(state) !== initial || pendingCategory !== null,
    render(content, api) {
      setHTML(content, html`
        <form class="sheet-body compose" id="${ids.form}" data-action="submit" novalidate>
          <div class="field">
            <label class="field-label" for="${ids.title}">Title</label>
            <input class="input" id="${ids.title}" name="title" data-action="field" maxlength="${LIMITS.title}"
              placeholder="What happened?" autocomplete="off" required autofocus value="${state.title}"
              aria-describedby="${ids.title}-err">
            <p class="field-error" id="${ids.title}-err" hidden></p>
          </div>
          <div class="field">
            <label class="field-label" for="${ids.date}">Date</label>
            <input class="input" id="${ids.date}" name="date" data-action="field" type="date" required value="${state.date}"
              aria-describedby="${ids.date}-err">
            <p class="field-error" id="${ids.date}-err" hidden></p>
          </div>
          <div class="field">
            <span class="field-label" id="${ids.cats}-label">Category</span>
            <div class="chips is-wrapping" id="${ids.cats}" role="group" aria-labelledby="${ids.cats}-label"></div>
          </div>
          <div class="field">
            <label class="field-label" for="${ids.notes}">Notes</label>
            <textarea class="textarea" id="${ids.notes}" name="notes" data-action="field" maxlength="${LIMITS.notes}" rows="3"
              placeholder="Details, cost, who was there…" aria-describedby="${ids.notes}-err">${state.notes}</textarea>
            <p class="field-error" id="${ids.notes}-err" hidden></p>
          </div>
          <label class="switch-row">
            <span>${icon('star')} Star this memory</span>
            <input type="checkbox" role="switch" name="starred" data-action="field" ${state.starred ? 'checked' : ''}>
          </label>
          <div id="${ids.rem}"></div>
        </form>
        <div class="sheet-foot">
          <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" form="${ids.form}">Save</button>
        </div>`);

      const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (content.querySelector(sel));
      const notesEl = /** @type {HTMLTextAreaElement} */ ($(`#${ids.notes}`));
      const grow = () => { notesEl.style.height = 'auto'; notesEl.style.height = `${notesEl.scrollHeight}px`; };
      requestAnimationFrame(grow);

      let lastCats = '';
      function renderCategories() {
        const cats = allCategories();
        const markup = String(html`
          ${cats.map((c) => html`<button type="button" class="chip" data-action="cat" data-id="${c.id}"
              aria-pressed="${String(state.categoryId === c.id)}" style="--c:${c.color}"><span class="dot"></span>${c.name}</button>`)}
          ${newCatOpen
            ? html`<span class="newcat">
                <input class="input" name="newCategory" placeholder="Category name" maxlength="${LIMITS.categoryName}"
                  aria-label="New category name" autocomplete="off" data-action="newcat-key">
                <button type="button" class="btn btn-secondary" data-action="newcat-add">Add</button>
              </span>
              ${errors.newCategory ? html`<p class="field-error" role="alert">${errors.newCategory}</p>` : ''}`
            : html`<button type="button" class="chip" data-action="newcat-open">${icon('plus', { cls: 'icon-sm' })}New</button>`}`);
        if (markup === lastCats) return;
        const typed = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'))?.value ?? '';
        lastCats = markup;
        setHTML($(`#${ids.cats}`), markup);
        const input = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'));
        if (input) { input.value = typed; }
      }

      function renderReminder() {
        const box = $(`#${ids.rem}`);
        if (!state.reminderOn) {
          setHTML(box, html`<button type="button" class="reminder-toggle" data-action="reminder-open">${icon('bell')}<span>Add a reminder</span></button>`);
          return;
        }
        setHTML(box, html`
          <div class="field reminder-box">
            <div class="reminder-head">
              <span class="field-label" id="${ids.rem}-label">Reminder</span>
              <button type="button" class="btn btn-quiet" data-action="reminder-remove">Remove</button>
            </div>
            <div class="segmented" role="group" aria-labelledby="${ids.rem}-label">
              <button type="button" data-action="kind" data-kind="once" aria-pressed="${String(state.reminderKind === 'once')}">Once</button>
              <button type="button" data-action="kind" data-kind="yearly" aria-pressed="${String(state.reminderKind === 'yearly')}">${icon('repeat', { cls: 'icon-sm' })}Every year</button>
            </div>
            ${state.reminderKind === 'once'
              ? html`<input class="input" type="datetime-local" name="onceAt" data-action="field" value="${state.onceAt}"
                  aria-label="Reminder date and time" aria-describedby="${ids.rem}-err">`
              : html`<input class="input" type="time" name="yearlyTime" data-action="field" value="${state.yearlyTime}"
                  aria-label="Reminder time" aria-describedby="${ids.rem}-hint ${ids.rem}-err">
                <p class="field-hint" id="${ids.rem}-hint">Every year on ${formatDayMonth(state.date) || 'the memory’s date'}.</p>`}
            <p class="field-error" id="${ids.rem}-err" hidden></p>
          </div>`);
      }

      /** Show or clear the error line for a field. @param {string} key @param {string} id */
      function showError(key, id) {
        const line = /** @type {HTMLElement|null} */ (content.querySelector(`#${id}-err`));
        const input = content.querySelector(`[aria-describedby~="${id}-err"]`);
        if (line) { line.textContent = errors[key] || ''; line.hidden = !errors[key]; }
        if (input) input.setAttribute('aria-invalid', String(Boolean(errors[key])));
      }
      function showAllErrors() {
        showError('title', ids.title);
        showError('date', ids.date);
        showError('notes', ids.notes);
        showError('reminder', ids.rem);
      }

      function addNewCategory() {
        const input = /** @type {HTMLInputElement|null} */ (content.querySelector('input[name="newCategory"]'));
        const name = input?.value ?? '';
        const msg = validateCategoryName(name, allCategories());
        if (msg) { errors = { ...errors, newCategory: msg }; renderCategories(); /** @type {HTMLElement} */ (content.querySelector('input[name="newCategory"]')).focus(); return; }
        const cats = allCategories();
        pendingCategory = buildCategory({ name, color: nextPaletteColor(cats), order: cats.length });
        state.categoryId = pendingCategory.id;
        newCatOpen = false;
        delete errors.newCategory;
        renderCategories();
        /** @type {HTMLElement|null} */ (content.querySelector(`[data-id="${pendingCategory.id}"]`))?.focus();
      }

      function save() {
        const input = {
          title: state.title,
          date: state.date,
          notes: state.notes,
          categoryId: state.categoryId,
          starred: state.starred,
          reminder: !state.reminderOn ? null
            : state.reminderKind === 'once' ? { kind: 'once', at: state.onceAt } : { kind: 'yearly', time: state.yearlyTime },
        };
        errors = validateEntry(input);
        showAllErrors();
        const firstBad = content.querySelector('[aria-invalid="true"]');
        if (firstBad) { /** @type {HTMLElement} */ (firstBad).focus(); return; }

        if (pendingCategory && input.categoryId === pendingCategory.id) guard(addCategory(uid, pendingCategory));
        if (entry) guard(updateEntry(uid, entry.id, entryPatch(input)));
        else guard(addEntry(uid, buildEntry(input)));
        api.close();
        toast(entry ? 'Changes saved' : 'Memory saved');
      }

      renderCategories();
      renderReminder();
      const unsub = store.subscribe(renderCategories);

      const offs = [
        delegate(content, 'input', {
          field: (el) => {
            const f = /** @type {HTMLInputElement} */ (el);
            if (f.type === 'checkbox') /** @type {any} */ (state)[f.name] = f.checked;
            else /** @type {any} */ (state)[f.name] = f.value;
            if (f.name === 'notes') grow();
            if (f.name === 'date' && state.reminderOn && state.reminderKind === 'yearly') {
              const hint = content.querySelector(`#${ids.rem}-hint`);
              if (hint) hint.textContent = `Every year on ${formatDayMonth(state.date) || 'the memory’s date'}.`;
            }
          },
        }),
        delegate(content, 'change', {
          field: (el) => { const f = /** @type {HTMLInputElement} */ (el); if (f.type === 'checkbox') state.starred = f.checked; },
        }),
        delegate(content, 'keydown', {
          'newcat-key': (_el, ev) => {
            const k = /** @type {KeyboardEvent} */ (ev);
            if (k.key === 'Enter') { k.preventDefault(); addNewCategory(); }
            if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); newCatOpen = false; delete errors.newCategory; renderCategories(); }
          },
        }),
        delegate(content, 'submit', { submit: (_el, ev) => { ev.preventDefault(); save(); } }),
        delegate(content, 'click', {
          cancel: () => api.requestClose(),
          cat: (el) => {
            const id = el.dataset.id || null;
            state.categoryId = state.categoryId === id ? null : id;
            renderCategories();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-id="${id}"]`))?.focus();
          },
          'newcat-open': () => {
            newCatOpen = true;
            renderCategories();
            /** @type {HTMLElement} */ (content.querySelector('input[name="newCategory"]')).focus();
          },
          'newcat-add': () => addNewCategory(),
          'reminder-open': () => {
            state.reminderOn = true;
            if (!state.onceAt) state.onceAt = defaultOnceAt(state.date);
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector('[data-action="kind"][aria-pressed="true"]'))?.focus();
          },
          'reminder-remove': () => {
            state.reminderOn = false;
            delete errors.reminder;
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector('[data-action="reminder-open"]'))?.focus();
          },
          kind: (el) => {
            state.reminderKind = el.dataset.kind === 'once' ? 'once' : 'yearly';
            if (state.reminderKind === 'once' && !state.onceAt) state.onceAt = defaultOnceAt(state.date);
            delete errors.reminder;
            renderReminder();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-kind="${state.reminderKind}"]`))?.focus();
          },
        }),
      ];
      return () => { unsub(); offs.forEach((off) => off()); };
    },
  });
}
```

Note: the `Escape` handler on the new-category input calls `stopPropagation()` so the sheet's own Esc (dirty-checked close) doesn't also fire.

- [ ] **Step 2: Append compose styles to `styles/screens.css`**

```css
/* ---------- Compose ---------- */
.compose .chips { padding: 0; }
.compose .switch-row span { display: inline-flex; align-items: center; gap: var(--sp-3); }
.compose .switch-row .icon { color: var(--text-3); }
.newcat { display: flex; gap: var(--sp-2); width: 100%; }
.newcat .input { flex: 1; min-width: 0; }
.reminder-toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: var(--tap);
  color: var(--text-2);
  font-weight: var(--fw-medium);
}
.reminder-toggle:hover { color: var(--text-1); }
.reminder-toggle .icon { color: var(--text-3); }
.reminder-box { padding: var(--sp-3) var(--sp-4) var(--sp-4); border-radius: var(--r-card); background: var(--surface-2); gap: var(--sp-3); margin-bottom: 0; }
.reminder-head { display: flex; align-items: center; justify-content: space-between; }
```

- [ ] **Step 3: Browser check (from the console — no screen opens compose yet)**

`npm run serve`, sign in, open DevTools → Console and run:
```js
(await import('/src/ui/compose.js')).openCompose()
```
Check:
1. Title has focus; placeholder "What happened?"; Date is today; categories show Travel, Milestones, Health, Family and "+ New"; Notes placeholder "Details, cost, who was there…"; star switch; "Add a reminder".
2. Save with an empty title → "Give this memory a title." under Title, focus moves to Title, the sheet stays open.
3. Tap a category twice → it toggles off. "+ New" → type "Work" → Enter → a "Work" chip appears, selected. Typing "travel" instead shows "You already have a category with that name." inline.
4. Add a reminder → Once pre-fills tomorrow 09:00 (for today's date); switch to Every year → time 09:00 with "Every year on <today's day month>." Change the date → the hint updates. Remove → collapses.
5. Type into Notes over several lines → the textarea grows.
6. Esc with changes → "Discard changes?"; Keep editing returns; Discard closes. Browser Back behaves the same.
7. Fill Title "Test memory", pick Work, star it, add a yearly reminder, Save → toast "Memory saved". Firestore: `users/<uid>/entries/<id>` has `title`, `date`, `notes: ''`, `categoryId` = the new Work category id, `starred: true`, `reminder: {kind:'yearly', time:'09:00'}`, `deletedAt: null`, `createdAt`, `updatedAt`; `categories` now has Work with `order: 4`.
8. DevTools → Network → Offline, open compose again, save another memory → the sheet closes immediately (no hang); back online, it appears in Firestore.

- [ ] **Step 4: Commit**

```bash
git add src/ui/compose.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add compose sheet for new and edited memories

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: `src/ui/timeline.js` — the home screen

Implements spec §4.3 in full (header with wordmark, search, reminders bell with badge = reminders in the next 14 days, avatar → Settings; search mode with Cancel and live filtering and "No memories match 'xyz'."; sticky filter strip `All · ★ · categories` shown only with ≥ 1 entry, category single-select, ★ combines; backup nudge; On This Day card with up to 3 rows then "and N more"; Upcoming card with "See all →"; entries grouped by month, newest first, sticky month header that opens a month/year jumper; row layout; empty state), §3 (one `+` button; `/` focuses search, Esc closes it), §8 (sync indicator: hidden when clean, amber while pending, red on error with an explanation on tap), §3 backup nudge ("… · Export · Dismiss", once every 30 days).

**Design notes:**
- Three regions (header, filters, body) are rendered to strings and only written to the DOM when their markup changed. Metadata-only snapshots therefore cause no DOM work, and focus survives most updates.
- The search header never contains the query text in its markup (the input's `value` is set after rendering), so typing never re-renders the header.
- `src/ui/backup.js` holds the "export JSON backup now" action, shared with Settings → Data (Task 26).

**Files:**
- Create: `src/ui/timeline.js`, `src/ui/backup.js`
- Modify: `src/ui/app.js` (register the screen)
- Modify: `styles/screens.css` (append timeline section)

**Interfaces:**
- Consumes: `store`, `setUI` (T10); selectors `activeEntries`, `indexById`, `filterEntries`, `groupByMonth`, `onThisDay`, `upcomingReminders`, `shouldShowBackupNudge` (T5); dates `todayISO`, `dayNumber`, `formatWeekday`, `formatDayMonth`, `formatLong`, `relativeDayLabel`, `parseISODate` (T2); `entryHref` (T11); `updateMeta` (T17); `buildJSONExport`, `exportFilename`, `downloadText` (T8); `openSheet`, `toast`, `guard` (T18); `openCompose` (T20).
- Produces:
  - `mount(root)` screen for route `timeline`
  - `avatar(user: User|null): Raw` — used by Settings (Task 24)
  - `exportJSONBackup(): void` in `src/ui/backup.js` — downloads the JSON export, sets `meta.lastBackupAt`, toasts "Backup downloaded"

- [ ] **Step 1: Create `src/ui/backup.js`**

```js
import { store } from '../store.js';
import { buildJSONExport, exportFilename, downloadText } from '../io/export.js';
import { updateMeta } from '../db.js';
import { guard, toast } from './toast.js';

/** Download a full JSON backup (including Trash) and record the backup time. */
export function exportJSONBackup() {
  const s = store.get();
  if (!s.user) return;
  downloadText(exportFilename('json'), buildJSONExport(s.entries, s.categories), 'application/json');
  guard(updateMeta(s.user.uid, { lastBackupAt: Date.now() }));
  toast('Backup downloaded');
}
```

- [ ] **Step 2: Create `src/ui/timeline.js`**

```js
import { store, setUI } from '../store.js';
import {
  activeEntries, indexById, filterEntries, groupByMonth, onThisDay, upcomingReminders, shouldShowBackupNudge,
} from '../selectors.js';
import {
  todayISO, dayNumber, formatWeekday, formatDayMonth, formatLong, relativeDayLabel, parseISODate,
} from '../dates.js';
import { entryHref } from '../router.js';
import { updateMeta } from '../db.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { toast, guard } from './toast.js';
import { openCompose } from './compose.js';
import { exportJSONBackup } from './backup.js';

/** @typedef {import('../model.js').Entry} Entry */
/** @typedef {import('../model.js').Category} Category */
/** @typedef {import('../store.js').User} User */

const OTD_VISIBLE = 3;
const UPCOMING_VISIBLE = 5;
const DAY_MS = 86400000;
const yearsAgoFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

/** @param {User|null} user */
export function avatar(user) {
  if (user?.photoURL) return html`<img class="avatar" src="${user.photoURL}" alt="" referrerpolicy="no-referrer">`;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  return html`<span class="avatar avatar-fallback" aria-hidden="true">${initial}</span>`;
}

/** @param {Entry} e @param {Category|undefined} cat */
function entryRow(e, cat) {
  const firstLine = e.notes.split('\n').find((l) => l.trim()) || '';
  return html`
    <a class="entry-row" href="${entryHref(e.id)}">
      <span class="entry-day" aria-hidden="true">
        <span class="entry-daynum">${dayNumber(e.date)}</span>
        <span class="label">${formatWeekday(e.date)}</span>
      </span>
      <span class="entry-main">
        <span class="visually-hidden">${formatLong(e.date)}: </span>
        <span class="entry-title">${e.title}</span>
        ${cat || firstLine ? html`<span class="entry-sub">
          ${cat ? html`<span class="dot" style="--c:${cat.color}"></span><span class="entry-cat">${cat.name}</span>` : ''}
          ${cat && firstLine ? html`<span aria-hidden="true">·</span>` : ''}
          ${firstLine ? html`<span class="entry-note">${firstLine}</span>` : ''}
        </span>` : ''}
      </span>
      <span class="entry-flags">
        ${e.starred ? html`<span class="visually-hidden">Starred</span>${icon('star', { cls: 'icon-sm is-filled' })}` : ''}
        ${e.reminder ? html`<span class="visually-hidden">Has a reminder</span>${icon('bell', { cls: 'icon-sm' })}` : ''}
      </span>
    </a>`;
}

/** @param {{ key: string, label: string, entries: Entry[] }[]} groups @param {Map<string, Category>} catsById */
function monthGroups(groups, catsById) {
  return html`${groups.map((g) => html`
    <section class="month" id="m-${g.key}">
      <h2 class="month-head">
        <button type="button" class="month-btn label" data-action="jump" aria-label="${g.label}. Jump to another month">
          ${g.label}${icon('chevron-down', { cls: 'icon-sm' })}
        </button>
      </h2>
      <ul class="entries">
        ${g.entries.map((e) => html`<li>${entryRow(e, e.categoryId ? catsById.get(e.categoryId) : undefined)}</li>`)}
      </ul>
    </section>`)}`;
}

/** @param {import('../store.js').AppState} s @param {number} badge */
function mainHeader(s, badge) {
  const bellLabel = badge ? `Reminders, ${badge} in the next 14 days` : 'Reminders';
  return html`
    <header class="topbar">
      <span class="topbar-title wordmark">DateTracker</span>
      ${s.sync === 'pending' ? html`<span class="sync-dot is-pending" role="img" aria-label="Saving changes"></span>` : ''}
      ${s.sync === 'error' ? html`<button type="button" class="icon-btn" data-action="sync-info" aria-label="Sync problem"><span class="sync-dot is-error"></span></button>` : ''}
      <div class="topbar-actions">
        <button type="button" class="icon-btn" data-action="search" aria-label="Search" aria-keyshortcuts="/">${icon('search')}</button>
        <a class="icon-btn" href="#/reminders" aria-label="${bellLabel}">
          ${icon('bell')}${badge ? html`<span class="badge" aria-hidden="true">${badge > 9 ? '9+' : badge}</span>` : ''}
        </a>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${avatar(s.user)}</a>
      </div>
    </header>`;
}

function searchHeader() {
  return html`
    <header class="topbar topbar--search">
      <label class="search-field">
        ${icon('search', { cls: 'icon-sm' })}
        <input class="search-input" type="search" data-action="query" placeholder="Search memories"
          aria-label="Search memories" autocomplete="off" enterkeyhint="search">
      </label>
      <button type="button" class="btn btn-quiet" data-action="cancel-search">Cancel</button>
    </header>`;
}

/** @param {Category[]} categories @param {import('../store.js').UI} ui */
function filterStrip(categories, ui) {
  return html`
    <div class="filters">
      <div class="chips" role="toolbar" aria-label="Filter memories">
        <button type="button" class="chip" data-action="filter-all" aria-pressed="${String(ui.categoryId === 'all' && !ui.starredOnly)}">All</button>
        <button type="button" class="chip" data-action="filter-star" aria-pressed="${String(ui.starredOnly)}">${icon('star', { cls: 'icon-sm' })}Starred</button>
        ${categories.map((c) => html`<button type="button" class="chip" data-action="filter-cat" data-id="${c.id}"
          aria-pressed="${String(ui.categoryId === c.id)}" style="--c:${c.color}"><span class="dot"></span>${c.name}</button>`)}
      </div>
    </div>`;
}

/** @param {import('../store.js').Meta|null} meta @param {number} count @param {Date} now */
function backupNudge(meta, count, now) {
  if (!meta || !shouldShowBackupNudge(meta, count, now.getTime())) return '';
  const text = meta.lastBackupAt
    ? `${Math.floor((now.getTime() - meta.lastBackupAt) / DAY_MS)} days since your last backup`
    : 'Your journal has never been backed up';
  return html`
    <div class="nudge" role="note">
      ${icon('download', { cls: 'icon-sm' })}
      <span class="nudge-text">${text}</span>
      <button type="button" class="nudge-btn" data-action="backup">Export</button>
      <button type="button" class="nudge-btn is-quiet" data-action="dismiss-nudge">Dismiss</button>
    </div>`;
}

/** @param {Entry[]} active @param {Map<string, Category>} catsById @param {Date} now @param {boolean} expanded */
function otdCard(active, catsById, now, expanded) {
  const today = todayISO(now);
  const items = onThisDay(active, today);
  if (!items.length) return '';
  const shown = expanded ? items : items.slice(0, OTD_VISIBLE);
  const rest = items.length - shown.length;
  return html`
    <section class="card" aria-labelledby="otd-h">
      <div class="card-head"><h2 class="label" id="otd-h">On this day · ${formatDayMonth(today)}</h2></div>
      ${shown.map(({ entry, year, yearsAgo }) => {
        const cat = entry.categoryId ? catsById.get(entry.categoryId) : undefined;
        return html`<a class="card-row" href="${entryHref(entry.id)}">
          <span class="card-row-main">${year} · ${entry.title}${cat ? ` · ${cat.name}` : ''}</span>
          <span class="card-row-aside">${yearsAgoFmt.format(-yearsAgo, 'year')}</span>
        </a>`;
      })}
      ${rest > 0 ? html`<button type="button" class="card-row card-more" data-action="otd-more">and ${rest} more</button>` : ''}
    </section>`;
}

/** @param {{ entry: Entry, next: Date }[]} upcoming @param {Date} now */
function upcomingCard(upcoming, now) {
  if (!upcoming.length) return '';
  return html`
    <section class="card" aria-labelledby="up-h">
      <div class="card-head">
        <h2 class="label" id="up-h">Upcoming</h2>
        <a href="#/reminders">See all${icon('chevron-right', { cls: 'icon-sm' })}</a>
      </div>
      ${upcoming.slice(0, UPCOMING_VISIBLE).map(({ entry, next }) => html`
        <a class="card-row" href="${entryHref(entry.id)}">
          <span class="card-when">${relativeDayLabel(next, now)}</span>
          <span class="card-row-main">${entry.title}</span>
        </a>`)}
    </section>`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  setHTML(root, html`
    <main class="screen timeline">
      <div id="tl-head"></div>
      <div id="tl-filters"></div>
      <div id="tl-body"></div>
    </main>
    <button type="button" class="fab" data-action="compose" aria-label="Add a memory">${icon('plus')}</button>`);
  const main = /** @type {HTMLElement} */ (root.querySelector('.timeline'));
  const headEl = /** @type {HTMLElement} */ (root.querySelector('#tl-head'));
  const filtersEl = /** @type {HTMLElement} */ (root.querySelector('#tl-filters'));
  const bodyEl = /** @type {HTMLElement} */ (root.querySelector('#tl-body'));
  const last = { head: '', filters: '', body: '' };
  let otdExpanded = false;
  let firstRender = true;
  /** @type {{ key: string, label: string, entries: Entry[] }[]} */
  let lastGroups = [];

  function render() {
    const s = store.get();
    const now = new Date();
    const active = activeEntries(s.entries);
    const catsById = indexById(s.categories);
    const upcoming = upcomingReminders(active, now, 14);

    const head = String(s.ui.searching ? searchHeader() : mainHeader(s, upcoming.length));
    if (head !== last.head) {
      const enteringSearch = s.ui.searching && !last.head.includes('search-input');
      setHTML(headEl, head);
      last.head = head;
      const input = /** @type {HTMLInputElement|null} */ (headEl.querySelector('.search-input'));
      if (input) {
        input.value = s.ui.query;
        if (enteringSearch && !firstRender) input.focus();
      }
    }

    const filters = active.length ? String(filterStrip(s.categories, s.ui)) : '';
    if (filters !== last.filters) {
      const strip = filtersEl.querySelector('.chips');
      const scrollLeft = strip ? strip.scrollLeft : 0;
      setHTML(filtersEl, filters);
      last.filters = filters;
      const next = filtersEl.querySelector('.chips');
      if (next) next.scrollLeft = scrollLeft;
    }
    main.classList.toggle('has-filters', Boolean(filters));

    const q = s.ui.searching ? s.ui.query.trim() : '';
    const list = filterEntries(active, { categoryId: s.ui.categoryId, starredOnly: s.ui.starredOnly, query: q, categoriesById: catsById });
    lastGroups = groupByMonth(list);
    let body;
    if (!active.length) {
      body = html`
        <div class="empty">
          <h2>Your journal is empty.</h2>
          <p>Tap + to record your first memory — a trip, a purchase, a milestone. Anything worth remembering.</p>
        </div>`;
    } else if (s.ui.searching) {
      body = q && !list.length
        ? html`<div class="empty"><p>No memories match ‘${q}’.</p></div>`
        : monthGroups(lastGroups, catsById);
    } else {
      body = html`
        ${backupNudge(s.meta, active.length, now)}
        ${otdCard(active, catsById, now, otdExpanded)}
        ${upcomingCard(upcoming, now)}
        ${list.length ? monthGroups(lastGroups, catsById) : html`<div class="empty"><p>No memories match this filter.</p></div>`}`;
    }
    const bodyStr = String(body);
    if (bodyStr !== last.body) { setHTML(bodyEl, bodyStr); last.body = bodyStr; }
    firstRender = false;
  }

  function openJumper() {
    /** @type {Map<string, { key: string, label: string }[]>} */
    const byYear = new Map();
    for (const g of lastGroups) {
      const y = g.key.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      /** @type {{ key: string, label: string }[]} */ (byYear.get(y)).push(g);
    }
    openSheet({
      title: 'Jump to month',
      render(content, api) {
        setHTML(content, html`
          <div class="sheet-body jumper">
            ${[...byYear].map(([year, months]) => html`
              <h3 class="label">${year}</h3>
              <div class="jumper-grid">
                ${months.map((m) => html`<button type="button" class="chip" data-action="go" data-key="${m.key}" aria-label="${m.label}">
                  ${monthShortFmt.format(/** @type {Date} */ (parseISODate(`${m.key}-01`)))}</button>`)}
              </div>`)}
          </div>`);
        return delegate(content, 'click', {
          go: (el) => {
            const key = el.dataset.key;
            api.close().then(() => {
              const target = document.getElementById(`m-${key}`);
              target?.scrollIntoView({ block: 'start' });
              /** @type {HTMLElement|null} */ (target?.querySelector('.entry-row'))?.focus({ preventScroll: true });
            });
          },
        });
      },
    });
  }

  const cancelSearch = () => setUI({ searching: false, query: '' });

  const offs = [
    delegate(root, 'click', {
      compose: () => openCompose(),
      search: () => setUI({ searching: true }),
      'cancel-search': cancelSearch,
      'sync-info': () => toast("Changes aren't syncing right now. Reload the app to reconnect."),
      'filter-all': () => setUI({ categoryId: 'all', starredOnly: false }),
      'filter-star': () => setUI({ starredOnly: !store.get().ui.starredOnly }),
      'filter-cat': (el) => {
        const id = el.dataset.id || 'all';
        setUI({ categoryId: store.get().ui.categoryId === id ? 'all' : id });
      },
      'otd-more': () => { otdExpanded = true; render(); },
      backup: () => exportJSONBackup(),
      'dismiss-nudge': () => {
        const uid = store.get().user?.uid;
        if (uid) guard(updateMeta(uid, { backupNudgeDismissedAt: Date.now() }));
      },
      jump: () => openJumper(),
    }),
    delegate(root, 'input', { query: (el) => setUI({ query: /** @type {HTMLInputElement} */ (el).value }) }),
    delegate(root, 'keydown', {
      query: (_el, ev) => { if (/** @type {KeyboardEvent} */ (ev).key === 'Escape') { ev.preventDefault(); cancelSearch(); } },
    }),
  ];

  /** @param {KeyboardEvent} ev */
  const onSlash = (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = /** @type {HTMLElement} */ (ev.target);
    if (t.closest('input, textarea, select, [contenteditable="true"], .sheet-layer')) return;
    ev.preventDefault();
    if (store.get().ui.searching) /** @type {HTMLElement|null} */ (headEl.querySelector('.search-input'))?.focus();
    else setUI({ searching: true });
  };
  document.addEventListener('keydown', onSlash);

  const unsub = store.subscribe(render);
  render();
  return {
    unmount() {
      unsub();
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onSlash);
    },
  };
}
```

- [ ] **Step 3: Register the screen in `src/ui/app.js`**

Add the import below the existing imports:
```js
import { mount as mountTimeline } from './timeline.js';
```
and the registry line inside `SCREENS`:
```js
const SCREENS = {
  timeline: mountTimeline,
};
```

- [ ] **Step 4: Append timeline styles to `styles/screens.css`**

```css
/* ---------- Timeline ---------- */
.wordmark { letter-spacing: -0.01em; }
.timeline { --filters-h: 0px; }
.timeline.has-filters { --filters-h: 52px; }

.topbar--search { gap: var(--sp-2); padding-left: var(--gutter); }
.search-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  min-height: 40px;
  padding: 0 var(--sp-3);
  border-radius: var(--r-input);
  background: var(--surface-2);
  color: var(--text-3);
}
.search-field:focus-within { outline: 2px solid var(--accent); }
.search-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font-size: var(--fs-3);
}
.search-input:focus-visible { outline: none; }

.filters {
  position: sticky;
  top: calc(env(safe-area-inset-top) + var(--topbar-h));
  z-index: 9;
  height: var(--filters-h);
  padding: var(--sp-1) var(--gutter) 0;
  background: var(--bg);
}

.nudge {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: var(--sp-2) var(--gutter) var(--sp-4);
  padding: 0 var(--sp-2) 0 var(--sp-4);
  border-radius: var(--r-card);
  background: var(--surface-1);
  border: 1px solid var(--card-border);
  font-size: var(--fs-2);
  color: var(--text-2);
}
.nudge-text { flex: 1; min-width: 0; padding: var(--sp-2) 0; }
.nudge-btn { min-height: var(--tap); padding: 0 var(--sp-2); font-weight: var(--fw-semibold); color: var(--text-1); }
.nudge-btn.is-quiet { color: var(--text-3); font-weight: var(--fw-medium); }

.card-more { color: var(--text-2); font-size: var(--fs-2); }
.card-when { flex: none; width: 92px; font-size: var(--fs-2); color: var(--text-2); }

.month { scroll-margin-top: calc(env(safe-area-inset-top) + var(--topbar-h) + var(--filters-h)); }
.month-head {
  position: sticky;
  top: calc(env(safe-area-inset-top) + var(--topbar-h) + var(--filters-h));
  z-index: 8;
  padding: 0 var(--gutter);
  background: var(--bg);
}
.month-btn { display: inline-flex; align-items: center; gap: var(--sp-1); min-height: var(--tap); }
.month-btn:hover { color: var(--text-1); }

.entries { padding: 0 var(--gutter); margin-bottom: var(--sp-4); }
.entries li + li { border-top: 1px solid var(--hairline); }
.entry-row {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-height: 64px;
  margin: 0 calc(-1 * var(--sp-2));
  padding: var(--sp-2);
  border-radius: var(--r-input);
  color: inherit;
  text-decoration: none;
}
.entry-row:hover { background: var(--surface-1); }
.entry-day { display: flex; flex-direction: column; align-items: center; flex: none; width: 40px; line-height: 1.15; }
.entry-daynum { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.entry-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.entry-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-medium); }
.entry-sub { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: var(--fs-2); color: var(--text-3); white-space: nowrap; }
.entry-cat { flex: none; color: var(--text-2); }
.entry-note { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.entry-flags { display: flex; flex: none; gap: var(--sp-1); color: var(--text-3); }
.entry-flags .is-filled { color: var(--accent); }

.jumper h3 { margin: var(--sp-4) 0 var(--sp-2); }
.jumper h3:first-child { margin-top: 0; }
.jumper-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); }
.jumper-grid .chip { justify-content: center; }
```

- [ ] **Step 5: Browser check**

`npm run serve`, sign in:
1. Fresh account (or after moving everything to Trash later): only the header, the empty state copy exactly as in the spec, and the `+` button. No filter strip, no cards.
2. `+` opens compose. Add four memories: one dated today in an earlier year (e.g. 2023), one starred in Travel, one with a once-reminder three days from now, one in last month. The timeline shows month groups newest first, with day number + weekday on the left, title, category dot + name · first note line, and a filled star / bell on the right.
3. The On This Day card lists the 2023 memory with "3 years ago"; with four such memories it shows three and "and 1 more", which expands.
4. The Upcoming card shows "in 3 days · <title>"; the bell shows badge `1`; "See all" goes to `#/reminders` ("Nothing here." until Task 23 — expected) and Back returns to the timeline at the same scroll position.
5. Filters: Travel shows only Travel; tapping Travel again returns to All; Starred combines with a category; All resets both. Chips scroll horizontally at 360 px and keep their scroll position after tapping.
6. Scroll: the header, filter strip and month header stay stuck in that order. Tap a month header → "Jump to month" → pick a month → it scrolls there.
7. Search: tap the magnifier (or press `/`) → the header becomes a search field with focus; typing filters live on title, notes and category name; "zzz" shows "No memories match ‘zzz’."; Esc or Cancel restores the timeline and the cards.
8. Offline: add a memory → an amber dot shows next to the wordmark until you reconnect and the write is acknowledged.
9. Backup nudge: in Firestore set `meta/app.createdAt` to a value 31 days in the past → the nudge "Your journal has never been backed up · Export · Dismiss" appears; Export downloads `DateTracker-YYYY-MM-DD.json` and the nudge disappears; setting the time back again and pressing Dismiss also hides it.
10. Keyboard only: Tab reaches search, bell, avatar, chips, cards, rows, and `+` in visual order with a visible focus ring.

- [ ] **Step 6: Commit**

```bash
git add src/ui/timeline.js src/ui/backup.js src/ui/app.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add timeline home with search, filters, on-this-day and upcoming

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: `src/ui/entry-detail.js` — the entry screen

Implements spec §4.4 in full (back · star toggle; long date line; large title; coloured category chip; full notes with preserved line breaks and auto-linked URLs `rel="noopener"`; reminder block "Every year · 09:00 · next: 18 Sep 2027" with **Add to calendar** `.ics`; **Edit** primary · **Delete** danger text; delete moves to Trash immediately with toast "Moved to Trash · Undo" for 6 s, no confirm), §9 (calendar export).

**Files:**
- Create: `src/ui/entry-detail.js`
- Modify: `src/ui/app.js` (register), `styles/screens.css` (append detail section)

**Interfaces:**
- Consumes: `store` (T10); `back` (T11); `updateEntry`, `trashEntry`, `restoreEntry` (T17); `nextFireTime`, `scheduleLabel`, `toICS` (T4); `formatLong`, `formatShort`, `toISODate` (T2); `downloadText` (T8); `openCompose` (T20); `toast`, `guard` (T18); `html`, `setHTML`, `delegate`, `linkify` (T9); `icon` (T14).
- Produces: `mount(root, { id })` screen for route `entry`; `icsFilename(title: string): string`

- [ ] **Step 1: Implement `src/ui/entry-detail.js`**

```js
import { store } from '../store.js';
import { back } from '../router.js';
import { updateEntry, trashEntry, restoreEntry } from '../db.js';
import { nextFireTime, scheduleLabel, toICS } from '../reminders.js';
import { formatLong, formatShort, toISODate } from '../dates.js';
import { downloadText } from '../io/export.js';
import { html, setHTML, delegate, linkify } from './dom.js';
import { icon } from './icons.js';
import { openCompose } from './compose.js';
import { toast, guard } from './toast.js';

/** "car-insurance-renewal.ics" @param {string} title */
export function icsFilename(title) {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'reminder'}.ics`;
}

/** @param {HTMLElement} root @param {{ id?: string }} params */
export function mount(root, { id = '' }) {
  let lastMarkup = '';

  function render() {
    const s = store.get();
    const entry = s.entries.find((e) => e.id === id && e.deletedAt == null);
    const cat = entry?.categoryId ? s.categories.find((c) => c.id === entry.categoryId) : undefined;
    let markup;
    if (!entry) {
      markup = html`
        <main class="screen">
          <header class="topbar">
            <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          </header>
          <div class="empty"><h2>This memory isn't here.</h2><p>It may have been moved to the Trash.</p></div>
        </main>`;
    } else {
      const r = entry.reminder;
      const next = r ? nextFireTime(entry, new Date()) : null;
      const isPast = r?.kind === 'once' && next && next.getTime() <= Date.now();
      markup = html`
        <main class="screen detail">
          <header class="topbar">
            <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
            <span class="topbar-title"></span>
            <button type="button" class="icon-btn" data-action="star" aria-pressed="${String(entry.starred)}" aria-label="Star">
              ${icon('star', { cls: entry.starred ? 'is-filled' : '' })}
            </button>
          </header>
          <article class="content detail-body">
            <p class="detail-date">${formatLong(entry.date)}</p>
            <h1 class="detail-title">${entry.title}</h1>
            ${cat ? html`<span class="cat-chip" style="--c:${cat.color}"><span class="dot"></span>${cat.name}</span>` : ''}
            ${entry.notes ? html`<div class="detail-notes">${linkify(entry.notes)}</div>` : ''}
            ${r ? html`
              <section class="card detail-reminder" aria-label="Reminder">
                <p class="reminder-line">
                  ${icon(r.kind === 'yearly' ? 'repeat' : 'bell')}
                  <span>
                    ${scheduleLabel(entry)}${r.kind === 'yearly' && next ? ` · next: ${formatShort(toISODate(next))}` : ''}${isPast ? ' · passed' : ''}
                  </span>
                </p>
                <button type="button" class="btn btn-secondary" data-action="ics">${icon('calendar-plus')}Add to calendar</button>
              </section>` : ''}
            <div class="detail-actions">
              <button type="button" class="btn btn-primary" data-action="edit">${icon('pencil')}Edit</button>
              <button type="button" class="btn btn-danger" data-action="delete">${icon('trash-2')}Delete</button>
            </div>
          </article>
        </main>`;
    }
    const str = String(markup);
    if (str !== lastMarkup) {
      const active = document.activeElement;
      const focusedAction = active && root.contains(active) ? active.closest('[data-action]')?.getAttribute('data-action') : null;
      setHTML(root, str);
      lastMarkup = str;
      if (focusedAction) /** @type {HTMLElement|null} */ (root.querySelector(`[data-action="${focusedAction}"]`))?.focus();
    }
  }

  /** @returns {import('../model.js').Entry|undefined} */
  const current = () => store.get().entries.find((e) => e.id === id && e.deletedAt == null);

  const off = delegate(root, 'click', {
    back: () => back('#/'),
    star: () => {
      const e = current();
      const uid = store.get().user?.uid;
      if (!e || !uid) return;
      guard(updateEntry(uid, e.id, { starred: !e.starred, updatedAt: Date.now() }));
    },
    edit: () => { const e = current(); if (e) openCompose({ entry: e }); },
    ics: () => {
      const e = current();
      if (!e) return;
      const cat = e.categoryId ? store.get().categories.find((c) => c.id === e.categoryId) : null;
      downloadText(icsFilename(e.title), toICS(e, cat || null), 'text/calendar');
    },
    delete: () => {
      const e = current();
      const uid = store.get().user?.uid;
      if (!e || !uid) return;
      guard(trashEntry(uid, e.id));
      back('#/');
      toast('Moved to Trash', {
        actionLabel: 'Undo',
        onAction: () => guard(restoreEntry(uid, e.id)),
      });
    },
  });

  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}
```

- [ ] **Step 2: Add a unit test for `icsFilename`**

`tests/entry-detail.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db.js', () => ({}));
vi.mock('../src/ui/compose.js', () => ({}));
vi.mock('../src/ui/toast.js', () => ({}));
vi.mock('../src/router.js', () => ({}));

const { icsFilename } = await import('../src/ui/entry-detail.js');

describe('icsFilename', () => {
  it('slugs titles and falls back', () => {
    expect(icsFilename('Car insurance renewal!')).toBe('car-insurance-renewal.ics');
    expect(icsFilename('Mum’s birthday 🎂')).toBe('mum-s-birthday.ics');
    expect(icsFilename('!!!')).toBe('reminder.ics');
    expect(icsFilename('x'.repeat(60))).toBe(`${'x'.repeat(40)}.ics`);
  });
});
```
Run: `npm test -- tests/entry-detail.test.js` → green. (The mocks keep the Firebase SDK out of Node.)

- [ ] **Step 3: Register the screen in `src/ui/app.js`**

```js
import { mount as mountEntry } from './entry-detail.js';
```
```js
const SCREENS = {
  timeline: mountTimeline,
  entry: mountEntry,
};
```

- [ ] **Step 4: Append detail styles to `styles/screens.css`**

```css
/* ---------- Entry detail ---------- */
.detail-body { padding-top: var(--sp-2); }
.detail-date { font-size: var(--fs-2); color: var(--text-2); }
.detail-title { margin: var(--sp-2) 0 var(--sp-4); font-size: var(--fs-5); overflow-wrap: anywhere; }
.cat-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-input);
  background: color-mix(in srgb, var(--c) 18%, transparent);
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
}
.detail-notes { margin-top: var(--sp-6); white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-notes a { text-decoration: underline; text-underline-offset: 3px; }
.detail-body .detail-reminder { display: grid; gap: var(--sp-3); justify-items: start; margin: var(--sp-6) 0 0; padding: var(--sp-4); }
.reminder-line { display: flex; align-items: center; gap: var(--sp-3); color: var(--text-2); }
.reminder-line .icon { color: var(--text-3); }
.detail-actions { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-8); }
```

- [ ] **Step 5: Browser check**

1. Tap a timeline row → the entry screen slides in: long date ("Friday, 18 September 2026" style, device locale), large title, coloured category chip, notes with line breaks kept; a URL in the notes is a link that opens a new tab.
2. Star toggles and the timeline row shows/hides the star afterwards.
3. A yearly reminder reads "Every year · 09:00 · next: <date>"; "Add to calendar" downloads `<title-slug>.ics`; opening it in Google Calendar/Outlook/Apple Calendar creates a yearly event with an alert. A past once-reminder shows "· passed".
4. Edit opens compose pre-filled; saving updates the screen live.
5. Delete → back on the timeline at the previous scroll position, toast "Moved to Trash · Undo"; Undo restores the row. Without Undo, Firestore shows `deletedAt` set (the document is not deleted).
6. Open `#/entry/does-not-exist` directly → "This memory isn't here."; Back goes to the timeline (not off the site).
7. Browser Back from an entry returns to the timeline at the same scroll position.

- [ ] **Step 6: Commit**

```bash
git add src/ui/entry-detail.js tests/entry-detail.test.js src/ui/app.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add entry detail with star, calendar export and undoable delete

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: `src/notifications.js` and `src/ui/reminders-view.js`

Implements spec §9 (in-app scheduler on load and every 60 s; fire once per occurrence via `fired:{entryId}:{occurrence}` keys in `localStorage`; the honest two-sentence explanation), §4.6 in full (Upcoming / Past sections sorted by next occurrence; relative chip · title · category · schedule; tap → entry; header notification status with the explanation; empty state "No reminders yet. Add one from any memory.").

**Design notes:**
- When notification permission is not `granted`, the scheduler treats every occurrence as already fired **without** marking it — so turning notifications on later that day still delivers today's reminders.
- Notifications go through the service worker registration when there is one (required on Android Chrome; the worker arrives in Task 29) and fall back to `new Notification()`.
- `fired:` keys older than 400 days are pruned at start so `localStorage` cannot grow without bound.

**Files:**
- Create: `src/notifications.js`, `src/ui/reminders-view.js`
- Test: `tests/notifications.test.js`
- Modify: `src/main.js` (start/stop the scheduler with the session), `src/ui/app.js` (register), `styles/screens.css` (append)

**Interfaces:**
- Consumes: `startScheduler`, `scheduleLabel` (T4); `activeEntries`, `reminderSections`, `indexById` (T5); `relativeDayLabel` (T2); `store` (T10); `entryHref`, `back` (T11).
- Produces (`src/notifications.js`):
  - `NOTIFY_EXPLAINER: string` — "DateTracker can only show a notification while it is open or was used recently — a free web app can't wake itself up at a set time. For reminders you can rely on, use Add to calendar on a memory and let your calendar app alert you."
  - `notificationPermission(): 'granted'|'denied'|'default'|'unsupported'`
  - `requestNotifications(): Promise<string>`
  - `showReminderNotification(entry): Promise<void>`
  - `pruneFiredKeys(storage?, now?): number` — returns how many keys it removed
  - `startReminderScheduler(): () => void`
- Produces (`src/ui/reminders-view.js`): `mount(root)` for route `reminders`; `notificationStatusBlock(): Raw` (reused by Settings → Notifications, Task 24)

- [ ] **Step 1: Write the failing test**

`tests/notifications.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { pruneFiredKeys, notificationPermission, NOTIFY_EXPLAINER } from '../src/notifications.js';

const DAY = 86400000;
const fakeStorage = (entries) => {
  const m = new Map(entries);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => m.delete(k),
    getItem: (k) => m.get(k) ?? null,
    _m: m,
  };
};

describe('pruneFiredKeys', () => {
  it('drops fired keys whose occurrence is older than 400 days and keeps the rest', () => {
    const now = 1000 * DAY;
    const s = fakeStorage([
      [`fired:a:${now - 401 * DAY}`, '1'],
      [`fired:b:${now - 10 * DAY}`, '1'],
      ['fired:c:garbage', '1'],
      ['dt:prefs', '{}'],
    ]);
    expect(pruneFiredKeys(s, now)).toBe(2);
    expect([...s._m.keys()].sort()).toEqual(['dt:prefs', `fired:b:${now - 10 * DAY}`]);
  });
  it('never throws on a broken storage', () => {
    expect(pruneFiredKeys({ get length() { throw new Error('x'); } }, 0)).toBe(0);
  });
});

describe('permission & copy', () => {
  it('reports unsupported in Node', () => {
    expect(notificationPermission()).toBe('unsupported');
  });
  it('explains the limitation in two sentences', () => {
    expect(NOTIFY_EXPLAINER.split('. ').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/notifications.test.js`
Expected: FAIL — cannot resolve `../src/notifications.js`.

- [ ] **Step 3: Implement `src/notifications.js`**

```js
// @ts-check
import { startScheduler, scheduleLabel } from './reminders.js';
import { activeEntries } from './selectors.js';
import { store } from './store.js';

/** @typedef {import('./model.js').Entry} Entry */

export const NOTIFY_EXPLAINER =
  "DateTracker can only show a notification while it is open or was used recently — a free web app can't wake itself up at a set time. " +
  'For reminders you can rely on, use Add to calendar on a memory and let your calendar app alert you.';

const FIRED_PREFIX = 'fired:';
const KEEP_MS = 400 * 86400000;

/** @returns {'granted'|'denied'|'default'|'unsupported'} */
export function notificationPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Ask for permission (must be called from a user gesture). */
export async function requestNotifications() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/** @param {string} key */
function hasFired(key) {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
}
/** @param {string} key */
function markFired(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* storage unavailable: may repeat once */ }
}

/**
 * Remove fired-reminder markers whose occurrence is more than 400 days old.
 * @param {any} [storage] @param {number} [now]
 */
export function pruneFiredKeys(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(FIRED_PREFIX)) continue;
      const at = Number(key.slice(key.lastIndexOf(':') + 1));
      if (!Number.isFinite(at) || now - at > KEEP_MS) stale.push(key);
    }
    stale.forEach((k) => storage.removeItem(k));
    return stale.length;
  } catch {
    return 0;
  }
}

/** @param {Entry} entry */
export async function showReminderNotification(entry) {
  if (notificationPermission() !== 'granted') return;
  const options = {
    body: scheduleLabel(entry) || 'Reminder',
    tag: `dt-${entry.id}`,
    icon: './assets/icons/icon-192.png',
    data: { url: `./#/entry/${encodeURIComponent(entry.id)}` },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(entry.title, options); return; }
  } catch { /* fall through */ }
  try { new Notification(entry.title, options); } catch { /* e.g. Android without a worker */ }
}

/** Start the in-app scheduler for the signed-in session. @returns {() => void} stop */
export function startReminderScheduler() {
  pruneFiredKeys();
  return startScheduler({
    getEntries: () => activeEntries(store.get().entries),
    hasFired: (key) => notificationPermission() !== 'granted' || hasFired(key),
    markFired,
    notify: (entry) => { showReminderNotification(entry); },
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/notifications.test.js`
Expected: green.

- [ ] **Step 5: Wire the scheduler into `src/main.js`**

Add the import:
```js
import { startReminderScheduler } from './notifications.js';
```
Replace `maybeReady` in `startSession` with:
```js
  const maybeReady = () => {
    if (gotEntries && gotCategories && store.get().status === 'loading') {
      store.set({ status: 'ready' });
      unsubs.push(startReminderScheduler());
    }
  };
```
(`stopSession()` already runs every function in `unsubs`, so signing out stops the scheduler.)

- [ ] **Step 6: Implement `src/ui/reminders-view.js`**

```js
import { store } from '../store.js';
import { back, entryHref } from '../router.js';
import { activeEntries, reminderSections, indexById } from '../selectors.js';
import { scheduleLabel } from '../reminders.js';
import { relativeDayLabel } from '../dates.js';
import { notificationPermission, requestNotifications, NOTIFY_EXPLAINER } from '../notifications.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';

const STATUS = {
  granted: { text: 'Notifications are on for this device.', action: '' },
  default: { text: 'Notifications are off.', action: 'Turn on' },
  denied: { text: 'Notifications are blocked in your browser settings.', action: '' },
  unsupported: { text: "This browser can't show notifications.", action: '' },
};

/** Status line + explanation; the "Turn on" button uses data-action="enable-notifications". */
export function notificationStatusBlock() {
  const st = STATUS[notificationPermission()];
  return html`
    <div class="notif-status">
      <p class="notif-line">
        ${icon('bell')}
        <span>${st.text}</span>
        ${st.action ? html`<button type="button" class="btn btn-secondary" data-action="enable-notifications">${st.action}</button>` : ''}
      </p>
      <p class="field-hint">${NOTIFY_EXPLAINER}</p>
    </div>`;
}

/** @param {{ entry: import('../model.js').Entry, next: Date }[]} items @param {Map<string, import('../model.js').Category>} cats @param {Date} now */
function rows(items, cats, now) {
  return html`${items.map(({ entry, next }) => {
    const cat = entry.categoryId ? cats.get(entry.categoryId) : undefined;
    return html`
      <a class="list-row" href="${entryHref(entry.id)}">
        <span class="when-chip">${relativeDayLabel(next, now)}</span>
        <span class="list-row-main">
          <span class="list-row-title">${entry.title}</span>
          <span class="list-row-meta">${cat ? `${cat.name} · ` : ''}${scheduleLabel(entry)}</span>
        </span>
        ${icon('chevron-right')}
      </a>`;
  })}`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  function render() {
    const s = store.get();
    const now = new Date();
    const { upcoming, past } = reminderSections(activeEntries(s.entries), now);
    const cats = indexById(s.categories);
    const markup = String(html`
      <main class="screen reminders">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          <h1 class="topbar-title">Reminders</h1>
        </header>
        <div class="content">${notificationStatusBlock()}</div>
        ${!upcoming.length && !past.length
          ? html`<div class="empty"><p>No reminders yet. Add one from any memory.</p></div>`
          : html`
            ${upcoming.length ? html`<h2 class="label list-title">Upcoming</h2><div class="list">${rows(upcoming, cats, now)}</div>` : ''}
            ${past.length ? html`<h2 class="label list-title">Past</h2><div class="list">${rows(past, cats, now)}</div>` : ''}`}
      </main>`);
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  const off = delegate(root, 'click', {
    back: () => back('#/'),
    'enable-notifications': async () => { await requestNotifications(); last = ''; render(); },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}
```

- [ ] **Step 7: Register the screen in `src/ui/app.js`**

```js
import { mount as mountReminders } from './reminders-view.js';
```
```js
const SCREENS = {
  timeline: mountTimeline,
  entry: mountEntry,
  reminders: mountReminders,
};
```

- [ ] **Step 8: Append styles to `styles/screens.css`**

```css
/* ---------- Reminders ---------- */
.notif-status { display: grid; gap: var(--sp-2); padding: var(--sp-2) 0 var(--sp-2); }
.notif-line { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.notif-line > span { flex: 1; min-width: 160px; }
.notif-line .icon { color: var(--text-3); }
.when-chip {
  flex: none;
  width: 108px;
  padding: 2px var(--sp-2);
  border-radius: var(--r-input);
  background: var(--accent-soft);
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
  text-align: center;
}
```

- [ ] **Step 9: Browser check**

1. Bell → Reminders. Upcoming lists reminders soonest first with chips like "Tomorrow", "in 3 days", "in 2 months"; rows show title and "Category · Every year · 09:00" or "Sep 25, 2026 · 09:00". A once-reminder in the past appears under **Past** as "2 days ago". Tapping a row opens the entry; Back returns here.
2. With no reminders: "No reminders yet. Add one from any memory."
3. "Notifications are off. [Turn on]" → the browser prompt → "Notifications are on for this device."; the explanation text is always shown.
4. Due-today test: create a memory with a once-reminder two minutes from now, keep the app open → within ~60 s of the time a system notification titled with the memory appears **once**. Reload → it does not appear again (`localStorage` has a `fired:<id>:<ms>` key).
5. `npm test` — green.

- [ ] **Step 10: Commit**

```bash
git add src/notifications.js tests/notifications.test.js src/ui/reminders-view.js src/main.js src/ui/app.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add reminders screen and once-per-occurrence notification scheduler

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: `src/ui/settings.js` — index, Account, Appearance, Notifications, About, Sign out

Implements spec §4.7 (grouped list, each group a sub-screen with back navigation; Account with avatar, name, email and "342 memories across 5 categories."; Appearance with System/Light/Dark and 8 swatches + custom colour, stored per device; Notifications status, enable, explanation, calendar alternative; About with version, "Built by Anshul Samarwal", GitHub link, Lucide and Outfit licence lines; Sign out with a confirm).

**Files:**
- Create: `src/ui/settings.js`, `src/ui/settings-shared.js`
- Modify: `src/ui/app.js` (register), `styles/screens.css` (append)

**Interfaces:**
- Consumes: `store` (T10); `back` (T11); `ACCENTS`, `loadPrefs`, `updatePrefs`, `isHex` (T12); `signOutUser` (T13); `activeEntries`, `trashedEntries` (T5); `daysBetween`, `todayISO`, `toISODate` (T2); `avatar` (T21); `logoMark` (T19); `notificationStatusBlock` (T23); `requestNotifications`, `notificationPermission`, `showReminderNotification` (T23); `confirmSheet`, `toast` (T18).
- Produces:
  - `mount(root, { section })` for route `settings`
  - `APP_VERSION = '9.0.0'`
  - `SECTIONS` registry inside `settings.js` (Tasks 25–27 add `categories`, `data`, `trash`)
  - `src/ui/settings-shared.js`: `sectionScreen(title: string, body: Raw): Raw` (a `.screen` with a back button that returns to `#/settings`), `lastBackupLabel(meta, now?): string` ("Never backed up" / "Last backup: today" / "Last backup: 12 days ago")
  - Section contract: `(root: HTMLElement) => { unmount(): void }`; back buttons use `data-action="back"`

- [ ] **Step 1: Create `src/ui/settings-shared.js`**

```js
import { html } from './dom.js';
import { icon } from './icons.js';
import { daysBetween, todayISO, toISODate } from '../dates.js';

/** A settings sub-screen: back button (data-action="back") + title + body. @param {string} title @param {import('./dom.js').Raw} body */
export function sectionScreen(title, body) {
  return html`
    <main class="screen settings-section">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back to settings">${icon('chevron-left')}</button>
        <h1 class="topbar-title">${title}</h1>
      </header>
      ${body}
    </main>`;
}

/** @param {{ lastBackupAt: number|null } | null} meta @param {Date} [now] */
export function lastBackupLabel(meta, now = new Date()) {
  if (!meta?.lastBackupAt) return 'Never backed up';
  const days = daysBetween(toISODate(new Date(meta.lastBackupAt)), todayISO(now));
  if (days <= 0) return 'Last backup: today';
  if (days === 1) return 'Last backup: yesterday';
  return `Last backup: ${days} days ago`;
}
```

- [ ] **Step 2: Create `src/ui/settings.js`**

```js
import { store } from '../store.js';
import { back } from '../router.js';
import { ACCENTS, loadPrefs, updatePrefs, isHex } from '../theme.js';
import { signOutUser } from '../firebase.js';
import { activeEntries, trashedEntries } from '../selectors.js';
import { notificationPermission, requestNotifications, showReminderNotification } from '../notifications.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './timeline.js';
import { logoMark } from './landing.js';
import { notificationStatusBlock } from './reminders-view.js';
import { confirmSheet } from './sheet.js';
import { toast } from './toast.js';
import { sectionScreen, lastBackupLabel } from './settings-shared.js';

export const APP_VERSION = '9.0.0';

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
const PERMISSION_LABEL = { granted: 'On', default: 'Off', denied: 'Blocked', unsupported: 'Not supported' };

/* ---------- Index ---------- */

/** @param {HTMLElement} root */
function mountIndex(root) {
  let last = '';
  function render() {
    const s = store.get();
    const active = activeEntries(s.entries);
    const trashed = trashedEntries(s.entries);
    const prefs = loadPrefs();
    const accent = ACCENTS.find((a) => a.color.toLowerCase() === prefs.accent.toLowerCase());
    const markup = String(html`
      <main class="screen settings">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('chevron-left')}</button>
          <h1 class="topbar-title">Settings</h1>
        </header>
        <section class="account" aria-label="Account">
          ${avatar(s.user)}
          <div class="account-text">
            <p class="account-name">${s.user?.name || 'Signed in'}</p>
            <p class="secondary">${s.user?.email || ''}</p>
            <p class="muted">${plural(active.length, 'memory', 'memories')} across ${plural(s.categories.length, 'category', 'categories')}.</p>
          </div>
        </section>
        <nav class="list" aria-label="Settings">
          ${row('#/settings/appearance', 'sun', 'Appearance', `${THEME_LABEL[prefs.theme]} · ${accent ? accent.name : 'Custom'}`)}
          ${row('#/settings/categories', 'tag', 'Categories', plural(s.categories.length, 'category', 'categories'))}
          ${row('#/settings/notifications', 'bell', 'Notifications', PERMISSION_LABEL[notificationPermission()])}
          ${row('#/settings/data', 'download', 'Data', lastBackupLabel(s.meta))}
          ${row('#/settings/trash', 'trash-2', 'Trash', trashed.length ? plural(trashed.length, 'memory', 'memories') : 'Empty')}
          ${row('#/settings/about', 'info', 'About', `Version ${APP_VERSION}`)}
        </nav>
        <div class="list">
          <button type="button" class="list-row" data-action="signout">${icon('log-out')}<span class="list-row-main">Sign out</span></button>
        </div>
      </main>`);
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  /** @param {string} href @param {string} ic @param {string} title @param {string} meta */
  function row(href, ic, title, meta) {
    return html`
      <a class="list-row" href="${href}">
        ${icon(ic)}
        <span class="list-row-main"><span class="list-row-title">${title}</span><span class="list-row-meta">${meta}</span></span>
        ${icon('chevron-right')}
      </a>`;
  }
  const off = delegate(root, 'click', {
    back: () => back('#/'),
    signout: async () => {
      const ok = await confirmSheet({ title: 'Sign out?', message: 'Your journal stays safe in your account. Sign in again any time.', confirmLabel: 'Sign out' });
      if (ok) signOutUser().catch(() => toast("Couldn't sign out. Try again."));
    },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}

/* ---------- Appearance ---------- */

/** @param {HTMLElement} root */
function mountAppearance(root) {
  function render() {
    const prefs = loadPrefs();
    const isPreset = ACCENTS.some((a) => a.color.toLowerCase() === prefs.accent.toLowerCase());
    setHTML(root, sectionScreen('Appearance', html`
      <h2 class="label list-title" id="theme-label">Theme</h2>
      <div class="content">
        <div class="segmented" role="group" aria-labelledby="theme-label">
          ${[['system', 'monitor'], ['light', 'sun'], ['dark', 'moon']].map(([mode, ic]) => html`
            <button type="button" data-action="theme" data-mode="${mode}" aria-pressed="${String(prefs.theme === mode)}">
              ${icon(ic, { cls: 'icon-sm' })}${THEME_LABEL[/** @type {'system'|'light'|'dark'} */ (mode)]}
            </button>`)}
        </div>
      </div>
      <h2 class="label list-title" id="accent-label">Accent</h2>
      <div class="content swatches" role="group" aria-labelledby="accent-label">
        ${ACCENTS.map((a) => html`
          <button type="button" class="swatch" data-action="accent" data-color="${a.color}" style="--c:${a.color}"
            aria-pressed="${String(a.color.toLowerCase() === prefs.accent.toLowerCase())}" aria-label="${a.name}">
            ${icon('check', { cls: 'swatch-check' })}
          </button>`)}
        <label class="swatch swatch-custom" style="--c:${isPreset ? 'transparent' : prefs.accent}" data-pressed="${String(!isPreset)}">
          <span class="visually-hidden">Custom colour</span>
          <input type="color" data-action="custom-accent" value="${prefs.accent}">
          ${icon('plus', { cls: 'icon-sm' })}
        </label>
      </div>
      <p class="content field-hint">Saved on this device only.</p>`));
  }
  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      theme: (el) => { updatePrefs({ theme: /** @type {any} */ (el.dataset.mode) }); render(); /** @type {HTMLElement|null} */ (root.querySelector(`[data-mode="${el.dataset.mode}"]`))?.focus(); },
      accent: (el) => { updatePrefs({ accent: /** @type {string} */ (el.dataset.color) }); render(); /** @type {HTMLElement|null} */ (root.querySelector(`[data-color="${el.dataset.color}"]`))?.focus(); },
    }),
    delegate(root, 'change', {
      'custom-accent': (el) => {
        const v = /** @type {HTMLInputElement} */ (el).value.toUpperCase();
        if (isHex(v)) { updatePrefs({ accent: v }); render(); }
      },
    }),
  ];
  render();
  return { unmount() { offs.forEach((off) => off()); } };
}

/* ---------- Notifications ---------- */

/** @param {HTMLElement} root */
function mountNotifications(root) {
  function render() {
    setHTML(root, sectionScreen('Notifications', html`
      <div class="content">
        ${notificationStatusBlock()}
        ${notificationPermission() === 'granted'
          ? html`<button type="button" class="btn btn-secondary" data-action="test">Send a test notification</button>` : ''}
        <h2 class="label list-title flush">Calendar alerts</h2>
        <p class="secondary">Open any memory with a reminder and choose ${icon('calendar-plus', { cls: 'icon-sm inline-icon' })} <strong>Add to calendar</strong>. Anniversaries repeat every year in your calendar, with an alert.</p>
      </div>`));
  }
  const off = delegate(root, 'click', {
    back: () => back('#/settings'),
    'enable-notifications': async () => { await requestNotifications(); render(); },
    test: () => showReminderNotification(/** @type {any} */ ({ id: 'test', title: 'DateTracker', reminder: null })),
  });
  render();
  return { unmount: off };
}

/* ---------- About ---------- */

/** @param {HTMLElement} root */
function mountAbout(root) {
  setHTML(root, sectionScreen('About', html`
    <div class="content about">
      ${logoMark()}
      <p class="about-name">DateTracker</p>
      <p class="muted">Version ${APP_VERSION}</p>
      <p>Built by Anshul Samarwal.</p>
      <p><a class="btn btn-secondary" href="https://github.com/anshulsamarwal2/DateTracker" target="_blank" rel="noopener noreferrer">${icon('external-link', { cls: 'icon-sm' })}Source on GitHub</a></p>
      <h2 class="label list-title flush">Licences</h2>
      <p class="secondary">Icons: <a href="./assets/icons/LICENSE-lucide.txt" target="_blank" rel="noopener">Lucide</a> (ISC licence).</p>
      <p class="secondary">Typeface: <a href="./assets/fonts/OFL.txt" target="_blank" rel="noopener">Outfit</a> (SIL Open Font License 1.1).</p>
    </div>`));
  const off = delegate(root, 'click', { back: () => back('#/settings') });
  return { unmount: off };
}

/* ---------- Router ---------- */

/** Section name → mount. Tasks 25–27 add categories, data and trash. @type {Record<string, (root: HTMLElement) => { unmount(): void }>} */
const SECTIONS = {
  appearance: mountAppearance,
  notifications: mountNotifications,
  about: mountAbout,
};

/** @param {HTMLElement} root @param {{ section?: string }} params */
export function mount(root, { section = '' }) {
  if (!section) return mountIndex(root);
  const m = SECTIONS[section];
  if (m) return m(root);
  setHTML(root, sectionScreen('Settings', html`<div class="empty"><p>This section isn't available yet.</p></div>`));
  const off = delegate(root, 'click', { back: () => back('#/settings') });
  return { unmount: off };
}
```

- [ ] **Step 3: Register the screen in `src/ui/app.js`**

```js
import { mount as mountSettings } from './settings.js';
```
```js
const SCREENS = {
  timeline: mountTimeline,
  entry: mountEntry,
  reminders: mountReminders,
  settings: mountSettings,
};
```

- [ ] **Step 4: Append styles to `styles/screens.css`**

```css
/* ---------- Settings ---------- */
.list-row > .icon:first-child { color: var(--text-3); }
.list-row-main { display: flex; flex-direction: column; }
.list-title.flush { margin-left: 0; margin-right: 0; }
.inline-icon { display: inline-block; vertical-align: -3px; }

.account { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--gutter) var(--sp-6); }
.account .avatar { width: 56px; height: 56px; font-size: var(--fs-4); }
.account-text { min-width: 0; }
.account-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.account-text p { overflow: hidden; text-overflow: ellipsis; }

.swatches { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
.swatch {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  border-radius: var(--r-full);
  background: var(--c);
  color: var(--on-accent);
  cursor: pointer;
}
.swatch .swatch-check { opacity: 0; }
.swatch[aria-pressed="true"], .swatch-custom[data-pressed="true"] { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text-1); }
.swatch[aria-pressed="true"] .swatch-check { opacity: 1; }
.swatch-custom { border: 2px dashed var(--hairline); color: var(--text-2); }
.swatch-custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.swatch-custom:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }

.about { display: grid; gap: var(--sp-2); justify-items: start; padding-top: var(--sp-4); }
.about .logo-mark { width: 48px; height: 48px; }
.about-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); margin-top: var(--sp-2); }
.about a:not(.btn) { text-decoration: underline; text-underline-offset: 3px; }
```

- [ ] **Step 5: Browser check**

1. Avatar → Settings: account block with photo, name, email and e.g. "4 memories across 5 categories." Rows: Appearance ("System · Copper"), Categories, Notifications, Data ("Never backed up"), Trash, About ("Version 9.0.0"), and Sign out. Categories/Data/Trash show "This section isn't available yet." until Tasks 25–27.
2. Appearance: Light/Dark/System switch immediately (native date pickers follow); an accent swatch recolours the `+` button, chips and focus rings; the custom colour picker sets any colour and the text on the `+` stays readable. Reload → preserved. Another browser profile → defaults (per device).
3. Notifications: status line + two-sentence explanation + "Calendar alerts" paragraph; when granted, "Send a test notification" shows one.
4. About: version, "Built by Anshul Samarwal.", GitHub opens in a new tab, both licence links open the licence files.
5. Sign out → "Sign out?" confirm → Cancel keeps you in; Sign out returns to the landing. Signing back in shows the same journal (no re-seed).
6. Back buttons: section → Settings → Timeline; opening `#/settings/about` directly and pressing the back button goes to Settings, then Timeline.

- [ ] **Step 6: Commit**

```bash
git add src/ui/settings.js src/ui/settings-shared.js src/ui/app.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add settings with account, appearance, notifications, about and sign out

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: `src/ui/settings-categories.js` — manage categories

Implements spec §4.7 Categories (list with colour dot, name, entry count and ordering; tap → edit: rename, colour from the palette + custom, delete; deleting a category with entries asks where to move them — another category or "No category"; add a category at the bottom).

**Deliberate design choice:** ordering uses **Move up / Move down** buttons instead of a drag handle. They work with keyboard, screen readers and touch without a drag library; the spec's intent (user-controlled order) is kept.

**Files:**
- Create: `src/ui/settings-categories.js`
- Modify: `src/ui/settings.js` (register), `styles/screens.css` (append)

**Interfaces:**
- Consumes: `store`, `setUI` (T10); `back` (T11); `isHex` (T12); `addCategory`, `updateCategory`, `reorderCategories`, `deleteCategory` (T17); `buildCategory`, `nextPaletteColor`, `validateCategoryName`, `PALETTE`, `LIMITS` (T3); `categoryCounts` (T5); `openSheet`, `confirmSheet`, `guard`, `toast` (T18); `sectionScreen` (T24).
- Produces: `mount(root)` registered as settings section `categories`.

- [ ] **Step 1: Implement `src/ui/settings-categories.js`**

```js
import { store, setUI } from '../store.js';
import { back } from '../router.js';
import { addCategory, updateCategory, reorderCategories, deleteCategory } from '../db.js';
import { buildCategory, nextPaletteColor, validateCategoryName, PALETTE, LIMITS } from '../model.js';
import { categoryCounts } from '../selectors.js';
import { isHex } from '../theme.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet, confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { sectionScreen } from './settings-shared.js';

/** @typedef {import('../model.js').Category} Category */

/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;
const uid = () => /** @type {string} */ (store.get().user?.uid);

/** @param {Category} cat */
function openEditor(cat) {
  const state = { name: cat.name, color: cat.color };
  const initial = JSON.stringify(state);
  let error = '';
  openSheet({
    title: 'Edit category',
    isDirty: () => JSON.stringify(state) !== initial,
    render(content, api) {
      function render() {
        const custom = !PALETTE.some((p) => p.toLowerCase() === state.color.toLowerCase());
        setHTML(content, html`
          <form class="sheet-body" data-action="save" novalidate id="cat-form">
            <div class="field">
              <label class="field-label" for="cat-name">Name</label>
              <input class="input" id="cat-name" name="name" data-action="name" maxlength="${LIMITS.categoryName}" autocomplete="off"
                value="${state.name}" aria-invalid="${String(Boolean(error))}" aria-describedby="cat-name-err" autofocus>
              <p class="field-error" id="cat-name-err" ${error ? '' : 'hidden'}>${error}</p>
            </div>
            <div class="field">
              <span class="field-label" id="cat-color-label">Colour</span>
              <div class="swatches small" role="group" aria-labelledby="cat-color-label">
                ${PALETTE.map((c) => html`<button type="button" class="swatch" data-action="color" data-color="${c}" style="--c:${c}"
                  aria-pressed="${String(c.toLowerCase() === state.color.toLowerCase())}" aria-label="Colour ${c}">${icon('check', { cls: 'swatch-check' })}</button>`)}
                <label class="swatch swatch-custom" style="--c:${custom ? state.color : 'transparent'}" data-pressed="${String(custom)}">
                  <span class="visually-hidden">Custom colour</span>
                  <input type="color" data-action="custom" value="${state.color}">
                  ${icon('plus', { cls: 'icon-sm' })}
                </label>
              </div>
            </div>
            <button type="button" class="btn btn-danger" data-action="delete">${icon('trash-2')}Delete category</button>
          </form>
          <div class="sheet-foot">
            <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" form="cat-form">Save</button>
          </div>`);
      }
      render();
      const offs = [
        delegate(content, 'input', { name: (el) => { state.name = /** @type {HTMLInputElement} */ (el).value; } }),
        delegate(content, 'change', {
          custom: (el) => {
            const v = /** @type {HTMLInputElement} */ (el).value.toUpperCase();
            if (isHex(v)) { state.color = v; render(); }
          },
        }),
        delegate(content, 'click', {
          cancel: () => api.requestClose(),
          color: (el) => { state.color = /** @type {string} */ (el.dataset.color); render(); /** @type {HTMLElement|null} */ (content.querySelector(`[data-color="${state.color}"]`))?.focus(); },
          delete: () => { api.close().then(() => confirmDelete(cat)); },
        }),
        delegate(content, 'submit', {
          save: (_el, ev) => {
            ev.preventDefault();
            const msg = validateCategoryName(state.name, store.get().categories, cat.id);
            if (msg) { error = msg; render(); /** @type {HTMLElement} */ (content.querySelector('#cat-name')).focus(); return; }
            guard(updateCategory(uid(), cat.id, { name: state.name.trim(), color: state.color }));
            api.close();
          },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {Category} cat */
async function confirmDelete(cat) {
  const s = store.get();
  const entryIds = s.entries.filter((e) => e.categoryId === cat.id).map((e) => e.id);
  const finish = (/** @type {string|null} */ target) => {
    guard(deleteCategory(uid(), cat.id, entryIds, target));
    if (store.get().ui.categoryId === cat.id) setUI({ categoryId: 'all' });
    toast(`Deleted “${cat.name}”`);
  };
  if (!entryIds.length) {
    const ok = await confirmSheet({ title: `Delete “${cat.name}”?`, confirmLabel: 'Delete', danger: true });
    if (ok) finish(null);
    return;
  }
  const others = s.categories.filter((c) => c.id !== cat.id);
  let target = '';
  openSheet({
    title: `Delete “${cat.name}”?`,
    className: 'sheet--confirm',
    render(content, api) {
      setHTML(content, html`
        <div class="sheet-body">
          <p class="secondary">${memories(entryIds.length)} use this category. Move them to:</p>
          <div class="radio-list" role="radiogroup" aria-label="Move memories to">
            ${others.map((c) => html`<label class="radio-row"><input type="radio" name="target" value="${c.id}" data-action="target"><span class="dot" style="--c:${c.color}"></span>${c.name}</label>`)}
            <label class="radio-row"><input type="radio" name="target" value="" data-action="target" checked><span class="dot"></span>No category</label>
          </div>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn btn-secondary" data-action="cancel" autofocus>Cancel</button>
          <button type="button" class="btn btn-danger" data-action="confirm">Delete category</button>
        </div>`);
      const offs = [
        delegate(content, 'change', { target: (el) => { target = /** @type {HTMLInputElement} */ (el).value; } }),
        delegate(content, 'click', {
          cancel: () => api.close(),
          confirm: () => { api.close().then(() => finish(target || null)); },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {HTMLElement} root */
export function mount(root) {
  let error = '';
  let last = '';
  function render() {
    const s = store.get();
    const counts = categoryCounts(s.entries.filter((e) => e.deletedAt == null));
    const cats = s.categories;
    const markup = String(sectionScreen('Categories', html`
      ${cats.length ? html`
        <ul class="list" aria-label="Categories">
          ${cats.map((c, i) => html`
            <li class="list-row cat-row">
              <span class="dot" style="--c:${c.color}"></span>
              <button type="button" class="cat-open" data-action="edit" data-id="${c.id}">
                <span class="list-row-title">${c.name}</span>
                <span class="list-row-meta">${memories(counts.get(c.id) || 0)}</span>
              </button>
              <button type="button" class="icon-btn" data-action="up" data-id="${c.id}" aria-label="Move ${c.name} up" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
              <button type="button" class="icon-btn" data-action="down" data-id="${c.id}" aria-label="Move ${c.name} down" ${i === cats.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
            </li>`)}
        </ul>` : html`<div class="empty"><p>No categories yet.</p></div>`}
      <form class="content add-cat" data-action="add" novalidate>
        <label class="field-label" for="new-cat">Add a category</label>
        <div class="newcat">
          <input class="input" id="new-cat" name="name" maxlength="${LIMITS.categoryName}" placeholder="e.g. Work" autocomplete="off"
            aria-invalid="${String(Boolean(error))}" aria-describedby="new-cat-err">
          <button type="submit" class="btn btn-secondary">${icon('plus', { cls: 'icon-sm' })}Add</button>
        </div>
        <p class="field-error" id="new-cat-err" ${error ? '' : 'hidden'}>${error}</p>
      </form>`));
    if (markup === last) return;
    const input = /** @type {HTMLInputElement|null} */ (root.querySelector('#new-cat'));
    const typed = input?.value ?? '';
    const hadFocus = input !== null && document.activeElement === input;
    const focusedMove = /** @type {HTMLElement|null} */ (document.activeElement)?.closest?.('[data-action="up"],[data-action="down"]');
    const moveKey = focusedMove && root.contains(focusedMove) ? `[data-action="${focusedMove.dataset.action}"][data-id="${focusedMove.dataset.id}"]` : '';
    setHTML(root, markup);
    last = markup;
    const next = /** @type {HTMLInputElement} */ (root.querySelector('#new-cat'));
    next.value = typed;
    if (hadFocus) next.focus();
    if (moveKey) {
      const btn = /** @type {HTMLButtonElement|null} */ (root.querySelector(moveKey));
      if (btn && !btn.disabled) btn.focus();
      else /** @type {HTMLElement|null} */ (root.querySelector(`[data-action="edit"][data-id="${focusedMove?.dataset.id}"]`))?.focus();
    }
  }

  /** @param {string} id @param {-1|1} delta */
  function move(id, delta) {
    const ids = store.get().categories.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    guard(reorderCategories(uid(), ids));
  }

  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      edit: (el) => { const c = store.get().categories.find((x) => x.id === el.dataset.id); if (c) openEditor(c); },
      up: (el) => move(/** @type {string} */ (el.dataset.id), -1),
      down: (el) => move(/** @type {string} */ (el.dataset.id), 1),
    }),
    delegate(root, 'submit', {
      add: (_el, ev) => {
        ev.preventDefault();
        const input = /** @type {HTMLInputElement} */ (root.querySelector('#new-cat'));
        const cats = store.get().categories;
        const msg = validateCategoryName(input.value, cats);
        error = msg || '';
        if (msg) { render(); input.focus(); return; }
        const order = cats.reduce((m, c) => Math.max(m, c.order), -1) + 1;
        guard(addCategory(uid(), buildCategory({ name: input.value, color: nextPaletteColor(cats), order })));
        input.value = '';
        render();
      },
    }),
  ];
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); offs.forEach((off) => off()); } };
}
```

- [ ] **Step 2: Register the section in `src/ui/settings.js`**

```js
import { mount as mountCategories } from './settings-categories.js';
```
```js
const SECTIONS = {
  appearance: mountAppearance,
  categories: mountCategories,
  notifications: mountNotifications,
  about: mountAbout,
};
```

- [ ] **Step 3: Append styles to `styles/screens.css`**

```css
/* ---------- Settings: categories ---------- */
.cat-row { gap: var(--sp-2); padding-right: var(--sp-2); }
.cat-row .dot { width: 12px; height: 12px; margin-right: var(--sp-2); }
.cat-open { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: var(--tap); justify-content: center; }
.cat-open:hover .list-row-title { text-decoration: underline; }
.icon-btn:disabled { opacity: 0.35; cursor: default; background: none; }
.add-cat { display: grid; gap: var(--sp-2); }
.swatches.small { gap: var(--sp-2); }
.swatches.small .swatch { width: 36px; height: 36px; }
.radio-list { display: grid; margin-top: var(--sp-3); }
.radio-row { display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap); cursor: pointer; }
.radio-row input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); }
```

- [ ] **Step 4: Browser check**

1. Settings → Categories lists the categories in order with colour dot, name and "N memories". The first "up" and last "down" buttons are disabled.
2. Move a category down → the list and the timeline filter strip reorder; focus stays on the moved row's button. Reload → order kept (Firestore `order` values 0..n-1).
3. Add "Work" → appears at the bottom with the least-used palette colour; adding "work" again shows "You already have a category with that name." under the field.
4. Tap a category → "Edit category": rename + pick a palette colour or a custom colour → Save → the timeline chips and rows update. Esc after a change → "Discard changes?".
5. Delete a category with no memories → "Delete “X”?" confirm → gone. Delete one with memories → "N memories use this category. Move them to:" with each other category and "No category" → pick one → the memories now show that category (check a row), and the deleted category's filter (if selected) resets to All.

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-categories.js src/ui/settings.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add category management with reorder and reassign-on-delete

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: `src/ui/settings-data.js` — export and import

Implements spec §10 in full (Export JSON = full backup incl. Trash, updates `meta.lastBackupAt`; Import JSON always merges, skipping existing ids, with the preview "340 memories, 5 categories in this file · 12 already in your journal · import 328?" and an inline confirm, no replace mode; Export CSV with `date, title, category, notes, starred, reminder`; Import CSV with header → field mapping guessed automatically, 5-row preview, explicit `DD/MM` ↔ `MM/DD` switch defaulting to day-first, categories created by name), §4.7 Data ("Last backup: 12 days ago").

**Files:**
- Create: `src/ui/settings-data.js`
- Modify: `src/ui/settings.js` (register), `styles/screens.css` (append)

**Interfaces:**
- Consumes: `store` (T10); `back` (T11); `importData` (T17); `activeEntries`, `sortNewestFirst`, `indexById` (T5); `parseCSV` (T6); `CSV_FIELDS`, `guessMapping`, `csvRowsToEntries`, `parseJSONExport`, `planMerge` (T7); `buildCSVExport`, `exportFilename`, `downloadText` (T8); `formatShort` (T2); `exportJSONBackup` (T21); `openSheet`, `confirmSheet`, `guard`, `toast` (T18); `sectionScreen`, `lastBackupLabel` (T24).
- Produces: `mount(root)` registered as settings section `data`; `withKnownCategories(entries, categoryIds: Set<string>): Entry[]`

- [ ] **Step 1: Implement `src/ui/settings-data.js`**

```js
import { store } from '../store.js';
import { back } from '../router.js';
import { importData } from '../db.js';
import { activeEntries, sortNewestFirst, indexById } from '../selectors.js';
import { parseCSV } from '../io/csv.js';
import { CSV_FIELDS, guessMapping, csvRowsToEntries, parseJSONExport, planMerge } from '../io/import.js';
import { buildCSVExport, exportFilename, downloadText } from '../io/export.js';
import { formatShort } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { openSheet, confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { exportJSONBackup } from './backup.js';
import { sectionScreen, lastBackupLabel } from './settings-shared.js';

/** @typedef {import('../model.js').Entry} Entry */

const PREVIEW_ROWS = 5;
const IMPORT_FAILED = "Import didn't finish. Check your connection and try again.";
/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;
/** @param {number} n */
const categories = (n) => `${n} ${n === 1 ? 'category' : 'categories'}`;

/** Entries whose categoryId is unknown get categoryId: null. @param {Entry[]} entries @param {Set<string>} ids */
export function withKnownCategories(entries, ids) {
  return entries.map((e) => (e.categoryId && !ids.has(e.categoryId) ? { ...e, categoryId: null } : e));
}

/** @param {File} file */
async function importJSONFile(file) {
  let parsed;
  try { parsed = parseJSONExport(await file.text()); } catch (err) { toast(/** @type {Error} */ (err).message); return; }
  const s = store.get();
  const plan = planMerge(s.entries, s.categories, parsed);
  if (!plan.entriesToAdd.length && !plan.categoriesToAdd.length) {
    toast('Everything in this file is already in your journal.');
    return;
  }
  const inFile = `${memories(parsed.entries.length)}, ${categories(parsed.categories.length)} in this file`;
  const already = plan.skippedEntries ? ` · ${plan.skippedEntries} already in your journal` : '';
  const ok = await confirmSheet({
    title: `Import ${memories(plan.entriesToAdd.length)}?`,
    message: `${inFile}${already}.`,
    confirmLabel: 'Import',
  });
  if (!ok) return;
  const known = new Set([...s.categories, ...plan.categoriesToAdd].map((c) => c.id));
  guard(importData(/** @type {string} */ (s.user?.uid), {
    entries: withKnownCategories(plan.entriesToAdd, known),
    categories: plan.categoriesToAdd,
  }), IMPORT_FAILED);
  toast(`Imported ${memories(plan.entriesToAdd.length)}`);
}

/** @param {File} file */
async function importCSVFile(file) {
  const { headers, rows } = parseCSV(await file.text());
  if (!rows.length) { toast('That file has no rows to import.'); return; }
  /** @type {Record<number, string>} */
  const mapping = guessMapping(headers);
  let dayFirst = true;

  openSheet({
    title: 'Import CSV',
    render(content, api) {
      const samples = headers.map((_, i) => rows.find((r) => (r[i] ?? '').trim())?.[i] ?? '');
      setHTML(content, html`
        <div class="sheet-body csv-import">
          <p class="secondary">${rows.length} rows found in “${file.name}”. Match each column to a field.</p>
          <div class="csv-map">
            ${headers.map((h, i) => html`
              <label class="field">
                <span class="field-label">${h || `Column ${i + 1}`}</span>
                <select class="select" data-action="map" data-col="${i}">
                  ${CSV_FIELDS.map((f) => html`<option value="${f.id}" ${mapping[i] === f.id ? 'selected' : ''}>${f.label}</option>`)}
                </select>
                ${samples[i] ? html`<span class="field-hint">e.g. ${samples[i].slice(0, 60)}</span>` : ''}
              </label>`)}
          </div>
          <div class="field">
            <span class="field-label" id="dayfirst-label">Dates like 03/04/2026 mean</span>
            <div class="segmented" role="group" aria-labelledby="dayfirst-label" id="dayfirst"></div>
          </div>
          <h3 class="label">Preview</h3>
          <div class="csv-preview" id="csv-preview"></div>
          <p class="field-error" id="csv-error" hidden></p>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="import" id="csv-go">Import</button>
        </div>`);

      function refresh() {
        const s = store.get();
        setHTML(/** @type {HTMLElement} */ (content.querySelector('#dayfirst')), html`
          <button type="button" data-action="dayfirst" data-value="true" aria-pressed="${String(dayFirst)}">3 April (day first)</button>
          <button type="button" data-action="dayfirst" data-value="false" aria-pressed="${String(!dayFirst)}">March 4 (month first)</button>`);
        const usable = Object.values(mapping).some((f) => f === 'title' || f === 'date');
        const err = /** @type {HTMLElement} */ (content.querySelector('#csv-error'));
        const go = /** @type {HTMLButtonElement} */ (content.querySelector('#csv-go'));
        err.hidden = usable;
        err.textContent = usable ? '' : 'Choose which column holds the title or the date.';
        if (!usable) { setHTML(/** @type {HTMLElement} */ (content.querySelector('#csv-preview')), ''); go.disabled = true; return; }
        const preview = csvRowsToEntries(rows.slice(0, PREVIEW_ROWS), mapping, { dayFirst, categories: s.categories });
        const catName = (/** @type {string|null} */ id) => [...s.categories, ...preview.newCategories].find((c) => c.id === id)?.name || '';
        setHTML(/** @type {HTMLElement} */ (content.querySelector('#csv-preview')), html`
          <table>
            <thead><tr><th scope="col">Date</th><th scope="col">Title</th><th scope="col">Category</th></tr></thead>
            <tbody>${preview.entries.map((e) => html`<tr><td>${formatShort(e.date)}</td><td>${e.title}</td><td>${catName(e.categoryId)}</td></tr>`)}</tbody>
          </table>`);
        const total = csvRowsToEntries(rows, mapping, { dayFirst, categories: s.categories }).entries.length;
        go.disabled = total === 0;
        go.textContent = `Import ${memories(total)}`;
      }
      refresh();

      const offs = [
        delegate(content, 'change', {
          map: (el) => { mapping[Number(el.dataset.col)] = /** @type {HTMLSelectElement} */ (el).value; refresh(); },
        }),
        delegate(content, 'click', {
          cancel: () => api.close(),
          dayfirst: (el) => {
            dayFirst = el.dataset.value === 'true';
            refresh();
            /** @type {HTMLElement|null} */ (content.querySelector(`[data-action="dayfirst"][data-value="${el.dataset.value}"]`))?.focus();
          },
          import: () => {
            const s = store.get();
            const result = csvRowsToEntries(rows, mapping, { dayFirst, categories: s.categories });
            if (!result.entries.length) return;
            guard(importData(/** @type {string} */ (s.user?.uid), { entries: result.entries, categories: result.newCategories }), IMPORT_FAILED);
            api.close();
            toast(`Imported ${memories(result.entries.length)}${result.skipped ? ` · ${result.skipped} empty rows skipped` : ''}`);
          },
        }),
      ];
      return () => offs.forEach((off) => off());
    },
  });
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  function render() {
    const s = store.get();
    const markup = String(sectionScreen('Data', html`
      <p class="content secondary backup-line">${lastBackupLabel(s.meta)}</p>
      <h2 class="label list-title">Export</h2>
      <div class="list">
        <button type="button" class="list-row" data-action="export-json">${icon('download')}
          <span class="list-row-main"><span class="list-row-title">Export JSON</span><span class="list-row-meta">Full backup, including Trash</span></span></button>
        <button type="button" class="list-row" data-action="export-csv">${icon('download')}
          <span class="list-row-main"><span class="list-row-title">Export CSV</span><span class="list-row-meta">For Google Sheets or Excel</span></span></button>
      </div>
      <h2 class="label list-title">Import</h2>
      <div class="list">
        <button type="button" class="list-row" data-action="pick-json">${icon('upload')}
          <span class="list-row-main"><span class="list-row-title">Import JSON</span><span class="list-row-meta">Adds a DateTracker backup to your journal</span></span></button>
        <button type="button" class="list-row" data-action="pick-csv">${icon('upload')}
          <span class="list-row-main"><span class="list-row-title">Import CSV</span><span class="list-row-meta">From any spreadsheet</span></span></button>
      </div>
      <p class="content field-hint">Importing never replaces anything: memories already in your journal are skipped.</p>
      <input type="file" id="file-json" accept=".json,application/json" data-action="file-json" hidden>
      <input type="file" id="file-csv" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" data-action="file-csv" hidden>`));
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  /** @param {string} sel */
  const pick = (sel) => { const input = /** @type {HTMLInputElement} */ (root.querySelector(sel)); input.value = ''; input.click(); };
  const offs = [
    delegate(root, 'click', {
      back: () => back('#/settings'),
      'export-json': () => exportJSONBackup(),
      'export-csv': () => {
        const s = store.get();
        downloadText(exportFilename('csv'), buildCSVExport(sortNewestFirst(activeEntries(s.entries)), indexById(s.categories)), 'text/csv');
      },
      'pick-json': () => pick('#file-json'),
      'pick-csv': () => pick('#file-csv'),
    }),
    delegate(root, 'change', {
      'file-json': (el) => { const f = /** @type {HTMLInputElement} */ (el).files?.[0]; if (f) importJSONFile(f); },
      'file-csv': (el) => { const f = /** @type {HTMLInputElement} */ (el).files?.[0]; if (f) importCSVFile(f); },
    }),
  ];
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); offs.forEach((off) => off()); } };
}
```

- [ ] **Step 2: Test `withKnownCategories`**

`tests/settings-data.test.js`:
```js
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
```
Run: `npm test -- tests/settings-data.test.js` → green.

- [ ] **Step 3: Register the section in `src/ui/settings.js`**

```js
import { mount as mountData } from './settings-data.js';
```
```js
const SECTIONS = {
  appearance: mountAppearance,
  categories: mountCategories,
  notifications: mountNotifications,
  data: mountData,
  about: mountAbout,
};
```

- [ ] **Step 4: Append styles to `styles/screens.css`**

```css
/* ---------- Settings: data ---------- */
.backup-line { padding-top: var(--sp-2); }
.select { appearance: auto; }
.csv-map { display: grid; gap: 0 var(--sp-4); grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.csv-map .field { margin-bottom: var(--sp-4); }
.csv-map .field-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csv-import h3 { margin: var(--sp-2) 0; }
.csv-preview { overflow-x: auto; margin-bottom: var(--sp-3); }
.csv-preview table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.csv-preview th { text-align: left; color: var(--text-3); font-weight: var(--fw-semibold); padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--hairline); }
.csv-preview td { padding: var(--sp-2); border-bottom: 1px solid var(--hairline); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 5: Browser check**

1. Settings → Data shows "Never backed up". Export JSON downloads `DateTracker-YYYY-MM-DD.json` (open it: `version: 2`, entries include trashed ones) and the line becomes "Last backup: today"; the timeline nudge (if showing) disappears.
2. Export CSV downloads a file that opens in Excel/Sheets with correct accents and commas inside quoted cells; columns `date,title,category,notes,starred,reminder`.
3. Import that JSON back → "Everything in this file is already in your journal." Delete one memory permanently (Trash, Task 27 — or delete the doc in the Firebase console) and import again → "Import 1 memory?" with "N memories, M categories in this file · N−1 already in your journal." → Import → it returns.
4. Import a non-DateTracker JSON (e.g. `package.json`) → toast "That file is not a DateTracker export."
5. Import CSV with a file like:
   ```
   Event,When,Notes,Tag
   Trip to Goa,03/04/2024,"Beach, sun",Travel
   Bought a bike,2025-01-10,,Purchases
   ```
   → columns pre-mapped Title/Date/Notes/Category; preview shows "Apr 3, 2024" (day first); switching to month first shows "Mar 4, 2024"; mapping every column to Skip shows "Choose which column holds the title or the date." and disables Import; "Import 2 memories" adds them, creating "Purchases" as a new category.

- [ ] **Step 6: Commit**

```bash
git add src/ui/settings-data.js tests/settings-data.test.js src/ui/settings.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add data export and merge-only JSON/CSV import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: `src/ui/settings-trash.js` — Trash

Implements spec §4.7 Trash (trashed entries with title, date, "deleted N days ago" and **Restore**; **Empty trash** at the bottom with a confirm) and §3 (nothing auto-purges).

**Files:**
- Create: `src/ui/settings-trash.js`
- Modify: `src/ui/settings.js` (register), `styles/screens.css` (append)

**Interfaces:**
- Consumes: `store` (T10); `back` (T11); `restoreEntry`, `emptyTrash` (T17); `trashedEntries` (T5); `formatShort`, `relativeDayLabel` (T2); `confirmSheet`, `guard`, `toast` (T18); `sectionScreen` (T24).
- Produces: `mount(root)` registered as settings section `trash`.

- [ ] **Step 1: Implement `src/ui/settings-trash.js`**

```js
import { store } from '../store.js';
import { back } from '../router.js';
import { restoreEntry, emptyTrash } from '../db.js';
import { trashedEntries } from '../selectors.js';
import { formatShort, relativeDayLabel } from '../dates.js';
import { html, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { confirmSheet } from './sheet.js';
import { guard, toast } from './toast.js';
import { sectionScreen } from './settings-shared.js';

/** @param {number} n */
const memories = (n) => `${n} ${n === 1 ? 'memory' : 'memories'}`;

/** "Deleted today" / "Deleted yesterday" / "Deleted 3 days ago" @param {number} deletedAt @param {Date} now */
function deletedLabel(deletedAt, now) {
  const rel = relativeDayLabel(new Date(deletedAt), now);
  return `Deleted ${rel.charAt(0).toLowerCase()}${rel.slice(1)}`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  let last = '';
  function render() {
    const now = new Date();
    const trashed = trashedEntries(store.get().entries);
    const markup = String(sectionScreen('Trash', trashed.length
      ? html`
        <p class="content secondary trash-intro">Deleted memories stay here until you empty the trash.</p>
        <ul class="list" aria-label="Trashed memories">
          ${trashed.map((e) => html`
            <li class="list-row">
              <span class="list-row-main">
                <span class="list-row-title">${e.title}</span>
                <span class="list-row-meta">${formatShort(e.date)} · ${deletedLabel(/** @type {number} */ (e.deletedAt), now)}</span>
              </span>
              <button type="button" class="btn btn-quiet" data-action="restore" data-id="${e.id}" aria-label="Restore ${e.title}">${icon('undo-2', { cls: 'icon-sm' })}Restore</button>
            </li>`)}
        </ul>
        <div class="content trash-actions">
          <button type="button" class="btn btn-danger" data-action="empty">${icon('trash-2')}Empty trash</button>
        </div>`
      : html`<div class="empty"><h2>Trash is empty.</h2><p>Deleted memories stay here until you empty the trash.</p></div>`));
    if (markup !== last) { setHTML(root, markup); last = markup; }
  }
  const off = delegate(root, 'click', {
    back: () => back('#/settings'),
    restore: (el) => {
      const uid = store.get().user?.uid;
      if (!uid) return;
      guard(restoreEntry(uid, /** @type {string} */ (el.dataset.id)));
      toast('Restored');
    },
    empty: async () => {
      const s = store.get();
      const ids = trashedEntries(s.entries).map((e) => e.id);
      if (!ids.length || !s.user) return;
      const ok = await confirmSheet({
        title: 'Empty trash?',
        message: `${memories(ids.length)} will be deleted forever. This can't be undone.`,
        confirmLabel: 'Delete forever',
        danger: true,
      });
      if (ok) guard(emptyTrash(s.user.uid, ids));
    },
  });
  const unsub = store.subscribe(render);
  render();
  return { unmount() { unsub(); off(); } };
}
```

- [ ] **Step 2: Register the section in `src/ui/settings.js`**

```js
import { mount as mountTrash } from './settings-trash.js';
```
```js
const SECTIONS = {
  appearance: mountAppearance,
  categories: mountCategories,
  notifications: mountNotifications,
  data: mountData,
  trash: mountTrash,
  about: mountAbout,
};
```
Also delete the fallback in `mount()` — every section in `SETTINGS_SECTIONS` now exists. Replace the end of `mount` with:
```js
export function mount(root, { section = '' }) {
  const m = section ? SECTIONS[section] : undefined;
  return m ? m(root) : mountIndex(root);
}
```

- [ ] **Step 3: Append styles to `styles/screens.css`**

```css
/* ---------- Settings: trash ---------- */
.trash-intro { padding-top: var(--sp-2); padding-bottom: var(--sp-4); }
.trash-actions { display: flex; justify-content: center; }
```

- [ ] **Step 4: Browser check**

1. Delete two memories from their entry screens. Settings → Trash lists both, newest deletion first, as "<date> · Deleted today".
2. Restore one → toast "Restored"; it's back on the timeline with its star/reminder/category intact.
3. Empty trash → "Empty trash?" with "1 memory will be deleted forever. This can't be undone." → Cancel keeps it; "Delete forever" removes it; Firestore no longer has that document. The screen shows "Trash is empty."
4. Nothing disappears from Trash on its own (leave an item for a day and check).

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-trash.js src/ui/settings.js styles/screens.css
git commit -m "$(cat <<'EOF'
feat: add trash with restore and manual empty

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — PWA and release

### Task 28: Web app manifest and PNG app icons

Implements spec §11 PWA manifest (name, short name, `start_url: "./"`, `display: standalone`, theme/background colours, icons 192 / 512 / maskable, `apple-touch-icon`; a geometric mark drawn from paths, no text, generated to PNG once and committed).

**Files:**
- Create: `scripts/make-app-icons.ps1`, `manifest.webmanifest`
- Create (generated): `assets/icons/icon-192.png`, `assets/icons/icon-512.png`, `assets/icons/icon-maskable-512.png`, `assets/icons/apple-touch-icon.png`
- Test: `tests/manifest.test.js`

**Interfaces:**
- Produces: the icon files referenced by `index.html` (T14), `showReminderNotification` (T23) and the service worker precache (T29).

- [ ] **Step 1: Write the failing test**

`tests/manifest.test.js`:
```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/manifest.test.js`
Expected: FAIL — `ENOENT: … manifest.webmanifest`.

- [ ] **Step 3: Write `scripts/make-app-icons.ps1`**

```powershell
# Rasterise the DateTracker mark (see assets/icons/favicon.svg) to PNG icons.
# Windows PowerShell, from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-app-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\icons'))
$bg = [System.Drawing.Color]::FromArgb(255, 0xC8, 0x95, 0x6C)   # copper
$fg = [System.Drawing.Color]::FromArgb(255, 0x1A, 0x14, 0x10)   # near-black

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# $fullBleed: square background (maskable / apple-touch); otherwise a rounded square with transparent corners.
function New-Icon([int]$size, [string]$name, [bool]$fullBleed) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 64.0
  $brush = New-Object System.Drawing.SolidBrush $bg
  if ($fullBleed) { $g.FillRectangle($brush, 0, 0, $size, $size) }
  else { $g.FillPath($brush, (New-RoundedRect 0 0 $size $size (14 * $s))) }

  $pen = New-Object System.Drawing.Pen $fg, (5 * $s)
  $r = 15 * $s
  $c = 32 * $s
  $g.DrawEllipse($pen, $c - $r, $c - $r, 2 * $r, 2 * $r)
  $dot = 5 * $s
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $fg), $c - $dot, $c - $dot, 2 * $dot, 2 * $dot)

  $g.Dispose()
  $path = Join-Path $out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("{0} {1}x{1} {2} bytes" -f $name, $size, (Get-Item $path).Length)
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
New-Icon 180 'apple-touch-icon.png' $true
```
The ring's outer radius is 17.5/64 ≈ 27 % of the icon, inside the 40 % maskable safe zone, so the full-bleed icon needs no extra padding.

- [ ] **Step 4: Generate the icons** (PowerShell)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-app-icons.ps1
```
Expected: four lines, e.g. `icon-192.png 192x192 3012 bytes`. Open `icon-512.png` and `icon-maskable-512.png` in an image viewer: copper background, dark ring, centre dot, crisp edges.

- [ ] **Step 5: Create `manifest.webmanifest`**

```json
{
  "name": "DateTracker",
  "short_name": "DateTracker",
  "description": "A private journal of memorable events.",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0F0E0D",
  "theme_color": "#0F0E0D",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- tests/manifest.test.js`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add scripts/make-app-icons.ps1 manifest.webmanifest assets/icons tests/manifest.test.js
git commit -m "$(cat <<'EOF'
feat: add web app manifest and PNG app icons

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 29: `sw.js` — offline shell and "Update ready · Reload"

Implements spec §11 service worker (versioned precache of the app shell incl. fonts, icons and the vendored Firebase SDK; cache-first for the shell; network-only for Firebase/Google endpoints; when a new worker is waiting, show "Update ready · Reload" and activate it on reload), §9 (notification click opens the entry).

**Design notes:**
- The worker never calls `skipWaiting()` on its own; the page asks for it (`postMessage('SKIP_WAITING')`) when the user taps **Reload**, then reloads on `controllerchange`. The first install claims the page without reloading it.
- Registration is skipped on `localhost` unless the URL has `?sw=1`, so development never fights a stale cache.
- **Every deploy must bump `VERSION` in `sw.js`**, otherwise returning users keep the old shell. `tests/sw.test.js` also fails when a new `src/` module is not in the precache list.

**Files:**
- Create: `sw.js`
- Test: `tests/sw.test.js`
- Modify: `src/main.js` (register the worker, wire `onReload`)

**Interfaces:**
- Consumes: `store` (`updateReady`) (T10); `startApp` hook `onReload` (T19); notification `data.url` from `showReminderNotification` (T23).
- Produces: `sw.js` with `VERSION`, `SHELL`; message `'SKIP_WAITING'`.

- [ ] **Step 1: Write the failing test**

`tests/sw.test.js`:
```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/sw.test.js`
Expected: FAIL — `ENOENT: … sw.js`.

- [ ] **Step 3: Create `sw.js`**

```js
/* DateTracker service worker — precaches the app shell and serves it cache-first.
 * Bump VERSION on every deploy. Firebase / Google requests are never cached. */
const VERSION = '9.0.0-1';
const CACHE = `dt-shell-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/screens.css',
  './src/main.js',
  './src/config.js',
  './src/firebase.js',
  './src/db.js',
  './src/store.js',
  './src/selectors.js',
  './src/model.js',
  './src/dates.js',
  './src/reminders.js',
  './src/router.js',
  './src/theme.js',
  './src/notifications.js',
  './src/io/csv.js',
  './src/io/import.js',
  './src/io/export.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/sheet.js',
  './src/ui/toast.js',
  './src/ui/app.js',
  './src/ui/landing.js',
  './src/ui/timeline.js',
  './src/ui/backup.js',
  './src/ui/compose.js',
  './src/ui/entry-detail.js',
  './src/ui/reminders-view.js',
  './src/ui/settings.js',
  './src/ui/settings-shared.js',
  './src/ui/settings-categories.js',
  './src/ui/settings-data.js',
  './src/ui/settings-trash.js',
  './vendor/firebase/firebase-app.js',
  './vendor/firebase/firebase-auth.js',
  './vendor/firebase/firebase-firestore.js',
  './assets/fonts/Outfit-latin.woff2',
  './assets/fonts/OFL.txt',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/LICENSE-lucide.txt',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dt-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, Google sign-in, avatars: straight to the network
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          if ('navigate' in w) w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/sw.test.js`
Expected: green. (If it names a missing module, add that path to `SHELL`.)

- [ ] **Step 5: Register the worker in `src/main.js`**

Add after `startRouter();`:
```js
const hadController = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' && !new URLSearchParams(location.search).has('sw')) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const markReady = () => store.set({ updateReady: true });
    if (reg.waiting && navigator.serviceWorker.controller) markReady();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) markReady();
      });
    });
    setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
  }).catch((err) => console.warn('Service worker registration failed', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // first install: nothing to reload
    reloading = true;
    location.reload();
  });
}

function applyUpdate() {
  navigator.serviceWorker?.getRegistration().then((reg) => {
    if (reg?.waiting) reg.waiting.postMessage('SKIP_WAITING');
    else location.reload();
  });
}

registerServiceWorker();
```
and change the `startApp` hook:
```js
  onReload: () => applyUpdate(),
```

- [ ] **Step 6: Browser check**

1. `npm run serve`, open `http://localhost:8080/?sw=1`. DevTools → Application → Service workers: `sw.js` activated; Cache storage `dt-shell-9.0.0-1` contains every `SHELL` entry.
2. Network → Offline, reload: the app loads fully (fonts, icons, your journal from the Firestore cache); adding a memory works and syncs when back online. Network tab shows no request to `gstatic.com` or `fonts.googleapis.com`.
3. Change `VERSION` to `'9.0.0-2'`, reload once → the pill "Update ready · Reload" appears; tap Reload → the page reloads under the new worker and the old cache is deleted. Revert `VERSION` to `'9.0.0-1'` before committing.
4. Application → Manifest shows name, icons (maskable preview centred) and "Installable". Lighthouse → PWA/installability has no errors.
5. With notifications on, trigger a reminder (Task 23 step 9) and click the notification → the app focuses and opens that memory.
6. Unregister the worker (Application → Service workers → Unregister) when done, so plain `localhost:8080` development isn't cached.

- [ ] **Step 7: Commit**

```bash
git add sw.js tests/sw.test.js src/main.js
git commit -m "$(cat <<'EOF'
feat: add service worker with offline shell and update prompt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 30: Rules, CI, README, CHANGELOG and the release checklist

Implements spec §6 (Firestore rules checked in as `firestore.rules`), §13 (CI runs `npm test` on push/PR; manual checklist), §14 (CHANGELOG from 9.0.0 noting v8 data is not carried over; README rewritten, with a correct explanation that the Firebase web API key is public by design; merge to `main` only when the checklist passes).

**Files:**
- Create: `firestore.rules`, `.github/workflows/test.yml`, `CHANGELOG.md`, `docs/release-checklist.md`, `docs/screenshots/timeline.png`, `docs/screenshots/entry.png`
- Replace: `README.md`

- [ ] **Step 1: Create `firestore.rules`**

```
rules_version = '2';
// DateTracker: each signed-in user can read and write only their own data.
// v9 stores users/{uid}/entries/*, users/{uid}/categories/* and users/{uid}/meta/app.
// Deploy from the Firebase console (Firestore → Rules) or with the Firebase CLI.
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 2: Create `.github/workflows/test.yml`**

```yaml
name: test

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 3: Create `CHANGELOG.md`**

```markdown
# Changelog

## 9.0.0 — 2026

A ground-up rewrite. DateTracker is now a private journal of memorable events.

**Fresh start:** data from v8 is not carried over. The v8 document (`users/{uid}/data/main`) is left untouched in Firestore and can be deleted from the Firebase console. Import from Google Keep is planned for 9.1.

### New
- Timeline home: memories grouped by month, with a month jumper.
- On This Day and Upcoming cards on the timeline.
- Search across titles, notes and categories (`/` to focus).
- Star memories and filter by star and category.
- Trash with Undo and Restore; nothing is deleted until you empty the trash.
- Reminders: once or every year, with a Reminders screen, a badge on the bell, and **Add to calendar** (`.ics`) for dependable alerts.
- Notifications fire once per occurrence, even if the app is opened later that day.
- Works offline and installs as an app (PWA). Changes sync live between devices.
- Import JSON always merges and never replaces; CSV import lets you choose day-first or month-first dates.
- Theme: System, Light or Dark, with 8 accent colours or a custom one.

### Changed
- Every memory is its own Firestore document, so two devices editing different memories never overwrite each other.
- Dates are stored as local calendar days, so memories no longer shift by a day around midnight.
- Copy, layout, icons (Lucide) and type (self-hosted Outfit) redesigned; everything is keyboard and screen-reader accessible, and pinch-zoom works.
- Code split into small ES modules with unit tests; still no build step.

### Removed
- Quick Log, Pin (replaced by Star), Archive (replaced by Trash), daily/weekly/monthly reminders, the dashboard and the tutorial.
```

- [ ] **Step 4: Replace `README.md`**

````markdown
# DateTracker

A private journal of memorable events — trips, purchases, milestones, health episodes, conversations. Record what happened and when, look back with **On This Day**, and get reminders for renewals and anniversaries.

**Live app → [anshulsamarwal2.github.io/DateTracker](https://anshulsamarwal2.github.io/DateTracker/)**

It is a log, not a to-do list or a habit tracker.

<p>
  <img src="docs/screenshots/timeline.png" alt="The timeline: On This Day and Upcoming cards above memories grouped by month" width="300">
  <img src="docs/screenshots/entry.png" alt="A memory with its notes, category and a yearly reminder" width="300">
</p>

## Features

- **Timeline** of memories grouped by month, newest first, with search, a star filter and category filters.
- **On This Day**: memories from the same date in earlier years.
- **Reminders**, once or every year, with a Reminders screen and **Add to calendar** (`.ics`) so your calendar app can alert you.
- **Trash** with Undo. Nothing is deleted until you empty it.
- **Categories** with colours and your own order.
- **Export** JSON (full backup) or CSV; **import** JSON backups or any CSV (merge only — nothing is ever replaced).
- **Works offline** and **installs** as an app. Changes sync live across your devices.
- Light, dark or system theme, with a choice of accent colour.

## Privacy

No analytics, no ads, no tracking. Your journal is stored in Firestore under your Google account's user id, and Firestore rules allow only you to read or write it. Theme and accent are stored on your device only.

## Run locally

ES modules don't load from `file://`, so use the bundled static server (Node 20+):

```bash
npm install      # only needed for tests
npm run serve    # http://localhost:8080/
npm test         # unit tests (Vitest)
```

`localhost` is an authorised Firebase domain by default, so Google sign-in works. The service worker is not registered on `localhost` unless you add `?sw=1`.

## Deploy your own copy

1. **Firebase:** create a project, add a Firestore database, enable **Authentication → Google**, and register a web app.
2. **Config:** put your web app's config in `src/config.js` — the only file you need to edit.
3. **Rules:** paste `firestore.rules` into Firestore → Rules and publish.
4. **Authorised domains:** add your host (e.g. `yourname.github.io`) under Authentication → Settings → Authorised domains.
5. **Host:** any static host works. For GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

About the API key in `src/config.js`: a Firebase *web* API key is not a secret. It only identifies your project to Google. Access to data is controlled by the Firestore rules (only the signed-in owner can read or write their documents) and by the list of authorised domains for sign-in.

When you deploy a change, bump `VERSION` in `sw.js` so installed copies pick up the new files ("Update ready · Reload").

## How it's built

Plain HTML, CSS and native ES modules — no bundler, no framework, no build step. `npm` is only used for tests.

```
index.html            app shell (inline icon sprite)
sw.js                 offline cache
manifest.webmanifest  PWA manifest
styles/               tokens, base, components, screens
src/
  main.js             boot: theme → auth → first run → live sync → screens
  config.js           Firebase config
  firebase.js         SDK init (only this and db.js import Firebase)
  db.js               all Firestore reads and writes
  store.js            app state
  selectors.js        derived views (timeline groups, on this day, upcoming…)
  model.js dates.js reminders.js router.js theme.js notifications.js
  io/                 CSV, import, export
  ui/                 screens and components
vendor/firebase/      Firebase JS SDK 10.12.2 (ESM, vendored for offline use)
tests/                Vitest unit tests
```

Scripts: `scripts/vendor-firebase.sh` (refresh the SDK), `scripts/make-sprite.mjs` (rebuild the icon sprite), `scripts/make-app-icons.ps1` (rebuild PNG icons).

## Data model

```
users/{uid}/entries/{id}      title, date ('YYYY-MM-DD', local), notes, categoryId|null, starred,
                              reminder: null | {kind:'once', at:'YYYY-MM-DDTHH:MM'} | {kind:'yearly', time:'HH:MM'},
                              deletedAt|null, createdAt, updatedAt
users/{uid}/categories/{id}   name, color '#RRGGBB', order, createdAt
users/{uid}/meta/app          schemaVersion: 2, createdAt, lastBackupAt, backupNudgeDismissedAt
```

## About notifications

A free web app without a server can't wake itself up at a set time. DateTracker shows a notification when a reminder is due while the app is open (or opened later that day), and the bell and Upcoming card show what's coming. For alerts you can rely on, use **Add to calendar** on a memory.

## Credits & licences

Built by Anshul Samarwal, designed and developed with [Claude](https://claude.ai) by Anthropic.
Icons: [Lucide](https://lucide.dev) (ISC). Typeface: [Outfit](https://fonts.google.com/specimen/Outfit) (SIL Open Font License 1.1).

Personal project. Not licensed for redistribution or commercial use.

Version history: [CHANGELOG.md](CHANGELOG.md). The previous single-file app is at the `v8.2-legacy` tag.
````

- [ ] **Step 5: Create `docs/release-checklist.md`**

```markdown
# DateTracker 9.0 — release checklist

Run on the deployed build (or `npm run serve` with `?sw=1`). Tick every line before merging `v9-redesign` into `main`.

## Accounts & sync
- [ ] Sign in with the popup on desktop Chrome, Firefox and Safari.
- [ ] Sign in from the installed PWA (standalone) on Android and iOS — the redirect flow completes and lands in the app.
- [ ] Fresh account: `meta/app` and exactly four categories are created once; reloading doesn't add more.
- [ ] Existing v8 user: `users/{uid}/data/main` is untouched.
- [ ] Two devices signed in: adding, editing, starring and deleting on one appears on the other within seconds.
- [ ] Offline: add and edit memories, reload, still there; back online, they reach Firestore. The amber dot and the "Offline — changes will sync" pill behave.
- [ ] Offline on a device that has never loaded the account shows "Couldn't load your journal" with Retry, never an empty journal.

## Features
- [ ] Trash: delete → Undo restores; delete → Settings → Trash → Restore; Empty trash asks first.
- [ ] Reminders: once and yearly show correctly in Upcoming and Past; a due reminder notifies once; Feb 29 anniversaries show Feb 28 in non-leap years.
- [ ] Add to calendar: the `.ics` opens in Google Calendar, Apple Calendar and Outlook; the yearly one repeats and has an alert.
- [ ] Export JSON → Import JSON on another account restores everything (categories, stars, reminders, trash).
- [ ] CSV import of a Keep-style spreadsheet with DD/MM dates, then with MM/DD using the switch.

## Look & feel
- [ ] Light, Dark and System themes; all 8 accents and a custom colour; native date/time pickers match the theme.
- [ ] 360 px phone, tablet and desktop widths: no horizontal scrolling, no text under 12 px, the FAB stays in the column.
- [ ] `prefers-reduced-motion`: no slide or fade animations.

## Accessibility
- [ ] Keyboard only: every action reachable; focus visible; `/` opens search; Esc closes search and sheets; focus returns to the opener after a sheet closes; Tab never leaves an open sheet.
- [ ] Screen reader (NVDA or VoiceOver) on Timeline and Compose: rows read the date and title; chips announce pressed state; errors are announced; toasts are read.
- [ ] Pinch-zoom works on mobile.

## PWA
- [ ] Install on Android (Chrome) and iOS (Safari → Add to Home Screen); icon looks right, including the maskable crop.
- [ ] Offline launch of the installed app works.
- [ ] Bumping `VERSION` in `sw.js` shows "Update ready · Reload" and the reload picks up the new version.

## Release
- [ ] `npm test` passes locally and in GitHub Actions.
- [ ] `VERSION` in `sw.js` is final; `CHANGELOG.md` is up to date.
```

- [ ] **Step 5b: Capture the README screenshots**

With a journal that has a few memories (an On This Day match, an upcoming reminder, two months of entries), run `npm run serve`, open DevTools device mode at **390 × 844**, dark theme, and use DevTools → ⋮ → *Capture screenshot*:
- the Timeline → save as `docs/screenshots/timeline.png`
- an entry with notes and a yearly reminder → save as `docs/screenshots/entry.png`

Use a test account or made-up memories: nothing personal goes into the repo. (If the Playwright MCP tools are available, `browser_resize` 390×844 + `browser_take_screenshot` does the same.)

- [ ] **Step 6: Run everything**

```bash
npm test
git status --short
```
Expected: all suites pass (dates, model, reminders, selectors, csv, import, export, dom, store, router, theme, icons, db, entry-detail, notifications, settings-data, manifest, sw, smoke). `git status` lists only the files from this task.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules .github/workflows/test.yml CHANGELOG.md README.md docs/release-checklist.md docs/screenshots
git commit -m "$(cat <<'EOF'
docs: add rules, CI, changelog, README and release checklist for 9.0.0

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Stop and hand over**

Do **not** push, merge into `main`, or push the `v8.2-legacy` tag. Pushing `main` publishes the app to every user via GitHub Pages. Report to the user: the branch is ready, the test results, and that `docs/release-checklist.md` needs a pass on real devices before merging. Merge and push only when the user says so.
