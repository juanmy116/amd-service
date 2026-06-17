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
 * Línea de contract_machine VIGENTE EN UNA FECHA dada (date_debut ≤ fecha ≤ COALESCE(date_fin, ∞)).
 * Es la atribución CORRECTA para una lectura de contador: la lectura pertenece a la línea/puesto que
 * estaba en servicio EN SU FECHA REAL, no a «la línea abierta hoy» (clave para lecturas tardías tras
 * una rotación de máquina entre contratos). Si varias líneas cubrieran la fecha (no debería), toma la
 * de date_debut más reciente. Spec 2026-06-17 §6/FASE 2.
 */
export async function getLineForMachineAtDate(
  supabase: SupabaseClient,
  machineId: string,
  dateISO: string,
): Promise<ContractMachine | null> {
  const { data, error } = await supabase
    .from('contract_machines')
    .select('*')
    .eq('machine_id', machineId)
    .lte('date_debut', dateISO)
    .or(`date_fin.is.null,date_fin.gte.${dateISO}`)
    .order('date_debut', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[getLineForMachineAtDate]', error)
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
