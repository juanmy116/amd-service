import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { getAdminClient } from '../_shared/db.ts'
import { getSecretKey, isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'
import { READINGS_TOOL, READINGS_SYSTEM } from './prompt.ts'
import type { CounterExtraction } from '../_shared/counter-types.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-sonnet-4-6'

// Trozos con solape de 1 página: ninguna máquina (p.ej. Pantum a 2 págs) queda cortada de su
// página clave; la dedup elimina la repetición del solape. ~16 págs/llamada mantiene cada
// petición moderada. GAP_MS espacia las llamadas; además readChunk REINTENTA ante 429/5xx, así
// si aún se satura no se pierden páginas (antes un fallo de tanda dejaba máquinas fuera en silencio).
const CHUNK_PAGES = 16
const OVERLAP = 1
const GAP_MS = 8000

interface Reading extends CounterExtraction { page?: number }

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// base64 por bloques (no byte a byte): O(n) sin millones de concatenaciones en PDFs de varios MB.
function b64FromBytes(bytes: Uint8Array): string {
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(bin)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Llama a Claude con un trozo. Reintenta ante 429/5xx (espera más en rate-limit). Devuelve las
// lecturas, o `null` si tras los reintentos el trozo falló (para avisar de análisis incompleto).
async function readChunk(b64: string, mediaType: string, pageOffset: number): Promise<Reading[] | null> {
  const sourceBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }
  const payload = JSON.stringify({
    model: MODEL, max_tokens: 4096, system: READINGS_SYSTEM,
    tools: [READINGS_TOOL], tool_choice: { type: 'tool', name: 'submit_counter_readings' },
    messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: 'Extract every machine counter reading in this document.' }] }],
  })

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: payload,
      })
      if (res.ok) {
        const out = await res.json()
        const toolUse = (out.content ?? []).find((c: { type: string }) => c.type === 'tool_use')
        const readings = (toolUse?.input?.readings ?? []) as Reading[]
        return readings.map(r => ({ ...r, page: r.page ? pageOffset + r.page : undefined }))
      }
      console.error('[parse-counter-document] anthropic', res.status, 'attempt', attempt)
      if (attempt < 3) await sleep(res.status === 429 || res.status === 529 ? 22000 : 5000)
    } catch (e) {
      console.error('[parse-counter-document] anthropic fetch', e, 'attempt', attempt)
      if (attempt < 3) await sleep(5000)
    }
  }
  return null
}

async function sendSummary(added: number, chunks: number, failedChunks: number, uploadedBy: string | null) {
  const notify = (Deno.env.get('COUNTER_NOTIFY_EMAILS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (notify.length === 0) return
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
  const queueUrl = `${appUrl}/admin/contadores/pendientes`
  const warn = failedChunks > 0
    ? `<p style="color:#b91c1c"><strong>⚠️ Analyse incomplète :</strong> ${failedChunks}/${chunks} morceau(x) ont échoué — des machines peuvent manquer. Renvoyez le document.</p>`
    : ''
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getSecretKey()}` },
      body: JSON.stringify({
        template: 'raw', to: notify,
        data: {
          subject: failedChunks > 0 ? '[AMD SAV] Analyse PDF incomplète' : '[AMD SAV] Analyse PDF terminée',
          html: `<p><strong>${added}</strong> relevé(s) ajouté(s) à la file d'attente${uploadedBy ? ` (importé par ${uploadedBy})` : ''}.</p>${warn}<p><a href="${queueUrl}">Voir la file →</a></p>`,
        },
      }),
    })
  } catch (e) { console.error('[parse-counter-document] summary email', e) }
}

