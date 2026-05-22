import { createAdminClient } from '@/lib/supabase/admin'
import CsatForm from './csat-form'
import { Card } from '@/components/ui/Card'

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

  if (!csat) {
    return <CsatShell><InvalidState message="Ce lien est invalide ou n'existe pas." /></CsatShell>
  }

  if (csat.responded_at) {
    return <CsatShell><InvalidState message="Vous avez déjà répondu à cette enquête. Merci !" success /></CsatShell>
  }

  if (new Date(csat.expires_at) < new Date()) {
    return <CsatShell><InvalidState message="Ce lien a expiré (valable 7 jours)." /></CsatShell>
  }

  return (
    <CsatShell>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-ink mb-1">Comment s&apos;est passée notre intervention ?</h1>
        {incidentTitle && (
          <p className="text-sm text-ink-muted">Demande : <span className="font-medium text-ink-soft">{incidentTitle}</span></p>
        )}
      </div>
      <CsatForm token={token} />
    </CsatShell>
  )
}

function CsatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent">
            <span className="text-white font-bold text-sm font-display">A</span>
          </div>
          <span className="text-sm font-semibold text-ink font-display">AMD Service</span>
        </div>
        {children}
      </Card>
    </div>
  )
}

function InvalidState({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div className="text-center py-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${success ? 'bg-success-soft' : 'bg-neutral-soft'}`}>
        {success ? (
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}
