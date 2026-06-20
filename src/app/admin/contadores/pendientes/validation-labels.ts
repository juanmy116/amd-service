// Códigos de validación de process_counter_extraction → texto francés legible.
// El código crudo (V_*) se sigue guardando en pending_counter_imports.validation_errors;
// esto es solo la capa de presentación de la cola de revisión.

export const VALIDATION_LABELS: Record<string, string> = {
  V_NO_MATCH:      'Aucune machine correspondante',
  V_DUP_DAY:       'Relevé déjà existant pour ce jour',
  V_DUP_PENDING:   'Doublon : un autre relevé de cette machine (même jour) est déjà en attente',
  V_CONF:          'Lecture peu fiable (confiance faible)',
  V_RANGE_BW:      'Compteur N&B hors plage',
  V_RANGE_COLOR:   'Compteur couleur hors plage',
  V_YEAR:          'Année inhabituelle',
  V_MONTH:         'Mois invalide',
  V_CROSS_BW:      'Somme N&B (copie + impression) incohérente',
  V_CROSS_COLOR:   'Somme couleur (copie + impression) incohérente',
  V_NONDECR_BW:    'Compteur N&B inférieur au relevé précédent',
  V_NONDECR_COLOR: 'Compteur couleur inférieur au relevé précédent',
  V_DATE_INFERRED: 'Date déduite du lot (la feuille n’en imprime pas) — à vérifier',
}

// Códigos que señalan un posible duplicado (se resaltan de forma distinta en la UI).
export const DUPLICATE_CODES = new Set(['V_DUP_DAY', 'V_DUP_PENDING'])

export const labelFor = (code: string): string => VALIDATION_LABELS[code] ?? code
