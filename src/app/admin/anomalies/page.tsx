import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, XCircle, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { PARTS } from '@/lib/parts'
import RecalcButton from './RecalcButton'
import { setAnomalyStatusAction } from './actions'

type Anomaly = {
  id: string
  machine_id: string
  part_id: number | null
  light: string
  reason: string
  detected_at: string
}

const PART_NAME = new Map<number, string>(PARTS.map((p) => [p.id, p.name]))

export default async function AnomaliesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('machine_anomalies')
    .select('id, machine_id, part_id, light, reason, detected_at')
    .eq('status', 'open')
    .order('detected_at', { ascending: false })

  // Rojo (más urgente) primero; el sort es estable, así conserva el orden por fecha.
  const anomalies = ((data ?? []) as Anomaly[]).sort((a, b) =>
    a.light === b.light ? 0 : a.light === 'red' ? -1 : 1
  )
  const reds = anomalies.filter((a) => a.light === 'red').length

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Activity size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold font-display text-ink">Anomalies de consommation</h1>
            <p className="text-sm text-ink-muted">
              Pièces dont la consommation s&apos;approche ou dépasse le rendement attendu
            </p>
          </div>
        </div>
        <RecalcButton />
      </div>

      {/* Résumé */}
      <div className="flex gap-3">
        <Card className="px-4 py-3 flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-ink">{reds}</span>
          <span className="text-xs text-ink-muted">à remplacer</span>
        </Card>
        <Card className="px-4 py-3 flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-sm font-semibold text-ink">{anomalies.length - reds}</span>
          <span className="text-xs text-ink-muted">à surveiller</span>
        </Card>
      </div>

      {/* Cola */}
      <Card className="overflow-hidden">
        <PanelHeader title="À traiter" />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">État</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Pièce</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Motif</th>
              <th className="text-right px-5 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {anomalies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-ink-muted text-sm">
                  Aucune anomalie ouverte. Lancez « Recalculer » après l&apos;arrivée de relevés.
                </td>
              </tr>
            )}
            {anomalies.map((a) => {
              const variant: BadgeVariant = a.light === 'red' ? 'danger' : 'warning'
              const partName = a.part_id != null ? (PART_NAME.get(a.part_id) ?? `#${a.part_id}`) : '—'
              return (
                <tr key={a.id} className="hover:bg-neutral-soft transition-colors align-top">
                  <td className="px-5 py-3.5">
                    <Badge variant={variant}>
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {a.light === 'red' ? 'Remplacer' : 'Surveiller'}
                      </span>
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/admin/machines/${encodeURIComponent(a.machine_id)}/pieces`}
                      className="font-mono text-xs text-accent hover:underline"
                    >
                      {a.machine_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink whitespace-nowrap">{partName}</td>
                  <td className="px-4 py-3.5 text-ink-soft">{a.reason}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <StatusButton id={a.id} status="resolved" title="Résolu (pièce remplacée)">
                        <CheckCircle2 size={15} className="text-success" />
                      </StatusButton>
                      <StatusButton id={a.id} status="ack" title="Acquitter (vu, en cours)">
                        <Check size={15} className="text-ink-soft" />
                      </StatusButton>
                      <StatusButton id={a.id} status="dismissed" title="Écarter (faux positif)">
                        <XCircle size={15} className="text-ink-muted" />
                      </StatusButton>
                    </div>
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

function StatusButton({
  id, status, title, children,
}: {
  id: string; status: string; title: string; children: React.ReactNode
}) {
  return (
    <form action={setAnomalyStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        title={title}
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
      >
        {children}
      </button>
    </form>
  )
}
