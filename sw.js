// Service worker minimalista do Nébula.
// Só cuida do "casco" do app (o index.html e os ícones) pra deixar ele instalável
// e abrir mais rápido. NÃO mexe em nada do Firebase/Supabase (tempo real, chat,
// posição dos jogadores) — essas chamadas passam direto pra rede, sem cache.

const CACHE_NAME = 'nebula-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // só intercepta GET do próprio site (mesmo domínio). Tudo que for de fora
  // (Firebase, Supabase, CDNs de bibliotecas, etc.) passa direto, sem cache.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {});
        return resp;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => cached || caches.match('/index.html'))
      )
  );
});
