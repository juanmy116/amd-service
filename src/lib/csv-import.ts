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

// Control chars (incl. tab/newline), DEL, zero-width range and BOM. NBSP and other
// unicode spaces collapse via \s+ in the next pass.
const STRIP_INVISIBLE_RE = new RegExp('[\\x00-\\x1F\\x7F\\u200B-\\u200D\\uFEFF]', 'g')

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

  // Surface papaparse-level errors (mismatched quotes, field-count drift) so the admin
  // sees the real cause instead of confusing "Valeur manquante" downstream.
  for (const err of parsed.errors) {
    if (err.type === 'Delimiter' && err.code === 'UndetectableDelimiter') continue
    const row = typeof err.row === 'number' ? err.row + 2 : 0
    errors.push({ row, message: `Erreur de format CSV: ${err.message}` })
  }

  const rows: CsvMachineRow[] = []
  const seenSeries = new Set<string>()

  // +2 because: papaparse with header:true strips the header row, and Excel rows are 1-indexed.
  // idx 0 → file line 2.
  parsed.data.forEach((raw, idx) => {
    if (rows.length >= MAX_ROWS) return
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

  const truncated = parsed.data.length > MAX_ROWS

  return { rows, errors, missingColumns: [], truncated }
}
