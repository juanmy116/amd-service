import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { LogOut, Clock, CheckCircle, AlertCircle, Printer, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}
const PRIORITY_BADGE: Record<string, BadgeVariant> = {
  basse: 'neutral', normale: 'info', haute: 'warning', urgente: 'danger',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}
const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, haute: 1, normale: 2, basse: 3,
}

type HomeIncident = {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}

export default async function TechPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [profileRes, incidentsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
      .eq('assigned_to', user.id)
      .order('created_at', { ascending: false }),
  ])

  const incidents = (incidentsRes.data ?? []) as unknown as HomeIncident[]
  const firstName  = profileRes.data?.full_name?.split(' ')[0] ?? 'Technicien'

  const openCount          = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const urgentCount        = incidents.filter(i => i.priority === 'urgente' && !['résolu', 'fermé'].includes(i.status)).length
  const resolvedMonthCount = incidents.filter(i =>
    ['résolu', 'fermé'].includes(i.status) && i.created_at >= startOfMonth.toISOString()
  ).length
  const totalCount = incidents.length

  const nextIntervention = incidents
    .filter(i => !['résolu', 'fermé'].includes(i.status))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4))[0] ?? null

  const activeIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status))

  return (
    <div className="p-4 lg:p-8 space-y-6">

      {/* Header móvil */}
      <div className="flex items-center justify-between pt-2 lg:hidden">
        <div>
          <p className="text-xs text-ink-muted">Bonjour,</p>
          <h1 className="text-xl font-semibold text-ink font-display">{firstName}</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="w-9 h-9 flex items-center justify-center rounded-xl border border-line bg-card text-ink-muted">
            <LogOut size={16} />
          </button>
        </form>
      </div>

      {/* Header desktop */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold text-ink font-display">
          Bonjour, {firstName}
        </h1>
        <p className="text-sm text-ink-muted mt-1">Voici vos interventions en cours.</p>
      </div>

      {/* Stats 2×2 bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center mb-3">
            <Clock size={16} className="text-warning" />
          </div>
          <p className="text-2xl font-semibold text-ink">{openCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">En cours</p>
        </div>
        <div className={`rounded-[var(--radius-card)] border p-4 ${urgentCount > 0 ? 'bg-accent-soft border-accent/20' : 'bg-card border-line'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${urgentCount > 0 ? 'bg-accent/10' : 'bg-neutral-soft'}`}>
            <AlertCircle size={16} className={urgentCount > 0 ? 'text-accent' : 'text-ink-muted'} />
          </div>
          <p className={`text-2xl font-semibold ${urgentCount > 0 ? 'text-accent' : 'text-ink'}`}>{urgentCount}</p>
          <p className={`text-xs mt-0.5 ${urgentCount > 0 ? 'text-accent' : 'text-ink-muted'}`}>Urgents</p>
        </div>
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center mb-3">
            <CheckCircle size={16} className="text-success" />
          </div>
          <p className="text-2xl font-semibold text-ink">{resolvedMonthCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Résolus ce mois</p>
        </div>
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center mb-3">
            <Printer size={16} className="text-info" />
          </div>
          <p className="text-2xl font-semibold text-ink">{totalCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Total assignés</p>
        </div>
      </div>

      {/* Prochaine intervention */}
      {nextIntervention && (
        <Link
          href={`/tech/incidents/${nextIntervention.id}`}
          className="block bg-card rounded-[var(--radius-card)] border border-line shadow-card p-4"
        >
          <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
            Prochaine intervention
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">
                {nextIntervention.clients?.nom_client ?? '—'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5 truncate">{nextIntervention.title}</p>
              <div className="mt-2">
                <Badge variant={PRIORITY_BADGE[nextIntervention.priority] ?? 'neutral'}>
                  {PRIORITY_LABEL[nextIntervention.priority] ?? nextIntervention.priority}
                </Badge>
              </div>
            </div>
            <ChevronRight size={18} className="text-ink-muted shrink-0" />
          </div>
        </Link>
      )}

      {/* Interventions actives */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink lg:text-base">
            Interventions en cours
          </h2>
          <span className="text-xs text-ink-muted">{activeIncidents.length} actives</span>
        </div>

        {/* Mobile: cards */}
        <div className="lg:hidden">
          {activeIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-card rounded-[var(--radius-card)] border border-line">
              <Clock size={32} className="text-line mb-3" />
              <p className="text-sm font-medium text-ink-muted">Aucune intervention assignée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeIncidents.map((inc) => (
                <Link key={inc.id} href={`/tech/incidents/${inc.id}`} className="block bg-card rounded-[var(--radius-card)] border border-line p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-ink leading-snug">{inc.title}</p>
                    <Badge variant={PRIORITY_BADGE[inc.priority] ?? 'neutral'}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">{inc.clients?.nom_client ?? '—'}</p>
                    <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <Card className="hidden lg:block overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-soft">
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Client</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Priorité</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {activeIncidents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">Aucune intervention en cours</td></tr>
              )}
              {activeIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                  <td className="px-5 py-4 text-ink-muted text-xs">{inc.clients?.nom_client ?? '—'}</td>
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
                  <td className="px-5 py-4 text-ink-muted text-xs">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/tech/incidents/${inc.id}`} className="text-sm font-medium text-ink-muted hover:text-ink underline underline-offset-2">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
