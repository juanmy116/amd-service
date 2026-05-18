import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'AMD Service <noreply@amd-service.com>'
const RESEND_URL = 'https://api.resend.com/emails'

type TemplateName = 'ticket_open' | 'ticket_assigned' | 'ticket_resolved' | 'csat' | 'raw'

interface EmailPayload {
  template: TemplateName
  to: string
  data?: Record<string, string>
}

function renderTemplate(
  template: TemplateName,
  data: Record<string, string>
): { subject: string; html: string } {
  switch (template) {

    case 'ticket_open':
      return {
        subject: `Demande enregistrée : ${data.title}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="margin-top:0">Votre demande a bien été enregistrée</h2>
              <p>Référence : <strong>#${data.incident_id ?? ''}</strong></p>
              <p>Objet : ${data.title}</p>
              <p>Priorité : <strong>${data.priority ?? ''}</strong></p>
              <p>Notre équipe prend en charge votre demande dans les meilleurs délais.</p>
              ${data.portal_url ? `<p><a href="${data.portal_url}" style="color:#BF0D0D">Suivre mon dossier →</a></p>` : ''}
            </div>
          </div>
        `
      }

    case 'ticket_assigned':
      return {
        subject: `Technicien assigné — ${data.title}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="margin-top:0">Un technicien a été assigné à votre demande</h2>
              <p>Référence : <strong>#${data.incident_id ?? ''}</strong></p>
              <p>Objet : ${data.title}</p>
              <p>Technicien : <strong>${data.tech_name ?? ''}</strong></p>
              <p>Vous serez contacté prochainement pour planifier l'intervention.</p>
              ${data.portal_url ? `<p><a href="${data.portal_url}" style="color:#BF0D0D">Suivre mon dossier →</a></p>` : ''}
            </div>
          </div>
        `
      }

    case 'ticket_resolved':
      return {
        subject: `Intervention terminée — ${data.title}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="margin-top:0">Votre intervention a été résolue</h2>
              <p>Référence : <strong>#${data.incident_id ?? ''}</strong></p>
              <p>Objet : ${data.title}</p>
              <p>Merci de nous avoir fait confiance.</p>
            </div>
          </div>
        `
      }

    case 'csat':
      return {
        subject: `Votre avis sur l'intervention — ${data.title}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="margin-top:0">Comment s'est passée notre intervention ?</h2>
              <p>Votre demande <strong>${data.title}</strong> a été résolue.</p>
              <p>Prenez 30 secondes pour évaluer notre service :</p>
              <div style="text-align:center;margin:32px 0">
                <a href="${data.csat_url}" style="background:#BF0D0D;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
                  Donner mon avis
                </a>
              </div>
              <p style="font-size:12px;color:#9ca3af">Ce lien est valable 7 jours.</p>
            </div>
          </div>
        `
      }

    case 'raw':
      if (!data.subject || !data.html) throw new Error('raw requiert subject et html dans data')
      return { subject: data.subject, html: data.html }

    default:
      throw new Error(`Template inconnu: ${template}`)
  }
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

  const { template, to, data = {} } = payload

  if (!template || !to) {
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
    body: JSON.stringify({ from: FROM, to, subject, html }),
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
