'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import {
  parseMachinesCsv,
  type CsvMachineRow,
  type CsvParseError,
} from '@/lib/csv-import'

const MAX_CSV_BYTES = 1024 * 1024 // 1 MB

export type PreviewState = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
  duplicatesInDb: string[]
  unknownClients: string[]
  ok: boolean
  fatalError: string | null
}

export type ImportResult = {
  inserted: number
  skipped: number
  error: string | null
}

const EMPTY_PREVIEW: PreviewState = {
  rows: [],
  errors: [],
  missingColumns: [],
  duplicatesInDb: [],
  unknownClients: [],
  ok: false,
  fatalError: null,
}

async function buildPreview(file: File): Promise<PreviewState> {
  const { supabase } = await requireAdmin()

  if (file.size === 0) {
    return { ...EMPTY_PREVIEW, fatalError: 'Le fichier est vide.' }
  }
  if (file.size > MAX_CSV_BYTES) {
    return { ...EMPTY_PREVIEW, fatalError: `Fichier trop volumineux (max ${MAX_CSV_BYTES / 1024} KB).` }
  }

  const content = await file.text()
  const { rows, errors, missingColumns } = parseMachinesCsv(content)

  if (missingColumns.length > 0) {
    return { ...EMPTY_PREVIEW, missingColumns }
  }
  if (rows.length === 0 && errors.length === 0) {
    return { ...EMPTY_PREVIEW, fatalError: 'Aucune ligne détectée dans le fichier.' }
  }

  const series = rows.map((r) => r.numero_serie)
  let duplicatesInDb: string[] = []
  if (series.length > 0) {
    const { data: existing } = await supabase
      .from('machines')
      .select('numero_serie')
      .in('numero_serie', series)
    duplicatesInDb = (existing ?? []).map((m: { numero_serie: string }) => m.numero_serie)
  }

  const clientNames = [...new Set(
    rows.map((r) => r.nom_client).filter((c): c is string => c !== null)
  )]
  let unknownClients: string[] = []
  if (clientNames.length > 0) {
    const { data: known } = await supabase
      .from('clients')
      .select('nom_client')
      .in('nom_client', clientNames)
    const knownSet = new Set((known ?? []).map((c: { nom_client: string }) => c.nom_client))
    unknownClients = clientNames.filter((c) => !knownSet.has(c))
  }

  const insertable = rows.filter((r) => !duplicatesInDb.includes(r.numero_serie))
  // Permitir importar las filas válidas aunque haya errores en otras filas: el admin
  // ya ve los errores en la preview y decide si vale la pena seguir.
  const ok = insertable.length > 0

  return { rows, errors, missingColumns: [], duplicatesInDb, unknownClients, ok, fatalError: null }
}

export async function previewCsvAction(
  _prev: PreviewState | null,
  formData: FormData
): Promise<PreviewState> {
  const file = formData.get('csv')
  if (!(file instanceof File)) {
    return { ...EMPTY_PREVIEW, fatalError: 'Aucun fichier reçu.' }
  }
  return buildPreview(file)
}

export async function importCsvAction(formData: FormData): Promise<ImportResult> {
  const { supabase } = await requireAdmin()

  const file = formData.get('csv')
  if (!(file instanceof File)) {
    return { inserted: 0, skipped: 0, error: 'Aucun fichier reçu.' }
  }

  const preview = await buildPreview(file)
  if (!preview.ok) {
    return { inserted: 0, skipped: 0, error: preview.fatalError ?? 'Aperçu invalide; import annulé.' }
  }

  const skipSerials = new Set(preview.duplicatesInDb)
  const toInsert = preview.rows.filter((r) => !skipSerials.has(r.numero_serie))

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: preview.duplicatesInDb.length, error: null }
  }

  const records = toInsert.map((r) => ({
    numero_serie: r.numero_serie,
    marque: r.marque,
    modele: r.modele,
    type: r.type,
    localisation: r.localisation,
    active: true,
    princity_device_id: null,
    princity_pending: false,
  }))

  const { error } = await supabase.from('machines').insert(records)
  if (error) {
    return { inserted: 0, skipped: 0, error: `Erreur d'insertion: ${error.message}` }
  }

  revalidatePath('/admin/machines')
  return { inserted: records.length, skipped: preview.duplicatesInDb.length, error: null }
}
