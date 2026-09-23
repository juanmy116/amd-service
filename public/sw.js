// Service worker de la PWA de técnicos. Fase 1: no cachea NADA (sin manejador `fetch`), solo
// existe y toma el control al instante. La Fase 2 añadirá `push`/`notificationclick` y la
// Fase 4 la caché de solo lectura.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
