// Limpieza de fotos huérfanas del bucket `incident-photos`.
//
// Un cliente sube la foto DIRECTO a Storage al abrir una incidencia, antes de enviar el
// formulario. Si abandona sin enviar, el objeto queda en el bucket sin fila en incident_photos.
// Esta función borra esos objetos huérfanos (con > 24 h de antigüedad, para no tocar subidas
// en curso). La invoca pg_cron a diario (ver migración 20260625110000).
//
// Desplegar con: supabase functions deploy cleanup-orphan-incident-photos --no-verify-jwt
// (el cron llama vía net.http_post sin Authorization, como maintenance-cron).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { getSecretKey } from '../_shared/secret-key.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = getSecretKey()

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // La RPC (SECURITY DEFINER) hace el trabajo pesado en SQL: objetos del bucket sin fila
  // en incident_photos y con > 24 h. Devuelve solo los nombres a borrar.
  const { data: paths, error } = await db.rpc('orphan_incident_photo_paths')
  if (error) {
    console.error('[cleanup-orphan-incident-photos] rpc', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const names = (paths ?? []) as string[]
  if (names.length === 0) {
    return new Response(JSON.stringify({ removed: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Borrado físico del objeto (la RPC no puede: borrar la fila de storage.objects dejaría el
  // binario huérfano en el backend). La API de Storage sí lo elimina de verdad.
  const { data: removed, error: rmErr } = await db.storage.from('incident-photos').remove(names)
  if (rmErr) {
    console.error('[cleanup-orphan-incident-photos] remove', rmErr.message)
    return new Response(JSON.stringify({ error: rmErr.message, attempted: names.length }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({ removed: removed?.length ?? 0 }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
