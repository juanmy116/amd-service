import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContractMachineStatus, MaintenanceFrequency } from '@/lib/enums'

export type ContractMachine = {
  id: string
  contract_id: string
  machine_id: string
  date_debut: string
  date_fin: string | null
  statut: ContractMachineStatus
  billing_day_override: number | null
  maintenance_frequency_override: MaintenanceFrequency | null
  notes: string | null
  created_at: string
}

export type ContractMachineWithMachine = ContractMachine & {
  machines: {
    numero_serie: string
    marque: string
    modele: string
    type: string | null
    localisation: string | null
    active: boolean
  } | null
}

/**
 * Línea de contract_machine ABIERTA (date_fin IS NULL) para una máquina dada.
 * Devuelve null si la máquina no tiene línea abierta.
 */
export async function getOpenLineForMachine(
  supabase: SupabaseClient,
  machineId: string
): Promise<ContractMachine | null> {
  const { data, error } = await supabase
    .from('contract_machines')
    .select('*')
    .eq('machine_id', machineId)
    .is('date_fin', null)
    .maybeSingle()
  if (error) {
    console.error('[getOpenLineForMachine]', error)
    return null
  }
  return data as ContractMachine | null
}

/**
 * Todas las líneas activas (statut='actif' AND date_fin IS NULL) de un contrato.
 * Incluye los datos de la máquina por join.
 */
export async function getActiveLinesForContract(
  supabase: SupabaseClient,
  contractId: string
): Promise<ContractMachineWithMachine[]> {
  const { data, error } = await supabase
    .from('contract_machines')
    .select('*, machines!inner(numero_serie, marque, modele, type, localisation, active)')
    .eq('contract_id', contractId)
    .eq('statut', 'actif')
    .is('date_fin', null)
    .order('date_debut', { ascending: true })
  if (error) {
    console.error('[getActiveLinesForContract]', error)
    return []
  }
  return (data ?? []) as ContractMachineWithMachine[]
}

/**
 * billing_day efectivo: override de la línea o default del contrato.
 */
export function resolveBillingDay(
  line: Pick<ContractMachine, 'billing_day_override'>,
  contract: { billing_day: number | null }
): number | null {
  return line.billing_day_override ?? contract.billing_day
}

/**
 * frecuencia de mantenimiento efectiva: override de la línea o default del contrato.
 */
export function resolveMaintenanceFrequency(
  line: Pick<ContractMachine, 'maintenance_frequency_override'>,
  contract: { maintenance_frequency: MaintenanceFrequency | null }
): MaintenanceFrequency | null {
  return line.maintenance_frequency_override ?? contract.maintenance_frequency
}
