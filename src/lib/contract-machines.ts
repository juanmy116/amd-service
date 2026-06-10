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
 *
 * NOTA DE DISEÑO: filtra únicamente por `date_fin IS NULL`, sin importar `statut`.
 * Una máquina con statut='suspendue' sigue vinculada a su contrato hasta que se le
 * asigne una date_fin — esto es correcto por spec (sección 2.2: la exclusividad de
 * vinculación se basa en date_fin, no en statut). Para obtener las líneas que están
 * realmente en servicio usar `getActiveLinesForContract`, que sí filtra `statut='actif'`.
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
