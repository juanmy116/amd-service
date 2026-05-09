import { createAdminClient } from '@/lib/supabase/admin'
import CsatForm from './csat-form'

export default async function CsatPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: csat } = await admin
    .from('csat_responses')
    .select('token, responded_at, expires_at, incident_id, incidents(title)')
    .eq('token', token)
    .maybeSingle()

  const incidentTitle = (csat?.incidents as unknown as { title: string } | null)?.title

  // Token inválido
  if (!csat) {
    return <CsatShell><InvalidState message="Ce lien est invalide ou n'existe pas." /></CsatShell>
  }

  // Ya respondido
  if (csat.responded_at) {
    return <CsatShell><InvalidState message="Vous avez déjà répondu à cette enquête. Merci !" success /></CsatShell>
  }

  // Expirado
  if (new Date(csat.expires_at) < new Date()) {
    return <CsatShell><InvalidState message="Ce lien a expiré (valable 7 jours)." /></CsatShell>
  }

  return (
    <CsatShell>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Comment s&apos;est passée notre intervention ?</h1>
        {incidentTitle && (
          <p className="text-sm text-gray-500">Demande : <span className="font-medium text-gray-700">{incidentTitle}</span></p>
        )}
      </div>
      <CsatForm token={token} />
    </CsatShell>
  )
}

function CsatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#BF0D0D' }}>
            <span className="text-white font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>A</span>
          </div>
          <span className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>AMD Service</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function InvalidState({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div className="text-center py-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${success ? 'bg-green-100' : 'bg-gray-100'}`}>
        {success ? (
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  )
}
