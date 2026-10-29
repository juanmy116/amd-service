'use client'

import QrCamera from './QrCamera'

// Hoja a pantalla completa con la cámara. Quien la usa la monta SOLO mientras está abierta:
// al cerrarla, QrCamera se desmonta y libera la cámara.
export default function ScanSheet({ title, overlay, onDecode, onCancel }: {
  title: string
  overlay: string | null
  onDecode: (serie: string) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-page flex flex-col px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <h2 className="text-base font-semibold text-center mb-4">{title}</h2>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <QrCamera onDecode={onDecode} overlay={overlay} />
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full max-w-lg mx-auto py-3 rounded-full border border-gray-300 text-sm font-semibold"
      >
        Annuler
      </button>
    </div>
  )
}
