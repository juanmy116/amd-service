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
  event.waitUntil(
    self.registration.showNotification(data.title || 'AMD SAV', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      data: { url: data.url || '/tech' },
    })
  )
})

// Al tocar: reutilizar la ventana de la app si está abierta; si no, abrirla en la tarea.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/tech', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) return client.navigate(url)
        return
      }
    }
    return self.clients.openWindow(url)
  })())
})
