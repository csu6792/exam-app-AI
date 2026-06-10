const CACHE_NAME = 'ai-quiz-reader-cache-v1.0.0';

const ASSETS_TO_CACHE = [
  'index.html',
  'manifest.json'
];

// 1. 安裝階段
self.addEventListener('install', event => {
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(file =>
            cache.add(file).catch(err => console.log('cache fail:', file, err))
          )
        );
      })
  );
});

// 2. 啟用階段
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('delete old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('SW activated');
      // 🌟 解除註解：確保新的 SW 啟動後立刻控制所有開啟的網頁，配合強制刷新更穩定
      return self.clients.claim();
    })
  );
});

// 3. 攔截請求 (Fetch) - Network First 策略
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🌟 擴充：讓所有 .md 檔 (包含 update_log.md, manual.md, bank_list.md) 都永遠不被 SW 快取
  // 這樣你只要改了這些文字檔，App 點開絕對是最新內容！
  if (url.pathname.endsWith('.md')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功取得網路資料，才更新快取
        if (response.status === 200 && (url.origin === self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(() => {
        // 如果斷網，就從快取拿之前的資料 (離線可用)
        return caches.match(event.request);
      })
  );
});

// 4. 接收前端訊息
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    // 當使用者在畫面上點擊「立即更新」時，這裡才會觸發接管
    self.skipWaiting();
  }
});
