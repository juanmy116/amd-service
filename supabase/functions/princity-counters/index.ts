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

      // year/month/day se derivan de la FECHA REAL de la lectura (BillingCounter.date),
      // no de la fecha de ejecución del cron. Se mantiene la cota al mes actual (el cron
      // solo recoge el relevé del periodo en curso).
      const [cYear, cMonth, cDayRaw] = counterDate.split('-').map(Number)
      const counterDay = cDayRaw || 1
      if (cYear !== year || cMonth !== month) continue
      const readingDate = `${cYear}-${String(cMonth).padStart(2, '0')}-${String(counterDay).padStart(2, '0')}`

      // Atribución por FECHA REAL: la lectura pertenece a la línea VIGENTE en counterDate, no a
      // «la línea abierta hoy» (un reemplazo intra-mes puede dejar la lectura en la línea
      // equivocada). Mismo criterio que Manual/OCR (getLineForMachineAtDate): date_debut <= fecha
      // AND (date_fin IS NULL OR date_fin >= fecha), la de date_debut más reciente. Si ninguna
      // línea cubre la fecha → no se importa (se registra y se omite).
      const { data: line } = await db
        .from('contract_machines')
        .select('id, contract_id, contracts!inner ( client_id )')
        .eq('machine_id', m.numero_serie)
        .lte('date_debut', readingDate)
        .or(`date_fin.is.null,date_fin.gte.${readingDate}`)
        .order('date_debut', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!line) {
        console.warn(`[princity-counters] aucune ligne active pour ${m.numero_serie} au ${readingDate} — relevé ignoré`)
        continue
      }
      const targetClientId = (line.contracts as unknown as { client_id: number }).client_id

      // Idempotencia por FECHA REAL (reading_date), no por mes: el modelo nuevo admite dos
      // relevés el mismo mes en días distintos (uno por máquina y día).
      const { data: existing } = await db
        .from('machine_counters')
        .select('id')
        .eq('machine_id', m.numero_serie)
        .eq('year', cYear)
        .eq('month', cMonth)
        .eq('day', counterDay)
        .eq('status', 'actif')
        .maybeSingle()

      if (existing) continue

      const { error: insertErr } = await db.from('machine_counters').insert({
        machine_id:          m.numero_serie,
        contract_id:         line.contract_id,
        contract_machine_id: line.id,   // línea vigente en la fecha de la lectura
        client_id:           targetClientId,
        year:                cYear,
        month:               cMonth,
        day:                 counterDay,
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
