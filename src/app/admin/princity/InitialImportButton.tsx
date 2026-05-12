'use client'

import { useActionState } from 'react'
import { triggerInitialImportAction } from './actions'

export default function InitialImportButton() {
  const [state, action, pending] = useActionState(triggerInitialImportAction, null)

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        onClick={e => {
          if (!confirm(
            'ATTENTION: Cette action va effacer TOUTES les données de test.\n\n' +
            'Seront supprimés: clients, machines, contrats, incidents, compteurs, historiques.\n\n' +
            "Confirmez-vous l'importation initiale depuis Princity?"
          )) e.preventDefault()
        }}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        {pending ? 'Importation en cours…' : "Lancer l'importation initiale"}
      </button>

      {state?.status === 'success' && (
        <p className="mt-3 text-sm text-green-700">{state.message}</p>
      )}
      {state?.status === 'error' && (
        <p className="mt-3 text-sm text-red-700">Erreur: {state.message}</p>
      )}
    </form>
  )
}
