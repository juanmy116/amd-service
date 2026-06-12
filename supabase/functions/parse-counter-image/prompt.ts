export const COUNTER_TOOL = {
  name: 'submit_counter_reading',
  description: 'Submit the structured counter reading extracted from the page.',
  input_schema: {
    type: 'object',
    required: ['is_valid_counter_sheet', 'serial', 'date_iso', 'counter_bw', 'counter_color', 'confidence', 'issues'],
    properties: {
      is_valid_counter_sheet: { type: 'boolean', description: 'true ONLY if the image is a printer/copier page-counter sheet (Ricoh, Pantum or similar). false for any other document, blank page, or unrelated image.' },
      serial: { type: 'string', description: 'The machine serial number printed on the sheet. Empty string if not legible.' },
      date_iso: { type: 'string', description: 'Reading date in ISO 8601, e.g. 2026-06-10T14:35:00. Use the date printed on the sheet.' },
      counter_bw: { type: 'integer', description: 'Total black & white counter (the grand B&W total). 0 if none.' },
      counter_color: { type: 'integer', description: 'Total color counter (the grand color total). 0 for monochrome machines.' },
      copier_bw: { type: 'integer', description: 'Ricoh only: Copier B&W sub-counter. Omit if not present.' },
      printer_bw: { type: 'integer', description: 'Ricoh only: Printer B&W sub-counter. Omit if not present.' },
      copier_color: { type: 'integer', description: 'Ricoh only: Copier Color sub-counter. Omit if not present.' },
      printer_color: { type: 'integer', description: 'Ricoh only: Printer Color sub-counter. Omit if not present.' },
      confidence: { type: 'number', description: '0..1 overall confidence in the extracted values.' },
      issues: { type: 'array', items: { type: 'string' }, description: 'ONLY actual problems (blur, glare, ambiguous digit). Empty array if clean. Do NOT log checks that passed.' },
    },
  },
} as const

export const COUNTER_SYSTEM = [
  'You read printer/copier page-counter sheets (Ricoh, Pantum and similar brands) and extract the counters.',
  'Always return the GRAND totals in counter_bw and counter_color.',
  'For Ricoh sheets that show Copier/Printer sub-totals, also return the sub-fields so the server can cross-check.',
  'For Pantum or brands without sub-totals, return only counter_bw/counter_color and omit the sub-fields.',
  'issues must contain ONLY real problems. If a value is clearly legible, do not mention it.',
  'If the image is not a counter sheet, set is_valid_counter_sheet=false and return zeros.',
].join(' ')
