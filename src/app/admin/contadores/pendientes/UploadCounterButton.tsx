'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCounterImageAction } from './actions'

// Subida MANUAL de contadores. Dos caminos:
//  - Imagen (JPG/PNG/WEBP): se sube tal cual → 1 relevé.
//  - PDF: se TROCEA en el navegador (1 página = 1 imagen) y se suben todas → N relevés,
//    cada uno a la cola de revisión. Resuelve el PDF mensual de 2AS (46 páginas, 5 MB) que
//    ni cabe por email (512 KB) ni en una función serverless (4,5 MB).
// Sin `capture`: el selector nativo deja elegir cámara, galería o PDF (capture forzaría la
// cámara en móvil y bloquearía elegir el PDF, que es el caso principal).

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
      let images: File[]
      if (file.type === 'application/pdf') {
        setPhase({ kind: 'splitting' })
        const { pdfToJpegBlobs } = await import('@/lib/pdfToImages')
        const blobs = await pdfToJpegBlobs(file)
        if (blobs.length === 0) { setPhase({ kind: 'error', message: 'PDF illisible ou vide.' }); return }
        images = blobs.map((b, i) => new File([b], `page-${i + 1}.jpg`, { type: 'image/jpeg' }))
      } else {
        images = [file]
      }

      // Subir de CONCURRENCY en CONCURRENCY (no todas a la vez): cada subida espera su OCR, así
      // nunca hay más de CONCURRENCY lecturas simultáneas y el servicio no se satura (502).
      const total = images.length
      let done = 0
      setPhase({ kind: 'uploading', done: 0, total })
      const CONCURRENCY = 3
      let next = 0
      const worker = async () => {
        while (next < images.length) {
          const img = images[next++]
          count(await uploadOne(img))
          done++
          setPhase({ kind: 'uploading', done, total })
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, worker))

      setPhase({ kind: 'done', ...tally })
      router.refresh()
    } catch (e) {
      console.error('[UploadCounter]', e)
      // DIAGNÓSTICO TEMPORAL: mostrar el error real en pantalla para identificar el fallo del PDF.
      const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      setPhase({ kind: 'error', message: `Échec: ${detail}`.slice(0, 300) })
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
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {phase.kind === 'splitting' ? 'Découpage du PDF…'
          : phase.kind === 'uploading' ? `Envoi ${phase.done}/${phase.total}…`
          : 'Ajouter une photo / un PDF'}
      </button>
      {phase.kind === 'done' && (
        <p className="text-xs text-ink-muted text-right">
          {phase.ok > 0 && <span className="text-green-700">{phase.ok} ajouté(s). </span>}
          {phase.duplicates > 0 && <span className="text-amber-700">{phase.duplicates} doublon(s). </span>}
          {phase.errors > 0 && <span className="text-accent">{phase.errors} échec(s).</span>}
        </p>
      )}
      {phase.kind === 'error' && <p className="text-xs text-accent">{phase.message}</p>}
    </div>
  )
}
