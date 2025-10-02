const CACHE_NAME = 'entrance-app-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// インストール時のキャッシュ
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(urlsToCache);
            })
    );
});

// リクエスト時の処理
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // キャッシュがあれば返す
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});
