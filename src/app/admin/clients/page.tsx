import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, Plus, CheckCircle, XCircle } from 'lucide-react'

export default async function ClientsPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, nom_client, ninea, ville, active')
    .order('nom_client')

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Clients
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {clients?.length ?? 0} client{(clients?.length ?? 0) !== 1 ? 's' : ''} enregistré{(clients?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouveau client
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        {!clients || clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users size={36} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Aucun client enregistré</p>
            <p className="text-xs text-gray-400 mt-1 mb-5">Commencez par ajouter votre premier client</p>
            <Link
              href="/admin/clients/new"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              <Plus size={15} />
              Ajouter un client
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Nom du client</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">NINEA</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Ville</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Statut</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{client.nom_client}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{client.ninea ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{client.ville ?? '—'}</td>
                  <td className="px-6 py-4">
                    {client.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full">
                        <CheckCircle size={11} />
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                        <XCircle size={11} />
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: '#BF0D0D' }}
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
