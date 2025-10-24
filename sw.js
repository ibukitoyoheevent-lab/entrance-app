const CACHE_NAME = 'entrance-app-v1.0';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// インストール時のキャッシュ
self.addEventListener('install', function(event) {
  console.log('[Service Worker] インストール中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[Service Worker] キャッシュを開きました');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('[Service Worker] すべてのリソースをキャッシュしました');
        return self.skipWaiting(); // 即座にアクティブ化
      })
  );
});

// アクティベーション時の古いキャッシュ削除
self.addEventListener('activate', function(event) {
  console.log('[Service Worker] アクティベート中...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('[Service Worker] アクティベート完了');
      return self.clients.claim(); // 即座に制御を取得
    })
  );
});

// リクエスト時の処理（キャッシュファースト戦略）
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // キャッシュがあれば返す
        if (response) {
          return response;
        }
        
        // キャッシュがなければネットワークから取得
        return fetch(event.request).then(function(response) {
          // レスポンスが有効でない場合はそのまま返す
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // レスポンスをクローンしてキャッシュに保存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(function(error) {
        console.error('[Service Worker] Fetch エラー:', error);
        // オフライン時のフォールバック処理をここに追加可能
      })
  );
});
