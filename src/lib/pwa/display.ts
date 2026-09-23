// Qué tarjeta de instalación enseñar al técnico. Puro (sin `window`) para poder testearlo;
// el componente le pasa los datos del navegador.
export type InstallHint = 'none' | 'ios' | 'ios-other' | 'android-other' | 'other'

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
    // Los pasos de la tarjeta son los de Safari. Chrome/Firefox/Edge/Google/DuckDuckGo/Opera en
    // iOS (CriOS/FxiOS/EdgiOS/GSA/DuckDuckGo/Ddg/OPT) también pueden instalar desde iOS 16.4, pero
    // con otro menú; algunos (como GSA) SÍ llevan "Safari/" en el UA, así que hace falta nombrarlos
    // uno a uno. Los navegadores integrados de apps sin ninguno de esos rastros (sin "Safari/" en
    // el UA) tampoco pueden. Un único camino fiable: abrir en Safari.
    const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|GSA\/|DuckDuckGo|Ddg\/|OPT\//.test(userAgent) || !/Safari\//.test(userAgent)
    return isOtherIosBrowser ? 'ios-other' : 'ios'
  }
  if (/Android/.test(userAgent)) {
    // Los navegadores integrados de Android (WhatsApp, Instagram…) usan un WebView que se
    // identifica con "; wv)" en el UA y no puede instalar: hace falta abrir el enlace en Chrome.
    return /; wv\)/.test(userAgent) ? 'android-other' : 'other'
  }
  return 'none'
}
