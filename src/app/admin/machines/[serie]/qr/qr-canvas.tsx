'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function QrCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: 220,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      })
    }
  }, [value])

  return <canvas ref={canvasRef} />
}
