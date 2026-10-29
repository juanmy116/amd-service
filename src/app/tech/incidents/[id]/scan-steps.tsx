'use client'

import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, ScanLine } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { CloseAction } from '@/lib/scanGate'

// Piezas de la ficha en 3 pasos del técnico de campo (Démarrer → Rapport → Clôturer). Solo
// presentación: el estado, los escaneos y el envío viven en `intervention-form.tsx`.

export const hhmm = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// «M:SS» hasta `from` (redondeado hacia arriba: nunca marca 0:00 antes de tiempo).
function countdown(from: Date, now: Date) {
  const s = Math.max(0, Math.ceil((from.getTime() - now.getTime()) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const PRIMARY_BUTTON =
  'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-accent disabled:opacity-60 transition-opacity'
export const SECONDARY_BUTTON =
  'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold border border-line bg-card text-ink disabled:opacity-60 transition-opacity'

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
      {children}
    </div>
  )
}

export function StepSection({ title, done = false, locked = false, children }: {
  title: string
  done?: boolean
  locked?: boolean
  children: ReactNode
}) {
  return (
    <section className={`space-y-3 ${locked ? 'opacity-60' : ''}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {done && <CheckCircle2 size={16} className="text-success shrink-0" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

export function LockedStep({ title }: { title: string }) {
  return (
    <StepSection title={title} locked>
      <Card className="p-4">
        <p className="text-sm text-ink-soft">Disponible après le scan de démarrage.</p>
      </Card>
    </StepSection>
  )
}

export function StartStep({ started, firstScanAt, error, onScan }: {
  started: boolean
  firstScanAt: Date | null
  error: string | null
  onScan: () => void
}) {
  return (
    <StepSection title="1. Démarrer" done={started}>
      <Card className="p-4 space-y-3">
        {started ? (
          <p className="text-sm text-ink-soft">
            {firstScanAt ? `Démarrée — scan à ${hhmm(firstScanAt)}` : 'Démarrée'}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Arrivé devant la machine ? Scannez son QR pour démarrer l&apos;intervention.
            </p>
            {error && <ErrorBox>{error}</ErrorBox>}
            <button type="button" onClick={onScan} className={PRIMARY_BUTTON}>
              <ScanLine size={16} />
              Scanner pour démarrer
            </button>
          </>
        )}
      </Card>
    </StepSection>
  )
}

export function CloseStep({ closed, action, now, hasRapport, error, busy, spinning, locating, onScan, onConfirm }: {
  /** Avería ya `résolu` o `fermé`: no queda nada que cerrar. */
  closed: boolean
  action: CloseAction
  now: Date
  hasRapport: boolean
  error: string | null
  /** Envío o localización en curso: ningún botón responde. */
  busy: boolean
  /** El envío en curso es el cierre (spinner en este botón, no en el de guardar). */
  spinning: boolean
  locating: boolean
  onScan: () => void
  onConfirm: () => void
}) {
  return (
    <StepSection title="3. Clôturer" done={closed}>
      <Card className="p-4 space-y-3">
        {closed ? (
          <>
            <p className="text-sm text-ink-soft">Intervention clôturée.</p>
            {error && <ErrorBox>{error}</ErrorBox>}
          </>
        ) : (
          <>
            {action.kind === 'scan' && (
              <p className="text-sm text-ink-soft">
                Scannez à nouveau le QR de la machine : l&apos;intervention sera clôturée.
              </p>
            )}
            {action.kind === 'wait' && (
              // La cuenta atrás depende de la hora del navegador: en la hidratación puede diferir
              // un segundo de la del servidor.
              <p className="text-sm text-ink-soft" suppressHydrationWarning>
                Scan de clôture possible dans {countdown(action.from, now)}
              </p>
            )}
            {action.kind === 'confirm' && (
              <p className="text-sm text-ink-soft">
                Scan de clôture enregistré — clôture possible jusqu&apos;à {hhmm(action.until)}.
              </p>
            )}
            {!hasRapport && (
              <p className="text-sm font-medium text-accent">Écrivez d&apos;abord le rapport (étape 2).</p>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            {action.kind === 'confirm' ? (
              <button type="button" onClick={onConfirm} disabled={!hasRapport || busy} className={PRIMARY_BUTTON}>
                {spinning && <Loader2 size={16} className="animate-spin" />}
                {locating ? 'Localisation…' : <>Clôturer l&apos;intervention</>}
              </button>
            ) : (
              <button
                type="button"
                onClick={onScan}
                disabled={!hasRapport || busy || action.kind === 'wait'}
                className={PRIMARY_BUTTON}
              >
                {spinning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
                Scanner pour clôturer
              </button>
            )}
          </>
        )}
      </Card>
    </StepSection>
  )
}
