import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

export type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

type Props = { techPerf: TechPerf[] }

function RateChip({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-ink-muted">—</span>
  const cls =
    rate >= 80 ? 'bg-green-100 text-green-700' :
    rate >= 50 ? 'bg-orange-100 text-orange-700' :
                 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rate}%
    </span>
  )
}

export default function DashboardTechTable({ techPerf }: Props) {
  return (
    <div className="col-span-3">
      <Card className="overflow-hidden">
        <PanelHeader
          title="Performance équipe technique"
          action={{ label: "Gérer l'équipe →", href: '/admin/team' }}
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Technicien
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Total
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Résolus
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                En cours
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Taux
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {techPerf.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                  Aucun technicien enregistré
                </td>
              </tr>
            ) : (
              techPerf.map(tech => (
                <tr key={tech.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{tech.fullName}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">{tech.total}</td>
                  <td className="px-4 py-3 text-right font-medium text-success">{tech.resolved}</td>
                  <td className="px-4 py-3 text-right text-warning">{tech.active}</td>
                  <td className="px-4 py-3 text-right">
                    <RateChip rate={tech.rate} total={tech.total} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
