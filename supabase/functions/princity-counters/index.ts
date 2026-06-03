import { getPrincityClient }                      from '../_shared/princity-client.ts'
import { getAdminClient, updateHealth, writeLog } from '../_shared/db.ts'
import { notifyAdmin }                            from '../_shared/notify.ts'

const FUNCTION_NAME = 'princity-counters'

Deno.serve(async (_req: Request) => {
  const db       = getAdminClient()
  const princity = getPrincityClient()

  const now      = new Date()
  const todayDay = now.getUTCDate()
  const year     = now.getUTCFullYear()
  const month    = now.getUTCMonth() + 1

  let processed = 0
  let created   = 0
  let errors    = 0

  try {
    const { data: lines } = await db
      .from('contract_machines')
      .select(`
        machine_id,
        contract_id,
        billing_day_override,
        contracts!inner (
          id,
          client_id,
          billing_day,
          statut
        ),
        machines!inner (
          numero_serie,
          princity_device_id
        )
      `)
      .is('date_fin', null)
      .eq('statut', 'actif')
      .eq('contracts.statut', 'actif')
      .not('machines.princity_device_id', 'is', null)

    const machinesWithContracts = (lines ?? []).map(l => ({
      numero_serie:         (l.machines as unknown as { numero_serie: string; princity_device_id: string | null }).numero_serie,
      princity_device_id:   (l.machines as unknown as { numero_serie: string; princity_device_id: string | null }).princity_device_id,
      billing_day_override: l.billing_day_override as number | null,
      contracts:            l.contracts as unknown as { id: string; client_id: number; billing_day: number | null; statut: string },
    }))

    const machines = machinesWithContracts
    processed = machines.length

    for (const m of machines) {
      const contract            = m.contracts
      const effectiveBillingDay = m.billing_day_override ?? contract.billing_day

      if (effectiveBillingDay !== null && effectiveBillingDay !== todayDay) continue

      const entries = await princity.fetchAll('/v3/billingCounters', {
        cursorParams: {
          filters: [{ key: 'BillingCounter.deviceId', type: 'EQ', value: m.princity_device_id! }],
          orders:  [{ key: 'BillingCounter.date', type: 'DESC' }],
          limit:   1,
        },
        fieldIds: [
          'BillingCounter.date',
          'BillingCounter.startMono',
          'BillingCounter.endMono',
          'BillingCounter.startColor',
          'BillingCounter.endColor',
          'BillingCounter.deviceId',
        ],
      }).catch(() => [])

      if (!entries.length) continue

      const entry       = entries[0]
      const counterDate = String(entry['BillingCounter.date'] ?? '')
      if (!counterDate) continue

      // Verificar que el billing counter es del mes actual
      const [cy, cm] = counterDate.split('-').map(Number)
      if (cy !== year || cm !== month) continue

      // Idempotencia: verificar que no existe ya un relevé activo para este mes+máquina
      const { data: existing } = await db
        .from('machine_counters')
        .select('id')
        .eq('machine_id', m.numero_serie)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'actif')
        .maybeSingle()

      if (existing) continue

      const counterDay = Number(counterDate.split('-')[2] ?? 1)

      const { error: insertErr } = await db.from('machine_counters').insert({
        machine_id:    m.numero_serie,
        contract_id:   contract.id,
        client_id:     contract.client_id,
        year,
        month,
        day:           counterDay,
        counter_bw:    Number(entry['BillingCounter.endMono']   ?? 0),
        counter_color: Number(entry['BillingCounter.endColor']  ?? 0),
        status:        'actif',
        notes:         'Importé automatiquement depuis Princity API',
        recorded_by:   null,
      })

      if (insertErr) {
        if ((insertErr as { code?: string }).code === '23505') {
          // Relevé ya existe (race entre cron y guardado manual) — idempotencia OK
          continue
        }
        console.error('[princity-counters] insert error:', insertErr.message)
        errors++
        continue
      }

      // Aprender el día de facturación si no estaba guardado
      if (effectiveBillingDay === null) {
        await db.from('contracts')
          .update({ billing_day: counterDay })
          .eq('id', contract.id)
      }

      created++
    }

    if (created > 0 || errors > 0) {
      await notifyAdmin(
        `📊 COMPTEURS IMPORTÉS\nMachines traitées: ${processed}\nImportés: ${created}\nErreurs: ${errors}`
      )
    }

    await updateHealth(db, FUNCTION_NAME, true)
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/billingCounters',
      status:           errors > 0 ? 'partial' : 'success',
      recordsProcessed: processed,
      recordsCreated:   created,
      errorMessage:     errors > 0 ? `${errors} errores de inserción` : undefined,
    })

    return new Response(JSON.stringify({ ok: true, processed, created, errors }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${FUNCTION_NAME}]`, msg)
    await updateHealth(db, FUNCTION_NAME, false, msg).catch(() => {})
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/billingCounters',
      status:           'error',
      recordsProcessed: processed,
      recordsCreated:   created,
      errorMessage:     msg,
    }).catch(() => {})

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
