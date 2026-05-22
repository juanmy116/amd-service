import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Printer, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id, clients(nom_client)')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const clientName = (clientProfile.clients as unknown as { nom_client: string } | null)?.nom_client ?? ''

  const [{ data: contracts }, { data: incidents }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, machine_id, lieu_installation, machines(marque, modele, type, localisation)')
      .eq('client_id', clientProfile.client_id)
      .eq('statut', 'actif'),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at')
      .in('contract_id', (await supabase
        .from('contracts')
        .select('id')
        .eq('client_id', clientProfile.client_id)
        .then(r => r.data?.map(c => c.id) ?? []))
      )
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const openCount     = incidents?.filter(i => !['résolu', 'fermé'].includes(i.status)).length ?? 0
  const resolvedCount = incidents?.filter(i =>  ['résolu', 'fermé'].includes(i.status)).length ?? 0

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Bonjour, {clientName}
        </h1>
        <p className="text-sm text-ink-muted mt-1">Voici l&apos;état de votre parc d&apos;impression.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center">
              <Printer size={16} className="text-info" />
            </div>
            <span className="text-sm text-ink-soft">Machines actives</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{contracts?.length ?? 0}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center">
              <Clock size={16} className="text-warning" />
            </div>
            <span className="text-sm text-ink-soft">Incidents ouverts</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{openCount}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center">
              <CheckCircle size={16} className="text-success" />
            </div>
            <span className="text-sm text-ink-soft">Résolus</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{resolvedCount}</p>
        </Card>
      </div>

      {/* Machines */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">Mes machines</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Type</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Localisation</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Contrat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {(!contracts || contracts.length === 0) && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-ink-muted">Aucune machine active</td></tr>
              )}
              {contracts?.map((c) => {
                const m = c.machines as unknown as { marque: string; modele: string; type: string; localisation: string | null } | null
                return (
                  <tr key={c.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-4 font-medium text-ink">{m ? `${m.marque} ${m.modele}` : c.machine_id}</td>
                    <td className="px-5 py-4">
                      <Badge variant={m?.type === 'color' ? 'violet' : 'neutral'}>
                        {m?.type === 'color' ? 'Couleur' : 'N&B'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink-soft">{m?.localisation ?? c.lieu_installation ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-ink-muted">{c.numero_contrat}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Recent incidents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Incidents récents</h2>
          <Link href="/portal/incidents" className="text-sm text-ink-soft hover:text-ink underline underline-offset-2">
            Voir tout
          </Link>
        </div>
        <Card className="overflow-hidden">
          {(!incidents || incidents.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={32} className="text-ink-muted mb-3" />
              <p className="text-sm text-ink-muted">Aucun incident signalé</p>
              <Link href="/portal/incidents/new" className="mt-3 text-sm font-medium text-accent underline underline-offset-2">
                Signaler un problème
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-soft border-b border-line-subtle">
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                    <td className="px-5 py-4">
                      <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                        {STATUS_LABEL[inc.status] ?? inc.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink-muted text-xs">
                      {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/portal/incidents/${inc.id}`} className="text-xs text-ink-muted hover:text-ink-soft underline underline-offset-2">Voir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
