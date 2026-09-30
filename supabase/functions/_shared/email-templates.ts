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
export function safeHttpUrl(raw: unknown): string {
  if (!raw) return ''
  try {
    const url = new URL(String(raw))
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

// Escapado, un nombre como «https://evil.tld/avis-amd» sigue llegando como texto, y muchos
// clientes de correo convierten en enlace lo que parece una dirección. Solo se saluda a lo que
// claramente es un nombre (lista de lo permitido, no de lo prohibido: ningún TLD nuevo, IDN o punto
// Unicode se cuela): letras de cualquier alfabeto, cifras, espacios y , ' ’ - & ( ). Un punto solo
// tras una inicial («M.Diop», «A.Ly») o al final de una palabra («Diop Jr.»); una barra solo con
// espacio delante («Awa / Accueil»). Sin saludo, la encuesta sale igual.
const NAME_CHARS = /^[\p{L}\p{M}\p{N} ,'’\-&()/.]+$/u

export function isPlainName(s: string): boolean {
  if (!NAME_CHARS.test(s) || /\S\//.test(s)) return false
  for (let i = s.indexOf('.'); i !== -1; i = s.indexOf('.', i + 1)) {
    const afterInitial = /(^|\s)\p{L}$/u.test(s.slice(0, i))
    const endsWord = i === s.length - 1 || /\s/.test(s[i + 1])
    if (!afterInitial && !endsWord) return false
  }
  return true
}

export function renderTemplate(
  template: TemplateName,
  data: Record<string, string>
): { subject: string; html: string } {
  // Texto para el HTML (escapado) y URLs para un `href` (solo http(s), escapadas). Los asuntos
  // van como texto plano al proveedor y no se escapan: saldrían «&amp;» en la bandeja de entrada.
  const h = (key: string) => escapeHtml(String(data[key] ?? ''))
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
      const name       = String(data.client_name ?? '').trim()
      const greeting   = name && isPlainName(name) ? `<p>Bonjour ${escapeHtml(name)},</p>` : ''
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
      const total = escapeHtml(String(data.total ?? '0'))
      const greens = escapeHtml(String(data.greens ?? '0'))
      const attention = escapeHtml(String(data.attention ?? '0'))
      return {
        subject: `[AMD SAV] ${data.total ?? '0'} compteur(s) traité(s) par email`,
        html: `<p><strong>${total}</strong> compteur(s) reçus par email ont été traités.</p>
             <ul><li>🟢 ${greens} prêt(s) à confirmer</li><li>🟡🔴 ${attention} à vérifier</li></ul>
             ${url('url') ? `<p><a href="${url('url')}">Voir la file d'attente →</a></p>` : ''}`,
      }
    }

    case 'raw':
      if (!data.subject || !data.html) throw new Error('raw requiert subject et html dans data')
      return { subject: data.subject, html: data.html }

    default:
      throw new Error(`Template inconnu: ${template}`)
  }
}
