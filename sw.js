const CACHE_NAME = 'pt-vocab-v3';
const BASE = '/portuguese-flashcards/';
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/app.css',
  BASE + 'js/app.js',
  BASE + 'data/vocab.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'apple-touch-icon.png'
];

// Files that should use network-first strategy (fresh data matters)
const NETWORK_FIRST = [
  'index.html',
  'data/vocab.json',
  'data/news/'
];

// Install: cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Check if a URL should use network-first strategy
function isNetworkFirst(url) {
  return NETWORK_FIRST.some(pattern => url.pathname.includes(pattern));
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Network-first for HTML, vocab data, and news data
  if (event.request.mode === 'navigate' || isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Cache-first for static assets (CSS, JS, images)
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
