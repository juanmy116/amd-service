import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { getAdminClient } from '../_shared/db.ts'
import { isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'
import { READINGS_TOOL, READINGS_SYSTEM } from './prompt.ts'
import type { CounterExtraction } from '../_shared/counter-types.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-sonnet-4-6'

// Trozos con solape de 1 página: ninguna máquina (p.ej. Pantum a 2 págs) queda cortada de su
// página clave; la dedup por serial elimina la repetición del solape. ~16 págs/llamada mantiene
// cada petición por debajo del límite por minuto del servicio de IA.
const CHUNK_PAGES = 16
const OVERLAP = 1
const GAP_MS = 18000 // espaciado entre llamadas para no superar el límite por minuto

interface Reading extends CounterExtraction { page?: number }

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function b64FromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// Llama a Claude con un trozo (PDF o imagen) y devuelve el array de lecturas (con page absoluta).
async function readChunk(b64: string, mediaType: string, pageOffset: number): Promise<Reading[]> {
  const sourceBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096, system: READINGS_SYSTEM,
      tools: [READINGS_TOOL], tool_choice: { type: 'tool', name: 'submit_counter_readings' },
      messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: 'Extract every machine counter reading in this document.' }] }],
    }),
  })
  if (!res.ok) {
    console.error('[parse-counter-document] anthropic', res.status, await res.text().catch(() => ''))
    return []
  }
  const out = await res.json()
  const toolUse = (out.content ?? []).find((c: { type: string }) => c.type === 'tool_use')
  const readings = (toolUse?.input?.readings ?? []) as Reading[]
  // page del modelo es 1-based dentro del trozo → a página absoluta del documento.
  return readings.map(r => ({ ...r, page: r.page ? pageOffset + r.page : undefined }))
}

// Trabajo pesado (descarga + troceo + N llamadas + inserción), en segundo plano.
async function processDocument(documentPath: string, contentType: string, docHash: string) {
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

  // 2) Leer cada trozo (espaciado para no saturar la IA) y acumular.
  const all: Reading[] = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    all.push(...await readChunk(c.b64, c.mediaType, c.offset))
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, GAP_MS))
  }

  // 3) Dedup por serial (el solape repite máquinas): quedarse con la de mayor confianza.
  const bySerial = new Map<string, Reading>()
  const noSerial: Reading[] = []
  for (const r of all) {
    const key = (r.serial ?? '').trim()
    if (!key) { noSerial.push(r); continue }
    const prev = bySerial.get(key)
    if (!prev || (r.confidence ?? 0) > (prev.confidence ?? 0)) bySerial.set(key, r)
  }
  const readings = [...bySerial.values(), ...noSerial]

  // 4) Por cada lectura: dedup de re-subida + insertar fila + match/validación/semáforo (RPC existente).
  for (const r of readings) {
    const rowHash = await sha256Hex(`${docHash}:${(r.serial ?? '').trim()}:${r.page ?? 0}`)
    const { data: dup } = await db.rpc('register_counter_duplicate', { p_hash: rowHash })
    if (dup) continue // misma máquina del mismo PDF ya en cola → no reprocesar

    const { data: pending, error: insErr } = await db.from('pending_counter_imports').insert({
      image_path: documentPath, image_size_bytes: bytes.length, image_hash_sha256: rowHash,
      source: 'manual', email_subject: 'Import PDF', extraction_model: MODEL,
    }).select('id').single()
    if (insErr) { console.error('[parse-counter-document] insert', insErr); continue }

    const { error: rpcErr } = await db.rpc('process_counter_extraction', { p_pending_id: pending.id, p_extracted: r })
    if (rpcErr) console.error('[parse-counter-document] process', rpcErr, 'serial', r.serial)
  }
  console.log(`[parse-counter-document] done: ${readings.length} lecturas de ${chunks.length} trozos`)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  if (getAllSecretKeys().length === 0 || !ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: 'config_missing' }), { status: 500 })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  if (!isValidSecretKey(token)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })

  let body: { document_path: string; content_type: string; doc_hash: string }
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400 }) }
  if (!body.document_path) return new Response(JSON.stringify({ error: 'missing_document_path' }), { status: 400 })

  // Lanzar el trabajo en segundo plano y responder ya (la cola se va llenando sola).
  const work = processDocument(body.document_path, body.content_type, body.doc_hash)
  const edge = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (edge) edge.waitUntil(work); else await work

  return new Response(JSON.stringify({ ok: true, started: true }), { headers: { 'Content-Type': 'application/json' } })
})
