export const INCIDENT_CATEGORIES = ['panne', 'maintenance', 'consommable', 'autre'] as const
export const INCIDENT_PRIORITIES = ['basse', 'normale', 'haute', 'urgente'] as const
export const INCIDENT_STATUSES   = ['nouveau', 'assigné', 'en_cours', 'résolu', 'fermé'] as const
export const CONTRACT_STATUSES   = ['actif', 'suspendu', 'terminé'] as const
export const MACHINE_TYPES       = ['color', 'noir_blanc'] as const
export const STAFF_ROLES         = ['admin', 'technician'] as const
export const MAINTENANCE_FREQUENCIES = ['mensuel', 'trimestriel'] as const

export type IncidentCategory     = typeof INCIDENT_CATEGORIES[number]
export type IncidentPriority     = typeof INCIDENT_PRIORITIES[number]
export type IncidentStatus       = typeof INCIDENT_STATUSES[number]
export type ContractStatus       = typeof CONTRACT_STATUSES[number]
export type MachineType          = typeof MACHINE_TYPES[number]
export type StaffRole            = typeof STAFF_ROLES[number]
export type MaintenanceFrequency = typeof MAINTENANCE_FREQUENCIES[number]

export function parseEnum<T extends string>(
  value: FormDataEntryValue | null | undefined,
  allowed: readonly T[],
): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}
