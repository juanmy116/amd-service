'use client'

import { startTransition, useCallback, type FormEvent } from 'react'

/**
 * `onSubmit` para un formulario con `useActionState` que NO se vacía al volver con error.
 *
 * Con `<form action={formAction}>`, React 19 reinicia el formulario cuando la acción termina,
 * también si devuelve `{ error }`: se perdía todo lo escrito (p. ej. un NINEA repetido obligaba a
 * reescribir la ficha entera). Enviándolo a mano no hay reinicio. Las validaciones del navegador
 * (`required`, `type="email"`…) siguen actuando antes, y el botón pulsado viaja con sus datos.
 *
 * Uso: `<form onSubmit={useSubmitKeepingValues(formAction)}>`. Si el formulario se queda en la
 * página tras guardar bien y conviene vaciarlo, hacerlo a mano con `form.reset()` al ver el éxito.
 */
export function useSubmitKeepingValues(formAction: (data: FormData) => void) {
  return useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement && submitter.name) data.append(submitter.name, submitter.value)
    startTransition(() => formAction(data))
  }, [formAction])
}
