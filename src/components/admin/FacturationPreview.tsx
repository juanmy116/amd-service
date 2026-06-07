'use client'
import { formatPrice } from '@/lib/billing'
import { emitInvoiceAction } from '@/app/admin/facturation/actions'
import type { ClientDraft } from '@/lib/invoicing'

type Props = {
  clients: { id: number; nom_client: string }[]
  selectedClient: number | null
  year: number; month: number
  draft: ClientDraft | null
  alreadyIssued: string | null
}

export default function FacturationPreview({ clients, selectedClient, year, month, draft, alreadyIssued }: Props) {
  function nav(next: Partial<{ client: number; year: number; month: number }>) {
    const p = new URLSearchParams({
      client: String(next.client ?? selectedClient ?? ''),
      year:  String(next.year  ?? year),
      month: String(next.month ?? month),
    })
    window.location.href = `/admin/facturation?${p.toString()}`
  }
  const monthLabel = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedClient ?? ''} onChange={e => nav({ client: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {clients.length === 0 && <option value="">Aucun client facturable</option>}
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom_client}</option>)}
        </select>
        <select value={month} onChange={e => nav({ month: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>{new Date(2000, m - 1).toLocaleDateString('fr-FR', { month: 'long' })}</option>)}
        </select>
        <select value={year} onChange={e => nav({ year: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {alreadyIssued && (
        <div className="px-4 py-3 rounded-lg bg-info-soft border border-info/20 text-sm text-info flex items-center justify-between">
          <span>Facture déjà émise pour {monthLabel} : <strong>{alreadyIssued}</strong></span>
          <a href="/admin/factures" className="underline">Voir les factures →</a>
        </div>
      )}

      {!draft || draft.lines.length === 0 ? (
        <div className="text-center py-12 text-sm text-ink-muted">Aucune ligne facturable pour {monthLabel}.</div>
      ) : (
        <>
          <div className="border border-line rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-soft">
              <span className="font-semibold text-sm text-ink">{draft.client_name} — {monthLabel}</span>
              <span className="font-bold text-sm text-ink">{formatPrice(draft.total_amount)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-xs text-ink-muted">
                  <th className="text-left px-5 py-2">Machine</th><th className="text-left px-4 py-2">Contrat</th>
                  <th className="text-left px-4 py-2">Plan</th><th className="text-right px-4 py-2">ΔB&N</th>
                  <th className="text-right px-4 py-2">ΔCoul.</th><th className="text-right px-5 py-2">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-line-subtle">
                  {draft.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-neutral-soft/50">
                      <td className="px-5 py-3 font-mono text-xs">{l.machine_label}{l.is_estimated && <span className="ml-2 text-[10px] font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Estimée</span>}</td>
                      <td className="px-4 py-3 text-xs text-ink-soft">{l.numero_contrat}</td>
                      <td className="px-4 py-3 text-xs text-ink-soft">{l.plan_name}</td>
                      <td className="px-4 py-3 text-right">{l.delta_bw.toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 text-right">{l.delta_color.toLocaleString('fr-FR')}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatPrice(l.amount_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!alreadyIssued && (
            <form action={emitInvoiceAction} className="flex items-center justify-end gap-3">
              <input type="hidden" name="client_id" value={draft.client_id} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              {draft.has_estimated ? (
                <>
                  <p className="text-sm text-warning mr-auto">⚠️ Des machines n&apos;ont pas de relevé pour {monthLabel}.</p>
                  <button name="confirm_estimated" value="true" type="submit"
                    className="rounded-input bg-warning px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    Émettre malgré tout (lignes estimées)
                  </button>
                </>
              ) : (
                <button type="submit" className="rounded-input bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
                  Émettre la facture
                </button>
              )}
            </form>
          )}
        </>
      )}
    </div>
  )
}
