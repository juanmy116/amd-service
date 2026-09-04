import { adminClient, enableBilling } from './helpers'

// Capa 1 — el candado de facturación arranca APAGADO por migración (bloquea todo INSERT en
// `invoices`). La suite RLS + el gate E2E emiten facturas reales, así que lo abrimos una sola vez
// para toda la corrida (la BD es efímera: `supabase start` en local, reset en CI). El test dedicado
// `billing-lock.test.ts` lo vuelve a cerrar puntualmente y lo restaura.
export default async function setup(): Promise<void> {
  await enableBilling(adminClient())
}
