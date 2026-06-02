'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import {
  parseMachinesCsv,
  type CsvMachineRow,
  type CsvParseError,
} from '@/lib/csv-import'

const MAX_CSV_BYTES = 1024 * 1024 // 1 MB
const IN_CHUNK_SIZE = 200

type AdminSupabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

export type PreviewState = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
  duplicatesInDb: string[]
  insertableCount: number
  truncated: boolean
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
  insertableCount: 0,
  truncated: false,
  ok: false,
  fatalError: null,
}

// Threshold of suspicious characters (replacement / non-printable) before we declare
// the upload binary. Real CSVs are ≥99% printable text; a JPEG/PDF/ZIP is ≥30%.
const BINARY_RATIO_THRESHOLD = 0.05

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 2048)
  if (sample.length === 0) return false
  let suspicious = 0
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    // U+FFFD replacement char + non-whitespace control range.
    if (
      code === 0xfffd ||
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
    ) {
      suspicious++
    }
  }
  return suspicious / sample.length > BINARY_RATIO_THRESHOLD
}

async function decodeCsv(file: File): Promise<{ text: string | null; error: string | null }> {
  const buf = await file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // French Excel exports default to Windows-1252; fall back rather than refuse.
    text = new TextDecoder('windows-1252').decode(buf)
  }
  if (looksBinary(text)) {
    return { text: null, error: 'Le fichier ne semble pas être un CSV (contenu binaire détecté).' }
  }
  return { text, error: null }
}

async function findExistingSerials(
  supabase: AdminSupabase,
  series: string[]
): Promise<{ existing: string[]; error: string | null }> {
  const existing: string[] = []
  for (let i = 0; i < series.length; i += IN_CHUNK_SIZE) {
    const chunk = series.slice(i, i + IN_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('machines')
      .select('numero_serie')
      .in('numero_serie', chunk)
    if (error) {
      return { existing: [], error: error.message }
    }
    for (const row of data ?? []) {
      existing.push(row.numero_serie)
    }
  }
  return { existing, error: null }
}

async function buildPreview(supabase: AdminSupabase, file: File): Promise<PreviewState> {
  if (file.size === 0) {
    return { ...EMPTY_PREVIEW, fatalError: 'Le fichier est vide.' }
  }
  if (file.size > MAX_CSV_BYTES) {
    return {
      ...EMPTY_PREVIEW,
      fatalError: `Fichier trop volumineux (max ${MAX_CSV_BYTES / (1024 * 1024)} Mo).`,
    }
  }

  const decoded = await decodeCsv(file)
  if (decoded.error) {
    return { ...EMPTY_PREVIEW, fatalError: decoded.error }
  }
  const { rows, errors, missingColumns, truncated } = parseMachinesCsv(decoded.text!)

  if (missingColumns.length > 0) {
    return { ...EMPTY_PREVIEW, missingColumns }
  }
  if (rows.length === 0 && errors.length === 0) {
    return { ...EMPTY_PREVIEW, fatalError: 'Aucune ligne valide détectée.' }
  }

  let duplicatesInDb: string[] = []
  if (rows.length > 0) {
    const lookup = await findExistingSerials(supabase, rows.map((r) => r.numero_serie))
    if (lookup.error) {
      console.error('[machines/import] duplicate lookup failed:', lookup.error)
      return {
        ...EMPTY_PREVIEW,
        fatalError: 'Impossible de vérifier les doublons en base. Réessayez plus tard.',
      }
    }
    duplicatesInDb = lookup.existing
  }

  const dupSet = new Set(duplicatesInDb)
  const insertableCount = rows.reduce(
    (acc, r) => (dupSet.has(r.numero_serie) ? acc : acc + 1),
    0
  )

  return {
    rows,
    errors,
    missingColumns: [],
    duplicatesInDb,
    insertableCount,
    truncated,
    ok: insertableCount > 0,
    fatalError: null,
  }
}

export async function previewCsvAction(
  _prev: PreviewState | null,
  formData: FormData
): Promise<PreviewState> {
  const { supabase } = await requireAdmin()

  const file = formData.get('csv')
  if (!(file instanceof File)) {
    return { ...EMPTY_PREVIEW, fatalError: 'Aucun fichier reçu.' }
  }
  return buildPreview(supabase, file)
}

export async function importCsvAction(formData: FormData): Promise<ImportResult> {
  const { supabase } = await requireAdmin()

  const file = formData.get('csv')
  if (!(file instanceof File)) {
    return { inserted: 0, skipped: 0, error: 'Aucun fichier reçu.' }
  }

  const preview = await buildPreview(supabase, file)
  if (preview.fatalError) {
    return { inserted: 0, skipped: 0, error: preview.fatalError }
  }
  if (preview.insertableCount === 0) {
    return { inserted: 0, skipped: preview.duplicatesInDb.length, error: null }
  }

  const dupSet = new Set(preview.duplicatesInDb)
  const records = preview.rows
    .filter((r) => !dupSet.has(r.numero_serie))
    .map((r) => ({
      numero_serie: r.numero_serie,
      marque: r.marque,
      modele: r.modele,
      type: r.type,
      localisation: r.localisation,
      active: true,
      princity_device_id: null,
      princity_pending: false,
    }))

  // Idempotent: a race-condition duplicate (another admin or Princity sync inserting
  // the same serial between preview and import) is silently ignored rather than
  // failing the whole batch.
  const { data: insertedRows, error } = await supabase
    .from('machines')
    .upsert(records, { onConflict: 'numero_serie', ignoreDuplicates: true })
    .select('numero_serie')

  if (error) {
    console.error('[machines/import] insert failed:', error)
    return {
      inserted: 0,
      skipped: 0,
      error: "Erreur lors de l'enregistrement en base. Vérifiez les logs.",
    }
  }

  const inserted = insertedRows?.length ?? 0
  const skipped = preview.duplicatesInDb.length + (records.length - inserted)

  revalidatePath('/admin')
  revalidatePath('/admin/machines')
  revalidatePath('/admin/contadores')

  return { inserted, skipped, error: null }
}
