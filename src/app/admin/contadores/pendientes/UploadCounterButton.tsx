'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { sha256Hex } from '@/lib/counterUpload'
import { prepareCounterUploadAction, triggerCounterDocumentAction } from './actions'

// Subida MANUAL de un documento de contadores. El archivo se sube DIRECTO a Supabase Storage desde
// el navegador (con una URL firmada que da el servidor), porque Vercel topa el body de las Server
// Actions a 4,5 MB y el PDF de 2AS pesa ~5 MB. Luego el motor `parse-counter-document` lo trocea,
// se lo da a la IA y va llenando la cola con todas las lecturas.

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'done' }
  | { kind: 'duplicate' }
  | { kind: 'error'; message: string }

export default function UploadCounterButton() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    setPhase({ kind: 'uploading' })
    try {
      // 1) Hash del documento en el navegador (para la dedup y el nombre del objeto).
      const hash = await sha256Hex(await file.arrayBuffer())

      // 2) Pedir al servidor la URL firmada (valida + dedup de documento).
      const prep = await prepareCounterUploadAction(hash, file.type, file.size)
      if ('error' in prep) { setPhase({ kind: 'error', message: prep.error }); return }
      if ('duplicate' in prep) { setPhase({ kind: 'duplicate' }); return }

      // 3) Subir el archivo DIRECTO a Supabase Storage (no pasa por Vercel → sin el tope de 4,5 MB).
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { error: upErr } = await supabase.storage.from('counter-images')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type, upsert: true })
      if (upErr) { console.error('[UploadCounter] uploadToSignedUrl', upErr); setPhase({ kind: 'error', message: 'Échec de l’envoi du fichier.' }); return }

      // 4) Disparar el motor (el trabajo va en segundo plano).
      const trig = await triggerCounterDocumentAction(prep.path, file.type, hash)
      if (trig && 'error' in trig) { setPhase({ kind: 'error', message: trig.error }); return }

      setPhase({ kind: 'done' })
      router.refresh()
    } catch (e) {
      console.error('[UploadCounter]', e)
      setPhase({ kind: 'error', message: 'Échec de l’envoi du fichier.' })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={phase.kind === 'uploading'}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {phase.kind === 'uploading' ? 'Envoi…' : 'Ajouter une photo / un PDF'}
      </button>
      {phase.kind === 'done' && (
        <p className="text-xs text-ink-muted text-right">
          Document reçu. <span className="text-green-700">Analyse en cours</span>, rafraîchissez dans 1-2 min.
        </p>
      )}
      {phase.kind === 'duplicate' && <p className="text-xs text-amber-700 text-right">Document déjà importé — non retraité.</p>}
      {phase.kind === 'error' && <p className="text-xs text-accent text-right">{phase.message}</p>}
    </div>
  )
}
