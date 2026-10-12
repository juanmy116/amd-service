import { headers } from 'next/headers'

// Dirección pública de la app para los enlaces de los correos de Supabase Auth (confirmación de
// alta, recuperación de contraseña). En prod manda NEXT_PUBLIC_APP_URL; si falta, la de la
// petición.
export async function getAppOrigin(): Promise<string> {
  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
}
