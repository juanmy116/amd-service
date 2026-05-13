import { getPrincityClient }                      from '../_shared/princity-client.ts'
import { getAdminClient, updateHealth, writeLog } from '../_shared/db.ts'
import { notifyAdmin }                            from '../_shared/notify.ts'

const FUNCTION_NAME = 'princity-sync'

interface V1Contract {
  prefix:           string
  location:         { name: string; street?: string; city?: string; postalCode?: string; phone?: string | null; email?: string | null; active?: boolean }
  timezone?:        string
  taxNumber?:       string | null
  settlementMethod?: string
}

interface V1Device {
  id:           string
  serial?:      string
  mac?:         string
  hostname?:    string
  sysName?:     string
  sysLocation?: string
  hrDeviceDescr?: string
  deviceModel?: { name?: string; manufacturer?: string; color?: boolean }
  deviceStatus?: string
}

async function fetchAllDevices(princity: ReturnType<typeof getPrincityClient>, contracts: V1Contract[]) {
  // Paralelizar en lotes de 10 para no saturar
  const batchSize = 10
  const allDevices: Array<V1Device & { contractPrefix: string; companyName: string }> = []

  for (let i = 0; i < contracts.length; i += batchSize) {
    const batch = contracts.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(c =>
        princity.getV1<V1Device[]>('/v1/devices', { contract: c.prefix })
          .then(devices => devices.map(d => ({ ...d, contractPrefix: c.prefix, companyName: c.location.name })))
          .catch(err => {
            console.error(`[princity-sync] devices fetch error for contract ${c.prefix}:`, err.message)
            return []
          })
      )
    )
    for (const list of results) allDevices.push(...list)
  }

  return allDevices
}

async function runInitialImport(
  db: ReturnType<typeof getAdminClient>,
  princity: ReturnType<typeof getPrincityClient>
) {
  // 1. Borrar datos existentes en orden FK
  const { error: wipeErr } = await db.rpc('wipe_data_tables')
  if (wipeErr) throw new Error(`WIPE_FAILED: ${wipeErr.message}`)

  // 2. Obtener contratos (= clientes en Princity)
  const contracts = await princity.getV1<V1Contract[]>('/v1/contracts')

  // 3. Insertar clientes
  let clientsCreated = 0
  let clientsFailed  = 0
  for (const c of contracts) {
    const { error } = await db.from('clients').insert({
      nom_client:          c.location.name,
      princity_company_id: c.prefix,
      princity_prefix:     c.prefix,
      adresse:             c.location.street ?? null,
      ville:               c.location.city ?? null,
      telephone:           c.location.phone ?? null,
      email:               c.location.email ?? null,
      ninea:               c.taxNumber ?? null,
      active:              c.location.active ?? true,
    })
    if (error) {
      console.error(`[princity-sync] client insert error (${c.prefix} ${c.location.name}):`, error.message)
      clientsFailed++
    } else {
      clientsCreated++
    }
  }

  // 4. Obtener todos los equipos (paralelo en lotes)
  const devices = await fetchAllDevices(princity, contracts)

  // 5. Insertar equipos
  let machinesCreated = 0
  let machinesFailed  = 0
  for (const d of devices) {
    const serie = String(d.serial ?? '').trim()
    if (!serie) continue

    const isColor = d.deviceModel?.color === true

    const { error } = await db.from('machines').insert({
      numero_serie:       serie,
      marque:             d.deviceModel?.manufacturer ?? 'Ricoh',
      modele:             d.deviceModel?.name ?? '',
      type:               isColor ? 'color' : 'noir_blanc',
      princity_device_id: d.id,
      princity_pending:   true,
      active:             d.deviceStatus === 'ACTIVE',
    })
    if (error) {
      console.error(`[princity-sync] machine insert error (${d.id} ${serie}):`, error.message)
      machinesFailed++
    } else {
      machinesCreated++
    }
  }

  return {
    clientsCreated,
    machinesCreated,
    companiesTotal: contracts.length,
    devicesTotal:   devices.length,
  }
}

async function runNormalSync(
  db: ReturnType<typeof getAdminClient>,
  princity: ReturnType<typeof getPrincityClient>
) {
  let created = 0

  // 1. Contratos
  const contracts = await princity.getV1<V1Contract[]>('/v1/contracts')

  for (const c of contracts) {
    const { data: existing } = await db.from('clients')
      .select('id').eq('princity_company_id', c.prefix).maybeSingle()

    if (!existing) {
      await db.from('clients').insert({
        nom_client:          c.location.name,
        princity_company_id: c.prefix,
        princity_prefix:     c.prefix,
        adresse:             c.location.street ?? null,
        ville:               c.location.city ?? null,
        telephone:           c.location.phone ?? null,
        email:               c.location.email ?? null,
        ninea:               c.taxNumber ?? null,
        active:              c.location.active ?? true,
      })
      await notifyAdmin(
        `🆕 NOUVEAU CLIENT PRINCITY\nEntreprise: ${c.location.name}\nID Princity: ${c.prefix}\n→ À lier manuellement: /admin/clients`
      )
      created++
    }
  }

  // 2. Equipos
  const devices = await fetchAllDevices(princity, contracts)

  for (const d of devices) {
    const serie = String(d.serial ?? '').trim()
    if (!serie) continue

    const isColor = d.deviceModel?.color === true

    const { data: existing } = await db.from('machines')
      .select('numero_serie, princity_device_id').eq('numero_serie', serie).maybeSingle()

    if (!existing) {
      await db.from('machines').insert({
        numero_serie:       serie,
        marque:             d.deviceModel?.manufacturer ?? 'Ricoh',
        modele:             d.deviceModel?.name ?? '',
        type:               isColor ? 'color' : 'noir_blanc',
        princity_device_id: d.id,
        princity_pending:   true,
        active:             d.deviceStatus === 'ACTIVE',
      })
      await notifyAdmin(
        `🆕 NOUVEL ÉQUIPEMENT PRINCITY\nSérie: ${serie}\nModèle: ${d.deviceModel?.name ?? '—'}\nEntreprise: ${d.companyName}\n→ Créer contrat: /admin/contracts`
      )
      created++
    } else if (!existing.princity_device_id) {
      await db.from('machines').update({ princity_device_id: d.id })
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
      endpointCalled:   '/v1/contracts + /v1/devices',
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
      endpointCalled:   '/v1/contracts + /v1/devices',
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
