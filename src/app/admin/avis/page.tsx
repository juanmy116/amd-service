import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

type Feedback = {
  id: string
  incident_id: string
  rating: number | null
  comment: string | null
  responded_at: string | null
  numero_incident: string | null
  contact_name: string | null
  contact_email: string | null
  machine_id: string | null
  nom_client: string | null
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? 'text-amber-400' : 'text-line'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 31) return `il y a ${days} jours`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

export default async function AvisPage({
  searchParams,
}: {
  searchParams: Promise<{ negatifs?: string }>
}) {
  const { negatifs } = await searchParams
  const onlyNegative = negatifs === '1'

  const supabase = await createClient()
  let query = supabase
    .from('v_csat_feedback')
    .select('id, incident_id, rating, comment, responded_at, numero_incident, contact_name, contact_email, machine_id, nom_client')
    .order('responded_at', { ascending: false })

  if (onlyNegative) query = query.lte('rating', 2)

  const { data } = await query
  const avis = (data ?? []) as Feedback[]
  const average = avis.length
    ? (avis.reduce((s, a) => s + (a.rating ?? 0), 0) / avis.length).toFixed(1)
    : null

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <MessageSquare size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold font-display text-ink">Avis clients</h1>
            <p className="text-sm text-ink-muted">
              Réponses aux enquêtes de satisfaction envoyées après chaque intervention
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/avis"
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              onlyNegative ? 'border-line text-ink-soft hover:bg-neutral-soft' : 'border-accent text-accent bg-accent/5'
            }`}
          >
            Tous
          </Link>
          <Link
            href="/admin/avis?negatifs=1"
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              onlyNegative ? 'border-accent text-accent bg-accent/5' : 'border-line text-ink-soft hover:bg-neutral-soft'
            }`}
          >
            ★ ≤ 2
          </Link>
        </div>
      </div>

      {/* Résumé */}
      {average && (
        <Card className="px-4 py-3 inline-flex items-center gap-2.5">
          <span className="text-sm font-semibold text-ink">{average} / 5</span>
          <span className="text-xs text-ink-muted">
            {avis.length} avis{onlyNegative ? ' négatifs' : ''}
          </span>
        </Card>
      )}

      {/* Liste */}
      <Card className="overflow-hidden">
        <PanelHeader title={onlyNegative ? 'Avis négatifs' : 'Tous les avis'} />
        <ul className="divide-y divide-line-subtle">
          {avis.length === 0 && (
            <li className="px-5 py-12 text-center text-ink-muted text-sm">
              Aucun avis pour le moment. Les enquêtes partent quand une intervention passe en « résolu ».
            </li>
          )}
          {avis.map((a) => (
            <li key={a.id} className="px-5 py-4 hover:bg-neutral-soft transition-colors">
              <div className="flex items-center gap-3 flex-wrap">
                {a.rating != null && <Stars rating={a.rating} />}
                <Link
                  href={`/admin/incidents/${a.incident_id}`}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {a.numero_incident ?? '—'}
                </Link>
                <span className="text-sm text-ink-soft">
                  {a.nom_client ?? a.contact_name ?? '—'}
                </span>
                {a.machine_id && (
                  <span className="font-mono text-xs text-ink-muted">{a.machine_id}</span>
                )}
                <span className="text-xs text-ink-muted ml-auto">
                  {a.responded_at ? timeAgo(a.responded_at) : ''}
                </span>
              </div>
              {a.comment && (
                <p className="text-sm text-ink mt-2 whitespace-pre-wrap">« {a.comment} »</p>
              )}
              {(a.contact_name || a.contact_email) && (
                <p className="text-xs text-ink-muted mt-1.5">
                  {a.contact_name}
                  {a.contact_email && ` · ${a.contact_email}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
