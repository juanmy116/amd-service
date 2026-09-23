// Qué tarjeta de instalación enseñar al técnico. Puro (sin `window`) para poder testearlo;
// el componente le pasa los datos del navegador.
export type InstallHint = 'none' | 'ios' | 'other'

export const INSTALL_DISMISSED_KEY = 'amd-sav:install-card-dismissed'

type Input = {
  userAgent: string
  maxTouchPoints: number
  /** `display-mode: standalone` o `navigator.standalone` (iOS). */
  standalone: boolean
  dismissed: boolean
}

export function installHint({ userAgent, maxTouchPoints, standalone, dismissed }: Input): InstallHint {
  if (standalone || dismissed) return 'none'
  // iPadOS se anuncia como «Macintosh»: lo delata la pantalla táctil.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/.test(userAgent)) return 'other'
  return 'none'
}
