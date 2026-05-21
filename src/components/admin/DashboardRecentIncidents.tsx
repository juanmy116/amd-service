import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant; className?: string }> = {
  nouveau:  { label: 'Nouveau',  variant: 'neutral', className: 'bg-blue-50 text-blue-700' },
  assigné:  { label: 'Assigné',  variant: 'warning' },
  en_cours: { label: 'En cours', variant: 'neutral' },
}

type RecentIncident = {
  id: string
  title: string
  status: string
  created_at: string
  clients: { nom_client: string } | null
  profiles: { full_name: string } | null
}

export default async function DashboardRecentIncidents() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('incidents')
    .select(`
      id, title, status, created_at,
      clients!client_id ( nom_client ),
      profiles!assigned_to ( full_name )
    `)
    .not('status', 'in', '("résolu","fermé")')
    .order('created_at', { ascending: false })
    .limit(8)

  const incidents = (data ?? []) as unknown as RecentIncident[]

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Incidents récents"
        action={{ label: 'Voir tout →', href: '/admin/incidents' }}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-soft border-b border-line-subtle">
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Titre
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Client
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Statut
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Technicien
            </th>
            <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {incidents.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                Aucun incident ouvert
              </td>
            </tr>
          ) : (
            incidents.map(inc => {
              const badge = STATUS_BADGE[inc.status]
              return (
                <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/incidents/${inc.id}`}
                      className="font-medium text-ink hover:text-accent transition-colors truncate block max-w-[220px]"
                    >
                      {inc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-4 py-3">
                    {badge ? (
                      <Badge variant={badge.variant} className={badge.className ?? ''}>
                        {badge.label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-muted">{inc.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {inc.profiles?.full_name ?? 'Non assigné'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-ink-muted whitespace-nowrap">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </Card>
  )
}
