import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Gauge, Wrench, AlertTriangle, Package } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

type HistoryRow = {
  source: string | null
  source_id: string | null
  reference: string | null
  part_id: number | null
  part_name: string | null
  description: string | null
  quantity: number | null
  changed_at: string | null
  category: string | null
  technician_name: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  panne: 'Panne', maintenance: 'Maintenance', consommable: 'Consommable', autre: 'Autre',
}

export default async function MachinePartsHistoryPage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  const { data: machine } = await supabase
    .from('machines')
    .select('numero_serie, marque, modele')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine) notFound()

  const { data: rows } = await supabase
    .from('v_machine_parts_history')
    .select('*')
    .eq('machine_id', numero_serie)
    .order('changed_at', { ascending: false })

  const history = (rows ?? []) as HistoryRow[]
  const totalUnits = history.reduce((sum, r) => sum + (r.quantity ?? 0), 0)

  const serieEnc = encodeURIComponent(numero_serie)

  return (
    <div className="p-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/machines/${serieEnc}`}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold font-display text-ink">
            {machine.marque} {machine.modele}
          </h1>
          <p className="font-mono text-xs text-ink-muted">{machine.numero_serie}</p>
        </div>
        <Link
          href={`/admin/contadores/${serieEnc}`}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-line text-sm font-medium text-ink-soft bg-card hover:bg-neutral-soft transition-colors"
        >
          <Gauge size={15} className="text-ink-muted" />
          Compteurs
        </Link>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <Package size={16} className="text-ink-muted shrink-0" />
          <div>
            <p className="text-xs text-ink-muted">Pièces / consommables remplacés</p>
            <p className="text-sm font-semibold text-ink">
              {totalUnits} unité{totalUnits > 1 ? 's' : ''} · {history.length} ligne{history.length > 1 ? 's' : ''}
            </p>
          </div>
        </Card>
      </div>

      {/* Historique */}
      <Card className="overflow-hidden">
        <PanelHeader title="Historique des pièces" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Origine</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Pièce</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Qté</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Technicien</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Référence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-ink-muted text-sm">
                  Aucune pièce remplacée pour cette machine
                </td>
              </tr>
            )}
            {history.map((r, idx) => {
              const isIncident = r.source === 'incident'
              const originVariant: BadgeVariant = isIncident ? 'warning' : 'info'
              const originLabel = isIncident
                ? (CATEGORY_LABEL[r.category ?? ''] ?? 'Incident')
                : 'Maintenance'
              const dateStr = r.changed_at
                ? new Date(r.changed_at).toLocaleDateString('fr-FR')
                : '—'
              return (
                <tr key={`${r.source}-${r.source_id}-${r.part_id ?? idx}`} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-3.5 text-ink-soft whitespace-nowrap">{dateStr}</td>
                  <td className="px-4 py-3.5">
                    <Badge variant={originVariant}>
                      <span className="inline-flex items-center gap-1">
                        {isIncident ? <AlertTriangle size={11} /> : <Wrench size={11} />}
                        {originLabel}
                      </span>
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink">{r.part_name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-ink-soft">{r.quantity ?? 1}</td>
                  <td className="px-4 py-3.5 text-ink-soft">{r.technician_name ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    {isIncident && r.source_id ? (
                      <Link
                        href={`/admin/incidents/${r.source_id}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {r.reference ?? 'Voir'}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-ink-muted">
                        {isIncident ? (r.reference ?? '—') : `Visite ${r.reference ?? ''}`}
                      </span>
                    )}
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
