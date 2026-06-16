/**
 * Lógica de detección de anomalías de consumo (Fase 3 del historial de piezas).
 *
 * Funciones PURAS y testeables: dado el consumo de una pieza y su rendimiento
 * esperado, deciden si hay anomalía y con qué semáforo. El "cómo" (leer datos,
 * persistir en machine_anomalies) vive en la server action; aquí solo el "qué es
 * anómalo", para poder validarlo con vitest sin base de datos.
 *
 * Spec: docs/superpowers/specs/2026-06-15-historial-piezas-anomalias-design.md (Fase 3).
 */

export type AnomalyLight = 'amber' | 'red'
export type AnomalyType = 'consumo_alto_sin_cambio'

export type YieldSource = 'fabricant' | 'historique' | null

/** Mínimo de muestras para fiarse de un rendimiento APRENDIDO del histórico. */
export const MIN_HISTORICAL_SAMPLES = 3
/** A partir de este % del rendimiento esperado avisamos en ámbar (acercándose). */
export const AMBER_RATIO = 0.8

export type ConsumptionInput = {
  /** Copias (total bw+color) acumuladas desde el último cambio de la pieza. */
  copiesSinceChange: number
  /** Rendimiento esperado en copias_total (ficha o baseline). null = desconocido. */
  expectedYield: number | null
  /** Origen del rendimiento esperado. */
  source: YieldSource
  /** Nº de muestras del baseline aprendido (irrelevante si source='fabricant'). */
  samples: number | null
}

export type AnomalyEvaluation = {
  type: AnomalyType
  light: AnomalyLight
  /** Texto legible en francés para la cola de revisión. */
  reason: string
  ratio: number
}

/**
 * Regla "consumo_alto_sin_cambio" (preventivo): si las copias desde el último
 * cambio de una pieza se acercan o superan su rendimiento esperado, conviene
 * revisarla/cambiarla. Devuelve null si no hay señal o no hay referencia fiable.
 */
export function evaluateConsumption(input: ConsumptionInput): AnomalyEvaluation | null {
  const { copiesSinceChange, expectedYield, source, samples } = input

  // Sin referencia de rendimiento no se puede juzgar.
  if (expectedYield == null || expectedYield <= 0) return null
  // Un baseline aprendido con pocas muestras no es fiable todavía.
  if (source === 'historique' && (samples ?? 0) < MIN_HISTORICAL_SAMPLES) return null
  // Consumo no positivo (datos incompletos): nada que reportar.
  if (copiesSinceChange <= 0) return null

  const ratio = copiesSinceChange / expectedYield
  const pct = Math.round(ratio * 100)

  if (ratio >= 1) {
    return {
      type: 'consumo_alto_sin_cambio',
      light: 'red',
      reason: `Consommation à ${pct}% du rendement attendu (${copiesSinceChange.toLocaleString('fr-FR')} copies depuis le dernier changement, attendu ~${expectedYield.toLocaleString('fr-FR')}). Remplacement recommandé.`,
      ratio,
    }
  }
  if (ratio >= AMBER_RATIO) {
    return {
      type: 'consumo_alto_sin_cambio',
      light: 'amber',
      reason: `Consommation à ${pct}% du rendement attendu (${copiesSinceChange.toLocaleString('fr-FR')} copies depuis le dernier changement). Fin de vie utile proche.`,
      ratio,
    }
  }
  return null
}
