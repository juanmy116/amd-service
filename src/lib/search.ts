const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 80
// Strip control chars (incl. tab, newline), DEL, double quotes, backslash and semicolon.
// Backslash is stripped because escapeIlike() reintroduces it as the ILIKE escape char.
const STRIP_RE = /[\x00-\x1F\x7F"\\;]/g

export function sanitizeSearchQuery(input: string | string[] | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input
    .replace(STRIP_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
  if (cleaned.length < MIN_QUERY_LENGTH) return null
  return cleaned
}

export function escapeIlike(input: string): string {
  return input.replace(/[%_]/g, (c) => `\\${c}`)
}

export function buildIlikePattern(query: string): string {
  return `%${escapeIlike(query)}%`
}

export function buildSafeOr(columns: readonly string[], query: string): string {
  const pattern = buildIlikePattern(query)
  return columns.map((col) => `${col}.ilike."${pattern}"`).join(',')
}

export function parseBooleanParam(value: string | string[] | null | undefined): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export function firstParam(value: string | string[] | null | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

export function parsePositiveIntParam(value: string | string[] | null | undefined): number | null {
  const str = firstParam(value)
  if (str === null) return null
  if (!/^[0-9]{1,15}$/.test(str)) return null
  const n = Number(str)
  return Number.isInteger(n) && n > 0 ? n : null
}
