/* JosRide service worker — production caching v1 */

var CACHE_VERSION = "josride-pwa-v1";
var STATIC_CACHE = CACHE_VERSION + "-static";
var RUNTIME_CACHE = CACHE_VERSION + "-runtime";
var OFFLINE_URL = "/offline";

var PRECACHE_URLS = [
  "/offline",
  "/static/pwa/offline.html",
  "/static/pwa/manifest.webmanifest",
  "/static/pwa/icons/icon-192.png",
  "/static/pwa/icons/icon-512.png",
  "/static/pwa/icons/icon-maskable-512.png",
  "/static/images/logo-main.png",
  "/static/css/theme.css",
  "/static/css/brand-assets.css",
  "/static/css/landing.css",
  "/static/css/admin.css",
  "/static/css/admin-dashboard.css",
  "/static/css/user-dashboard.css",
  "/static/css/pwa-install.css",
  "/static/js/pwa-register.js",
  "/static/js/pwa-install.js",
  "/static/js/flash-dismiss.js",
];

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept") && request.headers.get("accept").indexOf("text/html") !== -1);
}

function isStaticAsset(url) {
  return (
    url.pathname.indexOf("/static/") === 0 &&
    /\.(css|js|png|jpg|jpeg|webp|svg|gif|woff2?|ico|webmanifest)$/i.test(url.pathname)
  );
}

function isApiRequest(url) {
  return url.pathname.indexOf("/user/api/") === 0 || url.pathname.indexOf("/api/") === 0;
}

function isExternalFont(url) {
  return url.hostname.indexOf("fonts.googleapis.com") !== -1 || url.hostname.indexOf("fonts.gstatic.com") !== -1;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf("josride-pwa-") === 0 && key !== STATIC_CACHE && key !== RUNTIME_CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin && !isExternalFont(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (isStaticAsset(url) || isExternalFont(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

function networkFirstNavigation(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(RUNTIME_CACHE).then(function (cache) {
          cache.put(request, copy);
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return caches.match(OFFLINE_URL).then(function (offline) {
          if (offline) return offline;
          return caches.match("/static/pwa/offline.html");
        });
      });
    });
}

function networkFirstApi(request) {
  return fetch(request)
    .then(function (response) {
      return response;
    })
    .catch(function () {
      return caches.match(request);
    });
}

function staleWhileRevalidate(request) {
  return caches.open(RUNTIME_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networkFetch = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached;
        });

      return cached || networkFetch;
    });
  });
}
