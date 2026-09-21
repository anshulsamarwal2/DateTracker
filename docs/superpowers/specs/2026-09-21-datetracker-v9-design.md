# DateTracker v9 — Design Spec

**Date:** 2026-09-21
**Status:** Draft for approval
**Scope:** Ground-up redesign and rewrite of DateTracker as a journal of memorable events. Replaces the v8.2 single-file app.

---

## 1. Summary

DateTracker becomes a **private, dated journal of memorable events** — trips, purchases, milestones, health episodes, conversations. One entry type. A chronological timeline as the home screen. "On This Day" as the emotional core. Reminders for renewals and anniversaries. Syncs privately through Firebase; installs as a PWA; works offline.

The rewrite keeps the zero-build promise (no bundler, no framework) but splits the code into focused ES modules, removes the data-loss paths in v8, stores each entry as its own document with live sync, and replaces the current UI with a coherent information architecture and visual system. It is a **fresh start**: existing v8 data is not migrated (the owner keeps a copy in Google Keep and will import it later).

**What it is:** a log of what happened and when.
**What it is not:** a to-do list, a habit tracker, a recurring-tick counter (Quick Log is removed).

---

## 2. Decisions already made

| Question | Decision |
|---|---|
| Purpose | Redesign "all of it": concepts, navigation, look — and make the code understandable |
| Tooling | Zero-build, multiple files (native ES modules). `npm` only for optional tests |
| Content | Memorable events only. Quick Log removed |
| Mockups | None; design decisions delegated to the implementer |
| Existing data | **Not migrated.** Fresh start; the v8 Firestore document is ignored and left in place. Owner's data lives in Google Keep and will be imported in a later release |

---

## 3. Information architecture

No bottom tabs. One primary screen, a few secondary screens reached from it, and sheets for editing.

```
Landing (signed out)
└── Timeline (home)                      #/
    ├── Entry detail                     #/entry/:id
    │   └── Compose (edit)               sheet
    ├── Compose (new)                    sheet, from the + button
    ├── Reminders                        #/reminders
    └── Settings                         #/settings
        ├── Appearance                   #/settings/appearance
        ├── Categories                   #/settings/categories
        ├── Notifications                #/settings/notifications
        ├── Data (export / import)       #/settings/data
        ├── Trash                        #/settings/trash
        └── About                        #/settings/about
```

**Header (Timeline):** wordmark · search · reminders bell (badge = reminders in next 14 days) · avatar (→ Settings).
**Floating action:** a single `+` opens Compose. There is exactly one way to add a memory.
**Routing:** hash-based so the browser/Android back button works and every screen is linkable. Sheets push a history entry so back closes them.

### Concept inventory (before → after)

| v8 concept | v9 |
|---|---|
| Entry + Quick Log | Entry only |
| Pin (sort to top) | **Star** (favourite; filterable, never re-sorts) |
| Archive + permanent delete | **Trash** — delete moves here with Undo; restore or "Empty trash" manually; nothing auto-purges |
| Category "show in On This Day" toggle | Removed — every memory qualifies |
| Reminder repeat: once / daily / weekly / monthly / yearly | **Once** or **Every year** only |
| Dashboard (greeting, stats, quick actions, recent) | Removed — the Timeline *is* the home; On This Day and Upcoming appear on it as cards when relevant |
| 4-slide tutorial | Removed — replaced by a teaching empty state |
| Backup banner on dashboard | Gentle, dismissible one-line nudge on the Timeline once every 30 days without a backup |

---

## 4. Screens

### 4.1 Landing (signed out)

Wordmark, one-line tagline ("Moments worth remembering."), three feature lines with icons (private journal · on this day · reminders for renewals & anniversaries), **Continue with Google**, footer "Private · Free · No ads". If offline: "You're offline — connect to sign in."

Sign-in uses `signInWithPopup`; falls back to `signInWithRedirect` when the popup is blocked or the app is running standalone (installed PWA / iOS).

### 4.2 Loading

Wordmark + spinner while auth state resolves and the first snapshot arrives. If the first load fails, an error screen with **Retry** — never an empty journal.

### 4.3 Timeline (home)

Top to bottom:

