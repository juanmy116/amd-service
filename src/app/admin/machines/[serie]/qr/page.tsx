import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import QrCanvas from './qr-canvas'
import PrintButtons from './print-buttons'

export default async function MachineQrPage({
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
    .select('numero_contrat, lieu_installation, clients(id, nom_client)')
    .eq('machine_id', numero_serie)
    .eq('statut', 'actif')
    .maybeSingle()

  const client = contract?.clients as unknown as { id: number; nom_client: string } | null
  const qrUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tech/scan/${encodeURIComponent(numero_serie)}`

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .label { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
      `}</style>

      {/* Botones imprimir/cerrar — solo visibles en pantalla */}
      <PrintButtons />

      {/* Etiqueta imprimible */}
      <div className="flex justify-center px-6 pb-10">
        <div
          className="label bg-white rounded-2xl shadow-lg overflow-hidden"
          style={{ width: 320, fontFamily: 'Helvetica, Arial, sans-serif' }}
        >
          {/* Cabecera roja */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            <Image
              src="/images/logos/logo-amd.png"
              alt="AMD Service"
              width={90}
              height={36}
              style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            />
            <span className="text-white text-xs font-semibold tracking-wide opacity-80">
              ÉQUIPEMENT
            </span>
          </div>

          {/* Datos máquina */}
          <div className="px-5 pt-4 pb-2 space-y-2">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Machine</p>
              <p className="text-base font-bold text-gray-900">{machine.marque} {machine.modele}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">N° Série</p>
                <p className="text-xs font-mono font-semibold text-gray-800">{machine.numero_serie}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Type</p>
                <p className="text-xs font-semibold text-gray-800">
                  {machine.type === 'color' ? 'Couleur' : 'Noir & Blanc'}
                </p>
              </div>
            </div>

            {machine.localisation && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Localisation</p>
                <p className="text-xs text-gray-800">{machine.localisation}</p>
              </div>
            )}
          </div>

          {/* Separador */}
          <div className="mx-5 border-t border-gray-100 my-2" />

          {/* Datos cliente */}
          <div className="px-5 pb-2 space-y-2">
            {client ? (
              <>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Client</p>
                  <p className="text-sm font-semibold text-gray-900">{client.nom_client}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">N° Client</p>
                    <p className="text-xs font-mono font-semibold text-gray-800">{client.id}</p>
                  </div>
                  {contract?.numero_contrat && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">N° Contrat</p>
                      <p className="text-xs font-mono font-semibold text-gray-800">{contract.numero_contrat}</p>
                    </div>
                  )}
                </div>
                {contract?.lieu_installation && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Site</p>
                    <p className="text-xs text-gray-800">{contract.lieu_installation}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun client associé</p>
            )}
          </div>

          {/* QR code */}
          <div className="flex flex-col items-center py-4 bg-gray-50 mt-2">
            <QrCanvas value={qrUrl} />
            <p className="text-xs text-gray-400 mt-2 text-center px-4">
              Scanner pour accéder à la fiche machine
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
