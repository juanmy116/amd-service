// Qué tarjeta de instalación enseñar al técnico. Puro (sin `window`) para poder testearlo;
// el componente le pasa los datos del navegador.
export type InstallHint = 'none' | 'ios' | 'ios-other' | 'other'

export const INSTALL_DISMISSED_KEY = 'amd-sav:install-card-dismissed'

type Input = {
  userAgent: string
  maxTouchPoints: number
  /** `display-mode: standalone` o `navigator.standalone` (iOS). */
  standalone: boolean
  dismissed: boolean
}

// Solo en el navegador (usa `window`/`navigator`): no se testea con vitest (entorno `node`),
// se verifica a mano en Safari/instalada. `installHint` la aísla para poder testear el resto.
export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function installHint({ userAgent, maxTouchPoints, standalone, dismissed }: Input): InstallHint {
  if (standalone || dismissed) return 'none'
  // iPadOS se anuncia como «Macintosh»: lo delata la pantalla táctil.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (isIOS) {
    // Los pasos de la tarjeta son los de Safari. Chrome/Firefox/Edge en iOS (CriOS/FxiOS/EdgiOS)
    // también pueden instalar desde iOS 16.4, pero con otro menú; y los navegadores integrados de
    // apps como WhatsApp (sin "Safari/" en el UA) no pueden. Un único camino fiable: abrir en Safari.
    const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS/.test(userAgent) || !/Safari\//.test(userAgent)
    return isOtherIosBrowser ? 'ios-other' : 'ios'
  }
  if (/Android/.test(userAgent)) return 'other'
  return 'none'
}
