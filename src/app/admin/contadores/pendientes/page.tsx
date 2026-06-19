import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import PendingList from './PendingList'
import UploadCounterButton from './UploadCounterButton'

export const dynamic = 'force-dynamic'
// La subida manual espera el OCR (varios segundos) con reintentos; damos margen a la Server Action
// para que no la corte el timeout por defecto de la plataforma.
export const maxDuration = 60

type Pending = {
  id: string; image_path: string; light: 'green' | 'amber' | 'red'; status: string
  matched_machine_id: string | null; email_from: string | null; extracted_at: string
  extracted_data: Record<string, unknown>; validation_errors: string[]
  duplicate_count: number; last_duplicate_at: string | null
}

export default async function PendingCountersPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pending_counter_imports')
    .select('id, image_path, light, status, matched_machine_id, email_from, extracted_at, extracted_data, validation_errors, duplicate_count, last_duplicate_at')
    .eq('status', 'pending_review')
    .order('extracted_at', { ascending: false })
    .limit(200)
  if (error) { console.error('[pending-counters]', error); throw new Error('DATA_FETCH_ERROR') }

  const rows = (data ?? []) as Pending[]
  const withUrls = await Promise.all(rows.map(async (r) => {
    const { data: signed } = await admin.storage.from('counter-images').createSignedUrl(r.image_path, 3600)
    return { ...r, image_url: signed?.signedUrl ?? null }
  }))

  const { data: machines } = await admin.from('machines').select('numero_serie, marque, modele').eq('active', true).order('numero_serie')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Compteurs en attente</h1>
          <p className="text-sm text-ink-muted mt-0.5">Relevés reçus par email ou ajoutés manuellement, à valider avant import.</p>
        </div>
        <UploadCounterButton />
      </div>
      <Card className="p-0">
        {withUrls.length === 0
          ? <p className="px-6 py-8 text-sm text-center text-ink-muted">Aucun compteur en attente.</p>
          : <PendingList rows={withUrls} machines={machines ?? []} />}
      </Card>
    </div>
  )
}
