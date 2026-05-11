import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BarChart2, AlertTriangle } from 'lucide-react'

const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
                   'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

interface ActiveCounter {
  machine_id:    string
  year:          number
  month:         number
  counter_bw:    number
  counter_color: number
}

export default async function ClientContadoresPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const clientIdNum  = parseInt(clientId)
  if (isNaN(clientIdNum)) notFound()

  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, nom_client')
    .eq('id', clientIdNum)
    .maybeSingle()

  if (!client) notFound()

  // Máquinas de este cliente (a través de sus contratos activos)
  const { data: contracts } = await supabase
    .from('contracts')
    .select('machine_id')
    .eq('client_id', clientIdNum)
    .eq('statut', 'actif')

  const machineIds = (contracts ?? []).map(c => c.machine_id)

  const { data: machines } = machineIds.length > 0
    ? await supabase
        .from('machines')
        .select('numero_serie, marque, modele')
        .in('numero_serie', machineIds)
        .eq('active', true)
        .order('marque')
    : { data: [] }

  // Relevés activos para estas máquinas
  const { data: allActiveCounters } = machineIds.length > 0
    ? await supabase
        .from('machine_counters')
        .select('machine_id, year, month, counter_bw, counter_color')
        .eq('status', 'actif')
        .in('machine_id', machineIds)
        .order('year',  { ascending: false })
        .order('month', { ascending: false })
    : { data: [] }

  // Mapa: machine_id → { latest, delta }
  const counterMap = new Map<string, {
    latest:      ActiveCounter
    delta_bw:    number | null
    delta_color: number | null
  }>()

  if (allActiveCounters) {
    const seen = new Map<string, number>()
    allActiveCounters.forEach(c => {
      const count = seen.get(c.machine_id) ?? 0
      if (count === 0) {
        counterMap.set(c.machine_id, { latest: c, delta_bw: null, delta_color: null })
      } else if (count === 1) {
        const entry = counterMap.get(c.machine_id)!
        counterMap.set(c.machine_id, {
          latest:      entry.latest,
          delta_bw:    entry.latest.counter_bw    - c.counter_bw,
          delta_color: entry.latest.counter_color - c.counter_color,
        })
      }
      seen.set(c.machine_id, count + 1)
    })
  }

  const now    = new Date()
  const cYear  = now.getFullYear()
  const cMonth = now.getMonth() + 1

  const missingCount = (machines ?? []).filter(m => {
    const l = counterMap.get(m.numero_serie)?.latest
    return !l || l.year !== cYear || l.month !== cMonth
  }).length

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/admin/contadores"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {client.nom_client}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {(machines ?? []).length} machine{(machines ?? []).length !== 1 ? 's' : ''} active{(machines ?? []).length !== 1 ? 's' : ''}
            {missingCount > 0 && (
              <span className="ml-2 text-amber-500 font-medium">
                · {missingCount} relevé{missingCount !== 1 ? 's' : ''} manquant{missingCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Dernier relevé</th>
              <th className="text-right px-4 py-3.5 font-medium text-gray-500">N&amp;B total</th>
              <th className="text-right px-4 py-3.5 font-medium text-gray-500">Δ N&amp;B</th>
              <th className="text-right px-4 py-3.5 font-medium text-gray-500">Couleur total</th>
              <th className="text-right px-4 py-3.5 font-medium text-gray-500">Δ Couleur</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-gray-400">
                  Aucune machine active pour ce client
                </td>
              </tr>
            )}
            {(machines ?? []).map(m => {
              const entry   = counterMap.get(m.numero_serie)
              const latest  = entry?.latest
              const missing = !latest || (latest.year !== cYear || latest.month !== cMonth)

              return (
                <tr key={m.numero_serie} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{m.marque} <span className="text-gray-500">{m.modele}</span></p>
                    <p className="font-mono text-xs text-gray-400">{m.numero_serie}</p>
                  </td>
                  <td className="px-5 py-4">
                    {latest ? (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">
                          {MONTHS_FR[latest.month]} {latest.year}
                        </span>
                        {missing && (
                          <span title="Relevé du mois en cours manquant">
                            <AlertTriangle size={13} className="text-amber-400" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Aucun relevé</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-gray-700">
                    {latest ? latest.counter_bw.toLocaleString('fr-FR') : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs">
                    {entry?.delta_bw == null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={entry.delta_bw < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                        {entry.delta_bw.toLocaleString('fr-FR')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs text-gray-700">
                    {latest ? latest.counter_color.toLocaleString('fr-FR') : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-xs">
                    {entry?.delta_color == null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={entry.delta_color < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                        {entry.delta_color.toLocaleString('fr-FR')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/admin/contadores/${encodeURIComponent(m.numero_serie)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      <BarChart2 size={13} />
                      Détail
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
