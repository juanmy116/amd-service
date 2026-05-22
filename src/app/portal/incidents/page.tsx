import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

const PRIORITY_BADGE: Record<string, BadgeVariant> = {
  basse: 'neutral', normale: 'info', haute: 'warning', urgente: 'danger',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

export default async function PortalIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const { data: contractIds } = await supabase
    .from('contracts')
    .select('id')
    .eq('client_id', clientProfile.client_id)

  const ids = contractIds?.map(c => c.id) ?? []

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, numero_incident, title, status, priority, category, created_at, machine_id')
    .in('contract_id', ids)
    .or('source.is.null,source.neq.public')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-ink font-display">
          Mes incidents
        </h1>
        <Link
          href="/portal/incidents/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Signaler un problème
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Nº</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Priorité</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!incidents || incidents.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-ink-muted">Aucun incident signalé</td>
              </tr>
            )}
            {incidents?.map((inc) => (
              <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-mono text-xs font-semibold text-accent">
                  {inc.numero_incident}
                </td>
                <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                <td className="px-5 py-4 font-mono text-xs text-ink-muted">{inc.machine_id}</td>
                <td className="px-5 py-4">
                  <Badge variant={PRIORITY_BADGE[inc.priority] ?? 'neutral'}>
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-xs text-ink-muted">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link href={`/portal/incidents/${inc.id}`} className="text-sm text-ink-muted hover:text-ink-soft underline underline-offset-2">Voir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
