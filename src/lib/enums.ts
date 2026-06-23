export const INCIDENT_CATEGORIES = ['panne', 'maintenance', 'consommable', 'autre'] as const
export const INCIDENT_PRIORITIES = ['basse', 'normale', 'haute', 'urgente'] as const
export const INCIDENT_STATUSES   = ['nouveau', 'assigné', 'en_cours', 'résolu', 'fermé'] as const
export const CONTRACT_STATUSES   = ['actif', 'suspendu', 'terminé'] as const
export const MACHINE_TYPES       = ['color', 'noir_blanc'] as const
export const STAFF_ROLES         = ['admin', 'technician'] as const
export const MAINTENANCE_FREQUENCIES    = ['mensuel', 'trimestriel'] as const
export const VISIT_STATUSES             = ['planifié', 'en_retard', 'fait'] as const
export const CONTRACT_MACHINE_STATUSES  = ['actif', 'suspendu', 'terminé'] as const

export type MachineType             = typeof MACHINE_TYPES[number]
export type MaintenanceFrequency    = typeof MAINTENANCE_FREQUENCIES[number]
export type ContractMachineStatus   = typeof CONTRACT_MACHINE_STATUSES[number]

// Etiqueta larga del tipo de máquina (formularios, etiquetas, fiches).
// Los badges compactos usan "N&B" aparte, a propósito.
export function machineTypeLabel(type: string | null | undefined): string {
  return type === 'color' ? 'Couleur' : 'Noir & Blanc'
}

export function parseEnum<T extends string>(
  value: FormDataEntryValue | null | undefined,
  allowed: readonly T[],
): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}
