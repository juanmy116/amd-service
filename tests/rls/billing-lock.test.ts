import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, enableBilling } from './helpers'

// Capa 1 — CANDADO DE FACTURACIÓN.
// El trigger BEFORE INSERT `trg_guard_billing_enabled` en `invoices` bloquea la creación de
// facturas mientras billing_settings.billing_enabled = false, para TODOS los roles (incl.
// service_role). Es la barrera dura que respalda al guard de la Server Action y a la UI.
const admin = adminClient()

describe('candado de facturación (billing_settings)', () => {
  // El globalSetup abre el candado para el resto de la suite; este test lo cierra un instante,
  // así que lo restauramos siempre al terminar.
  afterAll(async () => {
    await enableBilling(admin)
  })

  it('con el candado ECHADO, ni service_role puede crear una factura', async () => {
    await admin.from('billing_settings').update({ billing_enabled: false }).eq('id', true)
    try {
      const { error } = await admin.from('invoices').insert({
        numero_facture: 'TESTLOCK-0001',
        client_id: 999_999_999,
        client_name: 'TESTLOCK',
        period_year: 2026,
        period_month: 1,
        total_amount: 0,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('billing_disabled')
    } finally {
      // Reabrir de inmediato (belt-and-suspenders con el afterAll) para no afectar a otros ficheros.
      await enableBilling(admin)
    }
  })

  it('el flag arranca en false por migración (fila única singleton id=true)', async () => {
    // No comprobamos el valor vivo (el globalSetup ya lo abrió); verificamos la forma singleton:
    // existe exactamente una fila con id=true.
    const { data, error } = await admin.from('billing_settings').select('id, billing_enabled')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
    expect(data?.[0]?.id).toBe(true)
  })
})
