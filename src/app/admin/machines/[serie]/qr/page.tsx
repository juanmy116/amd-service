import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
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
    .select('marque, modele, numero_serie')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine) notFound()

  const qrUrl = `${process.env.NEXT_PUBLIC_APP_URL}/m/${encodeURIComponent(numero_serie)}`

  // QR vectorial (SVG) con corrección de errores alta (H): nítido a cualquier
  // tamaño de impresión y tolerante a desgaste/suciedad de la etiqueta física.
  const qrSvg = await QRCode.toString(qrUrl, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  return (
    <>
      <style>{`
        .etq-label {
          width: 68mm;
          height: 100mm;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: Helvetica, Arial, sans-serif;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .etq-head {
          background: #BF0D0D;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .etq-head img { height: 8.1mm; width: auto; object-fit: contain; display: block; }
        .etq-body { padding: 3mm 5mm 0; flex: 0 0 auto; }
        .etq-field { margin-bottom: 1.6mm; }
        .etq-k {
          font-size: 7pt; letter-spacing: .06em; text-transform: uppercase;
          color: #A1A1AA; margin: 0 0 .4mm;
        }
        .etq-v { font-size: 11pt; font-weight: 700; color: #18181B; margin: 0; }
        .etq-v-mono {
          font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt;
          font-weight: 700; color: #18181B; margin: 0;
        }
        .etq-qr {
          background: #FFFFFF;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          flex: 1 1 auto; padding: 2mm 4mm 4mm;
        }
        .etq-qr svg { width: 44mm; height: 44mm; display: block; }
        .etq-qr p {
          margin: 1.6mm 0 0; text-align: center; font-size: 8pt; font-weight: 700;
          color: #BF0D0D; line-height: 1.3;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .etq-label { box-shadow: none !important; border-radius: 0; }
        }
      `}</style>

      {/* Botones imprimir/cerrar — solo visibles en pantalla */}
      <PrintButtons />

      {/* Etiqueta imprimible (10 cm de alto) */}
      <div className="flex justify-center px-6 pb-10">
        <div className="etq-label">
          {/* Cabecera roja con logo centrado */}
          <div className="etq-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logos/logo-amd-blanco.svg" alt="AMD Service" />
          </div>

          {/* Datos máquina */}
          <div className="etq-body">
            <div className="etq-field">
              <p className="etq-k">Machine</p>
              <p className="etq-v">{machine.marque} {machine.modele}</p>
            </div>
            <div className="etq-field">
              <p className="etq-k">N° Série</p>
              <p className="etq-v-mono">{machine.numero_serie}</p>
            </div>
          </div>

          {/* QR sobre fondo blanco */}
          <div className="etq-qr">
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p>Un problème ? Scannez pour<br />contacter le SAV AMD</p>
          </div>
        </div>
      </div>
    </>
  )
}