1. **Header** as above. Tapping search turns the header into a search field with Cancel; filtering is live on title, notes, category name. While searching, the cards below are hidden and results use the same grouped layout. Empty result: "No memories match 'xyz'."
2. **Filter strip** (sticky, only shown when there is ≥1 entry): `All` · `★` · one chip per category. Category is single-select; `★` is a toggle that combines with it. Chips are `<button aria-pressed>`.
3. **Backup nudge** (conditional): one line, "30 days since your last backup · Export · Dismiss".
4. **On This Day card** (conditional): shown when past-year entries share today's month/day. Header "On this day · 21 September". Rows: `2023 · Trip to Jaipur · Travel` with "3 years ago" on the right. Up to 3 rows, then "and 2 more" expands. Row tap → Entry detail.
5. **Upcoming card** (conditional): shown when any reminder fires in the next 14 days. Header "Upcoming · See all →". Rows: `Tomorrow · Mum's birthday` / `in 4 days · Car insurance renewal`. Row tap → Entry detail.
6. **Entries**, grouped by month, newest first. Month header (`September 2026`) is sticky; tapping it opens a compact month/year jumper that scrolls to that month.
   - **Row:** left column, fixed width — day-of-month (large) over weekday (small, muted). Middle — title (one line, ellipsis); below it category dot + name · first line of notes (muted, one line). Right — star icon if starred, small bell if a reminder is set. Whole row is a button → Entry detail. Rows are separated by hairlines, not cards.
7. **Empty state** (no entries at all): illustration-free, warm copy — "Your journal is empty. Tap + to record your first memory — a trip, a purchase, a milestone. Anything worth remembering." Filter strip and cards hidden.

Timeline re-renders on store change; there are no expand/collapse states to lose.

### 4.4 Entry detail

Full-screen view (slides in; back returns to Timeline at the same scroll position).

- Header: back · star toggle.
- Date line: "Thursday, 18 September 2026".
- Title (large).
- Category chip (coloured).
- Notes, full, with preserved line breaks; links auto-detected and clickable (`rel="noopener"`).
- Reminder block (if set): "Every year · 09:00 · next: 18 Sep 2027" plus **Add to calendar** (downloads an `.ics`).
- Bottom actions: **Edit** (primary) · **Delete** (text, danger).
- Delete: moves to Trash immediately, toast "Moved to Trash · **Undo**" (6 s). No confirm dialog.

### 4.5 Compose (new / edit)

Bottom sheet on phones, centred dialog ≥ 720 px. Fields in order:

1. **Title** — required, autofocus, ≤ 200 chars. Placeholder: "What happened?"
2. **Date** — native `<input type="date">`, default today (local). Required.
3. **Category** — chips, single-select, plus a `+ New` chip that reveals an inline name input (colour auto-assigned from the palette). May be left empty (`categoryId: null`).
4. **Notes** — auto-growing textarea, ≤ 5000 chars. Placeholder: "Details, cost, who was there…"
5. **Star** — toggle row.
6. **Reminder** — collapsed row "Add a reminder". Expanded: segmented `Once` / `Every year`.
   - Once: datetime-local, default = entry date 09:00 if that is in the future, otherwise tomorrow 09:00.
   - Every year: time, default 09:00. Fires on the entry's month/day.
7. **Save** (primary) · **Cancel**.

Validation is inline under the field (never a toast). Dismissing a dirty form (backdrop, Esc, back) asks "Discard changes?" with *Keep editing* / *Discard* in a small inline confirm — never `window.confirm`.

### 4.6 Reminders

List of entries that have a reminder, sorted by next occurrence.

- Sections: **Upcoming** (next occurrence in the future), **Past** (once-reminders whose time has passed).
- Row: relative chip (`Today` / `Tomorrow` / `in 3 days` / `in 2 months` / `2 days ago`) · title · category · schedule ("Every year · 09:00" / "18 Sep 2026 · 09:00"). Tap → Entry detail.
- Header action: notification status (enabled / tap to enable) with a one-line honest explanation (see §9).
- Empty: "No reminders yet. Add one from any memory."

### 4.7 Settings

Grouped list, each group opens a sub-screen with back navigation.

- **Account** — avatar, name, email. "342 memories across 5 categories."
- **Appearance** — Theme: `System` / `Light` / `Dark` (segmented). Accent: 8 swatches (Copper default, Coral, Gold, Sage, Teal, Blue, Violet, Rose) + custom colour. Stored per device.
- **Categories** — list with colour dot, name, entry count, drag handle (order). Tap → edit: rename, colour (palette + custom), delete. Deleting a category with entries asks where to move them (another category or "No category"). Add category at bottom.
- **Notifications** — permission status, enable button, explanation of what in-app notifications can and cannot do, and the calendar-export alternative.
- **Data** — Export JSON · Export CSV · Import JSON · Import CSV · "Last backup: 12 days ago".
- **Trash** — trashed entries (title, date, deleted N days ago) with **Restore**; **Empty trash** at the bottom (inline confirm).
- **About** — version, "Built by Anshul Samarwal", GitHub link, licence line for Lucide icons and Outfit font.
- **Sign out** — inline confirm.

