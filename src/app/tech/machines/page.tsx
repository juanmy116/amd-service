import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

export default async function TechMachinesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: assignedIncidents } = await supabase
    .from('incidents')
    .select('machine_id')
    .eq('assigned_to', user.id)
    .not('status', 'in', '("fermé")')

  const machineIds = [...new Set((assignedIncidents ?? []).map(i => i.machine_id))]

  const { data: machines } = machineIds.length > 0
    ? await supabase
        .from('machines')
        .select('numero_serie, marque, modele, type, localisation, active')
        .in('numero_serie', machineIds)
        .order('marque')
    : { data: [] }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink lg:text-2xl font-display">
          Machines
        </h1>
        <p className="text-sm text-ink-muted mt-1">Machines liées à vos interventions</p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-neutral-soft">
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Nº Série</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Marque / Modèle</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Type</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Localisation</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Aucune machine liée à vos interventions
                </td>
              </tr>
            )}
            {machines?.map((m) => (
              <tr key={m.numero_serie} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-mono text-xs text-ink-muted">{m.numero_serie}</td>
                <td className="px-5 py-4">
                  <span className="font-medium text-ink">{m.marque}</span>
                  <span className="text-gray-300 mx-1.5">·</span>
                  <span className="text-ink-soft">{m.modele}</span>
                </td>
                <td className="px-5 py-4">
                  <Badge variant={m.type === 'color' ? 'violet' : 'neutral'}>
                    {m.type === 'color' ? 'Couleur' : 'N&B'}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-ink-soft">{m.localisation || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.active ? 'text-success' : 'text-ink-muted'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.active ? 'bg-success' : 'bg-line'}`} />
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
