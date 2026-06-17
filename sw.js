const CACHE_NAME = 'acharya-nav-v19';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './icon-192.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always go network-first for OSRM routing API
  if (url.includes('router.project-osrm.org')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first for map tiles
  if (url.includes('basemaps') || url.includes('tile')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for our own app files (JS, CSS, HTML) to ensure updates go through
  if (url.includes('app.js') || url.includes('styles.css') || url.includes('index.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (fonts, icons)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