---

## 5. Visual design

**Direction:** keep the warm, dark, copper identity DateTracker already has, but execute it with a real type scale, a single icon language, and surfaces that create hierarchy instead of uniform bordered cards.

### Typography

- **Outfit**, self-hosted variable woff2 (`assets/fonts/`), fallback `system-ui`. No Google Fonts request.
- Base **16 px**. Scale: 12 · 14 · 16 · 20 · 28. Weights 400 / 500 / 600.
- Exactly one "label" style: 12 px / 600 / uppercase / `letter-spacing: .04em` — used for month headers, card headers and section labels. Nothing smaller than 12 px anywhere.
- Line-height 1.5 body, 1.25 headings.

### Colour

Tokens on `:root`, overridden under `[data-theme="light"]`. Default follows `prefers-color-scheme`; user choice overrides and persists.

- Dark: near-black warm background, two surface steps, hairline, three text levels, accent. Light: warm off-white equivalents.
- **Contrast requirement:** all text ≥ 4.5:1 (AA); the accent is never used for body-size text on light backgrounds — only for icons, large text and fills.
- Accent is a CSS variable; `--accent-soft` is derived with `color-mix()`. Category colours: the existing 20-colour palette, used for dots and chip fills; category *names* are drawn in text colour, not category colour, at small sizes.
- `color-scheme` is set per theme so native date/time pickers match.

### Icons

Inline SVG sprite in `index.html` (`<symbol id="i-…">`) using **Lucide** paths (ISC licence, included). ~24 icons: plus, search, bell, settings, star, star-filled, calendar, clock, repeat, tag, trash, undo, pencil, chevron-left/right/down, x, check, download, upload, sun, moon, monitor, log-out, alert, external-link. No emoji anywhere in the UI.

### Surfaces & layout

- Timeline rows: hairline separators, no borders, no card backgrounds.
- Cards (On This Day, Upcoming): one surface step up, 12 px radius, no border in dark, hairline in light.
- Sheets: 20 px top radius, elevation shadow, drag handle, no border.
- 4 px grid; 16 px gutters; ≥ 44 px tap targets. Max content width 680 px, centred on wide screens.
- Radii: 8 (inputs, chips) · 12 (cards) · 20 (sheets) · full (avatar, dots).

### Motion

Sheet 240 ms ease-out, screen push 200 ms, toast 200 ms. No list stagger animations. `prefers-reduced-motion` disables all of it.

### Accessibility

- Real `<button>` / `<a>` for everything interactive; chips use `aria-pressed`; icon-only buttons have `aria-label`.
- Sheets and dialogs: `role="dialog"`, `aria-modal`, focus trap, Esc closes, focus returns to the opener.
- Viewport allows zoom (`user-scalable=no` removed).
- Keyboard: Tab order follows visual order; `/` focuses search; Esc closes search.
- Toast is `role="status"`; Undo is a real button.

---

## 6. Data model (v2)

Per-user subcollections. IDs from `crypto.randomUUID()`.

```
users/{uid}/entries/{entryId}
  title:       string            // required, ≤ 200
  date:        'YYYY-MM-DD'      // required, local calendar date, never a timestamp
  notes:       string            // '' default, ≤ 5000
  categoryId:  string | null
  starred:     boolean
  reminder:    null | { kind: 'once',   at: 'YYYY-MM-DDTHH:MM' }
                    | { kind: 'yearly', time: 'HH:MM' }
  deletedAt:   number | null     // ms epoch; non-null ⇒ in Trash
  createdAt:   number
  updatedAt:   number

users/{uid}/categories/{categoryId}
  name:        string
  color:       '#RRGGBB'
  order:       number
  createdAt:   number

users/{uid}/meta/app
  schemaVersion:          2
  createdAt:              number
  lastBackupAt:           number | null
  backupNudgeDismissedAt: number | null
```

Per-device preferences (theme, accent, fired-reminder keys) live in `localStorage` only.

The v8 document at `users/{uid}/data/main` is never read or written by v9. It can be deleted from the Firebase console at any time.

**Firestore rules** stay as today — `users/{userId}/{document=**}` readable/writable only by that user — and are checked into the repo as `firestore.rules`.

