import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}
const STATUS_DOT: Record<string, string> = {
  nouveau: 'bg-blue-500', assigné: 'bg-purple-500', en_cours: 'bg-amber-500', résolu: 'bg-green-500', fermé: 'bg-gray-400',
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function PortalIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()
  if (!clientProfile) redirect('/portal/verify')

  // Incidencia — RLS garantiza que solo ve las propias
  const { data: incident } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .or('source.is.null,source.neq.public')
    .single()

  if (!incident) notFound()

  const { data: history } = await supabase
    .from('incident_history')
    .select('id, old_status, new_status, comment, created_at')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })

  // Obtener máquina y contrato via contract_machine_id si está disponible
  let machine: { marque: string; modele: string } | null = null
  let contractNumero: string | null = null

  if (incident.contract_machine_id) {
    const { data: line } = await supabase
      .from('contract_machines')
      .select('machine_id, contracts!inner(numero_contrat), machines!inner(marque, modele)')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (line) {
      machine = line.machines as unknown as { marque: string; modele: string } | null
      contractNumero = (line.contracts as unknown as { numero_contrat: string } | null)?.numero_contrat ?? null
    }
  } else if (incident.machine_id) {
    // Incidencia pública legacy con machine_id directo
    const { data: m } = await supabase
      .from('machines')
      .select('marque, modele')
      .eq('numero_serie', incident.machine_id)
      .maybeSingle()
    machine = m
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors">
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-accent">
            {incident.numero_incident}
          </p>
          <h1 className="text-xl font-semibold text-ink font-display truncate">
            {incident.title}
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {machine ? `${machine.marque} ${machine.modele}` : incident.machine_id}
            {contractNumero && ` · ${contractNumero}`}
          </p>
        </div>
        <span className="shrink-0">
          <Badge variant={STATUS_BADGE[incident.status] ?? 'neutral'}>
            {STATUS_LABEL[incident.status] ?? incident.status}
          </Badge>
        </span>
      </div>

      {/* Details */}
      <Card className="p-6 space-y-4">
        {incident.description && (
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Description</p>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.description}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-line-subtle">
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Catégorie</p>
            <p className="text-sm text-ink-soft capitalize">{incident.category}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Priorité</p>
            <p className="text-sm text-ink-soft capitalize">{incident.priority}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Ouvert le</p>
            <p className="text-sm text-ink-soft">{new Date(incident.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
      </Card>

      {/* Rapport technicien */}
      {incident.rapport_intervention && (
        <Card className="p-6">
          <p className="text-xs font-medium text-ink-muted mb-2">Rapport d&apos;intervention</p>
          <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.rapport_intervention}</p>
        </Card>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <Card className="p-6">
          <p className="text-sm font-semibold text-ink mb-5">Suivi de l&apos;incident</p>
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                </div>
                <div className="flex-1 pb-4 border-b border-line-subtle last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2">
                    {h.old_status ? (
                      <span className="text-xs text-ink-muted">
                        {STATUS_LABEL[h.old_status] ?? h.old_status}
                        {' → '}
                        <span className="font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                    )}
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.comment && <p className="mt-1 text-xs text-ink-muted italic">{h.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
