import { ANON_KEY, SERVICE_KEY, URL as SUPABASE_URL } from '../rls/helpers'

// Candado de los E2E: siembran y borran usuarios, averías y facturas, así que solo pueden correr
// contra un Supabase LOCAL (`supabase start`). El único proyecto en la nube es producción.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const HOW_TO =
  'Para correrlos en el Mac: `supabase start` y después `eval "$(supabase status -o env)"` ' +
  '(exporta API_URL, ANON_KEY y SERVICE_ROLE_KEY de la base local).'

export function assertLocalSupabase(): void {
  let host = ''
  try {
    host = new URL(SUPABASE_URL).hostname
  } catch {
    // URL mal formada: cae en el error de abajo.
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `E2E bloqueados: apuntan a ${SUPABASE_URL}, que no es un Supabase local. ` +
        `Solo se permiten 127.0.0.1/localhost para no tocar producción. ${HOW_TO}`,
    )
  }
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error(`E2E bloqueados: faltan las claves del Supabase local. ${HOW_TO}`)
  }
}
