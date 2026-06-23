import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAdmin } from '@/lib/auth'
import { getActiveLinesForContract } from '@/lib/contract-machines'
import { buildLabelsPdf, type MachineLabel } from '@/lib/labels-pdf'

export const runtime = 'nodejs'

// Logo AMD para la cabecera de cada etiqueta. Si no se puede leer (p. ej. el
// asset no viajó a la función), buildLabelsPdf dibuja un respaldo de texto.
async function loadLogo(): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'images', 'logos', 'logo-amd.png'))
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('numero_contrat, clients(id, nom_client)')
    .eq('id', id)
    .single()
  if (!contract) return new Response('Contrat introuvable', { status: 404 })

  const lines = await getActiveLinesForContract(supabase, id)
  if (lines.length === 0) {
    return new Response('Aucune machine active sur ce contrat', { status: 404 })
  }

  const client = contract.clients as unknown as { id: number; nom_client: string } | null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const labels: MachineLabel[] = lines.map((l) => ({
    marque: l.machines?.marque ?? '',
    modele: l.machines?.modele ?? '',
    numero_serie: l.machine_id,
    type: l.machines?.type ?? null,
    qrUrl: `${appUrl}/m/${encodeURIComponent(l.machine_id)}`,
  }))

  const pdf = await buildLabelsPdf({
    labels,
    client: client ? { id: client.id, nom: client.nom_client } : null,
    numeroContrat: contract.numero_contrat,
    logoPng: await loadLogo(),
  })

  const safe = (client?.nom_client ?? 'contrat').replace(/[^a-zA-Z0-9-_]/g, '_')
  const filename = `etiquettes-${safe}-${contract.numero_contrat}.pdf`

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
