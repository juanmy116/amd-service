import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'

// CANDADO DE RESOLUCIÓN — trigger `trg_guard_incident_resolution` sobre `incidents`.
//
// La aplicación ya exige informe (técnico) o motivo + explicación (oficina) en las cinco
// puertas. Esto prueba la red de debajo: que ni `service_role` —que ignora la RLS y es lo que
// usan las Server Actions, las Edge Functions y cualquier script— pueda archivar una avería
// viva sin decir cómo se resolvió.
//
// Plan: docs/plan-cierre-averias-2026-09-18.md (PR-4 de 4)

const admin = adminClient()

const SERIE = 'TEST-GRD1'

/** Crea una avería VIVA y devuelve su id. Cada prueba parte de una suya. */
async function freshIncident(numero: string, status = 'nouveau'): Promise<string> {
  const { data, error } = await admin
    .from('incidents')
    .insert({ numero_incident: numero, title: 'Guard test', machine_id: SERIE, status })
    .select('id')
    .single()
  if (error) throw new Error(`seed incident ${numero}: ${error.message}`)
  return data!.id as string
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  const { error } = await admin
    .from('machines')
    .insert({ numero_serie: SERIE, marque: 'TESTGRD', modele: 'G1' })
  if (error) throw new Error(`seed machine: ${error.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('candado de resolución — lo que el trigger RECHAZA', () => {
  it('no se puede pasar a «résolu» sin decir cómo se resolvió', async () => {
    const id = await freshIncident('TEST-GRD-A')
    const { error } = await admin.from('incidents').update({ status: 'résolu' }).eq('id', id)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('sans trace')
  })

  it('tampoco archivando directamente en «fermé» — el atajo barato', async () => {
    // Sin esto, «Fermé» sería la salida cómoda justo porque «Résolu» hace preguntas.
    const id = await freshIncident('TEST-GRD-B')
    const { error } = await admin.from('incidents').update({ status: 'fermé' }).eq('id', id)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('sans trace')
  })

  it('una intervención sin informe no cuela', async () => {
    const id = await freshIncident('TEST-GRD-C')
    const { error } = await admin
      .from('incidents')
      .update({ status: 'résolu', resolved_via: 'intervention' })
      .eq('id', id)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('rapport')
  })

  it('una resolución de oficina sin motivo ni explicación tampoco', async () => {
    const id = await freshIncident('TEST-GRD-D')
    const { error } = await admin
      .from('incidents')
      .update({ status: 'fermé', resolved_via: 'bureau' })
      .eq('id', id)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('motif')
  })

  it('no se le puede QUITAR el rastro a una avería que sigue resuelta', async () => {
    // Sin esta regla el candado solo valdría «de un solo movimiento»: dos UPDATE seguidos
    // —uno en regla y otro borrando la vía— dejaban la avería como si nunca hubiera tenido
    // rastro, indistinguible de una histórica.
    const id = await freshIncident('TEST-GRD-K', 'en_cours')
    const { error: resolveErr } = await admin
      .from('incidents')
      .update({
        status: 'fermé',
        resolved_via: 'bureau',
        resolution_reason: 'telephone',
        resolution_note: 'Réglé au téléphone avec le client.',
      })
      .eq('id', id)
    expect(resolveErr).toBeNull()

    const { error } = await admin
      .from('incidents')
      .update({ resolved_via: null, resolution_reason: null, resolution_note: null })
      .eq('id', id)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('effacer la trace')
  })

  it('ni creando la avería ya resuelta de un INSERT', async () => {
    // El camino que usaría un importador o un script: nacer resuelta, sin pasar por ninguna puerta.
    const { error } = await admin.from('incidents').insert({
      numero_incident: 'TEST-GRD-E',
      title: 'Née résolue',
      machine_id: SERIE,
      status: 'résolu',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('sans trace')
  })
})

describe('candado de resolución — lo que el trigger DEJA pasar', () => {
  it('una intervención con su informe', async () => {
    const id = await freshIncident('TEST-GRD-F', 'en_cours')
    const { error } = await admin
      .from('incidents')
      .update({
        status: 'résolu',
        resolved_via: 'intervention',
        rapport_intervention: 'Remplacement du tambour.',
        resolution_note: 'Remplacement du tambour.',
      })
      .eq('id', id)
    expect(error).toBeNull()
  })

  it('una resolución de oficina con motivo y explicación', async () => {
    const id = await freshIncident('TEST-GRD-G', 'assigné')
    const { error } = await admin
      .from('incidents')
      .update({
        status: 'fermé',
        resolved_via: 'bureau',
        resolution_reason: 'fausse_alerte',
        resolution_note: 'Alerte Princity sur une machine qui imprime normalement.',
      })
      .eq('id', id)
    expect(error).toBeNull()
  })

  it('el cierre automático tras la encuesta: de «résolu» a «fermé»', async () => {
    // `csat.server.ts` hace exactamente esto cuando el email sale. No puede tropezar con el candado.
    const id = await freshIncident('TEST-GRD-H', 'en_cours')
    // El montaje se comprueba: si un día dejara de pasar, la aserción de abajo se cumpliría
    // sobre cero filas y el test seguiría verde con el candado roto.
    const { error: setupErr } = await admin
      .from('incidents')
      .update({
        status: 'résolu',
        resolved_via: 'intervention',
        rapport_intervention: 'Bourrage papier dégagé.',
        resolution_note: 'Bourrage papier dégagé.',
      })
      .eq('id', id)
    expect(setupErr).toBeNull()

    const { error } = await admin
      .from('incidents')
      .update({ status: 'fermé', closed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'résolu')
    expect(error).toBeNull()
  })

  it('una avería ya resuelta se puede seguir editando y archivando', async () => {
    // El candado no puede congelar el registro: corregir una errata en el título de una
    // resuelta, o archivarla, siguen siendo operaciones normales.
    //
    // Las averías REALMENTE históricas (anteriores al verrou: `résolu`/`fermé` con
    // `resolved_via` nulo) ya no se pueden fabricar desde aquí — el INSERT sin rastro está
    // prohibido y quitarlo después también. Su caso lo cubre la rama «OLD.status no estaba
    // vivo» del trigger, y en producción son 2 filas de 2026.
    const id = await freshIncident('TEST-GRD-I', 'en_cours')

    const { error: resolveErr } = await admin
      .from('incidents')
      .update({
        status: 'résolu',
        resolved_via: 'intervention',
        rapport_intervention: 'Ancien rapport.',
        resolution_note: 'Ancien rapport.',
      })
      .eq('id', id)
    expect(resolveErr).toBeNull()

    const { error: editErr } = await admin
      .from('incidents')
      .update({ title: 'Titre corrigé' })
      .eq('id', id)
    expect(editErr).toBeNull()

    const { error: closeErr } = await admin
      .from('incidents')
      .update({ status: 'fermé' })
      .eq('id', id)
    expect(closeErr).toBeNull()
  })

  it('reabrir no pide nada: lo pedirá la próxima resolución', async () => {
    const id = await freshIncident('TEST-GRD-J', 'en_cours')
    const { error: setupErr } = await admin
      .from('incidents')
      .update({
        status: 'résolu',
        resolved_via: 'intervention',
        rapport_intervention: 'Première visite.',
        resolution_note: 'Première visite.',
      })
      .eq('id', id)
    expect(setupErr).toBeNull()

    const { error } = await admin
      .from('incidents')
      .update({
        status: 'en_cours',
        resolved_via: null,
        resolution_note: null,
        rapport_intervention: null,
        qr_verified: false,
      })
      .eq('id', id)
    expect(error).toBeNull()
  })
})
