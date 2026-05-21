import Link from 'next/link'
import { BarChart2 } from 'lucide-react'

type Props = { totalCopies: number }

export default function DashboardCopiesBanner({ totalCopies }: Props) {
  if (totalCopies === 0) return null
  return (
    <div className="bg-accent rounded-card p-5 flex items-center justify-between text-white">
      <div className="flex items-center gap-3">
        <BarChart2 size={20} className="opacity-80" />
        <div>
          <p className="text-xs font-medium opacity-70 uppercase tracking-wider">
            Copies enregistrées ce mois
          </p>
          <p className="font-display text-2xl font-bold mt-0.5">
            {totalCopies.toLocaleString('fr-FR')}
          </p>
        </div>
      </div>
      <Link
        href="/admin/contadores"
        className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity border border-white/30 rounded-lg px-3 py-1.5"
      >
        Voir les compteurs →
      </Link>
    </div>
  )
}
