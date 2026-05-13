import Link from 'next/link'

export type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

type Props = {
  techPerf: TechPerf[]
}

function RateChip({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-gray-400">—</span>
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
    <div className="col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Performance équipe technique</h2>
        <Link href="/admin/team" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Gérer l&apos;équipe →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50 bg-gray-50/60">
            <th className="text-left text-[11px] font-medium text-gray-400 px-6 py-3">Technicien</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Total</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Résolus</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">En cours</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-6 py-3">Taux</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {techPerf.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                Aucun technicien enregistré
              </td>
            </tr>
          ) : (
            techPerf.map(tech => (
              <tr key={tech.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-6 py-3.5 font-medium text-gray-900">{tech.fullName}</td>
                <td className="px-4 py-3.5 text-right text-gray-600">{tech.total}</td>
                <td className="px-4 py-3.5 text-right font-medium text-green-600">{tech.resolved}</td>
                <td className="px-4 py-3.5 text-right text-orange-500">{tech.active}</td>
                <td className="px-6 py-3.5 text-right">
                  <RateChip rate={tech.rate} total={tech.total} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
