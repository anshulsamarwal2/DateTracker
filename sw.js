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
  // Bypass the HTTP cache (GitHub Pages sends max-age=600) so a fresh deploy
  // never precaches a stale mix of old and new modules.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
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
