import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import PlanningVisits from '@/components/tech/PlanningVisits'
import type { VisitRow } from '@/components/tech/PlanningVisits'
import { coordsForMachines } from '@/lib/geo.server'
import type { LatLng } from '@/lib/geo'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nuevo: 'info', assigné: 'violet', en_cours: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', assigné: 'Assigné', en_cours: 'En cours',
}

export default async function TechPlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now   = new Date()
  const in14  = new Date(now)
  in14.setDate(now.getDate() + 14)
  const in14Str = in14.toISOString().split('T')[0]

  const [{ data: rawVisits }, { data: incidents }] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        contract_machines (
          machines ( numero_serie, marque, modele, localisation ),
          contracts ( clients ( nom_client ) )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(30),
    supabase
      .from('incidents')
      .select('id, title, status, priority, machine_id, created_at')
      .eq('assigned_to', user.id)
      .not('status', 'in', '("résolu","fermé")')
      .order('created_at', { ascending: false }),
  ])

  const visits = (rawVisits ?? []).filter(v =>
    v.status === 'en_retard' || v.scheduled_date <= in14Str
  )

  function toRow(v: (typeof visits)[number]): VisitRow {
    const line = v.contract_machines
    return {
      id: v.id,
      scheduled_date: v.scheduled_date,
      status: v.status,
      serie:  line?.machines?.numero_serie ?? null,
      marque: line?.machines?.marque ?? null,
      modele: line?.machines?.modele ?? null,
      client: line?.contracts?.clients?.nom_client ?? '—',
      lieu:   line?.machines?.localisation ?? null,
    }
  }

  const overdueRows = visits.filter(v => v.status === 'en_retard').map(toRow)
  const plannedRows = visits.filter(v => v.status === 'planifié').map(toRow)

  // Coordonnées des machines des visites, pour « Plus proche » (Fase 3 §Task 8).
  const series = [...overdueRows, ...plannedRows].map(r => r.serie).filter((s): s is string => !!s)
  const coordsMap = await coordsForMachines(series)
  const coords: Record<string, LatLng | null> = Object.fromEntries(coordsMap)

  return (
    <div className="p-4 space-y-6 pt-5">

      <div>
        <h1 className="text-lg font-semibold text-ink font-display">
          Planning
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ── MAINTENANCES (en retard + 14 prochains jours) ── */}
      <PlanningVisits overdueRows={overdueRows} plannedRows={plannedRows} coords={coords} />

      {/* ── MES INTERVENTIONS ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-ink-muted" />
          <p className="text-sm font-semibold text-ink-soft">
            Mes interventions
            {(incidents?.length ?? 0) > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-muted">({incidents!.length})</span>
            )}
          </p>
        </div>

        {(!incidents || incidents.length === 0) ? (
          <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
            <p className="text-sm text-ink-muted">Aucune intervention assignée</p>
          </div>
        ) : (
          incidents.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="flex items-start gap-3 bg-card rounded-[var(--radius-card)] border border-line p-4"
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-soft flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-ink-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{inc.title}</p>
                <p className="font-mono text-xs text-ink-muted mt-0.5">{inc.machine_id}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </Badge>
            </Link>
          ))
        )}
      </section>

    </div>
  )
}
