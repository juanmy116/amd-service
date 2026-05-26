import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import SignalerForm from './form'

export default async function SignalerPage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const admin = createAdminClient()

  const { data: machine } = await admin
    .from('machines')
    .select('numero_serie, marque, modele')
    .eq('numero_serie', decodeURIComponent(serie))
    .maybeSingle()

  if (!machine) notFound()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            <span className="text-white font-bold text-sm font-display">
              A
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-900 font-display">
            AMD Service
          </span>
        </div>
        <SignalerForm machine={machine} />
      </div>
    </div>
  )
}
