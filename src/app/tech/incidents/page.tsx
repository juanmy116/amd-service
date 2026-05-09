import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_STYLE: Record<string, string> = {
  nouveau: 'bg-blue-50 text-blue-700', assigné: 'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700', résolu: 'bg-green-50 text-green-700', fermé: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export default async function TechIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, machine_id, created_at')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900 pt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Toutes mes interventions
      </h1>

      {(!incidents || incidents.length === 0) ? (
        <p className="text-sm text-gray-400 text-center py-12">Aucune intervention assignée</p>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{inc.title}</p>
                <p className="font-mono text-xs text-gray-400 mt-0.5">{inc.machine_id}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              <span className={`shrink-0 ml-3 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
