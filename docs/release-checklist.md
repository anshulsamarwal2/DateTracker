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
