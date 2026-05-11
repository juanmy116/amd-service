import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, Building2, ChevronRight, Printer } from 'lucide-react'
import { MONTHS_FR } from './constants'

interface Machine {
  numero_serie: string
  marque:       string
  modele:       string
  clientId:     number | null
  clientName:   string | null
}

export default async function ContadoresPage() {
  const supabase = await createClient()

  const { data: rawMachines } = await supabase
    .from('machines')
    .select('numero_serie, marque, modele, contracts(statut, client_id, clients(id, nom_client))')
    .eq('active', true)
    .order('marque')

  const { data: allActiveCounters } = await supabase
    .from('machine_counters')
    .select('machine_id, year, month')
    .eq('status', 'actif')
    .order('year',  { ascending: false })
    .order('month', { ascending: false })

  // Latest relevé per machine
  const latestMap = new Map<string, { year: number; month: number }>()
  if (allActiveCounters) {
    const seen = new Set<string>()
    allActiveCounters.forEach(c => {
      if (!seen.has(c.machine_id)) {
        latestMap.set(c.machine_id, { year: c.year, month: c.month })
        seen.add(c.machine_id)
      }
    })
  }

  const now    = new Date()
  const cYear  = now.getFullYear()
  const cMonth = now.getMonth() + 1

  // Flatten machines with client info
  const machines: Machine[] = (rawMachines ?? []).map(m => {
    const contracts = m.contracts as unknown as {
      statut: string
      client_id: number | null
      clients: { id: number; nom_client: string } | null
    }[] | null
    const active = contracts?.find(c => c.statut === 'actif') ?? null
    return {
      numero_serie: m.numero_serie,
      marque:       m.marque,
      modele:       m.modele,
      clientId:     active?.client_id ?? null,
      clientName:   active?.clients?.nom_client ?? null,
    }
  })

  // Group by client
  const clientMap = new Map<number, { name: string; machines: Machine[] }>()
  const noClient: Machine[] = []

  machines.forEach(m => {
    if (m.clientId !== null && m.clientName !== null) {
      if (!clientMap.has(m.clientId)) {
        clientMap.set(m.clientId, { name: m.clientName, machines: [] })
      }
      clientMap.get(m.clientId)!.machines.push(m)
    } else {
      noClient.push(m)
    }
  })

  const clientGroups = [...clientMap.entries()]
    .map(([id, { name, machines }]) => ({ id, name, machines }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const missingCount = (ms: Machine[]) =>
    ms.filter(m => {
      const l = latestMap.get(m.numero_serie)
      return !l || l.year !== cYear || l.month !== cMonth
    }).length

  const totalMachines = machines.length
  const totalMissing  = missingCount(machines)

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Compteurs
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {clientGroups.length} client{clientGroups.length !== 1 ? 's' : ''} · {totalMachines} machine{totalMachines !== 1 ? 's' : ''} actives
            {totalMissing > 0 && (
              <span className="ml-2 text-amber-500 font-medium">· {totalMissing} relevé{totalMissing !== 1 ? 's' : ''} manquant{totalMissing !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
      </div>

      {clientGroups.length === 0 && noClient.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Aucune machine active enregistrée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clientGroups.map(group => {
            const missing   = missingCount(group.machines)
            const allGood   = missing === 0
            return (
              <Link
                key={group.id}
                href={`/admin/contadores/cliente/${group.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#BF0D0D18' }}>
                    <Building2 size={18} style={{ color: '#BF0D0D' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-700">{group.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Printer size={11} />
                        {group.machines.length} machine{group.machines.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        Dernier : {(() => {
                          const lasts = group.machines
                            .map(m => latestMap.get(m.numero_serie))
                            .filter((l): l is { year: number; month: number } => l !== undefined)
                          if (!lasts.length) return 'aucun relevé'
                          const l = lasts.sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)[0]
                          return `${MONTHS_FR[l.month]} ${l.year}`
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {!allGood ? (
                    <div className="flex items-center gap-1.5 text-amber-500">
                      <AlertTriangle size={14} />
                      <span className="text-xs font-medium">
                        {missing} en attente
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-green-600">
                      ✓ À jour
                    </span>
                  )}
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </Link>
            )
          })}

          {/* Machines sans contrat actif */}
          {noClient.length > 0 && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-dashed border-gray-200 px-5 py-4 opacity-70">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Printer size={18} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Sans contrat actif</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {noClient.length} machine{noClient.length !== 1 ? 's' : ''} sans client assigné
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
