const CACHE_NAME = 'acharya-nav-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './icon-192.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  // Network-first for tile requests, cache-first for app assets
  if (e.request.url.includes('tile') || e.request.url.includes('basemaps')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    // Network first for JS and HTML to ensure updates go through, fallback to cache
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
