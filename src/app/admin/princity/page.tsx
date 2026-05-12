import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import { CheckCircle2, XCircle, Activity } from 'lucide-react'
import InitialImportButton from './InitialImportButton'

const THRESHOLD_LABELS: Record<string, string> = {
  'princity-alerts':   'Alertes (seuil: 2h)',
  'princity-sync':     'Sync équipements (seuil: 2j)',
  'princity-counters': 'Compteurs (seuil: 35j)',
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Jamais'
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar' })
}

export default async function PrincityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: health } = await supabase
    .from('princity_health')
    .select('function_name, last_success_at, last_error_at, last_error_message, alert_sent')
    .order('function_name')

  const { data: logs } = await supabase
    .from('princity_api_logs')
    .select('function_name, endpoint_called, executed_at, status, records_processed, records_created, error_message')
    .order('executed_at', { ascending: false })
    .limit(20)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Intégration Princity
        </h1>
        <p className="text-sm text-gray-500 mt-1">Surveillance et importation des données Princity</p>
      </div>

      {/* Salud de las funciones */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">État des fonctions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(health ?? []).map(row => {
            const ok = row.last_success_at && !row.alert_sent
            return (
              <div key={row.function_name} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500">
                    {THRESHOLD_LABELS[row.function_name] ?? row.function_name}
                  </span>
                  {ok
                    ? <CheckCircle2 size={16} className="text-green-500" />
                    : <XCircle     size={16} className="text-red-500" />}
                </div>
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Dernière sync:</span> {formatDate(row.last_success_at)}
                </p>
                {row.last_error_message && (
                  <p className="text-xs text-red-600 mt-1 truncate" title={row.last_error_message}>
                    ⚠ {row.last_error_message}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Importación inicial */}
      <section className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <Activity size={15} />
          Importation initiale
        </h2>
        <p className="text-xs text-amber-700 mb-4">
          Efface toutes les données de test et importe clients + équipements depuis Princity.{' '}
          <strong>Action irréversible.</strong> Les contrats devront être créés manuellement ensuite.
        </p>
        <InitialImportButton />
      </section>

      {/* Logs recientes */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Journal (20 dernières exécutions)
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Fonction', 'Endpoint', 'Date', 'Statut', 'Traités', 'Créés'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(logs ?? []).map((log, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-gray-700">{log.function_name}</td>
                  <td className="px-4 py-2.5 text-gray-500 truncate max-w-32">{log.endpoint_called}</td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(log.executed_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.status === 'success' ? 'bg-green-50 text-green-700' :
                      log.status === 'partial'  ? 'bg-amber-50 text-amber-700' :
                                                   'bg-red-50 text-red-700'
                    }`}>{log.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{log.records_processed}</td>
                  <td className="px-4 py-2.5 text-gray-600">{log.records_created}</td>
                </tr>
              ))}
              {!logs?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun log disponible</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
