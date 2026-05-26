import Papa from 'papaparse'
import { MACHINE_TYPES, type MachineType } from '@/lib/enums'

export const REQUIRED_COLUMNS = ['numero_serie', 'marque', 'modele', 'type'] as const
export const OPTIONAL_COLUMNS = ['nom_client', 'localisation'] as const
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const

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
  nom_client: string | null
  localisation: string | null
}

export type CsvParseResult = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
}

const MAX_FIELD_LEN = 200

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

function trimOrEmpty(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.trim()
}

export function parseMachinesCsv(content: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = parsed.meta.fields ?? []
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  if (missingColumns.length > 0) {
    return { rows: [], errors: [], missingColumns }
  }

  const errors: CsvParseError[] = []
  const rows: CsvMachineRow[] = []
  const seenSeries = new Set<string>()

  parsed.data.forEach((raw, idx) => {
    const rowNum = idx + 1
    const numero_serie = trimOrEmpty(raw.numero_serie)
    const marque = trimOrEmpty(raw.marque)
    const modele = trimOrEmpty(raw.modele)
    const typeRaw = trimOrEmpty(raw.type).toLowerCase()
    const nom_client = trimOrNull(raw.nom_client)
    const localisation = trimOrNull(raw.localisation)

    if (!numero_serie) {
      errors.push({ row: rowNum, field: 'numero_serie', message: 'Valeur manquante' })
      return
    }
    if (numero_serie.length > MAX_FIELD_LEN) {
      errors.push({ row: rowNum, field: 'numero_serie', message: `Trop long (max ${MAX_FIELD_LEN})` })
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
    if (!modele) {
      errors.push({ row: rowNum, field: 'modele', message: 'Valeur manquante' })
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

    rows.push({
      numero_serie,
      marque,
      modele,
      type: typeRaw as MachineType,
      nom_client,
      localisation,
    })
  })

  return { rows, errors, missingColumns: [] }
}