---

## 7. First run

No migration. On first sign-in, if `users/{uid}/meta/app` does not exist, the app writes it (`{schemaVersion: 2, createdAt}`) and seeds four default categories — Travel, Milestones, Health, Family — in one batch. The Timeline then shows the empty state. Existing v8 data is deliberately ignored (see §2).

---

## 8. Sync & offline

- Firestore initialised with `persistentLocalCache` + `persistentMultipleTabManager`. Reads come from cache when offline; writes queue and replay.
- One `onSnapshot` on `entries` and one on `categories`; the store updates from snapshots, so every device sees changes live. All writes are per-document — two devices editing different entries never clobber each other.
- Sync indicator in the header: hidden when clean; amber dot while `hasPendingWrites`; red dot on error (tap → explanation). A slim "Offline — changes will sync" pill appears under the header when `navigator.onLine` is false.
- **No code path writes defaults over existing data.** If loading fails, the app shows an error screen with Retry — it never renders an empty journal that could then be saved.

---

## 9. Reminders & notifications

**Honest constraint:** a free, backend-less web app cannot reliably wake itself to deliver a notification at a future time. There is no Cloud Function here (that needs a paid Firebase plan), and browser scheduling APIs for this were abandoned.

What v9 does instead:

1. **In-app scheduler** — on load and every 60 s, compute each reminder's next occurrence (tested; a Feb 29 anniversary fires on Feb 28 in non-leap years). If it is due today and has not been fired (`localStorage` key `fired:{entryId}:{occurrenceISO}`), show a Notification (if permitted) exactly once. Opening the app any time on the day still fires it. This fixes the v8 duplicate-notification bug and the reload loss.
2. **Visibility** — the bell badge and the Upcoming card make the app itself the reminder every time it is opened.
3. **Add to calendar** — every reminder can be exported as an `.ics` (`RRULE:FREQ=YEARLY` for anniversaries, with an alarm). This is the reliable route to an OS-level notification and works with Google/Apple/Outlook calendars.

The Notifications settings screen says exactly this in two sentences.

---

## 10. Import & export

- **Export JSON** — `{ version: 2, exportedAt, categories, entries }`, includes trashed entries (it is a backup). Updates `meta.lastBackupAt`.
- **Import JSON** — accepts v2 export files. **Always merges**: entries and categories with ids already present are skipped. Shows a preview ("340 memories, 5 categories in this file · 12 already in your journal · import 328?") with an inline confirm. The v8 "Cancel = replace everything" behaviour is gone; there is no replace mode.
- **Export CSV** — RFC 4180 quoting, UTF-8 BOM for Excel. Columns: `date, title, category, notes, starred, reminder`.
- **Import CSV** — keeps the v8 column-mapping flow (headers → title / date / notes / category / skip, guessed automatically, 5-row preview). Date parsing is explicit about ambiguity: a `DD/MM` ↔ `MM/DD` switch, defaulting to day-first. Categories are created by name.
- **Import from Google Keep** — planned for 9.1, once the owner's Takeout export format is in hand. The import module is structured so a Keep adapter (Takeout JSON → v2 entries) slots in beside the CSV one.

---

## 11. PWA

- `manifest.webmanifest`: name, short name, `start_url: "./"`, `display: standalone`, theme/background colours, icons 192 / 512 / maskable, `apple-touch-icon`. Icon: a simple geometric mark drawn from paths (no text), generated to PNG once and committed.
- `sw.js`: versioned precache of the app shell (HTML, CSS, JS, fonts, icons, vendored Firebase SDK). Cache-first for the shell; network-only for Firebase/Google endpoints. When a new worker is waiting, the app shows "Update ready · Reload"; reload activates it.
- Firebase SDK (app, auth, firestore — v10, ESM builds) is **vendored** into `vendor/firebase/` so the shell has no third-party fetch and works fully offline.

---

## 12. Code structure

