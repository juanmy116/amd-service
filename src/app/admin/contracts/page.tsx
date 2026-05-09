import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const STATUT_STYLE = {
  actif:    'bg-green-50 text-green-700',
  suspendu: 'bg-amber-50 text-amber-700',
  terminé:  'bg-gray-100 text-gray-500',
} as const

const STATUT_LABEL = {
  actif:    'Actif',
  suspendu: 'Suspendu',
  terminé:  'Terminé',
} as const

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

export default async function ContractsPage() {
  const supabase = await createClient()

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, numero_contrat, date_debut, date_renouvellement, lieu_installation, statut, clients(nom_client), machines(marque, modele)')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Contrats
        </h1>
        <Link
          href="/admin/contracts/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouveau contrat
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Nº Contrat</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Client</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Début</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Renouvellement</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!contracts || contracts.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  Aucun contrat enregistré
                </td>
              </tr>
            )}
            {contracts?.map((c) => {
              const statut = c.statut as keyof typeof STATUT_STYLE
              const client  = c.clients  as unknown as { nom_client: string } | null
              const machine = c.machines as unknown as { marque: string; modele: string } | null
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-gray-600">{c.numero_contrat}</td>
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {client?.nom_client ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {machine ? `${machine.marque} ${machine.modele}` : '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{formatDate(c.date_debut)}</td>
                  <td className="px-5 py-4 text-gray-600">{formatDate(c.date_renouvellement)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUT_STYLE[statut] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUT_LABEL[statut] ?? statut}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/contracts/${c.id}`}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                    >
                      Modifier
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
