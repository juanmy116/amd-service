'use client'

import { Fragment, useActionState } from 'react'
import { submitCsatAction } from './actions'

const STARS = [1, 2, 3, 4, 5]
const LABELS: Record<number, string> = {
  1: 'Très insatisfait',
  2: 'Insatisfait',
  3: 'Neutre',
  4: 'Satisfait',
  5: 'Très satisfait',
}

export default function CsatForm({ token }: { token: string }) {
  const boundAction = submitCsatAction.bind(null, token)
  const [state, action, pending] = useActionState(boundAction, null)

  if (state?.success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">Merci pour votre avis !</h2>
        <p className="text-sm text-ink-muted">Votre retour nous aide à améliorer notre service.</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-6">
      {/* Estrellas */}
      <div>
        <p className="text-sm font-medium text-ink-soft mb-3 text-center">Votre note globale</p>
        {/*
          Las estrellas se pintan ACUMULATIVAS: elegir 5 enciende las cinco, no solo la quinta.

          Antes cada estrella era un `<label>` con su propio `<input>` dentro, así que el
          `peer-checked` no alcanzaba más que a la suya — dar la mejor nota posible parecía dar
          una de cinco. El truco: los inputs y las etiquetas son HERMANOS (por eso el
          `<Fragment>`, que no crea nodo), y se pintan en orden inverso con `flex-row-reverse`.
          Así «la estrella marcada y las que están a su izquierda» es, en el DOM, «la etiqueta
          de su input y todas las siguientes» — que es justo lo que alcanza el `~` de Tailwind.

          Sigue siendo un grupo de radios de verdad: accesible con teclado y lector de pantalla,
          y funciona aunque el navegador no ejecute JavaScript.
        */}
        <div className="flex flex-row-reverse justify-center gap-2">
          {[...STARS].reverse().map((star) => (
            <Fragment key={star}>
              <input
                id={`rating-${star}`}
                type="radio"
                name="rating"
                value={star}
                className="peer sr-only"
                required
              />
              <label
                htmlFor={`rating-${star}`}
                className="cursor-pointer text-ink-muted transition-colors peer-checked:text-amber-400 peer-focus-visible:text-amber-400 hover:text-amber-300 [label:hover~&]:text-amber-300"
              >
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="sr-only">{LABELS[star]}</span>
              </label>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">
          Commentaire <span className="text-ink-muted font-normal">(facultatif)</span>
        </label>
        <textarea
          name="comment"
          rows={3}
          placeholder="Dites-nous ce que nous pouvons améliorer..."
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-accent text-center">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Envoi...' : 'Envoyer mon avis'}
      </button>
    </form>
  )
}
