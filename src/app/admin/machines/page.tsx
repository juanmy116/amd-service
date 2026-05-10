import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, QrCode } from 'lucide-react'

export default async function MachinesPage() {
  const supabase = await createClient()

  const { data: machines } = await supabase
    .from('machines')
    .select('*')
    .order('marque')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Machines
        </h1>
        <Link
          href="/admin/machines/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouvelle machine
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Nº Série</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Marque / Modèle</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Type</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Localisation</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  Aucune machine enregistrée
                </td>
              </tr>
            )}
            {machines?.map((m) => (
              <tr key={m.numero_serie} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4 font-mono text-xs text-gray-600">{m.numero_serie}</td>
                <td className="px-5 py-4">
                  <span className="font-medium text-gray-900">{m.marque}</span>
                  <span className="text-gray-300 mx-1.5">·</span>
                  <span className="text-gray-600">{m.modele}</span>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    m.type === 'color'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {m.type === 'color' ? 'Couleur' : 'N&B'}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-600">{m.localisation || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    m.active ? 'text-green-700' : 'text-gray-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/machines/${encodeURIComponent(m.numero_serie)}/qr`}
                      target="_blank"
                      title="Télécharger QR code"
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
                    >
                      <QrCode size={15} />
                    </Link>
                    <Link
                      href={`/admin/machines/${encodeURIComponent(m.numero_serie)}`}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                    >
                      Modifier
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
