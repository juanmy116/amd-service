'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cancelCounterAction } from './actions'

const MONTHS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

interface Props {
  counterId: string
  machineId: string
  year:      number
  month:     number
  counterBw: number
  counterColor: number
}

export default function CancelModal({ counterId, machineId, year, month, counterBw, counterColor }: Props) {
  const [open, setOpen]     = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCancel() {
    setError(null)
    if (!reason.trim()) { setError('Le motif est obligatoire.'); return }
    startTransition(async () => {
      const res = await cancelCounterAction(counterId, machineId, reason)
      if (res.error) { setError(res.error); return }
      setOpen(false)
      setReason('')
    })
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); setReason('') }}
        className="text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2"
      >
        Annuler
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Annuler ce relevé</p>
                  <p className="text-xs text-gray-400 mt-0.5">Cette action est irréversible</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Détails du relevé */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p className="font-medium text-gray-700">{MONTHS_FR[month]} {year}</p>
              <p className="text-gray-500">N&B : <span className="font-mono font-semibold text-gray-800">{counterBw.toLocaleString('fr-FR')}</span></p>
              <p className="text-gray-500">Couleur : <span className="font-mono font-semibold text-gray-800">{counterColor.toLocaleString('fr-FR')}</span></p>
            </div>

            {/* Motif */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Motif d&apos;annulation <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Ex: Erreur de saisie — compteur B&N incorrect"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
              />
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>

            {/* Acciones */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleCancel}
                disabled={pending}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#BF0D0D' }}
              >
                {pending ? 'Traitement...' : 'Confirmer l\'annulation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
