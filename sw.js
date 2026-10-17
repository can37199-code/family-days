// 파일을 고치면 VERSION을 올려야 폰에 새 버전이 들어간다.
const VERSION = 'v1';
const FILES = ['./', 'index.html', 'app.js', 'core.js', 'lunar.min.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
