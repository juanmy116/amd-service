// Autenticación de las llamadas de pg_cron a princity-alerts, princity-counters y princity-watchdog.
//
// Se despliegan con --no-verify-jwt y trabajan con el cliente service_role: sin esta comprobación
// cualquiera podía dispararlas desde internet sin límite (invocaciones, cuota de la API Princity con
// la clave de AMD, avisos duplicados por Matrix y email). El cron envía la cabecera `x-cron-secret`
// con el secreto guardado en Vault (`princity_cron_secret`, ver migración 20260930160000); aquí se
// compara en tiempo constante con el secreto PRINCITY_CRON_SECRET de las Edge Functions.

import { timingSafeEqual } from './secret-key.ts'

const PRINCITY_CRON_SECRET = Deno.env.get('PRINCITY_CRON_SECRET') ?? ''

/** Respuesta 401 si la petición no trae el secreto del cron; null si puede seguir. */
export function rejectUnlessPrincityCron(req: Request, functionName: string): Response | null {
  if (!PRINCITY_CRON_SECRET) {
    console.error(`[${functionName}] PRINCITY_CRON_SECRET no configurado`)
  }
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!PRINCITY_CRON_SECRET || !timingSafeEqual(provided, PRINCITY_CRON_SECRET)) {
    return new Response(JSON.stringify({ ok: false, error: 'Non autorisé' }), {
      status:  401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}
