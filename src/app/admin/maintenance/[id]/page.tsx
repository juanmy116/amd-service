import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { presenceLabel, type Presence } from '@/lib/geo'

const PRESENCE_TONE_CLASS: Record<'green' | 'amber' | 'grey', string> = {
  green: 'text-success font-medium',
  amber: 'text-warning font-medium',
  grey:  'text-ink-muted',
}

const FREQ_LABEL: Record<string, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  fait:      'success',
  planifié:  'info',
  en_retard: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  fait:      'Fait',
  planifié:  'Planifié',
  en_retard: 'En retard',
}

export default async function MaintenancePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Las dos relaciones con `profiles` se piden POR SU CLAVE AJENA. `maintenance_visits` tiene
  // dos (`done_by` y `assigned_to`, esta última desde el kiosko del taller), así que pedir
  // `profiles(...)` a secas dejó de ser suficiente: PostgREST no sabe cuál quieres, devuelve
  // error, el `plan` llega vacío y la página respondía **404**. Los tres enlaces del listado
  // —cliente, contrato y «Détail»— apuntan aquí, así que la sección entera parecía rota.
  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes, created_at,
      contracts (
        id, numero_contrat,
        clients ( nom_client )
      ),
      maintenance_visits (
        id, scheduled_date, done_at, status, qr_verified, notes, matrix_notified,
        tech_presence, tech_distance_m, tech_accuracy_m,
        contract_machine_id,
        done_by_profile:profiles!maintenance_visits_done_by_fkey ( full_name ),
        assigned_profile:profiles!maintenance_visits_assigned_to_fkey ( full_name ),
        contract_machines ( machines ( numero_serie, marque, modele ) )
      )
    `)
    .eq('id', id)
    .single()

  if (!plan) notFound()

  const contract = plan.contracts

  type Visit = {
    id: string; scheduled_date: string; done_at: string | null
    status: string; qr_verified: boolean; notes: string | null
    matrix_notified: boolean
    tech_presence: Presence | null
    tech_distance_m: number | null
    tech_accuracy_m: number | null
    contract_machine_id: string
    done_by_profile: { full_name: string } | null
    assigned_profile: { full_name: string } | null
    contract_machines: { machines: { numero_serie: string; marque: string; modele: string } | null } | null
  }
  const visits = ((plan.maintenance_visits ?? []) as unknown as Visit[])
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))

  return (
    <div className="p-8 space-y-6 max-w-4xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink font-display">
            {contract.clients.nom_client}
          </h1>
          <p className="text-xs text-ink-muted">
            {contract.numero_contrat} · {visits.length} visite{visits.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Fréquence</p>
          <p className="text-sm font-semibold text-ink">{FREQ_LABEL[plan.frequency]}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Visites au total</p>
          <p className="text-sm font-semibold text-ink">{visits.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted mb-1">Faites</p>
          <p className="text-sm font-semibold text-success">
            {visits.filter(v => v.status === 'fait').length}
          </p>
        </Card>
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="bg-warning-soft border border-warning/30 rounded-card p-4 flex gap-3">
          <Wrench size={15} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-ink">{plan.notes}</p>
        </div>
      )}

      {/* Historial visitas */}
      <Card className="overflow-hidden">
        <PanelHeader title="Historique des visites" />
        <p className="px-4 pt-3 text-xs text-ink-muted">
          Avant le 25/09/2026, le QR n&apos;était pas vraiment vérifié : la clôture le marquait
          « ✓ Vérifié » automatiquement, sans scan réel sur la machine.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date planifiée</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Réalisée le</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Technicien</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">QR</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Position</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {visits.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-muted text-sm">
                  Aucune visite planifiée
                </td>
              </tr>
            )}
            {visits.map(v => {
              const variant = STATUS_BADGE[v.status as keyof typeof STATUS_BADGE] ?? 'info'
              const label   = STATUS_LABEL[v.status as keyof typeof STATUS_LABEL] ?? v.status
              return (
                <tr key={v.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-ink-soft">
                    {v.contract_machines?.machines
                      ? `${v.contract_machines.machines.marque} ${v.contract_machines.machines.modele}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink">
                    {new Date(v.scheduled_date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={variant}>{label}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft">
                    {v.done_at
                      ? new Date(v.done_at).toLocaleDateString('fr-FR')
                      : <span className="text-ink-muted">—</span>
                    }
                  </td>
                  {/* Quien la hizo; si todavía no está hecha, a quién se le asignó. */}
                  <td className="px-4 py-3.5 text-ink-soft">
                    {v.done_by_profile?.full_name ?? (
                      v.assigned_profile?.full_name
                        ? <span className="text-ink-muted">{v.assigned_profile.full_name} <span className="text-xs">(assigné)</span></span>
                        : <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {v.qr_verified
                      ? <span className="text-xs text-success font-medium">✓ Vérifié</span>
                      : <span className="text-xs text-ink-muted">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5">
                    {(() => {
                      const position = presenceLabel(v.tech_presence, v.tech_distance_m, v.tech_accuracy_m)
                      return position
                        ? <span className={`text-xs ${PRESENCE_TONE_CLASS[position.tone]}`}>{position.text}</span>
                        : <span className="text-xs text-ink-muted">—</span>
                    })()}
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft text-xs max-w-xs truncate">
                    {v.notes ?? <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
