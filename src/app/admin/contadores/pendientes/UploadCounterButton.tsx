'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCounterDocumentAction } from './actions'

// Subida MANUAL de un documento de contadores. El PDF (o la imagen) se sube ENTERO y el motor
// `parse-counter-document` lo trocea, se lo da a la IA y va llenando la cola con todas las lecturas.
// No se trocea nada en el navegador (eso lo hacía el método anterior, retirado).

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
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadCounterDocumentAction(null, fd)
      if (res && 'error' in res) { setPhase({ kind: 'error', message: res.error }); return }
      if (res && 'duplicate' in res) { setPhase({ kind: 'duplicate' }); return }
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
