/**
 * Lógica compartida de incidencias para la PWA del técnico.
 *
 * `TECH_INCIDENT_SELECT` centraliza el string del `select` de Supabase que usa
 * la lista del técnico. Vivía inline en `tech/incidents/page.tsx` y, tras el
 * refactor N-máquinas, un `select` apuntando a una columna inexistente
 * (`clients!client_id`) dejó la lista del técnico vacía en producción. Tenerlo
 * en un único sitio reduce el riesgo de que vuelva a divergir.
 *
 * `contract_machines(machines(numero_serie))` da el nº de serie de las incidencias internas
 * (las públicas ya lo tienen en `machine_id`) — lo necesita «Plus proche» (Fase 3) para pedir
 * las coordenadas de la máquina con `coordsForMachines`.
 */
export const TECH_INCIDENT_SELECT =
  'id, numero_incident, title, status, priority, created_at, machine_id, contract_machines(machines(numero_serie), contracts(clients(nom_client)))' as const

/**
 * Nombre a mostrar de una incidencia en la lista del técnico:
 * cliente (incidencia interna) → nº de serie (incidencia pública) → título.
 */
export function getIncidentDisplayName(incident: {
  clients: { nom_client: string } | null
  machine_id: string | null
  title: string
}): string {
  return incident.clients?.nom_client ?? incident.machine_id ?? incident.title
}
