'use client'
import { useActionState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCounterImageAction } from './actions'

// Botón de subida MANUAL de una foto/PDF de contador. `capture` deja que en móvil se
// abra la cámara directamente. Al elegir archivo, el formulario se envía solo; el OCR
// procesa y, al refrescar, el relevé aparece en la lista de abajo.
export default function UploadCounterButton() {
  const [state, action, pending] = useActionState(uploadCounterImageAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Tras una subida correcta o un duplicado, refrescar la lista y limpiar el input.
  useEffect(() => {
    if (state && ('ok' in state || 'duplicate' in state)) {
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    }
  }, [state, router])

  return (
    <form ref={formRef} action={action} className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={() => formRef.current?.requestSubmit()}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Envoi…' : 'Ajouter une photo / un PDF'}
      </button>
      {state && 'error' in state && <p className="text-xs text-accent">{state.error}</p>}
      {state && 'duplicate' in state && (
        <p className="text-xs text-amber-700">Fichier déjà reçu — non retraité (doublon).</p>
      )}
      {state && 'ok' in state && <p className="text-xs text-green-700">Ajouté à la file d’attente.</p>}
    </form>
  )
}
