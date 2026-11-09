/* Never stores or serves a redirected response (browsers refuse those for page loads: "This site can't be reached").
   Service worker: fast loads + offline use. Never caches /api/ or any user data.
   VERSION is filled in automatically by the server (backend/sw.php) from the files' timestamps, so any
   uploaded change makes this file differ, the browser installs it, old copies are deleted and the page
   reloads by itself. Within one version the saved copies are exact, so they are served with no network wait. */
var VERSION = 'et-dev';
var STATIC = VERSION + '-static', PAGES = VERSION + '-pages';
/* Everything a signed-in user needs is saved on install, so any page opens with no connection. */
var PRECACHE = [
  'offline.html', 'index.html', 'login.html', 'register.html', 'forgot-password.html', 'dashboard.html', 'expenses.html', 'income.html', 'transactions.html',
  'accounts.html', 'categories.html', 'debts.html', 'budgets.html', 'savings.html', 'recurring.html', 'reports.html', 'notifications.html', 'settings.html',
  'profile.html', 'subscription.html', 'help.html', 'support.html', 'manifest.json', 'assets/css/themes.css', 'assets/css/style.css', 'assets/css/components.css',
  'assets/css/animations.css', 'assets/css/responsive.css', 'assets/css/dashboard.css', 'assets/css/auth.css', 'assets/css/landing.css', 'assets/js/offline.js',
  'assets/js/theme.js', 'assets/js/ui.js', 'assets/js/api.js', 'assets/js/charts.js', 'assets/js/animations.js', 'assets/js/pwa.js', 'assets/js/app.js',
  'assets/js/forms.js', 'assets/js/auth.js', 'assets/js/landing.js', 'assets/js/pages/dashboard.js', 'assets/js/pages/transactions.js', 'assets/js/pages/accounts.js',
  'assets/js/pages/debts.js', 'assets/js/pages/budgets.js', 'assets/js/pages/savings.js', 'assets/js/pages/recurring.js', 'assets/js/pages/reports.js',
  'assets/js/pages/notifications.js', 'assets/js/pages/settings.js', 'assets/js/pages/subscription.js', 'assets/js/pages/help.js', 'assets/js/pages/support-public.js',
  'assets/images/logo.png', 'assets/images/logo-small.png', 'assets/images/logo-large.png', 'assets/images/mabumbatech-logo.png', 'assets/images/mabumbatech-gold.png',
  'assets/images/icons/icon-192.png', 'assets/images/icons/favicon-32.png', 'assets/images/icons/favicon-16.png', 'assets/images/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(STATIC).then(function (c) { return Promise.all(PRECACHE.map(function (u) { var r = new Request(u, { cache: 'reload' }); return fetch(r).then(function (res) { if (res && res.ok && !res.redirected) return c.put(r, res); }).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

/* Saved copy first (instant); fetched fresh from the server only when missing. Safe because the cache is per version. */
function cacheFirst(e, req, bucket) {
  e.respondWith(caches.open(bucket).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit && !hit.redirected) return hit;
      return fetch(req, { cache: 'reload' }).then(function (res) { if (res && res.ok && !res.redirected) c.put(req, res.clone()); return res; });
    });
  }));
}

/* A request that fails once is tried again, so a momentary hiccup on a working connection is never shown as "offline". */
function fetchRetry(req) {
  return fetch(req, { cache: 'no-cache' }).catch(function () {
    return new Promise(function (r) { setTimeout(r, 500); }).then(function () { return fetch(req, { cache: 'no-cache' }); });
  });
}

/* Pages: show the saved copy at once and refresh it quietly; first visit or offline falls back sensibly. */
function pageStrategy(e, req) {
  e.respondWith(caches.open(PAGES).then(function (c) {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit && !hit.redirected) {   // a saved redirect can never be shown to a page (browsers reject it), so it is ignored and re-fetched
        e.waitUntil(fetch(req, { cache: 'no-cache' }).then(function (res) { if (res && res.ok && !res.redirected) c.put(req, res.clone()); }).catch(function () {}));
        return hit;
      }
      return fetchRetry(req).then(function (res) {
        if (res && res.ok && !res.redirected) c.put(req, res.clone());
        return res;
      }).catch(function () {
        // Not saved and no connection: the site root means the home page; anything else gets the offline page.
        var p = new URL(req.url).pathname;
        return (/\/$/.test(p) ? caches.match('index.html') : Promise.resolve(null)).then(function (home) { return home || caches.match('offline.html'); });
      });
    });
  }));
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;          // data always comes from the network
  if (/\/version\.json$/.test(url.pathname)) return;          // the update check must always be live
  if (/service-worker\.js$/.test(url.pathname)) return;
  if (/\/(uploads|storage)\//.test(url.pathname)) return;

  if (/\.(js|css|png|jpg|jpeg|svg|ico|webp|woff2?|json)$/.test(url.pathname)) { cacheFirst(e, req, STATIC); return; }
  if (req.mode === 'navigate') { pageStrategy(e, req); return; }
});
