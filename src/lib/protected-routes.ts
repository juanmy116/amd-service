// Prefijos que exigen sesión (los aplica src/proxy.ts). Solo protege la ruta exacta o una
// subruta suya (`/tech`, `/tech/incidents/1`) — una ruta que solo EMPIEZA por el mismo texto
// (`/tech.webmanifest`, `/technologies`) no cuenta y queda pública.
const PROTECTED_ROUTES = ['/admin', '/portal', '/tech', '/atelier'] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}
