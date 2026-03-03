# DateTracker — Date Logs | Notes

A personal logging app for life events. Add anything worth remembering — trips, purchases, health events, bills, haircuts — with dates, notes, categories, and reminders. Built as a single HTML file, runs entirely in the browser, syncs privately to the cloud via Firebase.

**Live app → [anshulsamarwal2.github.io/DateTracker](https://anshulsamarwal2.github.io/DateTracker)**

---

## What it does

DateTracker is built around one idea: a personal log, like a ship's log or pilot's logbook. You record what happened, when it happened, and any details worth keeping. Over time, the app becomes a searchable, reminder-enabled diary of your life.

It is not a to-do app. It is not a habit tracker. It is a log.

---

## Features

### Two ways to add entries

**Add Entry** — for named events with their own story. A trip, a purchase, a health event, a conversation. Give it a title, a date, a comment, a category, and optionally a reminder.

**Quick Log** — for recurring ticks that don't need a title. Haircut, water tanker arrived, medication taken. Pick the category, add an optional note, and today's date is stamped in one tap. Quick Log cards show the date as the headline because the date is the whole point.

### Categories
Create categories that match your life — Trips, Health, Finance, Family, anything. Each category gets a colour. Filter entries by category. Control which categories appear in On This Day.

### Reminders
Set a reminder on any entry. Repeat options: one-time, daily, weekly, monthly, yearly. Yearly reminders are useful for anniversaries, insurance renewals, medical checkups. The Reminders tab shows all upcoming and overdue reminders sorted by date with countdown timers.

### On This Day
Every day the Dashboard shows entries from the same date in past years. A small, personal time machine. You can exclude specific categories from appearing here — useful for tracking-type logs that aren't meaningful as memories.

### Dashboard
- Personalised greeting based on time of day
- Stats: total entries, categories, archived count — each tappable as a shortcut
- On This Day memories
- Upcoming reminders for the next 7 days
- 5 most recent entries

### Archive & Pin
- Archive entries you don't need to see daily but want to keep
- Pin important entries to keep them at the top of the list
- Permanently delete from the archive when ready

### Search
Search all entry titles and comments from the Entries screen.

### Export & Import
- Export as JSON — full backup of all your data
- Export as CSV — for use in Google Sheets or Excel
- Import JSON — restore from backup or merge with existing data
- Import CSV — bring in entries from any spreadsheet with guided column mapping

### Appearance
- Dark mode (default) and Light mode
- 12 primary colour swatches + custom hex colour picker
- Preferences saved per device

### Cloud sync
Sign in with Google. Data is stored privately in Firestore, synced automatically. Accessible on any device. A sync dot in the top bar shows status in real time.

### Tutorial
A 4-slide tutorial appears on first login. Can be replayed anytime from the profile menu under "How it works?".

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Single HTML file — HTML, CSS, vanilla JS |
| Auth | Firebase Authentication (Google Sign-In) |
| Database | Cloud Firestore |
| Hosting | GitHub Pages |
| Fonts | Outfit (Google Fonts) |
| Dependencies | None — no npm, no build tools, no frameworks |

The entire app is one `index.html` file. No build step, no package.json, no node_modules. Open the file in a browser and it works.

---

## Project structure

```
DateTracker/
└── index.html        ← the entire app
```

That's it.

---

## How to run locally

1. Clone or download the repository
2. Open `index.html` in any modern browser
3. Sign in with Google

No server required. No installation required.

---

## How to deploy your own copy

### Step 1 — Firebase setup

1. Go to [firebase.google.com](https://firebase.google.com) and create a new project
2. Create a Firestore database (start in test mode, then update security rules — see below)
3. Enable Google Sign-In under Authentication → Sign-in method
4. Register a web app and copy the `firebaseConfig` object

### Step 2 — Add your config

Open `index.html` and find the Firebase config near the bottom of the file:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};
```

Replace `YOUR_API_KEY` with your real API key and update the other values to match your project.

### Step 3 — Firestore security rules

In the Firebase console, go to Firestore → Rules and replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures each user can only read and write their own data.

### Step 4 — GitHub Pages

1. Create a GitHub repository named `DateTracker` (or any name)
2. Upload `index.html` to the repository
3. Go to Settings → Pages → Source → Deploy from branch → main → / (root)
4. Your app will be live at `https://yourusername.github.io/DateTracker`

---

## Firestore data structure

All user data is stored under a single document per user:

```
users/
  {google-uid}/
    data/
      main:
        categories: [ { id, name, color, otd } ]
        entries:    [ { id, title, date, comment, catId, remOn, remType,
                        remDate, remTime, pinned, archived, quicklog, created } ]
        lastBackup: timestamp
        lastBackupReminder: timestamp
```

Each user's data is completely isolated. No user can access another user's data.

---

## Entry data model

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID (`e` + timestamp + random) |
| `title` | string | Entry title or category name for Quick Logs |
| `date` | string | ISO date `YYYY-MM-DD` |
| `comment` | string | Notes, details, cost, location etc. |
| `catId` | string | Reference to a category ID |
| `remOn` | boolean | Whether reminder is enabled |
| `remType` | string | `once`, `daily`, `weekly`, `monthly`, `yearly` |
| `remDate` | string | ISO datetime for one-time reminders |
| `remTime` | string | `HH:MM` for recurring reminders |
| `pinned` | boolean | Pinned to top of list |
| `archived` | boolean | In archive |
| `quicklog` | boolean | Created via Quick Log |
| `created` | number | Unix timestamp of creation |

---

## Category data model

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID |
| `name` | string | Display name |
| `color` | string | Hex colour e.g. `#CF6679` |
| `otd` | boolean | Show in On This Day section |

---

## Keyboard & interaction notes

- Tap any entry card header to expand/collapse it
- Tap outside any bottom sheet to close it
- The profile avatar (top right) opens the settings and data menu
- The `+` FAB always opens the Add Entry form
- The category filter strip on the Entries tab is horizontally scrollable
- Search is accessible via the magnifier icon in the top bar

---

## Browser support

Works in all modern browsers. Tested on:
- Chrome / Chromium (Android, Desktop)
- Safari (iOS, macOS)
- Firefox (Desktop)

Browser notifications require permission and work best on desktop Chrome. On iOS, notifications from web apps have limited support.

---

## Privacy

- No analytics
- No ads
- No third-party tracking
- Data is stored only in your own Firebase project
- Google Sign-In is used solely for authentication — no profile data beyond your name and photo is stored
- Appearance preferences (theme, colour) are stored in `localStorage` on your device only

---

## Backup recommendation

Although data is stored in the cloud, it is good practice to export a JSON backup periodically. The app will remind you every 14 days if you haven't done so. Go to profile menu → Export JSON and save the file to Google Drive or your preferred location.

---

## Version history

See [update_notes.md](update_notes.md) for full version history.

**Current version: 6.0** — March 2026

---

## License

Personal project. Not licensed for redistribution or commercial use.

---

## Author

Built by Anshul Samarwal.
Designed and developed with [Claude](https://claude.ai) by Anthropic.
