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
| `src/ui/reminders-view.js` | Reminders screen + scheduler wiring |
| `src/ui/settings.js` | Settings screen and all sections |
| `tests/*.test.js` | Vitest unit tests for pure modules |
| `.github/workflows/test.yml` | CI |
| `README.md`, `CHANGELOG.md` | Docs |

---

## Phase 0 — Scaffold

### Task 1: Tag the legacy app and scaffold the repo

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `tests/smoke.test.js`
- Create (empty dirs via `.gitkeep`): `src/ui/`, `src/io/`, `styles/`, `assets/fonts/`, `assets/icons/`, `vendor/firebase/`, `scripts/`

**Interfaces:**
- Produces: `npm test` runs Vitest over `tests/**/*.test.js`.

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
    "serve": "python -m http.server 8080"
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
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(days);
  let label;
  if (abs < 7) label = rtf.format(days, 'day');
  else if (abs < 30) label = rtf.format(Math.round(days / 7), 'week');
  else if (abs < 365) label = rtf.format(Math.round(days / 30), 'month');
  else label = rtf.format(Math.round(days / 365), 'year');
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
    expect(ics).not.toContain('DESCRIPTION:');
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

- [ ] **Step 1: Write the failing tests**

`tests/selectors.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  activeEntries, trashedEntries, sortNewestFirst, indexById, filterEntries,
  groupByMonth, onThisDay, upcomingReminders, reminderSections, categoryCounts,
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

<!-- PLAN IN PROGRESS: Tasks 1-8 written. Remaining: T9 ui/dom, T10 store, T11 theme, T12 assets+firebase.js+config.js, T13 tokens+base CSS, T14 components CSS, T15 index.html+sprite+icons.js, T16 db.js, T17 router, T18 sheet+toast, T19 landing+main+app.js, T20 timeline, T21 compose, T22 entry-detail, T23 reminders-view+scheduler, T24-27 settings sections, T28 manifest+app icons, T29 sw.js, T30 rules+CI+README+CHANGELOG+manual checklist. Then self-review (spec coverage, placeholders, type consistency). -->
