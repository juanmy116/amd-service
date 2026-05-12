import { getPrincityClient }                      from '../_shared/princity-client.ts'
import { getAdminClient, updateHealth, writeLog } from '../_shared/db.ts'
import { notifyAdmin }                            from '../_shared/notify.ts'

const FUNCTION_NAME = 'princity-sync'

async function runInitialImport(
  db: ReturnType<typeof getAdminClient>,
  princity: ReturnType<typeof getPrincityClient>
) {
  // 1. Borrar datos en orden FK
  await db.rpc('wipe_data_tables')

  // 2. Importar empresas → clients
  const companies = await princity.fetchAll('/v3/companies', {
    cursorParams: { filters: [{ key: 'Company.active', type: 'EQ', value: 'true' }] },
    fieldIds: ['Company.id', 'Company.name', 'Company.address', 'Company.city', 'Company.postalCode'],
  })

  let clientsCreated = 0
  for (const c of companies) {
    const { error } = await db.from('clients').insert({
      nom_client:          String(c['Company.name'] ?? ''),
      adresse:             String(c['Company.address'] ?? '') || null,
      ville:               String(c['Company.city'] ?? '') || null,
      princity_company_id: String(c['Company.id'] ?? ''),
      active:              true,
    })
    if (!error) clientsCreated++
  }

  // 3. Importar dispositivos → machines
  const devices = await princity.fetchAll('/v3/devices', {
    cursorParams: {
      filters: [{ key: 'Device.status', type: 'EQ', value: 'ACTIVE' }],
    },
    fieldIds: [
      'Device.id', 'Device.serialNumber',
      'Device.model.manufacturerName', 'Device.model.name',
      'Device.model.color', 'Device.ip', 'Device.sysLocation',
    ],
  })

  let machinesCreated = 0
  for (const d of devices) {
    const serie = String(d['Device.serialNumber'] ?? '').trim()
    if (!serie) continue

    const { error } = await db.from('machines').insert({
      numero_serie:       serie,
      marque:             String(d['Device.model.manufacturerName'] ?? '') || 'Ricoh',
      modele:             String(d['Device.model.name'] ?? ''),
      type:               d['Device.model.color'] ? 'color' : 'noir_blanc',
      localisation:       String(d['Device.sysLocation'] ?? '') || null,
      princity_device_id: String(d['Device.id'] ?? ''),
      princity_pending:   true,
      active:             true,
    })
    if (!error) machinesCreated++
  }

  return { clientsCreated, machinesCreated, companiesTotal: companies.length, devicesTotal: devices.length }
}

async function runNormalSync(
  db: ReturnType<typeof getAdminClient>,
  princity: ReturnType<typeof getPrincityClient>
) {
  let created = 0

  // Sincronizar empresas
  const companies = await princity.fetchAll('/v3/companies', {
    cursorParams: { filters: [{ key: 'Company.active', type: 'EQ', value: 'true' }] },
    fieldIds: ['Company.id', 'Company.name', 'Company.city'],
  })

  for (const c of companies) {
    const companyId = String(c['Company.id'] ?? '')
    const { data: existing } = await db.from('clients')
      .select('id').eq('princity_company_id', companyId).maybeSingle()

    if (!existing) {
      await db.from('clients').insert({
        nom_client:          String(c['Company.name'] ?? ''),
        ville:               String(c['Company.city'] ?? '') || null,
        princity_company_id: companyId,
        active:              true,
      })
      await notifyAdmin(
        `🆕 NOUVEAU CLIENT PRINCITY\nEntreprise: ${c['Company.name']}\nID Princity: ${companyId}\n→ À lier manuellement: /admin/clients`
      )
      created++
    }
  }

  // Sincronizar dispositivos
  const devices = await princity.fetchAll('/v3/devices', {
    cursorParams: { filters: [{ key: 'Device.status', type: 'EQ', value: 'ACTIVE' }] },
    fieldIds: [
      'Device.id', 'Device.serialNumber',
      'Device.model.manufacturerName', 'Device.model.name',
      'Device.model.color', 'Device.company.name',
    ],
  })

  for (const d of devices) {
    const serie = String(d['Device.serialNumber'] ?? '').trim()
    if (!serie) continue

    const { data: existing } = await db.from('machines')
      .select('numero_serie, princity_device_id').eq('numero_serie', serie).maybeSingle()

    if (!existing) {
      await db.from('machines').insert({
        numero_serie:       serie,
        marque:             String(d['Device.model.manufacturerName'] ?? '') || 'Ricoh',
        modele:             String(d['Device.model.name'] ?? ''),
        type:               d['Device.model.color'] ? 'color' : 'noir_blanc',
        princity_device_id: String(d['Device.id'] ?? ''),
        princity_pending:   true,
        active:             true,
      })
      await notifyAdmin(
        `🆕 NOUVEL ÉQUIPEMENT PRINCITY\nSérie: ${serie}\nModèle: ${d['Device.model.name']}\nEntreprise: ${d['Device.company.name']}\n→ Créer contrat: /admin/contracts`
      )
      created++
    } else if (!existing.princity_device_id) {
      await db.from('machines').update({ princity_device_id: String(d['Device.id'] ?? '') })
        .eq('numero_serie', serie)
    }
  }

  return { created }
}

Deno.serve(async (req: Request) => {
  const db       = getAdminClient()
  const princity = getPrincityClient()

  const body = await req.json().catch(() => ({})) as { mode?: string }
  const mode = body.mode === 'initial' ? 'initial' : 'normal'

  try {
    let result: Record<string, number>

    if (mode === 'initial') {
      result = await runInitialImport(db, princity)
      await notifyAdmin(
        `✅ IMPORTATION INITIALE TERMINÉE\n` +
        `Clients: ${result.clientsCreated}/${result.companiesTotal}\n` +
        `Machines: ${result.machinesCreated}/${result.devicesTotal}\n` +
        `→ Étape suivante: créer les contrats dans /admin/contracts`
      )
    } else {
      result = await runNormalSync(db, princity)
    }

    await updateHealth(db, FUNCTION_NAME, true)
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/companies + /v3/devices',
      status:           'success',
      recordsProcessed: (result.companiesTotal ?? 0) + (result.devicesTotal ?? 0),
      recordsCreated:   result.created ?? (result.clientsCreated ?? 0) + (result.machinesCreated ?? 0),
    })

    return new Response(JSON.stringify({ ok: true, mode, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${FUNCTION_NAME}]`, msg)
    await updateHealth(db, FUNCTION_NAME, false, msg).catch(() => {})
    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   '/v3/companies + /v3/devices',
      status:           'error',
      recordsProcessed: 0,
      recordsCreated:   0,
      errorMessage:     msg,
    }).catch(() => {})

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
