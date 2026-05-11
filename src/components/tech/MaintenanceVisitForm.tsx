'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Building2, MapPin, Wrench, AlertTriangle } from 'lucide-react'

type FormState = { error: string } | null

const PARTS = [
  { id: 1,  name: 'Four'            }, { id: 2,  name: 'Transfer Belt'   },
  { id: 3,  name: 'Tambour BK'      }, { id: 4,  name: 'Tambour C'       },
  { id: 5,  name: 'Tambour M'       }, { id: 6,  name: 'Tambour Y'       },
  { id: 7,  name: 'Toner BK'        }, { id: 8,  name: 'Toner C'         },
  { id: 9,  name: 'Toner M'         }, { id: 10, name: 'Toner Y'         },
  { id: 11, name: 'Cassette'        }, { id: 12, name: 'Rouleau Pression' },
]

type Props = {
  boundAction:     (prev: FormState, data: FormData) => Promise<FormState>
  backHref:        string
  scheduledDate:   string
  isOverdue:       boolean
  clientName:      string | null
  machineName:     string
  machineLocation: string | null
  planNotes:       string | null
}

export default function MaintenanceVisitForm({
  boundAction, backHref, scheduledDate, isOverdue,
  clientName, machineName, machineLocation, planNotes,
}: Props) {
  const [state, formAction, pending] = useActionState(boundAction, null)

  return (
    <div className="p-4 space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href={backHref} className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white shrink-0">
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Maintenance préventive
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isOverdue
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><AlertTriangle size={11} /> En retard</span>
              : <span className="text-xs text-blue-600 font-medium">Planifiée</span>
            }
            <span className="text-xs text-gray-400">· {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* Infos */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#BF0D0D' }}>
            <Wrench size={14} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900">{machineName}</p>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 size={14} className="text-gray-400 shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            {machineLocation}
          </div>
        )}
        {planNotes && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 mb-1">Points à vérifier</p>
            <p className="text-sm text-gray-700">{planNotes}</p>
          </div>
        )}
      </div>

      <form action={formAction} className="space-y-5">

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Piezas */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 cursor-pointer active:bg-gray-50">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
          <input
            name="autres_pieces"
            type="text"
            placeholder="Autres pièces (libre)"
            className="mt-3 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Notes de la visite</p>
          <textarea
            name="notes"
            rows={4}
            placeholder="État de la machine, observations, anomalies constatées..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Clôturer la maintenance
        </button>
      </form>
    </div>
  )
}
