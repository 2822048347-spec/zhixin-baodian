/* ============================================================
 * 智心宝典 · Service Worker  sw.js
 * ------------------------------------------------------------
 * 负责离线缓存：首次访问后所有核心资源缓存到本地，
 * 之后断网仍可正常刷题。
 * 版本号升级时改 CACHE_NAME，会自动清理旧缓存。
 * ============================================================ */
var CACHE_NAME = "zxbk-v12";
var ASSETS = [
  "./",
  "./index.html?v=12",
  "./style.css?v=12",
  "./quiz-data.js?v=12",
  "./quiz-app.js?v=12",
  "./icon-192.png?v=12",
  "./icon-512.png?v=12"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 逐个缓存，单个失败不影响整体
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function () { return; });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  // 网络优先策略：先取最新，失败才用缓存
  // 这样更新代码后用户能立刻看到新版，断网时用缓存兜底
  e.respondWith(
    fetch(e.request).then(function (resp) {
      // 成功取到最新，缓存一份
      if (resp && resp.status === 200 && resp.type === "basic") {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, copy).catch(function () {});
        });
      }
      return resp;
    }).catch(function () {
      // 离线兜底：用缓存
      return caches.match(e.request).then(function (cached) {
        return cached || caches.match("./index.html");
      });
    })
  );
});
