import { getAdminClient, writeLog } from '../_shared/db.ts'
import { notifyAdmin, notifyEmail }  from '../_shared/notify.ts'

const FUNCTION_NAME = 'princity-watchdog'

const THRESHOLDS: Record<string, number> = {
  'princity-alerts':   2 * 60 * 60 * 1000,       // 2 horas en ms
  'princity-sync':     2 * 24 * 60 * 60 * 1000,   // 2 días en ms
  'princity-counters': 35 * 24 * 60 * 60 * 1000,  // 35 días en ms
}

const ADMIN_EMAIL = 'info@amd-service.com'

Deno.serve(async (_req: Request) => {
  const db  = getAdminClient()
  const now = Date.now()

  try {
    const { data: healthRows } = await db
      .from('princity_health')
      .select('function_name, last_success_at, alert_sent')

    for (const row of healthRows ?? []) {
      const threshold = THRESHOLDS[row.function_name]
      if (!threshold) continue

      const lastSuccess  = row.last_success_at ? new Date(row.last_success_at).getTime() : 0
      const elapsed      = now - lastSuccess
      const isDown       = elapsed > threshold
      const alertPending = isDown && !row.alert_sent
      const recovered    = !isDown && row.alert_sent

      if (alertPending) {
        const hours = Math.round(elapsed / 3_600_000)
        const msg   = `⚠️ PRINCITY HORS LIGNE\nFonction: ${row.function_name}\nAucune donnée reçue depuis ${hours}h.\nDernière sync réussie: ${row.last_success_at ?? 'jamais'}\nVérifiez la connexion API Princity.`

        await notifyAdmin(msg)
        await notifyEmail(
          ADMIN_EMAIL,
          `⚠️ Princity — Connexion interrompue (${row.function_name})`,
          `<p>${msg.replace(/\n/g, '<br>')}</p>`
        )
        await db.from('princity_health').update({ alert_sent: true })
          .eq('function_name', row.function_name)
      }

      if (recovered) {
        const msg = `✅ PRINCITY RECONNECTÉE\nFonction: ${row.function_name}\nSynchronisation rétablie.`
        await notifyAdmin(msg)
        await notifyEmail(
          ADMIN_EMAIL,
          `✅ Princity — Connexion rétablie (${row.function_name})`,
          `<p>${msg.replace(/\n/g, '<br>')}</p>`
        )
        await db.from('princity_health').update({ alert_sent: false })
          .eq('function_name', row.function_name)
      }
    }

    await writeLog(db, {
      functionName:     FUNCTION_NAME,
      endpointCalled:   'princity_health (internal)',
      status:           'success',
      recordsProcessed: (healthRows ?? []).length,
      recordsCreated:   0,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${FUNCTION_NAME}]`, msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
