'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, Smartphone, X } from 'lucide-react'
import { INSTALL_DISMISSED_KEY, installHint, isStandaloneDisplay, type InstallHint } from '@/lib/pwa/display'

function readDismissed(): boolean {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1' } catch { return false }
}

// Guía para instalar la app en la pantalla de inicio. Solo se ve en móvil, mientras la app se use
// desde el navegador. El técnico puede cerrarla (recordado en este aparato).
export function InstallCard() {
  const [hint, setHint] = useState<InstallHint>('none')

  useEffect(() => {
    setHint(installHint({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: isStandaloneDisplay(),
      dismissed: readDismissed(),
    }))
  }, [])

  if (hint === 'none') return null

  function dismiss() {
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1') } catch { /* modo privado: se cierra igual */ }
    setHint('none')
  }

  return (
    <div className="relative rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-2 mb-3 pr-8">
        <Smartphone size={18} className="text-accent" />
        <p className="text-sm font-semibold text-ink">Installez l&apos;application AMD SAV</p>
      </div>
      {hint === 'ios' ? (
        <ol className="space-y-2 text-sm text-ink">
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">1.</span> Touchez
            <Share size={16} className="text-info" aria-hidden /> Partager (ou « ⋯ » puis Partager)
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">2.</span> Choisissez
            <SquarePlus size={16} aria-hidden /> « Sur l&apos;écran d&apos;accueil »
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">3.</span> Touchez « Ajouter »
          </li>
        </ol>
      ) : hint === 'ios-other' ? (
        <p className="text-sm text-ink">
          Pour installer l&apos;application, ouvrez cette page dans <strong>Safari</strong> : copiez le lien et
          collez-le dans Safari.
        </p>
      ) : hint === 'android-other' ? (
        <p className="text-sm text-ink">
          Pour installer l&apos;application, ouvrez cette page dans <strong>Chrome</strong> : copiez le lien et
          collez-le dans Chrome.
        </p>
      ) : (
        <p className="text-sm text-ink">
          Ouvrez le menu du navigateur (⋮) et choisissez « Installer l&apos;application ».
        </p>
      )}
      <p className="text-xs text-ink-muted mt-3">
        Ensuite, ouvrez AMD SAV depuis l&apos;écran d&apos;accueil et reconnectez-vous une fois avec
        votre email et votre mot de passe.
      </p>
    </div>
  )
}
