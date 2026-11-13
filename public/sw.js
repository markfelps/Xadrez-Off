// Cache-first: após a primeira visita tudo funciona sem internet.
// O motor completo (~95 MB) é guardado só quando for usado pela primeira vez.
const CACHE = 'xadrez-offline-v11';
const CORE = [
  './', 'index.html', 'style.css', 'app.js', 'logic.js', 'engine.js', 'store.js', 'notation.js', 'consult.js', 'util.js', 'board.js', 'review.js', 'puzzles.js', 'editor.js', 'book.js', 'human.js', 'openings.js', 'openings-data.js', 'openpicker.js', 'posid.js', 'vendor/chess.js',
  'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // arquivos gigantes (motor de 95 MB) não são copiados para o cache: duplicar o stream travava o carregamento
      const big = Number(res.headers.get('content-length')) > 20e6;
      if (res.ok && res.status === 200 && !big) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })),
  );
});
