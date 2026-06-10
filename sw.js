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

  // 🌟 修正 1：如果是 POST 請求（例如 AI 出題 API），或是外部 AI 引擎的網域
  // 絕對不要讓 Service Worker 介入，直接 return 退出，讓瀏覽器用原生方式處理！
  // 這樣 API 的 CORS 錯誤或網路錯誤才能正常在前端網頁被 try...catch 抓到
  if (
    event.request.method !== 'GET' || 
    url.hostname.includes('nvidia.com') || 
    url.hostname.includes('googleapis.com')
  ) {
    return; // 直接退出，不呼叫 event.respondWith()
  }

  // 🌟 原本的擴充：讓所有 .md 檔都永遠不被 SW 快取
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
      .catch(async () => {
        // 🌟 修正 2：如果斷網，從快取拿之前的資料
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // 如果連快取中也沒有（例如：初次開啟網頁就斷網，或是讀取未快取的資源）
        // 必須讓 Promise 拋出錯誤（reject），這樣瀏覽器才會回報正常的「網路中斷」
        // 絕對不能回傳 undefined，否則會噴 TypeError 導致整個 Service Worker 壞掉
        throw new Error('Network error and no cache available');
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
