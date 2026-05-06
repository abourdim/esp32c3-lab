/* ═══════════════════════════════════════════════════════════
   sw.js — minimal service worker (offline cache for app shell)
   ═══════════════════════════════════════════════════════════ */

const CACHE = 'esp32c3-lab-v0.1.0';
const SHELL = [
  './',
  './index.html',
  './plan.html',
  './manifest.json',
  './assets/styles.css',
  './js/ble.js',
  './js/protocol.js',
  './js/i18n.js',
  './js/ui.js',
  './js/lab-shell.js',
  './labs/drive-lab.html',
  './labs/servo-lab.html',
  './labs/leds-lab.html',
  './labs/neopixels-lab.html',
  './labs/distance-lab.html',
  './labs/buzzer-lab.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for SHELL, network-first for everything else
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        if (resp.ok && new URL(e.request.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
