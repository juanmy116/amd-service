'use client'
import { Fragment, useActionState } from 'react'
import { formatPrice } from '@/lib/billing'
import { emitContractInvoiceAction } from '@/app/admin/facturation/contract-actions'
import type { ContractDraft } from '@/lib/invoicing'

type Props = {
  contracts: { id: string; numero_contrat: string; client_name: string }[]
  selectedContract: string | null
  year: number; month: number
  draft: ContractDraft | null
  alreadyIssued: string | null
  technicalError?: boolean
}

function formatCycle(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function ContractInvoicePreview({ contracts, selectedContract, year, month, draft, alreadyIssued, technicalError }: Props) {
  const [emitState, emitAction] = useActionState(emitContractInvoiceAction, null)
  function nav(next: Partial<{ contract: string; year: number; month: number }>) {
    const p = new URLSearchParams({
      contract: String(next.contract ?? selectedContract ?? ''),
      year:  String(next.year  ?? year),
      month: String(next.month ?? month),
    })
    window.location.href = `/admin/facturation?${p.toString()}`
  }
  const anchorLabel = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedContract ?? ''} onChange={e => nav({ contract: e.target.value })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {contracts.length === 0 && <option value="">Aucun contrat facturable</option>}
          {contracts.map(c => <option key={c.id} value={c.id}>{c.numero_contrat} — {c.client_name}</option>)}
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
        <span className="text-xs text-ink-muted">Cycle ancré sur {anchorLabel}</span>
      </div>

      {alreadyIssued && (
        <div className="px-4 py-3 rounded-lg bg-info-soft border border-info/20 text-sm text-info flex items-center justify-between">
          <span>Facture déjà émise pour ce cycle : <strong>{alreadyIssued}</strong></span>
          <a href="/admin/factures" className="underline">Voir les factures →</a>
        </div>
      )}

      {technicalError ? (
        <div className="px-4 py-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold">⛔ Blocage technique</p>
          <p className="mt-1">Impossible de lire les données de facturation (erreur de base de données). L&apos;aperçu et l&apos;émission sont bloqués pour éviter une facture erronée. Réessayez ; si le problème persiste, prévenez un administrateur.</p>
        </div>
      ) : !draft || draft.lines.length === 0 ? (
        <div className="text-center py-12 text-sm text-ink-muted">Aucune ligne facturable pour ce contrat sur ce cycle.</div>
      ) : (
        <>
          <div className="border border-line rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-soft">
              <div>
                <span className="font-semibold text-sm text-ink">{draft.numero_contrat} — {draft.client_name}</span>
                <span className="block text-xs text-ink-muted mt-0.5">Cycle {formatCycle(draft.period_start, draft.period_end)} (jour {draft.billing_day})</span>
              </div>
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
                    <Fragment key={i}>
                      <tr className="hover:bg-neutral-soft/50">
                        <td className="px-5 py-3 font-mono text-xs">
                          {l.machine_label}
                          {l.breakdown && <span className="ml-2 text-[10px] font-medium text-info bg-info-soft rounded-full px-2 py-0.5">Remplacement</span>}
                          {l.is_estimated && <span className="ml-2 text-[10px] font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Estimée</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-soft">{l.numero_contrat}</td>
                        <td className="px-4 py-3 text-xs text-ink-soft">{l.plan_name}</td>
                        <td className="px-4 py-3 text-right">{l.delta_bw.toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right">{l.delta_color.toLocaleString('fr-FR')}</td>
                        <td className="px-5 py-3 text-right font-semibold">{formatPrice(l.amount_total)}</td>
                      </tr>
                      {l.breakdown && l.breakdown.map((b, bi) => (
                        <tr key={`${i}-bd-${bi}`} className="bg-neutral-soft/30">
                          <td className="pl-10 pr-5 py-1.5 font-mono text-[11px] text-ink-muted" colSpan={3}>
                            ↳ {b.machine_label}
                          </td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-ink-muted">{b.delta_bw.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-ink-muted">{b.delta_color.toLocaleString('fr-FR')}</td>
                          <td className="px-5 py-1.5" />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!alreadyIssued && (
            <form action={emitAction} className="flex flex-wrap items-center justify-end gap-3">
              <input type="hidden" name="contract_id" value={draft.contract_id} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              {emitState?.error && (
                <p className="w-full text-sm text-red-600 font-medium" role="alert">⛔ {emitState.error}</p>
              )}
              {draft.has_estimated ? (
                <>
                  <p className="text-sm text-warning mr-auto">⚠️ Des machines n&apos;ont pas de relevé pour ce cycle. En forçant, ces lignes seront facturées au forfait (estimées).</p>
                  <button name="confirm_estimated" value="true" type="submit"
                    className="rounded-input bg-warning px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    Forcer la facturation (lignes estimées)
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
