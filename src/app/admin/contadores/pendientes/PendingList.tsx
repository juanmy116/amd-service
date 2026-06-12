'use client'
import { useActionState, useState } from 'react'
import { confirmPendingAction, rejectPendingAction } from './actions'

type Row = {
  id: string; image_url: string | null; light: 'green' | 'amber' | 'red'
  matched_machine_id: string | null; email_from: string | null
  extracted_data: Record<string, unknown>; validation_errors: string[]
}
type Machine = { numero_serie: string; marque: string; modele: string }

const DOT: Record<Row['light'], string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }
const inputCls = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink'

export default function PendingList({ rows, machines }: { rows: Row[]; machines: Machine[] }) {
  const [selected, setSelected] = useState<Row | null>(rows[0] ?? null)
  return (
    <div className="grid grid-cols-[280px_1fr] divide-x divide-line min-h-[400px]">
      <ul className="divide-y divide-line overflow-y-auto">
        {rows.map(r => (
          <li key={r.id}>
            <button onClick={() => setSelected(r)}
              className={`w-full text-left px-4 py-3 hover:bg-neutral-soft ${selected?.id === r.id ? 'bg-neutral-soft' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[r.light]}`} />
                <span className="text-sm font-medium text-ink truncate">{r.matched_machine_id ?? '(non identifiée)'}</span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5 truncate">{r.email_from ?? ''}</p>
            </button>
          </li>
        ))}
      </ul>
      {selected && <Detail key={selected.id} row={selected} machines={machines} />}
    </div>
  )
}

function Detail({ row, machines }: { row: Row; machines: Machine[] }) {
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmPendingAction, null)
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectPendingAction, null)
  const d = row.extracted_data
  return (
    <div className="p-5 space-y-4">
      {row.image_url && <img src={row.image_url} alt="relevé" className="max-h-64 rounded-lg border border-line object-contain" />}
      {row.validation_errors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.validation_errors.map(e => <span key={e} className="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">{e}</span>)}
        </div>
      )}
      <form action={confirmAction} className="space-y-3">
        <input type="hidden" name="id" value={row.id} />
        {!row.matched_machine_id && (
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Machine (à assigner)</label>
            <select name="machine_id" required className={inputCls}>
              <option value="">— Choisir —</option>
              {machines.map(m => <option key={m.numero_serie} value={m.numero_serie}>{m.numero_serie} · {m.marque} {m.modele}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-ink-muted mb-1">N&B</label>
            <input name="counter_bw" type="number" defaultValue={String(d.counter_bw ?? '')} className={inputCls} /></div>
          <div><label className="block text-xs text-ink-muted mb-1">Couleur</label>
            <input name="counter_color" type="number" defaultValue={String(d.counter_color ?? '')} className={inputCls} /></div>
          <div><label className="block text-xs text-ink-muted mb-1">Date</label>
            <input name="date_iso" type="text" defaultValue={String(d.date_iso ?? '')} className={inputCls} /></div>
        </div>
        {confirmState && 'error' in confirmState && <p className="text-xs text-accent">{confirmState.error}</p>}
        <button type="submit" disabled={confirmPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {confirmPending ? 'Import…' : 'Confirmer et importer'}
        </button>
      </form>
      <form action={rejectAction} className="space-y-2 border-t border-line pt-3">
        <input type="hidden" name="id" value={row.id} />
        <input name="reason" placeholder="Motif du rejet" className={inputCls} />
        {rejectState && 'error' in rejectState && <p className="text-xs text-accent">{rejectState.error}</p>}
        <button type="submit" disabled={rejectPending} className="text-xs text-ink-muted hover:text-accent">
          {rejectPending ? '…' : 'Rejeter'}
        </button>
      </form>
    </div>
  )
}
