'use server'

import { requireTechnician } from '@/lib/auth'
import { setFirstScanLocation, stampQrScan } from '@/lib/scan.server'
import { toPosition } from '@/lib/geo'

// Sello «el técnico tuvo la máquina delante» cuando escanea con la cámara DE LA APP. Es tan
// creíble como `/m/[serie]`: en ambos casos el serie sale de leer la etiqueta física.
// Devuelve `needsLocation` (máquina instalada y sin ubicación): solo entonces el escáner espera
// al GPS y manda la posición con `recordMachineLocationAction`. Nunca bloquea (stampQrScan
// registra y sigue).
export async function recordQrScanAction(numeroSerie: string): Promise<{ needsLocation: boolean }> {
  const { user } = await requireTechnician()
  return stampQrScan(numeroSerie, user.id)
}

// Posición del escaneo para una máquina sin ubicación. Llega del navegador: se valida aquí
// (`toPosition`) y el servidor vuelve a comprobar todas las condiciones del primer escaneo
// (activa, instalada, sin ubicación, GPS ≤ 100 m — ver `setFirstScanLocation`).
export async function recordMachineLocationAction(numeroSerie: string, position: unknown): Promise<void> {
  const { user } = await requireTechnician()
  if (!position || typeof position !== 'object') return
  const { lat, lng, accuracy } = position as Record<string, unknown>
  const valid = toPosition(lat, lng, accuracy)
  if (valid) await setFirstScanLocation(numeroSerie, user.id, valid)
}
