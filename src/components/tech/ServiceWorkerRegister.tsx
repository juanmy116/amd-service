'use client'

import { useEffect } from 'react'

// Registra /sw.js al entrar en /tech. Silencioso si el navegador no lo soporta: la app funciona
// igual, solo sin las capacidades que llegarán en fases siguientes.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // scope: '/tech' (no '/'): start_url del manifest es /tech, que ya está dentro de ese scope,
    // y así el SW no controla /admin, /atelier (kiosko) ni /portal.
    navigator.serviceWorker.register('/sw.js', { scope: '/tech', updateViaCache: 'none' }).catch(err => {
      console.error('[pwa] registro del service worker fallido', err)
    })
  }, [])
  return null
}
