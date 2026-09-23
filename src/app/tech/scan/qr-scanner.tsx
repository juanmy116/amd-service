'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, AlertCircle } from 'lucide-react'
import { extractSerie } from '@/lib/qr'
import { getPositionOnce } from '@/lib/pwa/geolocation'
import { recordMachineLocationAction, recordQrScanAction } from './actions'

export default function QrScanner() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null)
  const scannedRef  = useRef(false)
  const router      = useRouter()
  const [error, setError]   = useState<string | null>(null)
  // null = buscando QR · stamping = sellando / abriendo la ficha · locating = esperando la posición
  // (solo si la máquina aún no tiene ubicación)
  const [phase, setPhase]   = useState<null | 'locating' | 'stamping'>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (result && !scannedRef.current) {
        scannedRef.current = true
        setPhase('stamping')

        const serie = extractSerie(result.getText())

        // Detener la cámara ANTES de navegar: libera el stream y evita que la
        // transición de cliente quede en blanco.
        try { BrowserMultiFormatReader.releaseAllStreams() } catch { /* noop */ }

        // Sellar ANTES de navegar: la ficha de la máquina ya no pasa por /m (ver comentario de
        // abajo), así que el sello QR se deja aquí, con su propio tope de 2,5 s. La posición se
        // pide A LA VEZ (siempre fresca, sin caché: puede fijar la ubicación de la máquina) pero
        // solo se espera si el servidor dice que la máquina la necesita (instalada y sin
        // ubicación, `needsLocation`) — el caso normal navega en cuanto hay sello. Nada de esto
        // impide abrir la ficha: con mala cobertura se navega igualmente (el sello o la
        // ubicación pueden perderse; la ficha es lo que el técnico necesita).
        const positionPromise = getPositionOnce(3000, 0)
        void (async () => {
          try {
            const stamp = await Promise.race([
              recordQrScanAction(serie),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
            ])
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
          // Navegación DIRECTA a la ficha. Ya estamos dentro de la PWA técnico, así que
          // no pasamos por el gateway /m (cuyo redirect server-side dejaba la página en
          // blanco hasta recargar).
          router.push(`/tech/scan/${encodeURIComponent(serie)}`)
        })()
      }
    }).catch(() => {
      setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.')
    })

    return () => {
      BrowserMultiFormatReader.releaseAllStreams()
    }
  }, [router])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
        <video ref={videoRef} className="w-full h-full object-cover" />
        {/* Visor */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-56 h-56 border-2 border-white/60 rounded-2xl relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
          </div>
        </div>
        {phase && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <p className="text-white font-medium text-sm">
              {phase === 'locating' ? 'QR détecté — localisation…' : 'QR détecté — chargement…'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
        <Camera size={14} />
        Caméra activée — centrez le QR code dans le cadre
      </div>
    </div>
  )
}
