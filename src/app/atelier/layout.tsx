import type { ReactNode } from 'react'

/**
 * Layout del kiosko del taller.
 *
 * El `font-size` del documento sube un 15 % SOLO en estas páginas: probado en la TV de AMD, el
 * texto por defecto se leía justo desde donde está el despachador.
 *
 * Se hace así, y no con el zoom del navegador (`--force-device-scale-factor`), porque eso obliga
 * a la Raspberry Pi 3 a escalar toda la imagen y se quedó en pantalla blanca al intentarlo. Subir
 * el tamaño base no le cuesta nada: dibuja las mismas cosas, un poco más grandes.
 *
 * Como las medidas de Tailwind van en `rem`, con esto crecen a la vez texto, márgenes y
 * separaciones, y el tablero mantiene sus proporciones. El alto sigue siendo la pantalla
 * (`h-screen` va en `vh`), así que no aparecen barras de desplazamiento.
 */
const KIOSK_FONT_SCALE = '115%'

export default function AtelierLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`:root { font-size: ${KIOSK_FONT_SCALE}; }`}</style>
      <div className="h-screen w-screen overflow-hidden bg-[#0E0E12] text-white">
        {children}
      </div>
    </>
  )
}
