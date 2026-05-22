import QrScanner from './qr-scanner'
import { QrCode } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export default function ScanPage() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-ink pt-2 font-display">
        Scanner une machine
      </h1>

      {/* Mobile: scanner actif */}
      <div className="lg:hidden">
        <p className="text-sm text-ink-muted mb-4">
          Pointez la caméra sur le QR code collé sur la machine.
        </p>
        <QrScanner />
      </div>

      {/* Desktop: message */}
      <Card className="hidden lg:flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-neutral-soft flex items-center justify-center mb-4">
          <QrCode size={28} className="text-ink-muted" />
        </div>
        <p className="text-base font-medium text-ink-soft mb-2">
          Fonctionnalité mobile uniquement
        </p>
        <p className="text-sm text-ink-muted max-w-xs">
          Le scanner QR est disponible depuis l&apos;application mobile. Utilisez votre téléphone pour scanner les machines sur le terrain.
        </p>
      </Card>
    </div>
  )
}
