// Estructura que el LLM devuelve (tool_use) y que consume process_counter_extraction.
export interface CounterExtraction {
  is_valid_counter_sheet: boolean
  serial: string
  date_iso: string            // ISO 8601, p.ej. 2026-06-10T14:35:00
  counter_bw: number          // total B&N
  counter_color: number       // total color (0 si la máquina es noir_blanc)
  copier_bw?: number          // sub-campos Ricoh (para validación cruzada); ausentes en otras marcas
  printer_bw?: number
  copier_color?: number
  printer_color?: number
  confidence: number          // 0..1
  issues: string[]            // SOLO problemas reales detectados por el modelo
}
