import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  nouveau:  { label: 'Nouveau',  variant: 'info'    },
  assigné:  { label: 'Assigné',  variant: 'violet'  },
  en_cours: { label: 'En cours', variant: 'warning' },
  résolu:   { label: 'Résolu',   variant: 'success' },
  fermé:    { label: 'Fermé',    variant: 'neutral' },
}

const PRIORITY: Record<string, { label: string; variant: BadgeVariant }> = {
  basse:   { label: 'Basse',   variant: 'neutral' },
  normale: { label: 'Normale', variant: 'info'    },
  haute:   { label: 'Haute',   variant: 'warning' },
  urgente: { label: 'Urgente', variant: 'danger'  },
}

export type IncidentRow = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  machine_id: string
  created_at: string
  clientName: string | null
  technicianName: string | null
}

const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5'

export default function IncidentsListView({ incidents }: { incidents: IncidentRow[] }) {
  if (incidents.length === 0) {
    return (
      <Card className="px-5 py-12 text-center text-sm text-ink-muted">
        Aucun incident
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-soft border-b border-line-subtle">
            <th className={TH}>Nº</th>
            <th className={TH}>Titre</th>
            <th className={TH}>Client</th>
            <th className={TH}>Machine</th>
            <th className={TH}>Statut</th>
            <th className={TH}>Priorité</th>
            <th className={TH}>Technicien</th>
            <th className={TH}>Date</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {incidents.map((inc) => {
            const href = `/admin/incidents/${inc.id}`
            const status = STATUS[inc.status]
            const priority = PRIORITY[inc.priority]
            return (
              <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={href} className="font-semibold text-accent hover:underline">
                    {inc.numero_incident}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium max-w-xs">
                  <Link href={href} className="text-ink hover:text-accent transition-colors block truncate">
                    {inc.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">{inc.clientName ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">{inc.machine_id}</td>
                <td className="px-4 py-3">
                  {status
                    ? <Badge variant={status.variant}>{status.label}</Badge>
                    : <span className="text-xs text-ink-muted">{inc.status}</span>}
                </td>
                <td className="px-4 py-3">
                  {priority
                    ? <Badge variant={priority.variant}>{priority.label}</Badge>
                    : <span className="text-xs text-ink-muted">{inc.priority}</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{inc.technicianName ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={href} className="text-sm font-medium text-ink-soft hover:text-ink">
                    Voir
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
