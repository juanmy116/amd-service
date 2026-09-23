// Service worker de la PWA de técnicos. Fase 1: no cachea NADA (sin manejador `fetch`), solo
// existe y toma el control al instante. La Fase 2 añade `push`/`notificationclick` (avisos de
// asignación). Sigue sin manejador `fetch`; la Fase 4 traerá la caché de solo lectura.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

// iOS exige mostrar SIEMPRE una notificación por cada push (userVisibleOnly): nunca salir sin
// showNotification, aunque el payload venga roto.
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  // Un payload válido en JSON pero que no es un objeto (número, string, null, array…) no debe
  // saltarse showNotification: iOS exige una notificación por cada push, así venga lo que venga.
  if (!data || typeof data !== 'object') data = {}
  const options = {
    body: data.body || '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    data: { url: data.url || '/tech' },
  }
  // El `tag` sustituye la notificación anterior de la misma tarea. Una asignación nueva debe volver
  // a sonar/vibrar aunque sustituya a otra (`renotify`); una retirada, no. `renotify` sin `tag`
  // lanza TypeError (y entonces no se mostraría nada), así que solo se pone si hay `tag`.
  if (typeof data.tag === 'string' && data.tag) {
    options.tag = data.tag
    if (data.kind === 'assigned') options.renotify = true
  }
  event.waitUntil(self.registration.showNotification(data.title || 'AMD SAV', options))
})

// Al tocar: reutilizar una ventana de la PWA (scope /tech) si hay una abierta; si no, o si
// `navigate()` falla, abrir una ventana nueva en la tarea. `navigate()` rechaza en clientes no
// controlados por este SW (p. ej. una pestaña en /login), así que solo se intenta en ventanas
// cuyo pathname ya está dentro de /tech.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let url = new URL(event.notification.data?.url || '/tech', self.location.origin)
  if (url.origin !== self.location.origin) url = new URL('/tech', self.location.origin)

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      let pathname
      try {
        pathname = new URL(client.url).pathname
      } catch {
        continue
      }
      if (!pathname.startsWith('/tech')) continue

      await client.focus()
      try {
        return await client.navigate(url.href)
      } catch {
        // sigue: probar otra ventana /tech, o abrir una nueva si no queda ninguna
      }
    }
    return self.clients.openWindow(url.href)
  })())
})
