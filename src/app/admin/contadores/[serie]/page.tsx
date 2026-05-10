import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, FileText, RefreshCw } from 'lucide-react'
import CounterForm from './counter-form'
import CounterChart, { ChartEntry, MONTHS_FR } from './counter-chart'
import CancelModal from './cancel-modal'

interface Counter {
  id:                   string
  year:                 number
  month:                number
  counter_bw:           number
  counter_color:        number
  status:               string
  is_replacement_start: boolean
  previous_machine_id:  string | null
  annulation_reason:    string | null
  annule_at:            string | null
  notes:                string | null
  recorded_at:          string
}

function calcDeltas(counters: Counter[]) {
  const active = [...counters]
    .filter(c => c.status === 'actif')
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  const deltaMap = new Map<string, { delta_bw: number | null; delta_color: number | null }>()

  active.forEach((c, i) => {
    if (i === 0 || c.is_replacement_start) {
      deltaMap.set(c.id, { delta_bw: null, delta_color: null })
    } else {
      const prev = active[i - 1]
      deltaMap.set(c.id, {
        delta_bw:    c.counter_bw    - prev.counter_bw,
        delta_color: c.counter_color - prev.counter_color,
      })
    }
  })

  return deltaMap
}

function buildChartData(counters: Counter[]): ChartEntry[] {
  const active = [...counters]
    .filter(c => c.status === 'actif')
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .slice(-12)

  const deltaMap = calcDeltas(counters)

  return active.map(c => {
    const d = deltaMap.get(c.id)
    return {
      label: `${MONTHS_FR[c.month].slice(0, 3)} ${String(c.year).slice(2)}`,
      bw:    d?.delta_bw    ?? null,
      color: d?.delta_color ?? null,
    }
  })
}

export default async function ContadoresDetailPage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine) notFound()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, numero_contrat, clients(id, nom_client)')
    .eq('machine_id', numero_serie)
    .eq('statut', 'actif')
    .maybeSingle()

  const client = contract?.clients as unknown as { id: number; nom_client: string } | null

  const { data: allCounters } = await supabase
    .from('machine_counters')
    .select('*')
    .eq('machine_id', numero_serie)
    .order('year',  { ascending: false })
    .order('month', { ascending: false })

  const counters = (allCounters ?? []) as Counter[]
  const deltaMap  = calcDeltas(counters)
  const chartData = buildChartData(counters)

  // Ordenar para tabla: más reciente arriba
  const tableRows = [...counters].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month
  )

  return (
    <div className="p-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/contadores"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {machine.marque} {machine.modele}
          </h1>
          <p className="font-mono text-xs text-gray-400">{machine.numero_serie}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {client && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <Building2 size={16} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Client</p>
              <p className="text-sm font-semibold text-gray-900">{client.nom_client}</p>
              <p className="text-xs text-gray-400">N° {client.id}</p>
            </div>
          </div>
        )}
        {contract && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <FileText size={16} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Contrat actif</p>
              <p className="text-sm font-semibold text-gray-900">{contract.numero_contrat}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Graphique + historique */}
        <div className="lg:col-span-2 space-y-6">

          {/* Graphique */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-4">
              Évolution mensuelle (pages imprimées)
            </p>
            <CounterChart data={chartData} />
          </div>

          {/* Historique */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Historique des relevés</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Période</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">N&amp;B total</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Δ N&amp;B</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Couleur total</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Δ Couleur</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-400 text-sm">
                      Aucun relevé enregistré
                    </td>
                  </tr>
                )}
                {tableRows.map(c => {
                  const d         = deltaMap.get(c.id)
                  const isAnnule  = c.status === 'annule'
                  const deltaBw:  number | null = d?.delta_bw  ?? null
                  const deltaCol: number | null = d?.delta_color ?? null

                  return (
                    <tr key={c.id} className={isAnnule ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {c.is_replacement_start && (
                            <span title="Remplacement de machine">
                              <RefreshCw size={12} className="text-blue-400 shrink-0" />
                            </span>
                          )}
                          <span className={isAnnule ? 'line-through text-gray-400' : 'font-medium text-gray-900'}>
                            {MONTHS_FR[c.month]} {c.year}
                          </span>
                        </div>
                        {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
                        {isAnnule && c.annulation_reason && (
                          <p className="text-xs text-amber-600 mt-0.5">↳ {c.annulation_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">
                        {c.counter_bw.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs">
                        {deltaBw === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={deltaBw < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                            {deltaBw < 0 ? '⚠ ' : ''}{deltaBw.toLocaleString('fr-FR')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">
                        {c.counter_color.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs">
                        {deltaCol === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={deltaCol < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                            {deltaCol < 0 ? '⚠ ' : ''}{deltaCol.toLocaleString('fr-FR')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          isAnnule
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-green-50 text-green-700'
                        }`}>
                          {isAnnule ? 'Annulé' : 'Actif'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!isAnnule && (
                          <CancelModal
                            counterId={c.id}
                            machineId={numero_serie}
                            year={c.year}
                            month={c.month}
                            counterBw={c.counter_bw}
                            counterColor={c.counter_color}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Formulario nuevo relevé */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
            <p className="text-sm font-semibold text-gray-900 mb-4">Nouveau relevé</p>
            <CounterForm machineId={numero_serie} />
          </div>
        </div>

      </div>
    </div>
  )
}
