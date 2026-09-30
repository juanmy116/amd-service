// Plantillas HTML de la Edge Function send-email. Puro: lo testea vitest y lo importa send-email.
//
// Todo valor de `data` se escapa antes de entrar en el HTML (salvo `raw`, que por diseño recibe
// el HTML ya construido por quien llama). Algunos valores vienen de formularios anónimos —el
// `contact_name` del QR público acaba en el saludo de la encuesta— y el correo sale del remitente
// real de AMD a la dirección que haya puesto quien rellenó el formulario (hallazgo F9).

export type TemplateName = 'ticket_open' | 'ticket_assigned' | 'ticket_resolved' | 'csat' | 'counter_batch_processed' | 'raw'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Solo http(s): un `href` con otro esquema (`javascript:`, `data:`) no llega nunca al correo.
export function safeHttpUrl(raw: string | undefined): string {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

// Escapado, un nombre como «https://evil.tld/avis-amd» sigue llegando como texto, y muchos
// clientes de correo convierten solo en enlace lo que parece una dirección. Esos nombres se quedan
// sin saludo; los normales («Diop & Fils», «M.Diop», «Bureau 2 - Fatou») lo conservan.
const LINK_TLDS =
  'com|net|org|info|biz|io|co|me|app|dev|xyz|top|site|online|link|click|shop|store|live|ly|' +
  'sn|fr|ru|cn|tk|ml|ga|cf|gq|be|ch|de|uk|us|ca|es|it|eu|ci|ma|tn'
const DOMAIN = new RegExp(`[a-z0-9-]\\.(?:${LINK_TLDS})(?![a-z0-9-])`, 'i')

export function looksLikeLink(s: string): boolean {
  return /[a-z][a-z0-9+.-]*:\/\//i.test(s)
    || /\bwww\./i.test(s)
    || s.includes('@')
    || DOMAIN.test(s)
    || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(s)
}

export function renderTemplate(
  template: TemplateName,
  data: Record<string, string>
): { subject: string; html: string } {
  // Texto para el HTML (escapado) y URLs para un `href` (solo http(s), escapadas). Los asuntos
  // van como texto plano al proveedor y no se escapan: saldrían «&amp;» en la bandeja de entrada.
  const h = (key: string) => escapeHtml(data[key] ?? '')
  const url = (key: string) => escapeHtml(safeHttpUrl(data[key]))

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
              <p>Référence : <strong>#${h('incident_id')}</strong></p>
              <p>Objet : ${h('title')}</p>
              <p>Priorité : <strong>${h('priority')}</strong></p>
              <p>Notre équipe prend en charge votre demande dans les meilleurs délais.</p>
              ${url('portal_url') ? `<p><a href="${url('portal_url')}" style="color:#BF0D0D">Suivre mon dossier →</a></p>` : ''}
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
              <p>Référence : <strong>#${h('incident_id')}</strong></p>
              <p>Objet : ${h('title')}</p>
              <p>Technicien : <strong>${h('tech_name')}</strong></p>
              <p>Vous serez contacté prochainement pour planifier l'intervention.</p>
              ${url('portal_url') ? `<p><a href="${url('portal_url')}" style="color:#BF0D0D">Suivre mon dossier →</a></p>` : ''}
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
              <p>Référence : <strong>#${h('incident_id')}</strong></p>
              <p>Objet : ${h('title')}</p>
              <p>Merci de nous avoir fait confiance.</p>
            </div>
          </div>
        `
      }

    case 'csat': {
      // Sin un enlace válido la encuesta no sirve: mejor que el envío falle (csat.server.ts lo
      // deja en el historial y la avería se queda en `résolu`) que mandar un botón vacío.
      const csatUrl = url('csat_url')
      if (!csatUrl) throw new Error('csat requiert un csat_url http(s) valide')

      const reference  = data.reference ?? ''
      const name       = (data.client_name ?? '').trim()
      const greeting   = name && !looksLikeLink(name) ? `<p>Bonjour ${escapeHtml(name)},</p>` : ''
      const rows = [
        reference ? ['Référence', h('reference')] : null,
        data.equipement ? ['Équipement', h('equipement')] : null,
      ].filter((r): r is string[] => r !== null)

      const details = rows.length
        ? `<table style="margin:20px 0;font-size:14px">${rows
            .map(([k, v]) =>
              `<tr><td style="color:#6b7280;padding:2px 16px 2px 0">${k}</td>` +
              `<td style="color:#111;font-weight:600">${v}</td></tr>`)
            .join('')}</table>`
        : ''

      return {
        subject: reference
          ? `Votre avis sur notre intervention — ${reference}`
          : `Votre avis sur notre intervention`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              ${greeting}
              <p>Votre demande a été résolue.</p>
              ${details}
              <h2 style="margin:24px 0 12px">Comment s'est passée notre intervention ?</h2>
              <p>Prenez 30 secondes pour évaluer notre service :</p>
              <div style="text-align:center;margin:32px 0">
                <a href="${csatUrl}" style="background:#BF0D0D;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
                  Donner mon avis
                </a>
              </div>
              <p style="font-size:12px;color:#9ca3af">Ce lien est valable 7 jours.</p>
            </div>
          </div>
        `
      }
    }

    case 'counter_batch_processed': {
      const total = escapeHtml(data.total ?? '0')
      const greens = escapeHtml(data.greens ?? '0')
      const attention = escapeHtml(data.attention ?? '0')
      return {
        subject: `[AMD SAV] ${data.total ?? '0'} compteur(s) traité(s) par email`,
        html: `<p><strong>${total}</strong> compteur(s) reçus par email ont été traités.</p>
             <ul><li>🟢 ${greens} prêt(s) à confirmer</li><li>🟡🔴 ${attention} à vérifier</li></ul>
             <p><a href="${url('url')}">Voir la file d'attente →</a></p>`,
      }
    }

    case 'raw':
      if (!data.subject || !data.html) throw new Error('raw requiert subject et html dans data')
      return { subject: data.subject, html: data.html }

    default:
      throw new Error(`Template inconnu: ${template}`)
  }
}
