'use server'

import { requireTechnician } from '@/lib/auth'
import { stampQrScan } from '@/lib/scan.server'

// Sello «el técnico tuvo la máquina delante» cuando escanea con la cámara DE LA APP. Es tan
// creíble como `/m/[serie]`: en ambos casos el serie sale de leer la etiqueta física. Nunca
// bloquea (stampQrScan registra y sigue).
export async function recordQrScanAction(numeroSerie: string): Promise<void> {
  const { user } = await requireTechnician()
  await stampQrScan(numeroSerie, user.id)
}
