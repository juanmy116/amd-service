'use client'

import { useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { ImagePlus, Loader2, X, Check } from 'lucide-react'
import { sha256Hex, validateIncidentPhoto, PHOTO_ERROR_MESSAGES } from '@/lib/incidentPhotos'
import { prepareIncidentPhotoUploadAction } from './actions'

// Subida de la foto adjunta a la incidencia. El navegador la sube DIRECTO a Supabase Storage
// con una URL firmada que da el servidor (Vercel topa el body de las Server Actions a 4,5 MB).
// Tras la subida, la ruta queda en un <input hidden name="photo_path"> que el formulario envía.

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'done'; path: string; previewUrl: string }
  | { kind: 'error'; message: string }

export default function PhotoUpload() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    // Libera la previsualización anterior si se reemplaza la foto (evita fuga de blobs).
    if (phase.kind === 'done') URL.revokeObjectURL(phase.previewUrl)

    // Validación inmediata en cliente (el servidor revalida).
    const valid = validateIncidentPhoto({ type: file.type, size: file.size })
    if (!valid.ok) {
      setPhase({ kind: 'error', message: PHOTO_ERROR_MESSAGES[valid.error] })
      return
    }

    setPhase({ kind: 'uploading' })
    try {
      // 1) Hash del fichero (para nombrar el objeto en el bucket).
      const hash = await sha256Hex(await file.arrayBuffer())

      // 2) Pedir al servidor la URL firmada (valida + genera el token).
      const prep = await prepareIncidentPhotoUploadAction(hash, file.type, file.size)
      if ('error' in prep) { setPhase({ kind: 'error', message: prep.error }); return }

      // 3) Subir la imagen DIRECTO a Supabase Storage (no pasa por Vercel).
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { error: upErr } = await supabase.storage
        .from('incident-photos')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type, upsert: true })
      if (upErr) {
        console.error('[PhotoUpload] uploadToSignedUrl', upErr)
        setPhase({ kind: 'error', message: "Échec de l'envoi de l'image." })
        return
      }

      setPhase({ kind: 'done', path: prep.path, previewUrl: URL.createObjectURL(file) })
    } catch (e) {
      console.error('[PhotoUpload]', e)
      setPhase({ kind: 'error', message: "Échec de l'envoi de l'image." })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function reset() {
    if (phase.kind === 'done') URL.revokeObjectURL(phase.previewUrl)
    setPhase({ kind: 'idle' })
  }

  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-1.5">
        Photo <span className="text-ink-muted font-normal">(facultatif)</span>
      </label>

      {/* Campo que viaja con el formulario: la ruta de la foto en Storage. */}
      <input
        type="hidden"
        name="photo_path"
        value={phase.kind === 'done' ? phase.path : ''}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {phase.kind === 'done' ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.previewUrl} alt="Aperçu" className="w-16 h-16 rounded-md object-cover shrink-0" />
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check size={15} /> Image ajoutée
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-soft hover:bg-neutral-soft transition-colors"
            aria-label="Retirer l'image"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={phase.kind === 'uploading'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-line text-sm font-medium text-ink-soft hover:border-ink-muted hover:bg-neutral-soft transition-colors disabled:opacity-60"
        >
          {phase.kind === 'uploading'
            ? <><Loader2 size={15} className="animate-spin" /> Envoi…</>
            : <><ImagePlus size={15} /> Ajouter une photo</>}
        </button>
      )}

      {phase.kind === 'error' && <p className="mt-1.5 text-xs text-accent">{phase.message}</p>}
      <p className="mt-1.5 text-xs text-ink-muted">
        Une photo du problème aide le technicien à préparer son intervention.
      </p>
    </div>
  )
}
