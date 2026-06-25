import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'

// Galería de fotos adjuntas a una incidencia. Lee las filas con el cliente del usuario
// (la RLS de incident_photos decide qué ve cada rol) y materializa cada foto con una URL
// firmada de lectura generada server-side con el admin client (el bucket es privado).
// No renderiza nada si la incidencia no tiene fotos visibles.
export default async function IncidentPhotos({
  incidentId,
  title = 'Photo signalée par le client',
}: {
  incidentId: string
  title?: string
}) {
  const supabase = await createClient()
  const { data: photos } = await supabase
    .from('incident_photos')
    .select('id, storage_path, created_at')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true })

  if (!photos || photos.length === 0) return null

  const admin = createAdminClient()
  const items = await Promise.all(
    photos.map(async (p) => {
      const { data } = await admin.storage
        .from('incident-photos')
        .createSignedUrl(p.storage_path, 3600)
      return { id: p.id, url: data?.signedUrl ?? null }
    }),
  )
  const visible = items.filter((i): i is { id: string; url: string } => i.url !== null)
  if (visible.length === 0) return null

  return (
    <Card className="p-6">
      <p className="text-sm font-semibold text-ink mb-3">{title}</p>
      <div className="flex flex-wrap gap-3">
        {visible.map((i) => (
          <a
            key={i.id}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-28 h-28 rounded-lg overflow-hidden border border-line hover:opacity-90 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.url} alt="Photo de l'incident" className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </Card>
  )
}
