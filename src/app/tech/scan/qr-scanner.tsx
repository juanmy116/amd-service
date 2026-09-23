'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, AlertCircle } from 'lucide-react'
import { extractSerie } from '@/lib/qr'
import { getPositionOnce } from '@/lib/pwa/geolocation'
import { recordQrScanAction } from './actions'

export default function QrScanner() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null)
  const scannedRef  = useRef(false)
  const router      = useRouter()
  const [error, setError]   = useState<string | null>(null)
  // null = buscando QR · locating = pidiendo la posición · stamping = sellando / abriendo la ficha
  const [phase, setPhase]   = useState<null | 'locating' | 'stamping'>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (result && !scannedRef.current) {
        scannedRef.current = true
        setPhase('locating')

        const serie = extractSerie(result.getText())

        // Detener la cámara ANTES de navegar: libera el stream y evita que la
        // transición de cliente quede en blanco.
        try { BrowserMultiFormatReader.releaseAllStreams() } catch { /* noop */ }

        // Sellar ANTES de navegar: la ficha de la máquina ya no pasa por /m (ver comentario de
        // abajo), así que el sello QR se deja aquí. Primero la posición (≤ ~3,5 s: tope de
        // `getPositionOnce`; sin permiso o sin GPS ⇒ null al instante o al vencer), luego el
        // sello con su propio tope de 2,5 s. Ninguno de los dos impide abrir la ficha: con mala
        // cobertura se navega igualmente (el sello puede llegar después o perderse; la ficha es lo
        // que el técnico necesita).
        void (async () => {
          try {
            const position = await getPositionOnce(3000)
            setPhase('stamping')
            await Promise.race([
              recordQrScanAction(serie, position),
              new Promise<void>((resolve) => setTimeout(resolve, 2500)),
            ])
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
