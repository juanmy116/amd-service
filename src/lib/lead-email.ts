// Construcción del email de notificación de un nuevo lead al equipo comercial.
// El lead es input público no confiable → todo valor se escapa para evitar inyección HTML.

export const NEEDS_LABELS: Record<string, string> = {
  rental:      'Location',
  sales:       'Vente',
  management:  'Gestion de parc',
  maintenance: 'Maintenance',
  other:       'Autre',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildLeadEmailHtml(lead: {
  name: string; email: string; company: string; phone: string; needsLabel: string; message: string
}): string {
  const { name, email, company, phone, needsLabel, message } = lead
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:6px 0;font-weight:500">${value}</td></tr>`
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
      </div>
      <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="margin-top:0">Nouveau lead reçu</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row('Entreprise', `<strong>${escapeHtml(company)}</strong>`)}
          ${row('Contact', escapeHtml(name))}
          ${row('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#BF0D0D">${escapeHtml(email)}</a>`)}
          ${row('Téléphone', `<a href="tel:${escapeHtml(phone)}" style="color:#BF0D0D">${escapeHtml(phone)}</a>`)}
          ${row('Besoin', escapeHtml(needsLabel))}
        </table>
        ${message
          ? `<div style="margin-top:16px"><p style="color:#6b7280;font-size:13px;margin:0 0 4px">Message</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p></div>`
          : ''}
      </div>
    </div>
  `
}
