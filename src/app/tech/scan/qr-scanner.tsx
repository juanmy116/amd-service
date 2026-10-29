'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import QrCamera from '@/components/tech/QrCamera'
import { scanDestination } from '@/lib/scanGate'
import { getPositionOnce } from '@/lib/pwa/geolocation'
import { recordMachineLocationAction, recordQrScanAction } from './actions'

export default function QrScanner() {
  const router = useRouter()
  // null = buscando QR · stamping = sellando / abriendo la ficha · locating = esperando la posición
  // (solo si la máquina aún no tiene ubicación)
  const [phase, setPhase] = useState<null | 'locating' | 'stamping'>(null)

  function handleDecode(serie: string) {
    setPhase('stamping')

    // Sellar ANTES de navegar: la ficha de la máquina ya no pasa por /m (ver comentario de
    // abajo), así que el sello QR se deja aquí, con su propio tope de 2,5 s. La posición se
    // pide A LA VEZ (siempre fresca, sin caché: puede fijar la ubicación de la máquina) pero
    // solo se espera si el servidor dice que la máquina la necesita (instalada y sin
    // ubicación, `needsLocation`) — el caso normal navega en cuanto hay sello. Nada de esto
    // impide abrir la ficha: con mala cobertura se navega igualmente (el sello o la
    // ubicación pueden perderse; la ficha es lo que el técnico necesita). Pero desde el doble
    // escaneo el sello es lo que deja empezar y cerrar la avería: si no llega (tope vencido o
    // error), la ficha lo avisa (`?scan=echec`) para que el técnico vuelva a escanear en vez de
    // descubrirlo al intentar cerrar.
    const positionPromise = getPositionOnce(3000, 0)
    void (async () => {
      let recorded = false
      let myIncidentIds: string[] = []
      let visitDue = false
      try {
        const stamp = await Promise.race([
          recordQrScanAction(serie),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ])
        recorded = stamp !== null
        if (stamp) {
          myIncidentIds = stamp.myIncidentIds
          visitDue = stamp.visitDue
        }
        if (stamp?.needsLocation) {
          setPhase('locating')
          // Acotada por `getPositionOnce` (más larga si el navegador aún tiene que pedir permiso).
          const position = await positionPromise
          if (position) {
            await Promise.race([
              recordMachineLocationAction(serie, position),
              new Promise<void>((resolve) => setTimeout(resolve, 2000)),
            ])
          }
        }
      } catch (err) {
        console.error('[scan] sello QR fallido', err)
      }
      // Navegación DIRECTA (sin pasar por el gateway /m, cuyo redirect server-side dejaba la
      // página en blanco hasta recargar). `scanDestination` decide: a la avería si es la única
      // del técnico, o a la pantalla de la máquina para que elija.
      router.push(scanDestination({ serie, recorded, myIncidentIds, visitDue }))
    })()
  }

  const overlay = phase === null ? null : phase === 'locating' ? 'QR détecté — localisation…' : 'QR détecté — chargement…'
  return <QrCamera onDecode={handleDecode} overlay={overlay} />
}
