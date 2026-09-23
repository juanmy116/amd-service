'use client'

import { useEffect } from 'react'

// Registra /sw.js al entrar en /tech. Silencioso si el navegador no lo soporta: la app funciona
// igual, solo sin las capacidades que llegarán en fases siguientes.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(err => {
      console.error('[pwa] registro del service worker fallido', err)
    })
  }, [])
  return null
}
