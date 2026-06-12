import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAdminClient } from '../_shared/db.ts'
import { isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'
import { COUNTER_TOOL, COUNTER_SYSTEM } from './prompt.ts'
import type { CounterExtraction } from '../_shared/counter-types.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-sonnet-4-6'

// Mapea content-type a media_type aceptado por la API de Anthropic.
function mediaType(ct: string): string | null {
  if (ct === 'image/jpeg' || ct === 'image/png' || ct === 'image/webp' || ct === 'image/gif') return ct
  if (ct === 'application/pdf') return 'application/pdf'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
  if (getAllSecretKeys().length === 0 || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'config_missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!isValidSecretKey(token)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let body: { pending_id: string; image_path: string; content_type: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const db = getAdminClient()

  // 1) Descargar la imagen del bucket privado.
  const { data: file, error: dlErr } = await db.storage.from('counter-images').download(body.image_path)
  if (dlErr || !file) {
    await db.from('pending_counter_imports').update({ status: 'failed_extraction' }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'download_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  const mt = mediaType(body.content_type) ?? 'image/jpeg'
  const sourceBlock = mt === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mt, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } }

  // 2) Llamar a Claude (tool_use forzado).
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1024, system: COUNTER_SYSTEM,
      tools: [COUNTER_TOOL], tool_choice: { type: 'tool', name: 'submit_counter_reading' },
      messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: 'Extract the counter reading.' }] }],
    }),
  })
  const out = await res.json()
  if (!res.ok) {
    console.error('[parse-counter-image] anthropic error', out)
    await db.from('pending_counter_imports').update({ status: 'failed_extraction', extraction_model: MODEL }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'llm_error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const toolUse = (out.content ?? []).find((c: { type: string }) => c.type === 'tool_use')
  if (!toolUse) {
    await db.from('pending_counter_imports').update({ status: 'failed_extraction', extraction_model: MODEL }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'no_tool_use' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const extracted = toolUse.input as CounterExtraction

  // 3) Coste aproximado (Sonnet: $3/M in, $15/M out).
  const usage = out.usage ?? { input_tokens: 0, output_tokens: 0 }
  const cost = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000

  await db.from('pending_counter_imports')
    .update({ extraction_model: MODEL, extraction_cost_usd: cost })
    .eq('id', body.pending_id)

  // 4) Decidir semáforo + match + persistir (toda la lógica en SQL).
  const { data: result, error: rpcErr } = await db.rpc('process_counter_extraction', {
    p_pending_id: body.pending_id, p_extracted: extracted,
  })
  if (rpcErr) {
    console.error('[parse-counter-image] process rpc', rpcErr)
    return new Response(JSON.stringify({ error: 'process_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { 'Content-Type': 'application/json' } })
})
