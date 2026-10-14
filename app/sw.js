/* Stack's service worker: keeps a copy of every app file on the phone, so Stack opens and works with no internet.
   VERSION is replaced with the git commit when GitHub deploys it, so every release downloads fresh copies.
   A new version waits until you tap "Update ready", then the app reloads onto it. */
const VERSION = '__BUILD__';
const CACHE = 'stack-' + VERSION;

/* Every file the app needs. A test (tests/sw.test.js) checks this matches what's in app/. */
const FILES = [
  './',
  'fonts/archivo-latin-ext.woff2',
  'fonts/archivo-latin.woff2',
  'fonts/OFL-archivo.txt',
  'fonts/OFL-ibmplexsans.txt',
  'fonts/plex-mono-500-latin-ext.woff2',
  'fonts/plex-mono-500-latin.woff2',
  'fonts/plex-mono-600-latin-ext.woff2',
  'fonts/plex-mono-600-latin.woff2',
  'fonts/plex-sans-latin-ext.woff2',
  'fonts/plex-sans-latin.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable.svg',
  'icons/icon.svg',
  'img/deep-field-tall.webp',
  'img/deep-field-wide.webp',
  'index.html',
  'manifest.webmanifest',
  'src/core/balances.js',
  'src/core/categorize.js',
  'src/core/csv.js',
  'src/core/due.js',
  'src/core/format.js',
  'src/core/index.js',
  'src/core/investing.js',
  'src/core/pdf.js',
  'src/core/projection.js',
  'src/core/sample.js',
  'src/core/stacks.js',
  'src/core/stages.js',
  'src/core/state.js',
  'src/core/util.js',
  'src/storage.js',
  'src/ui/actions.js',
  'src/ui/advice.js',
  'src/ui/app.js',
  'src/ui/bills.js',
  'src/ui/data.js',
  'src/ui/details.js',
  'src/ui/dom.js',
  'src/ui/forms.js',
  'src/ui/home.js',
  'src/ui/importer.js',
  'src/ui/lists.js',
  'src/ui/numpad.js',
  'src/ui/plan.js',
  'src/ui/render.js',
  'src/ui/saved.js',
  'src/ui/spent.js',
  'src/ui/stack.js',
  'src/ui/store.js',
  'styles.css',
  'vendor/pdfjs/LICENSE',
  'vendor/pdfjs/pdf.min.js',
  'vendor/pdfjs/pdf.worker.min.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's normal cache, so a new version really gets new files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  // Throw away older versions' copies.
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('stack-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'update') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Saved copy first (instant, works offline); the network only for anything not saved.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
    req.mode === 'navigate' ? caches.match('./') : Response.error())));
});
