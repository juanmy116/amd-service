import Link from 'next/link'
import { Wrench, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { summarizeMachineMaintenance, maintenanceRowRank, type MachineMaintenance } from '@/lib/maintenanceSummary'

const FREQUENCY_LABEL: Record<string, string> = { mensuel: 'Mensuel', trimestriel: 'Trimestriel' }

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR')

type Visit = {
  id: string
  scheduled_date: string
  status: string
  contract_machine_id: string
  assigned_to: string | null
  assigned_profile: { full_name: string | null } | null
}

/**
 * Sección «Maintenance» de la ficha del cliente: por cada máquina en contrato, su próxima visita,
 * la última hecha y quién la tiene asignada. Señala también las máquinas que no tienen ninguna
 * visita programada (p. ej. añadidas al contrato después de crear el plan) y los contratos sin plan.
 */
export default async function ClientMaintenance({ clientId }: { clientId: number }) {
  const supabase = await createClient()

  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select(`
      id, numero_contrat, statut, maintenance_frequency,
      contract_machines ( id, machine_id, date_fin, maintenance_frequency_override, machines ( marque, modele ) )
    `)
    .eq('client_id', clientId)
    .neq('statut', 'terminé')
    .order('numero_contrat')

  // Las dos claves de `maintenance_visits` hacia `profiles` (done_by, assigned_to) obligan a
  // nombrar la relación; un `profiles(...)` a secas da PGRST201 y vacía la consulta.
  const contractIds = (contracts ?? []).map((c) => c.id)
  const { data: plans, error: pErr } = contractIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from('maintenance_plans')
        .select(`
          id, contract_id, frequency,
          maintenance_visits (
            id, scheduled_date, status, contract_machine_id, assigned_to,
            assigned_profile:profiles!maintenance_visits_assigned_to_fkey ( full_name )
          )
        `)
        .in('contract_id', contractIds)
        .eq('active', true)

  if (cErr || pErr) {
    console.error('[client maintenance]', cErr ?? pErr)
    return (
      <Section>
        <p className="text-sm text-accent">Impossible de charger la maintenance de ce client.</p>
      </Section>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const planByContract = new Map((plans ?? []).map((p) => [p.contract_id, p]))

  const groups = (contracts ?? [])
    .map((c) => {
      const plan = planByContract.get(c.id) ?? null
      const summaries = summarizeMachineMaintenance((plan?.maintenance_visits ?? []) as Visit[], today)
      const rows = (c.contract_machines ?? [])
        .filter((l) => l.date_fin === null)
        .map((l) => ({
          line: l,
          frequency: l.maintenance_frequency_override ?? plan?.frequency ?? c.maintenance_frequency,
          hasPlan: plan !== null,
          summary: (summaries.get(l.id) ?? null) as MachineMaintenance<Visit> | null,
        }))
        .sort((a, b) => {
          const [ra, da] = maintenanceRowRank(a)
          const [rb, db] = maintenanceRowRank(b)
          return ra - rb || da.localeCompare(db) || a.line.machine_id.localeCompare(b.line.machine_id)
        })
      return { contract: c, plan, rows }
    })
    .filter((g) => g.rows.length > 0)

  if (groups.length === 0) {
    return (
      <Section>
        <p className="text-sm text-ink-muted">Aucune machine sous contrat pour ce client.</p>
      </Section>
    )
  }

  const overdue = groups.reduce((n, g) => n + g.rows.filter((r) => r.summary?.overdue).length, 0)
  const unscheduled = groups.reduce((n, g) => n + g.rows.filter((r) => r.hasPlan && !r.summary?.next).length, 0)

  return (
    <Section overdue={overdue} unscheduled={unscheduled}>
      <div className="space-y-6">
        {groups.map(({ contract, plan, rows }) => (
          <div key={contract.id}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm text-ink">
                <Link href={`/admin/contracts/${contract.id}`} className="font-mono font-medium hover:text-accent">
                  {contract.numero_contrat}
                </Link>
                <span className="text-ink-muted"> · {rows.length} machine{rows.length > 1 ? 's' : ''}</span>
              </p>
              {plan ? (
                <Link href={`/admin/maintenance/${plan.id}`} className="text-xs text-ink-muted hover:text-ink-soft">
                  Voir le plan →
                </Link>
              ) : (
                <Link href="/admin/maintenance/new" className="text-xs font-medium text-accent hover:underline">
                  Créer un plan →
                </Link>
              )}
            </div>

            {!plan ? (
              <p className="text-sm text-ink-muted rounded-lg border border-dashed border-line px-4 py-3">
                Pas de plan de maintenance pour ce contrat.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted border-b border-line">
                      <th className="px-3 py-2 font-semibold">Machine</th>
                      <th className="px-3 py-2 font-semibold">Fréquence</th>
                      <th className="px-3 py-2 font-semibold">Prochaine visite</th>
                      <th className="px-3 py-2 font-semibold">Dernière visite</th>
                      <th className="px-3 py-2 font-semibold">Technicien</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map(({ line, frequency, summary }) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <span className="font-mono text-ink whitespace-nowrap">{line.machine_id}</span>
                          {line.machines && (
                            <span className="block text-xs text-ink-muted">{line.machines.marque} {line.machines.modele}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{frequency ? FREQUENCY_LABEL[frequency] ?? frequency : '—'}</td>
                        <td className="px-3 py-2">
                          {summary?.next ? (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className={summary.overdue ? 'text-accent font-medium' : 'text-ink'}>
                                {fmtDate(summary.next.scheduled_date)}
                              </span>
                              {summary.overdue && <Badge variant="danger" className="whitespace-nowrap">En retard</Badge>}
                            </span>
                          ) : (
                            <Badge variant="warning" className="whitespace-nowrap">Aucune visite</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                          {summary?.lastDone ? fmtDate(summary.lastDone.scheduled_date) : '—'}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">
                          {/* assigned_to, no el nombre, dice si hay técnico: un perfil puede no tener nombre */}
                          {!summary?.next
                            ? '—'
                            : summary.next.assigned_to
                              ? summary.next.assigned_profile?.full_name ?? 'Assigné'
                              : <span className="text-ink-muted whitespace-nowrap">Non assigné</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function Section({ children, overdue = 0, unscheduled = 0 }: { children: React.ReactNode; overdue?: number; unscheduled?: number }) {
  return (
    <div className="px-8 pb-8 max-w-3xl">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-soft uppercase tracking-wide">
            <Wrench size={14} />
            Maintenance
          </h2>
          <div className="flex items-center gap-2">
            {overdue > 0 && <Badge variant="danger">{overdue} en retard</Badge>}
            {unscheduled > 0 && (
              <Badge variant="warning">
                <AlertTriangle size={11} className="mr-1" />
                {unscheduled} sans visite
              </Badge>
            )}
          </div>
        </div>
        {children}
      </Card>
    </div>
  )
}
