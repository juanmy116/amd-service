import { Users, Printer, FileText, AlertCircle } from 'lucide-react'

type Props = {
  clients: number
  machines: number
  contracts: number
  openIncidents: number
  avgCsat: number
}

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">{label}</p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  )
}

function CsatStars({ avg }: { avg: number }) {
  const filled = Math.round(avg)
  return (
    <div className="flex gap-0.5 mt-2">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className="text-base leading-none" style={{ color: n <= filled ? '#F59E0B' : '#E5E7EB' }}>
          ★
        </span>
      ))}
    </div>
  )
}

export default function DashboardKpiStrip({ clients, machines, contracts, openIncidents, avgCsat }: Props) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiCard label="Clients actifs" value={clients} icon={Users} accent="#3B82F6" sub="entreprises & institutions" />
      <KpiCard label="Machines actives" value={machines} icon={Printer} accent="#10B981" sub="en location" />
      <KpiCard label="Contrats actifs" value={contracts} icon={FileText} accent="#8B5CF6" />
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">CSAT moyen</p>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#F59E0B18' }}>
            <span style={{ color: '#F59E0B', fontSize: 16, lineHeight: 1 }}>★</span>
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {avgCsat > 0 ? avgCsat.toFixed(1) : '—'}
          {avgCsat > 0 && <span className="text-sm font-normal text-gray-400 ml-1">/5</span>}
        </p>
        {avgCsat > 0 ? <CsatStars avg={avgCsat} /> : <p className="text-xs text-gray-400 mt-2">Aucune réponse</p>}
      </div>
      <KpiCard
        label="Incidents ouverts"
        value={openIncidents}
        icon={AlertCircle}
        accent="#BF0D0D"
        sub={openIncidents > 0 ? 'en attente de résolution' : 'tout est résolu ✓'}
      />
    </div>
  )
}
