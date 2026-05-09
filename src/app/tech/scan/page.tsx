import QrScanner from './qr-scanner'
import { QrCode } from 'lucide-react'

export default function ScanPage() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900 pt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Scanner une machine
      </h1>

      {/* Mobile: scanner actif */}
      <div className="lg:hidden">
        <p className="text-sm text-gray-500 mb-4">
          Pointez la caméra sur le QR code collé sur la machine.
        </p>
        <QrScanner />
      </div>

      {/* Desktop: message */}
      <div className="hidden lg:flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-gray-200">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <QrCode size={28} className="text-gray-400" />
        </div>
        <p className="text-base font-medium text-gray-700 mb-2">
          Fonctionnalité mobile uniquement
        </p>
        <p className="text-sm text-gray-400 max-w-xs">
          Le scanner QR est disponible depuis l&apos;application mobile. Utilisez votre téléphone pour scanner les machines sur le terrain.
        </p>
      </div>
    </div>
  )
}
