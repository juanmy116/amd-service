import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TechMachinesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Machines linked to incidents assigned to this tech (via RLS)
  const { data: machines } = await supabase
    .from('machines')
    .select('numero_serie, marque, modele, type, localisation, active')
    .order('marque')

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 lg:text-2xl" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Machines
        </h1>
        <p className="text-sm text-gray-400 mt-1">Machines liées à vos interventions</p>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  Aucune machine liée à vos interventions
                </td>
              </tr>
            )}
            {machines?.map((m) => (
              <tr key={m.numero_serie} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-xs text-gray-600">{m.numero_serie}</td>
                <td className="px-5 py-4">
                  <span className="font-medium text-gray-900">{m.marque}</span>
                  <span className="text-gray-300 mx-1.5">·</span>
                  <span className="text-gray-600">{m.modele}</span>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m.type === 'color' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {m.type === 'color' ? 'Couleur' : 'N&B'}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-600">{m.localisation || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.active ? 'text-green-700' : 'text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
