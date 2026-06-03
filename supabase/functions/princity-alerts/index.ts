import { getPrincityClient }                      from '../_shared/princity-client.ts'
import { getAdminClient, updateHealth, writeLog } from '../_shared/db.ts'
import { notifyAlerts }                           from '../_shared/notify.ts'

const FUNCTION_NAME = 'princity-alerts'

function classifyAlert(entry: Record<string, unknown>): 'panne' | 'toner_bas' | 'autre' {
  const severity    = String(entry['Alert.severityLevel'] ?? '').toLowerCase()
  const description = String(entry['Alert.description']  ?? '').toLowerCase()

  if (severity === 'error' && !description.includes('toner')) return 'panne'
  if (description.includes('toner') || description.includes('niveau bas')) return 'toner_bas'
  return 'autre'
}

Deno.serve(async (_req: Request) => {
  const db       = getAdminClient()
  const princity = getPrincityClient()

  let processed = 0
  let created   = 0

  try {
    const entries = await princity.fetchAll('/v3/alerts', {
      cursorParams: {
        filters: [{ key: 'Alert.deactivationDate', type: 'IS_NULL' }],
        orders:  [{ key: 'Alert.activationDate', type: 'ASC' }],
      },
      fieldIds: [
        'Alert.activationDate',
        'Alert.severityLevel',
        'Alert.description',
        'Alert.deviceId',
        'Alert.code',
        'Alert.companyId',
      ],
    })

    processed = entries.length

    for (const entry of entries) {
      const deviceId       = String(entry['Alert.deviceId'] ?? '')
      const activationDate = String(entry['Alert.activationDate'] ?? '')
      const code           = Number(entry['Alert.code'] ?? 0)

      // Idempotencia: buscar si ya existe
      const { data: existing } = await db
        .from('princity_alerts')
        .select('id')
        .eq('princity_alert_code', code)
        .eq('princity_device_id_raw', deviceId)
        .eq('received_at', activationDate)
        .maybeSingle()

      if (existing) continue

      // Buscar máquina por princity_device_id
      const { data: machine } = await db
        .from('machines')
        .select('numero_serie')
        .eq('princity_device_id', deviceId)
        .maybeSingle()

      // Buscar línea de contrato activa de la máquina (nuevo modelo N máquinas)
      const { data: openLine } = machine ? await db
        .from('contract_machines')
        .select('id, contract_id, contracts(id, client_id)')
        .eq('machine_id', machine.numero_serie)
        .is('date_fin', null)
        .maybeSingle() : { data: null }
      const contract = (openLine?.contracts as { id: string; client_id: number } | null) ?? null

      const alertType = classifyAlert(entry)

      // Insertar en princity_alerts
      const { data: alert, error: alertErr } = await db
        .from('princity_alerts')
        .insert({
          received_at:            activationDate,
          client_raw:             String(entry['Alert.companyId'] ?? ''),
          machine_id:             machine?.numero_serie ?? null,
          client_id:              contract?.client_id ?? null,
          description:            String(entry['Alert.description'] ?? ''),
          severity:               String(entry['Alert.severityLevel'] ?? ''),
          alert_type:             alertType,
          processed:              false,
          princity_alert_code:    code,
          princity_device_id_raw: deviceId,
        })
        .select('id')
        .single()

      if (alertErr) {
        console.error('[princity-alerts] insert error:', alertErr.message)
        continue
      }

      // Crear incidencia si es panne (con o sin contrato activo)
      if (alertType === 'panne' && machine) {
        const { data: incident } = await db
          .from('incidents')
          .insert({
            contract_machine_id: openLine?.id ?? null,
            machine_id:          openLine ? null : machine.numero_serie,
            title:               `Panne détectée par Princity: ${entry['Alert.description']}`,
            description:         String(entry['Alert.description'] ?? ''),
            category:            'panne',
            priority:            'haute',
            status:              'nouveau',
          })
          .select('id')
          .single()

        if (incident) {
          await db.from('princity_alerts').update({ incident_id: incident.id, processed: true })
            .eq('id', alert.id)
        }

        await notifyAlerts(
          `🔴 PANNE DÉTECTÉE\nMachine: ${machine.numero_serie}\nDescription: ${entry['Alert.description']}\nTicket créé automatiquement`
        )
      } else if (alertType === 'toner_bas') {
        await notifyAlerts(
          `🟡 TONER BAS — Machine: ${deviceId}\nDescription: ${entry['Alert.description']}`
        )
      }

      created++
    }

    await updateHealth(db, FUNCTION_NAME, true)
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/alerts',
      status:           'success',
      recordsProcessed: processed,
      recordsCreated:   created,
    })

    return new Response(JSON.stringify({ ok: true, processed, created }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${FUNCTION_NAME}]`, msg)

    await updateHealth(db, FUNCTION_NAME, false, msg).catch(() => {})
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/alerts',
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
