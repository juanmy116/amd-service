'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { Plus, Search, Wrench, Truck } from 'lucide-react'
import KioskToast from './KioskToast'
import type { Technician } from './types'
import {
  createAtelierIncidentAction, listAtelierMachinesAction, type AtelierMachineOption,
} from '@/app/atelier/actions'
import {
  PICKUP_REASONS, PICKUP_REASON_LABEL, STAFF_DESCRIPTION_MAX, type PickupReason, type StaffIncidentKind,
} from '@/lib/staffIncident'

/** Cuántas máquinas enseña el buscador a la vez: más no caben sin desplazarse. */
const MAX_RESULTS = 6

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const field =
  'w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 py-3 text-lg text-white placeholder-white/30 focus:border-accent focus:outline-none [&>option]:bg-white [&>option]:text-[#15151C]'
const label = 'block text-sm font-bold uppercase tracking-wider text-white/40 mb-2'

/**
 * Burbuja roja «+» del kiosko: crea una panne o una recogida de máquina (tanda 6).
 *
 * Sin transiciones ni desenfoque, como la ventana de resolución en modo kiosko: la Raspberry Pi 3
 * de la TV va justa. La lista de máquinas se pide al abrir y se filtra aquí.
 */
export default function NewIncidentFab({ technicians }: { technicians: Technician[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [machines, setMachines] = useState<AtelierMachineOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [kind, setKind] = useState<StaffIncidentKind>('panne')
  const [query, setQuery] = useState('')
  const [serie, setSerie] = useState<string | null>(null)
  const [reason, setReason] = useState<PickupReason | null>(null)
  const [description, setDescription] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [technicianId, setTechnicianId] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState({ message: '', at: 0 })

  // Cada apertura empieza en blanco: heredar la máquina de la anterior es la forma más fácil de
  // crear una avería en la máquina equivocada.
  async function openDialog() {
    setKind('panne')
    setQuery('')
    setSerie(null)
    setReason(null)
    setDescription('')
    setUrgent(false)
    setTechnicianId('')
    setError(null)
    setOpen(true)
    if (machines) return
    setLoadError(null)
    const result = await listAtelierMachinesAction()
    if ('error' in result) setLoadError(result.error)
    else setMachines(result)
  }

  function chooseKind(next: StaffIncidentKind) {
    setKind(next)
    setError(null)
    // Una máquina de almacén vale para una panne, no para una recogida.
    if (next === 'recuperation' && serie && !machines?.find((m) => m.serie === serie)?.inContract) {
      setSerie(null)
    }
  }

  const selected = machines?.find((m) => m.serie === serie) ?? null

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!machines || !q) return []
    return machines
      .filter((m) => kind === 'panne' || m.inContract)
      .filter((m) => normalize(`${m.serie} ${m.label} ${m.clientName ?? ''}`).includes(q))
      .slice(0, MAX_RESULTS)
  }, [machines, query, kind])

  const missing =
    !selected ? 'Choisissez la machine.'
      : kind === 'recuperation' && !reason ? 'Choisissez le motif.'
        : kind === 'panne' && !description.trim() ? 'Décrivez la panne.'
          : null

  async function submit() {
    if (missing || !selected) return
    setBusy(true)
    setError(null)
    const result = await createAtelierIncidentAction({
      serie: selected.serie,
      kind,
      reason,
      description,
      urgent,
      technicianId: technicianId || null,
    })
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setOpen(false)
    setToast({
      message: `${result.numeroIncident} — ${kind === 'recuperation' ? 'récupération créée' : 'panne créée'}`,
      at: Date.now(),
    })
    router.refresh()
  }

  const tab = (active: boolean) =>
    [
      'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-lg font-bold transition-colors',
      active ? 'bg-accent text-white' : 'bg-white/5 text-white/60 hover:text-white',
    ].join(' ')

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Créer une panne ou une récupération"
        className="fixed bottom-8 right-8 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-2xl ring-4 ring-black/40 hover:brightness-110 active:scale-95"
      >
        <Plus size={34} strokeWidth={2.75} />
      </button>

      <Dialog open={open} onClose={busy ? () => {} : () => setOpen(false)} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/70" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="flex max-h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-2xl border-2 border-white/10 bg-[#15151C] p-7 text-white">
            <DialogTitle className="text-2xl font-extrabold">Nouvelle demande</DialogTitle>

            <div className="flex gap-2 rounded-2xl bg-white/5 p-1.5">
              <button type="button" onClick={() => chooseKind('panne')} className={tab(kind === 'panne')}>
                <Wrench size={20} /> Panne
              </button>
              <button type="button" onClick={() => chooseKind('recuperation')} className={tab(kind === 'recuperation')}>
                <Truck size={20} /> Récupération
              </button>
            </div>

            {error && (
              <p className="rounded-xl border-2 border-accent/40 bg-accent/10 px-4 py-3 text-base font-semibold text-white">
                {error}
              </p>
            )}

            {/* Máquina */}
            <div>
              <span className={label}>Machine</span>
              {selected ? (
                <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-accent/50 bg-accent/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{selected.clientName ?? 'Sans contrat (stock)'}</p>
                    <p className="truncate text-base text-white/60">
                      {selected.label} · <span className="font-mono">{selected.serie}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSerie(null)}
                    className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-base font-semibold text-white/80 hover:text-white"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Client, modèle ou numéro de série"
                      className={`${field} pl-12`}
                    />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {loadError && <p className="px-1 text-base text-accent">{loadError}</p>}
                    {!machines && !loadError && <p className="px-1 text-base text-white/40">Chargement des machines…</p>}
                    {machines && query.trim() && results.length === 0 && (
                      <p className="px-1 text-base text-white/40">
                        {kind === 'recuperation' ? 'Aucune machine sous contrat ne correspond.' : 'Aucune machine ne correspond.'}
                      </p>
                    )}
                    {results.map((m) => (
                      <button
                        key={m.serie}
                        type="button"
                        onClick={() => { setSerie(m.serie); setError(null) }}
                        className="flex w-full items-center justify-between gap-4 rounded-xl bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold">{m.clientName ?? 'Sans contrat (stock)'}</span>
                          <span className="block truncate text-sm text-white/50">{m.label}</span>
                        </span>
                        <span className="shrink-0 font-mono text-sm text-white/50">{m.serie}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Motivo de la recogida */}
            {kind === 'recuperation' && (
              <div>
                <span className={label}>Motif</span>
                <div className="grid grid-cols-3 gap-2">
                  {PICKUP_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={[
                        'rounded-xl px-3 py-3 text-base font-semibold transition-colors',
                        reason === r ? 'bg-accent text-white' : 'bg-white/5 text-white/70 hover:bg-white/10',
                      ].join(' ')}
                    >
                      {PICKUP_REASON_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={label} htmlFor="new-incident-description">
                {kind === 'panne' ? 'Ce qui ne va pas' : 'Note (facultatif)'}
              </label>
              <textarea
                id="new-incident-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={STAFF_DESCRIPTION_MAX}
                placeholder={kind === 'panne' ? 'Ce que le client a signalé…' : 'Contact sur place, horaires…'}
                className={`${field} resize-none`}
              />
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className={label} htmlFor="new-incident-technician">Technicien</label>
                <select
                  id="new-incident-technician"
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  className={field}
                >
                  <option value="">Sans technicien — à assigner plus tard</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.fullName}</option>
                  ))}
                </select>
              </div>
              {kind === 'panne' && (
                <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl bg-white/5 px-4 py-3.5 text-lg font-semibold">
                  <input
                    type="checkbox"
                    checked={urgent}
                    onChange={(e) => setUrgent(e.target.checked)}
                    className="h-5 w-5 accent-[#BF0D0D]"
                  />
                  Urgente
                </label>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="text-sm text-white/40">{missing ?? ''}</p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-xl bg-white/5 px-5 py-3 text-base font-semibold text-white/60 hover:text-white disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={missing !== null || busy}
                  className="rounded-xl bg-accent px-6 py-3 text-base font-bold text-white disabled:opacity-40"
                >
                  {busy ? 'Enregistrement...' : 'Créer'}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <KioskToast message={toast.message} at={toast.at} />
    </>
  )
}
