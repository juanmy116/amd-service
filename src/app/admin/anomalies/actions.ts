'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateConsumption, type YieldSource } from '@/lib/anomalies'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | { ok: true; count?: number } | null

const CONSUMO = 'consumo_alto_sin_cambio'

/**
 * Recalcula las anomalías de consumo: lee v_machine_part_consumption, aplica la
 * regla pura (src/lib/anomalies.ts) y regenera las anomalías ABIERTAS de tipo
 * consumo_alto_sin_cambio. Las ya revisadas (ack/dismissed/resolved) no se tocan.
 */
export async function recalcAnomaliesAction(): Promise<ActionState> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: rows, error } = await admin.from('v_machine_part_consumption').select('*')
  if (error) {
    console.error('[recalcAnomalies.read]', error)
    return { error: 'Erreur lors de la lecture des consommations.' }
  }

  const detected = (rows ?? []).flatMap((r) => {
    const ev = evaluateConsumption({
      copiesSinceChange: r.copies_since_change ?? 0,
      expectedYield: r.expected_yield_total,
      source: r.yield_source as YieldSource,
      samples: r.samples,
    })
    if (!ev || r.machine_id == null) return []
    return [{
      machine_id: r.machine_id,
      part_id: r.part_id,
      anomaly_type: ev.type,
      light: ev.light,
      reason: ev.reason,
      status: 'open',
      metrics: {
        copies_since_change: r.copies_since_change,
        expected_yield_total: r.expected_yield_total,
        yield_source: r.yield_source,
        samples: r.samples,
        ratio: ev.ratio,
        last_change_at: r.last_change_at,
      },
    }]
  })

  // Regenerar el conjunto abierto de este tipo (idempotente).
  const { error: delErr } = await admin.from('machine_anomalies')
    .delete().eq('status', 'open').eq('anomaly_type', CONSUMO)
  if (delErr) {
    console.error('[recalcAnomalies.delete]', delErr)
    return { error: 'Erreur lors du recalcul.' }
  }
  if (detected.length > 0) {
    const { error: insErr } = await admin.from('machine_anomalies').insert(detected)
    if (insErr) {
      console.error('[recalcAnomalies.insert]', insErr)
      return { error: 'Erreur lors de l\'enregistrement des anomalies.' }
    }
  }

  revalidatePath('/admin/anomalies')
  return { ok: true, count: detected.length }
}

/** Cambia el estado de una anomalía (acquittée / écartée / résolue). Form action directo. */
export async function setAnomalyStatusAction(fd: FormData): Promise<void> {
  const { user } = await requireAdmin()
  const id = fd.get('id') as string
  const status = fd.get('status') as string
  if (!['ack', 'dismissed', 'resolved'].includes(status)) return

  const admin = createAdminClient()
  const { error } = await admin.from('machine_anomalies')
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[setAnomalyStatus]', error)
  revalidatePath('/admin/anomalies')
}
