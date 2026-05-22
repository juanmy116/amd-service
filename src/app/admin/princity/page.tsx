import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import { CheckCircle2, XCircle, Activity } from 'lucide-react'
import InitialImportButton from './InitialImportButton'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

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
        <h1 className="text-2xl font-semibold font-display text-ink">
          Intégration Princity
        </h1>
        <p className="text-sm text-ink-soft mt-1">Surveillance et importation des données Princity</p>
      </div>

      {/* Salud de las funciones */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">État des fonctions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(health ?? []).map(row => {
            const ok = row.last_success_at && !row.alert_sent
            return (
              <Card key={row.function_name} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-ink-muted">
                    {THRESHOLD_LABELS[row.function_name] ?? row.function_name}
                  </span>
                  {ok
                    ? <CheckCircle2 size={16} className="text-success" />
                    : <XCircle     size={16} className="text-accent" />}
                </div>
                <p className="text-xs text-ink-soft">
                  <span className="font-medium">Dernière sync:</span> {formatDate(row.last_success_at)}
                </p>
                {row.last_error_message && (
                  <p className="text-xs text-accent mt-1 truncate" title={row.last_error_message}>
                    ⚠ {row.last_error_message}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      </section>

      {/* Importación inicial */}
      <section className="mb-8 bg-warning-soft border border-warning/30 rounded-card p-6">
        <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
          <Activity size={15} />
          Importation initiale
        </h2>
        <p className="text-xs text-ink-soft mb-4">
          Efface toutes les données de test et importe clients + équipements depuis Princity.{' '}
          <strong>Action irréversible.</strong> Les contrats devront être créés manuellement ensuite.
        </p>
        <InitialImportButton />
      </section>

      {/* Logs recientes */}
      <section>
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">
          Journal (20 dernières exécutions)
        </h2>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-neutral-soft border-b border-line-subtle">
              <tr>
                {['Fonction', 'Endpoint', 'Date', 'Statut', 'Traités', 'Créés'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-ink-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {(logs ?? []).map((log, i) => (
                <tr key={i} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-2.5 font-mono text-ink-soft">{log.function_name}</td>
                  <td className="px-4 py-2.5 text-ink-muted truncate max-w-32">{log.endpoint_called}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{formatDate(log.executed_at)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={
                      log.status === 'success' ? 'success' :
                      log.status === 'partial'  ? 'warning' :
                                                   'danger'
                    }>
                      {log.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{log.records_processed}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{log.records_created}</td>
                </tr>
              ))}
              {!logs?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">Aucun log disponible</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
