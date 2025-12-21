const CACHE_NAME = 'tareas-app-v59-css-force';
const urlsToCache = [
    './',
    './index.html',
    './style.css?v=5',
    './app.js?v=5',
    './ui.js?v=5',
    './state.js?v=4',
    './storage.js?v=4',
    './utils.js?v=4',
    './config.js?v=4',
    './lib/chart.min.js',
    './manifest.json',
    './ICON_APP_APOYO.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    // Remove self.skipWaiting() to allow manual control via UI
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});









