import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, MapPin, Building2, Wrench, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'
import { getOpenLineForMachine } from '@/lib/contract-machines'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

export default async function MachineScanPage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  // Check explícito de auth y rol — no depender únicamente del middleware o RLS
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'technician'].includes(profile.role)) redirect('/login')

  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine || !machine.active) notFound()

  // Obtener línea abierta para la máquina (nuevo modelo contract_machines)
  const openLine = await getOpenLineForMachine(supabase, numero_serie)
  let contract: { id: string; numero_contrat: string; clients: unknown } | null = null
  if (openLine) {
    const { data } = await supabase
      .from('contracts')
      .select('id, numero_contrat, clients(nom_client)')
      .eq('id', openLine.contract_id)
      .maybeSingle()
    contract = data
  }

  const client = contract?.clients as unknown as { nom_client: string } | null

  // Auto-transición primer escaneo: assigné → en_cours para incidentes asignados a este técnico en esta máquina.
  // Se ejecuta después del guard machine.active para no mutar incidentes en máquinas dadas de baja.
  // createAdminClient() bypassa RLS — server-only, nunca llamar desde un Client Component.
  const admin = createAdminClient()

  // Filtrar incidentes por contract_machine_id (nuevo modelo) y machine_id (legacy)
  const filterExpr = openLine
    ? `contract_machine_id.eq.${openLine.id},machine_id.eq.${numero_serie}`
    : `machine_id.eq.${numero_serie}`

  const { data: toTransition } = await admin
    .from('incidents')
    .select('id')
    .or(filterExpr)
    .eq('assigned_to', user.id)
    .eq('status', 'assigné')

  if (toTransition && toTransition.length > 0) {
    await admin
      .from('incidents')
      .update({ status: 'en_cours' })
      .in('id', toTransition.map((i) => i.id))
    await admin.from('incident_history').insert(
      toTransition.map((i) => ({
        incident_id: i.id,
        changed_by: user.id,
        old_status: 'assigné',
        new_status: 'en_cours',
        comment: 'Mise en cours automatique — scan QR',
      }))
    )
  }

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, created_at')
    .or(filterExpr)
    .not('status', 'in', '("fermé")')
    .order('created_at', { ascending: false })
    .limit(5)

  // Mantenimiento pendiente para esta máquina
  let pendingVisit: { id: string; scheduled_date: string; status: string } | null = null
  if (contract && openLine) {
    const { data: plan } = await supabase
      .from('maintenance_plans')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('active', true)
      .maybeSingle()

    if (plan) {
      const { data: visit } = await supabase
        .from('maintenance_visits')
        .select('id, scheduled_date, status')
        .eq('plan_id', plan.id)
        .eq('contract_machine_id', openLine.id)
        .in('status', ['planifié', 'en_retard'])
        .order('scheduled_date')
        .limit(1)
        .maybeSingle()
      pendingVisit = visit ?? null
    }
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/tech/scan" className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <h1 className="text-base font-semibold text-ink font-display">
          Fiche machine
        </h1>
      </div>

      {/* Machine info */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent">
            <Printer size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">{machine.marque} {machine.modele}</p>
            <p className="font-mono text-xs text-ink-muted">{machine.numero_serie}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-line-subtle">
          <div>
            <p className="text-xs text-ink-muted mb-0.5">Type</p>
            <Badge variant={machine.type === 'color' ? 'violet' : 'neutral'}>
              {machine.type === 'color' ? 'Couleur' : 'N&B'}
            </Badge>
          </div>
          {machine.localisation && (
            <div>
              <p className="text-xs text-ink-muted mb-0.5">Position</p>
              <div className="flex items-center gap-1 text-xs text-ink-soft">
                <MapPin size={11} className="text-ink-muted" />
                {machine.localisation}
              </div>
            </div>
          )}
        </div>

        {client && (
          <div className="flex items-center gap-2 text-sm text-ink-soft pt-1 border-t border-line-subtle">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            <span className="font-medium">{client.nom_client}</span>
            {machine.localisation && (
              <span className="text-ink-muted text-xs truncate">— {machine.localisation}</span>
            )}
          </div>
        )}
      </Card>

      {/* Maintenance en attente */}
      {pendingVisit && (
        <div>
          <p className="text-sm font-semibold text-ink mb-3">Maintenance préventive</p>
          <Link
            href={`/tech/scan/${encodeURIComponent(serie)}/maintenance/${pendingVisit.id}`}
            className={`flex items-center justify-between rounded-[var(--radius-card)] border-2 p-4 ${
              pendingVisit.status === 'en_retard'
                ? 'border-accent/50 bg-accent-soft'
                : 'border-info/50 bg-info-soft'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                pendingVisit.status === 'en_retard' ? 'bg-accent/10' : 'bg-info/10'
              }`}>
                {pendingVisit.status === 'en_retard'
                  ? <AlertTriangle size={16} className="text-accent" />
                  : <Wrench size={16} className="text-info" />
                }
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {pendingVisit.status === 'en_retard' ? 'Maintenance en retard' : 'Maintenance planifiée'}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Prévue le {new Date(pendingVisit.scheduled_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <span className="text-sm text-ink-muted">→</span>
          </Link>
        </div>
      )}

      {/* Incidents actifs */}
      <div>
        <p className="text-sm font-semibold text-ink mb-3">Incidents actifs</p>
        {(!incidents || incidents.length === 0) ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-ink-muted">Aucun incident actif sur cette machine</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/tech/incidents/${inc.id}`}
                className={`flex items-center justify-between bg-card rounded-[var(--radius-card)] border p-4 ${
                  inc.status === 'en_cours' ? 'border-warning/50' : 'border-line'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{inc.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</p>
                  {inc.status === 'en_cours' && (
                    <p className="text-xs font-medium mt-1 text-accent">
                      Faire l&apos;intervention →
                    </p>
                  )}
                </div>
                <span className="shrink-0 ml-3">
                  <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </Badge>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
