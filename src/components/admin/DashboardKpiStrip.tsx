import { Users, Printer, FileText, AlertCircle } from 'lucide-react'
import type { ElementType } from 'react'

type Props = {
  clients: number
  machines: number
  contracts: number
  openIncidents: number
  avgCsat: number
}

type KpiDef = {
  label: string
  value: string | number
  sub?: string
  icon: ElementType
  iconColor: string
  iconBg: string
  gradientFrom: string
}

function KpiCard({ label, value, sub, icon: Icon, iconColor, iconBg, gradientFrom }: KpiDef) {
  return (
    <div
      className="border border-line rounded-card shadow-card p-[18px]"
      style={{ background: `linear-gradient(135deg, ${gradientFrom} 0%, #FFFFFF 55%)` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-[0.07em] leading-none">
          {label}
        </p>
        <div
          className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <p className="font-display text-[26px] font-semibold text-ink leading-none">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1.5">{sub}</p>}
    </div>
  )
}

function CsatCard({ avg }: { avg: number }) {
  const filled = Math.round(avg)
  return (
    <div
      className="border border-line rounded-card shadow-card p-[18px]"
      style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 55%)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-[0.07em] leading-none">
          CSAT moyen
        </p>
        <div
          className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 text-base leading-none"
          style={{ background: '#FDE68A', color: '#B45309' }}
        >
          ★
        </div>
      </div>
      <p className="font-display text-[26px] font-semibold text-ink leading-none">
        {avg > 0 ? avg.toFixed(1) : '—'}
        {avg > 0 && <span className="text-sm font-normal text-ink-muted ml-1">/5</span>}
      </p>
      {avg > 0 ? (
        <div className="flex gap-0.5 mt-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              className="text-[13px] leading-none"
              style={{ color: n <= filled ? '#F59E0B' : '#E5E7EB' }}
            >
              ★
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-muted mt-1.5">Aucune réponse</p>
      )}
    </div>
  )
}

export default function DashboardKpiStrip({ clients, machines, contracts, openIncidents, avgCsat }: Props) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiCard
        label="Clients actifs"
        value={clients}
        sub="entreprises & institutions"
        icon={Users}
        iconColor="#3B82F6"
        iconBg="#DBEAFE"
        gradientFrom="#EFF6FF"
      />
      <KpiCard
        label="Machines actives"
        value={machines}
        sub="en location"
        icon={Printer}
        iconColor="#10B981"
        iconBg="#D1FAE5"
        gradientFrom="#ECFDF5"
      />
      <KpiCard
        label="Contrats actifs"
        value={contracts}
        icon={FileText}
        iconColor="#8B5CF6"
        iconBg="#EDE9FE"
        gradientFrom="#F5F3FF"
      />
      <CsatCard avg={avgCsat} />
      <KpiCard
        label="Incidents ouverts"
        value={openIncidents}
        sub={openIncidents > 0 ? 'en attente de résolution' : 'tout est résolu ✓'}
        icon={AlertCircle}
        iconColor="#BF0D0D"
        iconBg="#FECACA"
        gradientFrom="#FEF2F2"
      />
    </div>
  )
}