async function processDocument(documentPath: string, contentType: string, docHash: string, uploadedBy: string | null) {
  const db = getAdminClient()
  const { data: file, error: dlErr } = await db.storage.from('counter-images').download(documentPath)
  if (dlErr || !file) { console.error('[parse-counter-document] download', dlErr); return }
  const bytes = new Uint8Array(await file.arrayBuffer())

  // 1) Partir en trozos (PDF) o un único trozo (imagen).
  const chunks: { b64: string; mediaType: string; offset: number }[] = []
  if (contentType === 'application/pdf') {
    const src = await PDFDocument.load(bytes)
    const total = src.getPageCount()
    const STEP = CHUNK_PAGES - OVERLAP
    for (let start = 0; start < total; start += STEP) {
      const end = Math.min(start + CHUNK_PAGES, total)
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i))
      copied.forEach(p => out.addPage(p))
      chunks.push({ b64: b64FromBytes(await out.save()), mediaType: 'application/pdf', offset: start })
      if (end >= total) break
    }
  } else {
    chunks.push({ b64: b64FromBytes(bytes), mediaType: contentType, offset: 0 })
  }

  // 2) Leer cada trozo (espaciado + reintentos). Contamos los que fallan para avisar.
  const all: Reading[] = []
  let failedChunks = 0
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const r = await readChunk(c.b64, c.mediaType, c.offset)
    if (r === null) failedChunks++; else all.push(...r)
    if (i < chunks.length - 1) await sleep(GAP_MS)
  }

  // 3) Dedup por serial (el solape repite máquinas): quedarse con la de mayor confianza. Las
  // lecturas sin serial legible NO se deduplican (cada una es una máquina distinta a revisar).
  const bySerial = new Map<string, Reading>()
  const noSerial: Reading[] = []
  for (const r of all) {
    const key = (r.serial ?? '').trim()
    if (!key) { noSerial.push(r); continue }
    const prev = bySerial.get(key)
    if (!prev || (r.confidence ?? 0) > (prev.confidence ?? 0)) bySerial.set(key, r)
  }
  const readings = [...bySerial.values(), ...noSerial]

  // 4) Insertar cada lectura + match/validación/semáforo (RPC existente). El hash de fila usa el
  // ÍNDICE (no serial:page) → único garantizado, sin colisiones que descarten máquinas sin serial.
  let added = 0
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]
    const rowHash = await sha256Hex(`${docHash}:${i}`)
    const { data: pending, error: insErr } = await db.from('pending_counter_imports').insert({
      image_path: documentPath, image_size_bytes: bytes.length, image_hash_sha256: rowHash,
      source: 'manual', email_subject: 'Import PDF', email_from: uploadedBy, extraction_model: MODEL,
    }).select('id').single()
    if (insErr) { console.error('[parse-counter-document] insert', insErr); continue }

    const { error: rpcErr } = await db.rpc('process_counter_extraction', { p_pending_id: pending.id, p_extracted: r })
    if (rpcErr) {
      // Si la validación/match falla, no dejar una fila vacía atascada: la borramos (libera el hash).
      console.error('[parse-counter-document] process', rpcErr, 'serial', r.serial)
      await db.from('pending_counter_imports').delete().eq('id', pending.id)
      continue
    }
    added++
  }

  console.log(`[parse-counter-document] done: ${added} lecturas, ${chunks.length} trozos, ${failedChunks} fallidos`)
  await sendSummary(added, chunks.length, failedChunks, uploadedBy)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  if (getAllSecretKeys().length === 0 || !ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'config_missing' }), { status: 500 })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  if (!isValidSecretKey(token)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })

  let body: { document_path: string; content_type: string; doc_hash: string; uploaded_by?: string | null }
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400 }) }
  if (!body.document_path) return new Response(JSON.stringify({ error: 'missing_document_path' }), { status: 400 })

  // Lanzar el trabajo en segundo plano y responder ya (la cola se va llenando sola).
  const work = processDocument(body.document_path, body.content_type, body.doc_hash, body.uploaded_by ?? null)
  const edge = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (edge) edge.waitUntil(work); else await work

  return new Response(JSON.stringify({ ok: true, started: true }), { headers: { 'Content-Type': 'application/json' } })
})
