import Papa from 'papaparse'
import { MACHINE_TYPES, type MachineType } from '@/lib/enums'

export const REQUIRED_COLUMNS = ['numero_serie', 'marque', 'modele', 'type'] as const
export const OPTIONAL_COLUMNS = ['localisation'] as const
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const

export const MAX_FIELD_LEN = 200
export const MAX_ROWS = 2000

export type CsvParseError = {
  row: number
  field?: string
  message: string
}

export type CsvMachineRow = {
  numero_serie: string
  marque: string
  modele: string
  type: MachineType
  localisation: string | null
}

export type CsvParseResult = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
  truncated: boolean
}

// Non-whitespace invisible chars: control range (excluding TAB/LF/CR), DEL, zero-width,
// BOM. The control-whitespace chars (TAB/LF/CR) appear in RFC-4180 quoted cells and must
// be preserved as a space rather than dropped — `\s+` collapses them afterwards.
const STRIP_INVISIBLE_RE = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\u200B-\\u200D\\uFEFF]', 'g')

function normalizeString(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.replace(STRIP_INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
}

function normalizeOrNull(v: unknown): string | null {
  const s = normalizeString(v)
  return s.length === 0 ? null : s
}

function pushLengthError(errors: CsvParseError[], row: number, field: string): void {
  errors.push({ row, field, message: `Trop long (max ${MAX_FIELD_LEN} caractères)` })
}

export function parseMachinesCsv(content: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = parsed.meta.fields ?? []
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  if (missingColumns.length > 0) {
    return { rows: [], errors: [], missingColumns, truncated: false }
  }

  const errors: CsvParseError[] = []

  // Surface papaparse-level errors (mismatched quotes) so the admin sees the real cause.
  // FieldMismatch is intentionally skipped: those rows ALSO appear in parsed.data with
  // undefined fields and trigger the per-row "Valeur manquante" path, so reporting both
  // would double the noise. UndetectableDelimiter would just mean the file has 1 column,
  // which falls through to the missingColumns check.
  for (const err of parsed.errors) {
    if (err.type === 'FieldMismatch') continue
    if (err.type === 'Delimiter' && err.code === 'UndetectableDelimiter') continue
    const row = typeof err.row === 'number' ? err.row + 2 : null
    errors.push({ row: row ?? 0, message: `Erreur de format CSV: ${err.message}` })
  }

  const rows: CsvMachineRow[] = []
  const seenSeries = new Set<string>()
  let truncated = false

  // +2 because: papaparse with header:true strips the header row, and Excel rows are 1-indexed.
  // idx 0 → file line 2.
  parsed.data.forEach((raw, idx) => {
    if (rows.length >= MAX_ROWS) {
      truncated = true
      return
    }
    const rowNum = idx + 2

    const numero_serie = normalizeString(raw.numero_serie)
    const marque = normalizeString(raw.marque)
    const modele = normalizeString(raw.modele)
    const typeRaw = normalizeString(raw.type).toLowerCase()
    const localisation = normalizeOrNull(raw.localisation)

    if (!numero_serie) {
      errors.push({ row: rowNum, field: 'numero_serie', message: 'Valeur manquante' })
      return
    }
    if (numero_serie.length > MAX_FIELD_LEN) {
      pushLengthError(errors, rowNum, 'numero_serie')
      return
    }
    if (seenSeries.has(numero_serie)) {
      errors.push({ row: rowNum, field: 'numero_serie', message: 'Doublon dans le CSV' })
      return
    }
    seenSeries.add(numero_serie)

    if (!marque) {
      errors.push({ row: rowNum, field: 'marque', message: 'Valeur manquante' })
      return
    }
    if (marque.length > MAX_FIELD_LEN) {
      pushLengthError(errors, rowNum, 'marque')
      return
    }
    if (!modele) {
      errors.push({ row: rowNum, field: 'modele', message: 'Valeur manquante' })
      return
    }
    if (modele.length > MAX_FIELD_LEN) {
      pushLengthError(errors, rowNum, 'modele')
      return
    }
    if (!MACHINE_TYPES.includes(typeRaw as MachineType)) {
      errors.push({
        row: rowNum,
        field: 'type',
        message: `Doit être l'une de: ${MACHINE_TYPES.join(', ')}`,
      })
      return
    }
    if (localisation !== null && localisation.length > MAX_FIELD_LEN) {
      pushLengthError(errors, rowNum, 'localisation')
      return
    }

    rows.push({
      numero_serie,
      marque,
      modele,
      type: typeRaw as MachineType,
      localisation,
    })
  })

  return { rows, errors, missingColumns: [], truncated }
}
