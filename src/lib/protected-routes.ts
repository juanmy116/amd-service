// Prefijos que exigen sesión (los aplica src/proxy.ts). Comparación por `startsWith`, así que
// cualquier fichero público que empiece por uno de ellos (p. ej. `/tech.webmanifest`) quedaría
// tras el login — por eso el manifest de la PWA se llama `/amd-sav.webmanifest`.
export const PROTECTED_ROUTES = ['/admin', '/portal', '/tech', '/atelier'] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some(r => pathname.startsWith(r))
}
