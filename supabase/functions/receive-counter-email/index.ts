import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAdminClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/secret-key.ts'

const WEBHOOK_SECRET = Deno.env.get('COUNTER_WEBHOOK_SECRET') ?? ''
const SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_BYTES = 10 * 1024 * 1024

// Payload de email entrante. Tolera el contrato propio { from, subject, message_id,
// attachments:[{content_base64,filename,content_type}] } Y el JSON de proveedores de inbound
// como CloudMailin { envelope:{from}, headers:{subject,message_id}, attachments:[{content,file_name,content_type}] }.
interface RawAttachment {
  content_base64?: string; content?: string; data?: string
  filename?: string; file_name?: string; name?: string
  content_type?: string; contentType?: string; type?: string
  disposition?: string
}
interface InboundEmail {
  from?: string; subject?: string; message_id?: string
  envelope?: { from?: string }
  headers?: { subject?: string; message_id?: string; from?: string }
  attachments?: RawAttachment[]
}

// Getters defensivos: distintos proveedores nombran los campos de forma distinta.
const attContent = (a: RawAttachment) => (a.content_base64 ?? a.content ?? a.data ?? '').replace(/\s/g, '')
const attName    = (a: RawAttachment) => a.filename ?? a.file_name ?? a.name ?? 'attachment'
const attType    = (a: RawAttachment) => a.content_type ?? a.contentType ?? a.type ?? ''

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  // Validación de firma: secreto compartido en header O en query param (?secret=), timing-safe.
  // El query param permite usar proveedores que no dejan añadir headers personalizados al webhook.
  const url = new URL(req.url)
  const sig = req.headers.get('X-Counter-Webhook-Secret') ?? url.searchParams.get('secret') ?? ''
  if (!WEBHOOK_SECRET || sig.length !== WEBHOOK_SECRET.length || !timingSafeEqual(sig, WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let email: InboundEmail
  try { email = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const emailFrom    = email.envelope?.from ?? email.headers?.from ?? email.from ?? null
  const emailSubject = email.headers?.subject ?? email.subject ?? null
  const emailMsgId   = email.headers?.message_id ?? email.message_id ?? null

  const db = getAdminClient()
  const now = new Date()
  const yr = now.getUTCFullYear()
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  let queued = 0, skipped = 0
  const triggers: Promise<void>[] = []

  for (const att of email.attachments ?? []) {
    const ctype = attType(att)
    if (!ALLOWED.has(ctype)) { skipped++; continue }
    const b64 = attContent(att)
    if (!b64) { skipped++; continue }
    let bytes: Uint8Array
    try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)) } catch { skipped++; continue }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) { skipped++; continue }

    const hash = await sha256Hex(bytes)
    const ext = ctype === 'application/pdf' ? 'pdf' : ctype.split('/')[1]
    const path = `${yr}/${mo}/${hash}.${ext}`

    // Idempotencia: si el hash ya existe, saltar.
    const { data: existing } = await db.from('pending_counter_imports').select('id').eq('image_hash_sha256', hash).maybeSingle()
    if (existing) { skipped++; continue }

    // Insertar la fila ANTES de subir, para no dejar objetos huérfanos en el bucket si el insert
    // falla. El UNIQUE(image_hash_sha256) cierra cualquier carrera entre dos correos iguales (→ skipped).
    const { data: pending, error: insErr } = await db.from('pending_counter_imports').insert({
      image_path: path, image_size_bytes: bytes.length, image_hash_sha256: hash,
      source: 'email', email_from: emailFrom, email_subject: emailSubject, email_message_id: emailMsgId,
    }).select('id').single()
    if (insErr) { console.error('[receive-counter-email] insert', insErr, 'filename', attName(att)); skipped++; continue }

    // Subir la imagen (upsert: tolera un reintento que ya hubiera dejado el objeto).
    // Si falla, la fila ya existe y el OCR la marcará failed_extraction al no poder descargar
    // (visible para el admin), en vez de quedar un objeto huérfano que bloquee reenvíos.
    const up = await db.storage.from('counter-images').upload(path, bytes, { contentType: ctype, upsert: true })
    if (up.error) console.error('[receive-counter-email] upload', up.error)

    // Disparar el OCR. Se recoge la promesa para EdgeRuntime.waitUntil (sin él, el runtime de
    // Supabase puede cancelar el fetch al devolver la Response y el OCR no se ejecutaría nunca).
    triggers.push(
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/parse-counter-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}` },
        body: JSON.stringify({ pending_id: pending!.id, image_path: path, content_type: ctype }),
      }).then(() => {}).catch(e => console.error('[receive-counter-email] trigger parse', e))
    )
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

  // Garantizar que los disparos del OCR se completen DESPUÉS de devolver la respuesta al proveedor.
  const edge = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (triggers.length > 0 && edge) edge.waitUntil(Promise.all(triggers))

  return new Response(JSON.stringify({ ok: true, queued, skipped }), { headers: { 'Content-Type': 'application/json' } })
})
