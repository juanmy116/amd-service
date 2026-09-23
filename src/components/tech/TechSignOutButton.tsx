'use client'

import type { ReactNode } from 'react'
import { signOut } from '@/app/login/actions'
import { disablePushSubscription } from '@/app/tech/push-actions'

// Tope de la limpieza de avisos: cerrar sesión nunca debe quedarse esperando al navegador o a la red.
const PUSH_CLEANUP_TIMEOUT_MS = 3_000

// Antes de salir, apaga los avisos push de ESTE aparato para el técnico que se va (móvil
// compartido: si no, seguiría recibiendo los avisos del anterior). Todo es «mejor esfuerzo»:
// cualquier fallo o demora se ignora y el cierre de sesión sigue.
async function disableThisDevicePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration('/tech')
  const subscription = await reg?.pushManager.getSubscription()
  if (!subscription) return
  await disablePushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
}

export function TechSignOutButton({ className, children }: { className?: string; children: ReactNode }) {
  async function handleSignOut() {
    try {
      await Promise.race([
        disableThisDevicePush(),
        new Promise<void>(resolve => setTimeout(resolve, PUSH_CLEANUP_TIMEOUT_MS)),
      ])
    } catch (err) {
      console.error('[push] limpieza al cerrar sesión', err)
    }
    await signOut()
  }

  return (
    <form action={handleSignOut}>
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
