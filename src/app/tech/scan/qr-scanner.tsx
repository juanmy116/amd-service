'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, AlertCircle } from 'lucide-react'
import { extractSerie } from '@/lib/qr'

export default function QrScanner() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null)
  const scannedRef  = useRef(false)
  const router      = useRouter()
  const [error, setError]   = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (result && !scannedRef.current) {
        scannedRef.current = true
        setScanned(true)

        const serie = extractSerie(result.getText())

        // Detener la cámara ANTES de navegar: libera el stream y evita que la
        // transición de cliente quede en blanco.
        try { BrowserMultiFormatReader.releaseAllStreams() } catch { /* noop */ }

        // Navegación DIRECTA a la ficha. Ya estamos dentro de la PWA técnico, así que
        // no pasamos por el gateway /m (cuyo redirect server-side dejaba la página en
        // blanco hasta recargar).
        router.push(`/tech/scan/${encodeURIComponent(serie)}`)
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
        {scanned && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <p className="text-white font-medium text-sm">QR détecté — chargement...</p>
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
