'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { isStandaloneDisplay } from '@/lib/pwa/display'
import { sameKey, urlBase64ToUint8Array } from '@/lib/pwa/push'
import { savePushSubscription } from '@/app/tech/push-actions'

type Status = 'hidden' | 'denied' | 'default' | 'requesting' | 'granted' | 'error'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// Soporte disponible: clave VAPID presente, APIs del navegador y app instalada (en iPhone el
// push solo existe dentro de la app añadida a la pantalla de inicio). La InstallCard ya guía
// la instalación, así que sin ella este botón no aparece.
function pushSupported(): boolean {
  return (
    !!VAPID_PUBLIC_KEY &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    isStandaloneDisplay()
  )
}

// `navigator.serviceWorker.ready` nunca rechaza: si el SW no llega a activarse (fallo de
// registro, navegador raro) se queda colgada para siempre. La carrera con un timeout evita que
// el botón se quede en «Activation en cours…» sin salida.
function swReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      setTimeout(() => reject(new Error('sw_timeout')), 10_000)
    }),
  ])
}

async function subscribeAndSave(): Promise<{ ok: true } | { ok: false; error: string }> {
  const reg = await swReady()
  // TS moderno tipa Uint8Array como ArrayBufferLike (incluye SharedArrayBuffer), más estricto
  // que el BufferSource que pide la lib DOM real: el navegador acepta el Uint8Array sin más.
  const desiredKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY!)
  let existing = await reg.pushManager.getSubscription()
  // Rotación de la clave VAPID: una suscripción firmada con la clave anterior ya no sirve — hay
  // que darla de baja y volver a suscribirse con la nueva antes de poder guardarla.
  if (existing && !sameKey(existing.options.applicationServerKey, desiredKey)) {
    await existing.unsubscribe()
    existing = null
  }
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: desiredKey as BufferSource,
    }))
  return savePushSubscription(subscription.toJSON(), navigator.userAgent)
}

// Botón para activar los avisos push. En iPhone el permiso DEBE pedirse dentro del toque del
// usuario, así que nada se hace solo al cargar la página — salvo re-suscribirse en silencio si
// el permiso ya está concedido (reinstalación, suscripción caducada).
export function PushToggle() {
  const [status, setStatus] = useState<Status>('hidden')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pushSupported()) return
    const permission = Notification.permission
    if (permission === 'denied') { setStatus('denied'); return }
    if (permission === 'default') { setStatus('default'); return }

    // 'granted': re-suscribir/guardar en silencio, sin bloquear la pantalla. No marcar 'granted'
    // hasta confirmar que se guardó — si falla (servidor caído, endpoint dado de baja…), el botón
    // debe reaparecer para que el técnico pueda reintentar en vez de creerse protegido sin estarlo.
    subscribeAndSave()
      .then(result => {
        if (result.ok) {
          setStatus('granted')
        } else {
          console.error('[push] re-suscripción silenciosa', result.error)
          setStatus('default')
        }
      })
      .catch(err => {
        console.error('[push] re-suscripción silenciosa', err)
        setStatus('default')
      })
  }, [])

  if (status === 'hidden') return null

  async function handleActivate() {
    setStatus('requesting')
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default')
        return
      }
      const result = await subscribeAndSave()
      if (!result.ok) {
        setError(result.error)
        setStatus('error')
        return
      }
      setStatus('granted')
    } catch (err) {
      console.error('[push] activation', err)
      setError('Impossible d’activer les notifications.')
      setStatus('error')
    }
  }

  if (status === 'granted') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Bell size={14} className="text-accent" aria-hidden />
        Notifications activées
      </p>
    )
  }

  if (status === 'denied') {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-card p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <BellOff size={18} className="text-ink-muted" />
          <p className="text-sm font-semibold text-ink">Notifications bloquées</p>
        </div>
        <p className="text-sm text-ink-muted">
          Activez-les dans Réglages › Notifications › AMD SAV.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell size={18} className="text-accent" />
        <p className="text-sm font-semibold text-ink">Activer les notifications</p>
      </div>
      <p className="text-sm text-ink-muted mb-3">
        Recevez une alerte dès qu’une panne ou une maintenance vous est assignée.
      </p>
      <button
        type="button"
        onClick={handleActivate}
        disabled={status === 'requesting'}
        className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {status === 'requesting' ? 'Activation en cours…' : 'Activer les notifications'}
      </button>
      {error && <p className="text-xs text-accent mt-2">{error}</p>}
    </div>
  )
}
