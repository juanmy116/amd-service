import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import ImportPreview from './ImportPreview'

export default async function ImportMachinesPage() {
  await requireAdmin()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/machines"
          className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink mb-3"
        >
          <ArrowLeft size={14} />
          Retour aux machines
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Importer des machines (CSV)
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Chargez en masse les machines hors Princity. Les machines créées auront
          <code className="px-1.5 py-0.5 bg-neutral-soft rounded text-xs"> princity_device_id = NULL</code>
          {' '}et{' '}
          <code className="px-1.5 py-0.5 bg-neutral-soft rounded text-xs">princity_pending = false</code>.
        </p>
      </div>

      <ImportPreview />
    </div>
  )
}
