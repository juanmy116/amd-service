/**
 * Extrae el nº de serie del contenido de un QR de máquina.
 *
 * El QR codifica la URL del gateway (`.../m/<serie>`), pero toleramos también
 * rutas antiguas (`/maquina/`, `/tech/scan/`), una ruta relativa y un nº de
 * serie suelto. Función pura — testeada en `qr.test.ts`.
 */
export function extractSerie(raw: string): string {
  const t = raw.trim()
  try {
    const segs = new URL(t).pathname.split('/').filter(Boolean)
    return decodeURIComponent(segs.at(-1) ?? t)
  } catch {
    const m = t.match(/\/(?:m|maquina|tech\/scan)\/([^/?#]+)/)
    if (m) return decodeURIComponent(m[1])
    if (t.startsWith('/')) {
      const segs = t.split('/').filter(Boolean)
      return decodeURIComponent(segs.at(-1) ?? t)
    }
    return t
  }
}
