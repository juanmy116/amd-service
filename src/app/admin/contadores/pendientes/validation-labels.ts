// Códigos de validación de process_counter_extraction → texto francés legible.
// El código crudo (V_*) se sigue guardando en pending_counter_imports.validation_errors;
// esto es solo la capa de presentación de la cola de revisión.

export const VALIDATION_LABELS: Record<string, string> = {
  V_NO_MATCH:      'Aucune machine correspondante',
  V_DUP_MONTH:     'Relevé déjà existant pour ce mois',
  V_DUP_PENDING:   'Doublon : un autre relevé de cette machine (même mois) est déjà en attente',
  V_CONF:          'Lecture peu fiable (confiance faible)',
  V_RANGE_BW:      'Compteur N&B hors plage',
  V_RANGE_COLOR:   'Compteur couleur hors plage',
  V_YEAR:          'Année inhabituelle',
  V_MONTH:         'Mois invalide',
  V_CROSS_BW:      'Somme N&B (copie + impression) incohérente',
  V_CROSS_COLOR:   'Somme couleur (copie + impression) incohérente',
  V_NONDECR_BW:    'Compteur N&B inférieur au relevé précédent',
  V_NONDECR_COLOR: 'Compteur couleur inférieur au relevé précédent',
}

// Códigos que señalan un posible duplicado (se resaltan de forma distinta en la UI).
export const DUPLICATE_CODES = new Set(['V_DUP_MONTH', 'V_DUP_PENDING'])

export const labelFor = (code: string): string => VALIDATION_LABELS[code] ?? code
