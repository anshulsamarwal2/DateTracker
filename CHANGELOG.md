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
