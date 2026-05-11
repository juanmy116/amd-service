import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle, Wrench } from 'lucide-react'

const FREQ_LABEL: Record<string, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
}

const STATUS_CFG = {
  fait:      { label: 'Fait',      class: 'bg-green-50 text-green-700',  icon: CheckCircle2   },
  planifié:  { label: 'Planifié',  class: 'bg-blue-50 text-blue-700',    icon: Clock          },
  en_retard: { label: 'En retard', class: 'bg-red-50 text-red-700',      icon: AlertTriangle  },
}

export default async function MaintenancePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes, created_at,
      contracts (
        id, numero_contrat,
        clients  ( nom_client ),
        machines ( numero_serie, marque, modele )
      ),
      maintenance_visits (
        id, scheduled_date, done_at, status, qr_verified, notes, matrix_notified,
        profiles ( full_name )
      )
    `)
    .eq('id', id)
    .single()

  if (!plan) notFound()

  const contract = plan.contracts as unknown as {
    id: string; numero_contrat: string
    clients:  { nom_client: string }
    machines: { numero_serie: string; marque: string; modele: string }
  }

  type Visit = {
    id: string; scheduled_date: string; done_at: string | null
    status: string; qr_verified: boolean; notes: string | null
    matrix_notified: boolean
    profiles: { full_name: string }[] | null
  }
  const visits = ((plan.maintenance_visits ?? []) as unknown as Visit[])
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))

  return (
    <div className="p-8 space-y-6 max-w-4xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {contract.clients.nom_client}
          </h1>
          <p className="text-xs text-gray-400">
            {contract.machines.marque} {contract.machines.modele} · {contract.numero_contrat}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Fréquence</p>
          <p className="text-sm font-semibold text-gray-900">{FREQ_LABEL[plan.frequency]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Visites au total</p>
          <p className="text-sm font-semibold text-gray-900">{visits.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1">Faites</p>
          <p className="text-sm font-semibold text-green-700">
            {visits.filter(v => v.status === 'fait').length}
          </p>
        </div>
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <Wrench size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{plan.notes}</p>
        </div>
      )}

      {/* Historial visitas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Historique des visites</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Date planifiée</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Réalisée le</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Technicien</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">QR</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                  Aucune visite planifiée
                </td>
              </tr>
            )}
            {visits.map(v => {
              const cfg = STATUS_CFG[v.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.planifié
              const Icon = cfg.icon
              return (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {new Date(v.scheduled_date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.class}`}>
                      <Icon size={11} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500">
                    {v.done_at
                      ? new Date(v.done_at).toLocaleDateString('fr-FR')
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-gray-500">
                    {v.profiles?.[0]?.full_name ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {v.qr_verified
                      ? <span className="text-xs text-green-600 font-medium">✓ Vérifié</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs max-w-xs truncate">
                    {v.notes ?? <span className="text-gray-300">—</span>}
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
