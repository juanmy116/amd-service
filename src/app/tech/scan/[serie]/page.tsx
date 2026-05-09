import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, MapPin, Building2 } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau: 'bg-blue-50 text-blue-700', assigné: 'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700', résolu: 'bg-green-50 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

export default async function MachineScanPage({
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
    .select('id, numero_contrat, lieu_installation, statut, clients(nom_client)')
    .eq('machine_id', numero_serie)
    .eq('statut', 'actif')
    .single()

  const client = contract?.clients as unknown as { nom_client: string } | null

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, created_at')
    .eq('machine_id', numero_serie)
    .not('status', 'in', '("fermé")')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/tech/scan" className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white shrink-0">
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Fiche machine
        </h1>
      </div>

      {/* Machine info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#BF0D0D' }}>
            <Printer size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{machine.marque} {machine.modele}</p>
            <p className="font-mono text-xs text-gray-400">{machine.numero_serie}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Type</p>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${machine.type === 'color' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
              {machine.type === 'color' ? 'Couleur' : 'N&B'}
            </span>
          </div>
          {machine.localisation && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Position</p>
              <div className="flex items-center gap-1 text-xs text-gray-700">
                <MapPin size={11} className="text-gray-400" />
                {machine.localisation}
              </div>
            </div>
          )}
        </div>

        {client && (
          <div className="flex items-center gap-2 text-sm text-gray-700 pt-1 border-t border-gray-100">
            <Building2 size={14} className="text-gray-400 shrink-0" />
            <span className="font-medium">{client.nom_client}</span>
            {contract?.lieu_installation && (
              <span className="text-gray-400 text-xs truncate">— {contract.lieu_installation}</span>
            )}
          </div>
        )}
      </div>

      {/* Incidents actifs */}
      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3">Incidents actifs</p>
        {(!incidents || incidents.length === 0) ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Aucun incident actif sur cette machine</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/tech/incidents/${inc.id}`}
                className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{inc.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className={`shrink-0 ml-3 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[inc.status] ?? inc.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
