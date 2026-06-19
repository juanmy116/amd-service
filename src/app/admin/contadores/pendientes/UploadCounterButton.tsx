'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCounterImageAction } from './actions'

// Subida MANUAL de contadores. Dos caminos:
//  - Imagen (JPG/PNG/WEBP): se sube tal cual → 1 relevé.
//  - PDF: se TROCEA en el navegador (1 página = 1 imagen) y se suben todas → N relevés,
//    cada uno a la cola de revisión. Resuelve el PDF mensual de 2AS (46 páginas, 5 MB) que
//    ni cabe por email (512 KB) ni en una función serverless (4,5 MB).
// `capture` deja abrir la cámara en móvil para fotos sueltas.

type Phase =
  | { kind: 'idle' }
  | { kind: 'splitting' }
  | { kind: 'uploading'; done: number; total: number }
  | { kind: 'done'; ok: number; duplicates: number; errors: number }
  | { kind: 'error'; message: string }

async function uploadOne(file: File): Promise<'ok' | 'duplicate' | 'error'> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await uploadCounterImageAction(null, fd)
  if (res && 'ok' in res) return 'ok'
  if (res && 'duplicate' in res) return 'duplicate'
  return 'error'
}

export default function UploadCounterButton() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const busy = phase.kind === 'splitting' || phase.kind === 'uploading'

  async function handleFile(file: File) {
    const tally = { ok: 0, duplicates: 0, errors: 0 }
    const count = (r: 'ok' | 'duplicate' | 'error') =>
      r === 'ok' ? tally.ok++ : r === 'duplicate' ? tally.duplicates++ : tally.errors++

    try {
      if (file.type === 'application/pdf') {
        setPhase({ kind: 'splitting' })
        const { pdfToJpegBlobs } = await import('@/lib/pdfToImages')
        const blobs = await pdfToJpegBlobs(file)
        if (blobs.length === 0) { setPhase({ kind: 'error', message: 'PDF illisible ou vide.' }); return }
        setPhase({ kind: 'uploading', done: 0, total: blobs.length })
        for (let i = 0; i < blobs.length; i++) {
          const img = new File([blobs[i]], `page-${i + 1}.jpg`, { type: 'image/jpeg' })
          count(await uploadOne(img))
          setPhase({ kind: 'uploading', done: i + 1, total: blobs.length })
        }
      } else {
        setPhase({ kind: 'uploading', done: 0, total: 1 })
        count(await uploadOne(file))
      }
      setPhase({ kind: 'done', ...tally })
      router.refresh()
    } catch (e) {
      console.error('[UploadCounter]', e)
      setPhase({ kind: 'error', message: 'Échec du traitement du fichier.' })
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
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {phase.kind === 'splitting' ? 'Découpage du PDF…'
          : phase.kind === 'uploading' ? `Envoi ${phase.done}/${phase.total}…`
          : 'Ajouter une photo / un PDF'}
      </button>
      {phase.kind === 'done' && (
        <p className="text-xs text-ink-muted">
          {phase.ok > 0 && <span className="text-green-700">{phase.ok} ajouté(s). </span>}
          {phase.duplicates > 0 && <span className="text-amber-700">{phase.duplicates} doublon(s). </span>}
          {phase.errors > 0 && <span className="text-accent">{phase.errors} échec(s).</span>}
        </p>
      )}
      {phase.kind === 'error' && <p className="text-xs text-accent">{phase.message}</p>}
    </div>
  )
}
