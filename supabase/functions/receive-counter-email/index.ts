import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAdminClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/secret-key.ts'

const WEBHOOK_SECRET = Deno.env.get('COUNTER_WEBHOOK_SECRET') ?? ''
const SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_BYTES = 10 * 1024 * 1024

// Contrato normalizado que envía el adaptador del proveedor de email entrante.
interface InboundEmail {
  from: string
  subject?: string
  message_id?: string
  attachments: { filename: string; content_base64: string; content_type: string }[]
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
  // Validación de firma: secreto compartido en header (timing-safe).
  const sig = req.headers.get('X-Counter-Webhook-Secret') ?? ''
  if (!WEBHOOK_SECRET || sig.length !== WEBHOOK_SECRET.length || !timingSafeEqual(sig, WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let email: InboundEmail
  try { email = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const db = getAdminClient()
  const now = new Date()
  const yr = now.getUTCFullYear()
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  let queued = 0, skipped = 0

  for (const att of email.attachments ?? []) {
    if (!ALLOWED.has(att.content_type)) { skipped++; continue }
    const bytes = Uint8Array.from(atob(att.content_base64), c => c.charCodeAt(0))
    if (bytes.length === 0 || bytes.length > MAX_BYTES) { skipped++; continue }

    const hash = await sha256Hex(bytes)
    const ext = att.content_type === 'application/pdf' ? 'pdf' : att.content_type.split('/')[1]
    const path = `${yr}/${mo}/${hash}.${ext}`

    // Idempotencia: si el hash ya existe, saltar.
    const { data: existing } = await db.from('pending_counter_imports').select('id').eq('image_hash_sha256', hash).maybeSingle()
    if (existing) { skipped++; continue }

    const up = await db.storage.from('counter-images').upload(path, bytes, { contentType: att.content_type, upsert: false })
    if (up.error) { console.error('[receive-counter-email] upload', up.error); skipped++; continue }

    const { data: pending, error: insErr } = await db.from('pending_counter_imports').insert({
      image_path: path, image_size_bytes: bytes.length, image_hash_sha256: hash,
      source: 'email', email_from: email.from, email_subject: email.subject ?? null,
      email_message_id: email.message_id ?? null,
    }).select('id').single()
    if (insErr) { console.error('[receive-counter-email] insert', insErr); skipped++; continue }

    // Disparar el OCR (fire-and-forget; no bloquea la respuesta al proveedor).
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/parse-counter-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}` },
      body: JSON.stringify({ pending_id: pending!.id, image_path: path, content_type: att.content_type }),
    }).catch(e => console.error('[receive-counter-email] trigger parse', e))
    queued++
  }

  // Aviso de lote (B5): un solo email-resumen a los admins si se encoló algo.
  if (queued > 0) {
    const notify = (Deno.env.get('COUNTER_NOTIFY_EMAILS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
    if (notify.length > 0) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}` },
        body: JSON.stringify({
          template: 'counter_batch_processed', to: notify,
          data: { total: String(queued), greens: '—', attention: '—', url: `${appUrl}/admin/contadores/pendientes` },
        }),
      }).catch(e => console.error('[receive-counter-email] notify', e))
    }
  }

  return new Response(JSON.stringify({ ok: true, queued, skipped }), { headers: { 'Content-Type': 'application/json' } })
})
