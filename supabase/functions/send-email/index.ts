import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'
import { renderTemplate, type TemplateName } from '../_shared/email-templates.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'AMD Service <noreply@amd-service.com>'
const RESEND_URL = 'https://api.resend.com/emails'

interface EmailPayload {
  template: TemplateName
  to: string | string[]
  data?: Record<string, string>
  attachments?: { filename: string; content: string }[]
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (getAllSecretKeys().length === 0) {
    console.error('[send-email] SUPABASE_SECRET_KEYS non configurée')
    return new Response(JSON.stringify({ error: 'Configuration manquante' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!isValidSecretKey(token)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: EmailPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { template, to, data = {}, attachments } = payload

  const toEmpty = !to || (Array.isArray(to) && to.length === 0)
  if (!template || toEmpty) {
    return new Response(JSON.stringify({ error: 'template et to sont requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let subject: string
  let html: string
  try {
    ;({ subject, html } = renderTemplate(template, data))
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html, ...(attachments?.length ? { attachments } : {}) }),
  })

  const result = await res.json()

  if (!res.ok) {
    console.error('[send-email] Resend error:', result)
    return new Response(JSON.stringify({ error: result }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ id: result.id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
