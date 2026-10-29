'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Camera, AlertCircle } from 'lucide-react'
import { extractSerie } from '@/lib/qr'

// Cámara que lee UN QR y devuelve el número de serie. No sella ni navega: eso lo decide quien
// la usa (pantalla del escáner u hoja sobre la ficha). `overlay` es el texto de la capa que
// tapa el visor mientras el padre trabaja tras la lectura (null = buscando).
export default function QrCamera({ onDecode, overlay }: { onDecode: (serie: string) => void; overlay: string | null }) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const scannedRef = useRef(false)
  const onDecodeRef = useRef(onDecode)
  const [error, setError] = useState<string | null>(null)

  // Siempre el callback último, sin reiniciar la cámara si el padre se re-renderiza. Se asigna
  // en el render (no en un efecto) para que nunca haya una lectura con el callback viejo.
  onDecodeRef.current = onDecode

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    // Si la hoja se cierra antes de que el navegador conceda la cámara, el stream llega cuando
    // el cleanup ya pasó y `releaseAllStreams` no lo conoce: se para en cuanto llega los controles.
    let cancelled = false
    let controls: IScannerControls | null = null

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (cancelled || !result || scannedRef.current) return
      scannedRef.current = true

      // Detener lectura y cámara ANTES de seguir: libera el stream, corta el bucle de
      // decodificación y evita que la transición de cliente quede en blanco.
      try { controls?.stop() } catch { /* noop */ }
      try { BrowserMultiFormatReader.releaseAllStreams() } catch { /* noop */ }

      onDecodeRef.current(extractSerie(result.getText()))
    }).then((c) => {
      if (cancelled) c.stop()
      else controls = c
    }).catch(() => {
      if (!cancelled) setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.')
    })

    return () => {
      cancelled = true
      try { controls?.stop() } catch { /* noop */ }
      BrowserMultiFormatReader.releaseAllStreams()
    }
  }, [])

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
        {overlay && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <p className="text-white font-medium text-sm">{overlay}</p>
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
