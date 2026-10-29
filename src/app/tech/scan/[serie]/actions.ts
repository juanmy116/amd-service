'use server'

import { revalidatePath } from 'next/cache'
import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanStaffDescription, validateStaffIncident } from '@/lib/staffIncident'
import { createStaffIncident } from '@/lib/staffIncident.server'

export type ReportPanneState = { error: string } | { numeroIncident: string } | null

/**
 * «Signaler une panne» desde la ficha de máquina (tanda 6). Solo técnicos con el permiso
 * `can_create_incidents`, que se vuelve a leer aquí: el botón oculto no protege nada.
 * La avería entra `nouveau` y SIN asignar — la oficina o el taller deciden quién va.
 */
export async function reportPanneAction(
  serie: string,
  _prev: ReportPanneState,
  formData: FormData,
): Promise<ReportPanneState> {
  const { user } = await requireTechnician()

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('role, can_create_incidents')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'technician' || profile.can_create_incidents !== true) {
    return { error: "Vous n'avez pas l'autorisation de signaler une panne." }
  }

  const description = cleanStaffDescription(formData.get('description'))
  const invalid = validateStaffIncident({ kind: 'panne', reason: null, description })
  if (invalid) return { error: invalid }

  const result = await createStaffIncident({
    serie,
    kind:           'panne',
    reason:         null,
    description,
    urgent:         formData.get('urgent') === 'on',
    openedBy:       user.id,
    assignedTo:     null,
    historyComment: 'Panne signalée par le technicien (fiche machine)',
  })
  if ('error' in result) return result

  revalidatePath(`/tech/scan/${encodeURIComponent(serie)}`)
  return { numeroIncident: result.numeroIncident }
}
