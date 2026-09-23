'use server'

import { requireTechnician } from '@/lib/auth'
import { stampQrScan } from '@/lib/scan.server'
import type { LatLng } from '@/lib/geo'

type ScanPosition = LatLng & { accuracy: number }

// La posición llega del navegador: se valida aquí (números finitos, en rango, precisión ≥ 0).
// Cualquier cosa rara ⇒ null, que es lo mismo que no haber dado permiso.
function validPosition(p: unknown): ScanPosition | null {
  if (!p || typeof p !== 'object') return null
  const { lat, lng, accuracy } = p as Record<string, unknown>
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof accuracy !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0) return null
  return { lat, lng, accuracy }
}

// Sello «el técnico tuvo la máquina delante» cuando escanea con la cámara DE LA APP. Es tan
// creíble como `/m/[serie]`: en ambos casos el serie sale de leer la etiqueta física. Con la
// posición del escaneo, además, la máquina sin ubicación recibe la suya (ver `stampQrScan`).
// Nunca bloquea (stampQrScan registra y sigue).
export async function recordQrScanAction(numeroSerie: string, position?: unknown): Promise<void> {
  const { user } = await requireTechnician()
  await stampQrScan(numeroSerie, user.id, validPosition(position))
}
