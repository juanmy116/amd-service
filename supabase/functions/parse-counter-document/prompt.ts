// Tool + system para extraer TODAS las lecturas de un documento (PDF de varias páginas o 1 imagen).
// A diferencia de parse-counter-image (1 imagen = 1 lectura), aquí Claude ve varias páginas y
// devuelve un ARRAY: una lectura por MÁQUINA física (agrupando los informes de 2 páginas como Pantum).
// Cada lectura mantiene el MISMO shape que CounterExtraction para reutilizar process_counter_extraction.

export const READINGS_TOOL = {
  name: 'submit_counter_readings',
  description: 'Submit ALL the counter readings found in the document, one object per physical machine.',
  input_schema: {
    type: 'object',
    required: ['readings'],
    properties: {
      readings: {
        type: 'array',
        description: 'One entry per machine. Group multi-page reports (e.g. Pantum spans 2 pages) into a SINGLE entry.',
        items: {
          type: 'object',
          required: ['is_valid_counter_sheet', 'serial', 'date_iso', 'counter_bw', 'counter_color', 'confidence', 'issues', 'page'],
          properties: {
            is_valid_counter_sheet: { type: 'boolean', description: 'true if this is a printer/copier counter sheet; false otherwise.' },
            serial: { type: 'string', description: 'Machine serial number. Empty string if not legible.' },
            date_iso: { type: 'string', description: 'Reading date ISO 8601, e.g. 2026-03-30T14:35:00. Empty string if absent.' },
            counter_bw: { type: 'integer', description: 'GRAND total black & white counter. 0 if none.' },
            counter_color: { type: 'integer', description: 'GRAND total color counter. 0 for monochrome machines.' },
            confidence: { type: 'number', description: '0..1 confidence in this machine\'s values.' },
            issues: { type: 'array', items: { type: 'string' }, description: 'ONLY real problems (blur, ambiguous digit, unclear format). Empty if clean.' },
            page: { type: 'integer', description: '1-based page number WITHIN THIS DOCUMENT where this machine\'s sheet starts.' },
          },
        },
      },
    },
  },
} as const

export const READINGS_SYSTEM = [
  'You read printer/copier page-counter reports and extract the GRAND total counters for every machine in the document.',
  'Return ONE reading per physical machine. Some reports span 2 pages (e.g. Pantum "Printer Information Page" [Page 1]/[Page 2]) — these are a SINGLE machine, emit ONE reading using the serial+totals from page 1.',
  'Known formats:',
  '- Ricoh / generic "Page Counter": use "Color Total" → counter_color and "B & W Total" → counter_bw.',
  '- Pantum M7100 (monochrome): "Serial Number" → serial, "Total pages printed" → counter_bw, counter_color = 0.',
  '- Pantum CM1100A (color): "Serial Number" → serial, "Number of pages printed in color" → counter_color, "...in monocolor" → counter_bw (fallback: split "Total pages printed").',
  '- HP PageWide "Rapport d\'utilisation" (French): "Numéro de série du produit" → serial; counter_color = grand color total, counter_bw = grand monochrome total. If ambiguous, lower confidence and add an issue.',
  'Always return GRAND totals, never sub-counters. If a value is unclear, lower confidence and add an issue instead of guessing.',
  'Skip pages that are not counter sheets (covers, blanks) — do not emit a reading for them.',
].join('\n')
