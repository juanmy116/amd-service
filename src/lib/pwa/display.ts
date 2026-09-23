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

export function installHint({ userAgent, maxTouchPoints, standalone, dismissed }: Input): InstallHint {
  if (standalone || dismissed) return 'none'
  // iPadOS se anuncia como «Macintosh»: lo delata la pantalla táctil.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (isIOS) {
    // «Añadir a pantalla de inicio» solo existe en el Safari real. Chrome/Firefox/Edge en iOS
    // (CriOS/FxiOS/EdgiOS) usan el motor de Safari pero no tienen esa opción; y los navegadores
    // integrados de apps como WhatsApp no llevan "Safari/" en el UA. En ambos casos hay que
    // pedirle al técnico que abra el enlace en Safari.
    const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS/.test(userAgent) || !/Safari\//.test(userAgent)
    return isOtherIosBrowser ? 'ios-other' : 'ios'
  }
  if (/Android/.test(userAgent)) return 'other'
  return 'none'
}