```
DateTracker/
├── index.html                  shell: head, icon sprite, #app root, <script type="module" src="src/main.js">
├── manifest.webmanifest
├── sw.js
├── firestore.rules
├── assets/
│   ├── fonts/Outfit[wght].woff2
│   └── icons/                  favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
├── vendor/firebase/            firebase-app.js, firebase-auth.js, firebase-firestore.js (v10.12.2)
├── styles/
│   ├── tokens.css              colour/type/space tokens, dark + light
│   ├── base.css                reset, typography, focus rings, reduced motion
│   ├── components.css          buttons, inputs, chips, sheet, toast, card, list row
│   └── screens.css             landing, timeline, detail, compose, reminders, settings
├── src/
│   ├── main.js                 boot: theme → auth → first-run seed → subscribe → router
│   ├── config.js               firebaseConfig (the one file a self-hoster edits)
│   ├── firebase.js             app/auth/db init with persistent cache
│   ├── store.js                state container: get / set / subscribe
│   ├── selectors.js            visibleEntries, groupedByMonth, onThisDay, upcoming, counts
│   ├── db.js                   Firestore CRUD, snapshots, batches, first-run seed
│   ├── model.js                entry/category factories, validation, normalisation
│   ├── dates.js                local-date helpers: today, parse, format, nextOccurrence, relative
│   ├── reminders.js            nextFireTime, scheduler, notification, ics
│   ├── router.js               hash routes + history for sheets
│   ├── theme.js                theme/accent apply + persist
│   ├── io/
│   │   ├── csv.js              parse / serialise
│   │   ├── export.js           JSON / CSV / ICS download helpers
│   │   └── import.js           JSON (v1+v2) / CSV mapping + merge
│   └── ui/
│       ├── dom.js              html`` tagged template (auto-escaping), raw(), delegate()
│       ├── icons.js            icon(name) → sprite reference
│       ├── sheet.js            modal/sheet with focus trap, history, dirty-check hook
│       ├── toast.js            toast with optional action (Undo)
│       ├── landing.js
│       ├── timeline.js
│       ├── entry-detail.js
│       ├── compose.js
│       ├── reminders-view.js
│       └── settings.js         + sub-screens
├── tests/                      vitest — pure modules only
├── .github/workflows/test.yml  runs npm test on push / PR
├── package.json                devDependencies: vitest. Not needed to run the app
├── README.md
└── CHANGELOG.md
```

### Conventions

- **Rendering:** each screen exports `mount(root, ctx) → unmount`. It renders with the `html` tagged template (every interpolation is escaped; `raw()` is the only way to inject markup and is used for composed fragments, never for user data), assigns `root.innerHTML`, and binds events by delegation on `data-action` attributes. No inline `on*=` attributes. No `window.*` globals.
- **State:** a single store object; screens subscribe and re-render on change. Derived data lives in `selectors.js`, never computed inline in templates.
- **Dates:** an entry `date` is a calendar string. `today()` is computed from local time — never `toISOString()`. All date math goes through `dates.js`.
- **Firestore:** only `db.js` imports the SDK. Every write is one document. Nothing ever writes a whole collection from memory.
- **Types:** JSDoc on every exported function; `// @ts-check` at the top of pure modules so editors type-check without a build.
- **Local dev:** any static server (`npx serve .`, `python -m http.server`). ES modules do not load over `file://`, and Firebase sign-in never did.

---

## 13. Testing

- **Unit (vitest):** `dates` (local today, parse/format, nextOccurrence incl. Feb 29, relative labels), `reminders` (nextFireTime for once/yearly, dedupe keys, ics output), `csv` (quotes, embedded newlines, BOM, tabs, round-trip), `model` (validation, normalisation), `dom` (escaping incl. attributes), `import` (merge skipping, CSV mapping, date-order switch), `selectors` (grouping, on-this-day, upcoming window).
- **Manual checklist** (in the plan): sign-in popup + redirect, first-run seed, offline add/edit/reload, two-device live sync, trash/undo, calendar export opens in a calendar app, PWA install on Android + iOS, light/dark/system, keyboard-only pass, screen-reader pass on Timeline + Compose.
- **CI:** GitHub Action runs `npm test` on push and PR. Deployment stays "GitHub Pages from `main`".

---

## 14. Release

- Tag the current `main` as `v8.2-legacy` before the first v9 commit.
- Work on branch `v9-redesign`; merge to `main` when the manual checklist passes.
- `CHANGELOG.md` starts at **9.0.0** with the full list of changes and a note that v8 data is not carried over.
- README rewritten: what it is, screenshots, run locally, deploy your own (with a correct explanation that the Firebase web API key is public by design and security comes from rules + authorised domains), data model, privacy, licence.

---

## 15. Out of scope for 9.0

Google Keep import (9.1) · photos/attachments · server-side push notifications · calendar grid view · desktop two-pane layout · local-only mode without sign-in · locale/date-format setting (device locale is used) · sharing · end-to-end encryption · Periodic Background Sync · migration of v8 data.
