'use server'

import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { PARTS } from '@/lib/parts'
import { readPosition } from '@/lib/geo'
import { computePresence } from '@/lib/presence.server'

type FormState = { error: string } | null

// Derivado de la lista central: así las piezas nuevas del catálogo se
// reconocen aquí sin tener que mantener una lista de ids aparte.
const PART_IDS = PARTS.map((p) => p.id)

async function notifyMatrix(message: string): Promise<void> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL
  const token      = process.env.MATRIX_ACCESS_TOKEN
  const roomId     = process.env.MATRIX_MAINTENANCE_ROOM_ID
  if (!homeserver || !token || !roomId) return
  const txnId = Date.now()
  await fetch(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: message }),
    },
  ).catch(err => console.error('[Matrix]', err))
}

const RPC_ERRORS: Record<string, string> = {
  visit_not_found:   'Visite introuvable.',
  already_closed:    'Cette visite est déjà clôturée.',
  permission_denied: 'Permission refusée.',
}

export async function closeMaintenance(
  visitId: string,
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, profile, supabase } = await requireTechnician()

  // Autorización de la visita: los argumentos ligados (visitId, serie) viajan por el cliente y
  // se pueden reenviar con otros valores, y la RPC de abajo corre con service_role. Sin esto,
  // cualquier técnico podría cerrar una visita ajena. La RLS (auth_tech_visit_ids) decide si
  // la ve; el admin las ve todas.
  const { data: visible } = await supabase
    .from('maintenance_visits')
    .select('id')
    .eq('id', visitId)
    .maybeSingle()
  if (!visible) return { error: 'Visite introuvable.' }

  const notes       = ((formData.get('notes') as string) ?? '').trim() || null
  const partIds      = PART_IDS.filter(id => formData.get(`part_${id}`) === 'on')
  const autresPieces = ((formData.get('autres_pieces') as string) ?? '').trim() || null

  // RPC atómica vía service_role (la action ya validó el rol con requireTechnician).
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('close_maintenance_visit', {
    p_visit_id:      visitId,
    p_serie:         serie,
    p_done_by:       user.id,
    // p_notes / p_autres_pieces son `text` nullable en la función (acepta y espera null
    // cuando no hay datos); el generador de tipos de Supabase tipa los Args de RPC como
    // string no-null, de ahí el cast.
    p_notes:         notes as string,
    p_part_ids:      partIds,
    p_autres_pieces: autresPieces as string,
  })

  if (error) {
    for (const code of Object.keys(RPC_ERRORS)) {
      if (error.message.includes(code)) return { error: RPC_ERRORS[code] }
    }
    console.error('[closeMaintenance.rpc]', error)
    return { error: 'Erreur lors de la clôture de la visite.' }
  }

  // Dónde estaba el técnico al cerrar (Fase 3). La visita ya está cerrada: esto es un añadido
  // best-effort y un fallo solo se registra (el cierre no se deshace ni se avisa al técnico).
  // Cliente admin: `field_presence` solo la escribe service_role (ver 20260925100000_geolocation.sql).
  const { error: presenceError } = await admin
    .from('field_presence')
    .upsert(
      await computePresence({
        entityType: 'visit', entityId: visitId, techId: user.id,
        numeroSerie: serie, position: readPosition(formData),
      }),
      { onConflict: 'entity_type,entity_id' },
    )
  if (presenceError) console.error('[closeMaintenance.presence]', presenceError)

  // Notificación Matrix: best-effort, fuera de la transacción ya commiteada.
  const r = data as {
    next_date: string; marque: string | null; modele: string | null
    numero_serie: string | null; client: string | null; parts_count: number
  }
  const nextFmt = new Date(r.next_date + 'T00:00:00').toLocaleDateString('fr-FR')
  await notifyMatrix([
    '✅ MAINTENANCE EFFECTUÉE',
    `Client     : ${r.client ?? '—'}`,
    `Machine    : ${r.marque ?? ''} ${r.modele ?? ''} (${r.numero_serie ?? serie})`,
    `Technicien : ${profile.full_name ?? user.email}`,
    `Prochaine  : ${nextFmt}`,
    r.parts_count > 0 ? `Pièces     : ${r.parts_count} remplacée(s)` : '',
  ].filter(Boolean).join('\n'))

  redirect(`/tech/scan/${encodeURIComponent(serie)}`)
}
