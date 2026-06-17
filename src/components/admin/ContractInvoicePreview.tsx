'use client'
import { Fragment, useActionState } from 'react'
import { formatPrice } from '@/lib/billing'
import { emitContractInvoiceAction } from '@/app/admin/facturation/contract-actions'
import type { ContractDraft, ReadyToBillEntry } from '@/lib/invoicing'

type Props = {
  entries: ReadyToBillEntry[]
  selected: ReadyToBillEntry | null
  draft: ContractDraft | null
  alreadyIssued: string | null
  technicalError?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
function entryKey(e: { contract_id: string; period_year: number; period_month: number }): string {
  return `${e.contract_id}|${e.period_year}|${e.period_month}`
}

export default function ContractInvoicePreview({ entries, selected, draft, alreadyIssued, technicalError }: Props) {
  const [emitState, emitAction] = useActionState(emitContractInvoiceAction, null)

  function selectEntry(key: string) {
    const [contract, year, month] = key.split('|')
    const p = new URLSearchParams({ contract, year, month })
    window.location.href = `/admin/facturation?${p.toString()}`
  }

  if (!technicalError && entries.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-ink-muted">
        Rien à facturer pour le moment. Un contrat apparaît ici dès qu&apos;un relevé clôture un mois.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selected ? entryKey(selected) : ''}
          onChange={e => selectEntry(e.target.value)}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink min-w-[22rem]">
          {entries.length === 0 && <option value="">Aucun contrat à facturer</option>}
          {entries.map(e => (
            <option key={entryKey(e)} value={entryKey(e)}>
              {e.numero_contrat} — {e.client_name} · {monthLabel(e.period_year, e.period_month)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">Période réelle entre relevés</span>
      </div>

      {alreadyIssued && (
        <div className="px-4 py-3 rounded-lg bg-info-soft border border-info/20 text-sm text-info flex items-center justify-between">
          <span>Facture déjà émise pour ce mois : <strong>{alreadyIssued}</strong></span>
          <a href="/admin/factures" className="underline">Voir les factures →</a>
        </div>
      )}

      {technicalError ? (
        <div className="px-4 py-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold">⛔ Blocage technique</p>
          <p className="mt-1">Impossible de lire les données de facturation (erreur de base de données). L&apos;aperçu et l&apos;émission sont bloqués pour éviter une facture erronée. Réessayez ; si le problème persiste, prévenez un administrateur.</p>
        </div>
      ) : !draft || draft.lines.length === 0 ? (
        <div className="text-center py-12 text-sm text-ink-muted">Aucune ligne facturable pour ce mois.</div>
      ) : (
        <>
          <div className="border border-line rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-soft">
              <div>
                <span className="font-semibold text-sm text-ink">{draft.numero_contrat} — {draft.client_name}</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  {monthLabel(draft.period_year, draft.period_month)} · période {formatDate(draft.period_start)} – {formatDate(draft.period_end)}
                </span>
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
              <input type="hidden" name="year" value={draft.period_year} />
              <input type="hidden" name="month" value={draft.period_month} />
              {emitState?.error && (
                <p className="w-full text-sm text-red-600 font-medium" role="alert">⛔ {emitState.error}</p>
              )}
              {draft.has_estimated ? (
                <>
                  <p className="text-sm text-warning mr-auto">⚠️ Des machines n&apos;ont pas de relevé pour ce mois. En forçant, ces lignes seront facturées au forfait (estimées).</p>
                  <button name="confirm_estimated" value="true" type="submit"
                    className="rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    Forcer la facturation (lignes estimées)
                  </button>
                </>
              ) : (
                <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
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
