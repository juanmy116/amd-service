import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/auth'
import { getActiveLinesForContract } from '@/lib/contract-machines'
import { appBaseUrl } from '@/lib/app-url'
import { machineReportUrl } from '@/lib/qr'
import { buildLabelsPdf, type MachineLabel } from '@/lib/labels-pdf'

export const runtime = 'nodejs'

// Logo AMD blanco para la cabecera roja. El asset es SVG (pdf-lib solo embebe
// PNG/JPG), así que lo rasterizamos con sharp. Si falla, buildLabelsPdf dibuja
// un respaldo de texto.
async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const svg = await readFile(path.join(process.cwd(), 'public', 'images', 'logos', 'logo-amd-blanco.svg'))
    return await sharp(svg, { density: 300 }).resize({ width: 600 }).png().toBuffer()
  } catch (e) {
    console.error('[etiquettes logo]', e)
    return null
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireAdmin()

  // Consultas y rasterizado del logo en paralelo (independientes entre sí).
  const [contractRes, lines, logoPng, base] = await Promise.all([
    supabase.from('contracts').select('numero_contrat, clients(id, nom_client)').eq('id', id).single(),
    getActiveLinesForContract(supabase, id),
    loadLogo(),
    appBaseUrl(),
  ])

  // Distingue fallo técnico de "no existe" (PGRST116 = 0 filas), igual que las
  // páginas admin (patrón WP-5b).
  if (contractRes.error && contractRes.error.code !== 'PGRST116') {
    console.error('[etiquettes contract]', contractRes.error)
    return new Response('Erreur technique', { status: 500 })
  }
  const contract = contractRes.data
  if (!contract) return new Response('Contrat introuvable', { status: 404 })
  if (lines.length === 0) {
    return new Response('Aucune machine active sur ce contrat', { status: 404 })
  }

  const client = contract.clients as unknown as { id: number; nom_client: string } | null
  const labels: MachineLabel[] = lines.map((l) => ({
    marque: l.machines?.marque ?? '',
    modele: l.machines?.modele ?? '',
    numero_serie: l.machine_id,
    qrUrl: machineReportUrl(l.machine_id, base),
  }))

  let pdf: Uint8Array
  try {
    pdf = await buildLabelsPdf({ labels, logoPng })
  } catch (e) {
    console.error('[etiquettes pdf]', e)
    return new Response('Erreur lors de la génération du PDF', { status: 500 })
  }

  // Sanea el nombre de archivo completo (cliente + nº contrato) para no romper
  // la cabecera Content-Disposition con comillas/saltos de línea.
  const safe = `etiquettes-${client?.nom_client ?? 'contrat'}-${contract.numero_contrat}`
    .replace(/[^a-zA-Z0-9-_]/g, '_')

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safe}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
