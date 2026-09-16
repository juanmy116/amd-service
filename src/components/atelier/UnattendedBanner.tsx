import { AlertTriangle } from 'lucide-react'

type Props = {
  /** Cuántas averías siguen sin que nadie se haga cargo. */
  count: number
  /** Cuánto lleva esperando la más antigua, ya en francés («il y a 47 min»). */
  oldestLabel: string | null
}

/**
 * Franja de «nadie ha cogido esto todavía», bajo la cabecera del kiosko.
 *
 * No se quita con el tiempo ni con un clic: solo desaparece cuando deja de ser verdad, es decir,
 * cuando alguien asigna la avería o la pone en curso. Es lo que ve un técnico que vuelve de la
 * calle media hora después de que entrara, cuando el aviso de entrada ya se apagó hace rato.
 *
 * Va en el flujo, no flotando: en una TV encendida todo el día, un cartel superpuesto acabaría
 * tapando justo la avería de la que habla.
 */
export default function UnattendedBanner({ count, oldestLabel }: Props) {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-center gap-4 rounded-2xl border-2 border-white/25 bg-accent px-8 py-3.5 text-white shadow-lg"
    >
      <AlertTriangle size={30} className="shrink-0 animate-pulse" />
      <span className="font-display text-2xl font-extrabold tracking-tight">
        {count === 1 ? '1 panne non prise en charge' : `${count} pannes non prises en charge`}
      </span>
      {oldestLabel && (
        <span className="text-xl font-bold text-white/85">· la plus ancienne {oldestLabel}</span>
      )}
      <span className="text-lg font-semibold text-white/70">— assignez-la à un technicien</span>
    </div>
  )
}
