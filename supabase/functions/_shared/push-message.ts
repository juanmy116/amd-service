// Texto, destino y etiqueta de un aviso push al técnico. Puro: lo testea vitest y lo importa la
// Edge Function send-push. La etiqueta (`tag`) hace que un aviso nuevo de la misma tarea
// sustituya al anterior en el iPhone en vez de apilarse.
export type PushContext = {
  kind: 'assigned' | 'unassigned'
  entityType: 'incident' | 'visit'
  entityId: string
  clientName: string | null
  quartier: string | null
  incidentTitle: string | null
  incidentNumero: string | null
  priority: string | null
  /** YYYY-MM-DD */
  scheduledDate: string | null
  machineSerie: string | null
}

export type PushMessage = { title: string; body: string; url: string; tag: string }

function frDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Recorta a `max` caracteres y añade '…' — evita notificaciones ilegibles con títulos larguísimos. */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function buildPushMessage(c: PushContext): PushMessage {
  const client = c.clientName?.trim() || 'Client inconnu'
  const quartier = c.quartier?.trim() || null
  const where = quartier ? `${client}, ${quartier}` : client
  const tag = `${c.entityType}-${c.entityId}`

  if (c.kind === 'unassigned') {
    const body = c.entityType === 'incident'
      ? `La panne ${c.incidentNumero ?? ''} a été réassignée.`.replace('  ', ' ')
      : `La maintenance du ${frDate(c.scheduledDate)} a été réassignée.`
    return { title: `Tâche retirée — ${client}`, body, url: '/tech', tag }
  }

  if (c.entityType === 'incident') {
    const urgent = c.priority === 'urgente' ? 'Urgent · ' : ''
    const title = c.incidentTitle ? truncate(c.incidentTitle, 120) : c.incidentTitle
    const body = [title, c.incidentNumero].filter(Boolean).join(' · ')
    return { title: `${urgent}Nouvelle panne — ${where}`, body, url: `/tech/incidents/${c.entityId}`, tag }
  }

  return {
    title: `Maintenance assignée — ${where}`,
    body: c.scheduledDate ? `Prévue le ${frDate(c.scheduledDate)}` : '',
    url: c.machineSerie
      ? `/tech/scan/${encodeURIComponent(c.machineSerie)}/maintenance/${c.entityId}`
      : '/tech/planning',
    tag,
  }
}
