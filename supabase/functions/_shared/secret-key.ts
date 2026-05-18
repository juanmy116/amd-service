// SUPABASE_SECRET_KEYS es auto-inyectada por la plataforma como JSON con alias.
// Formato: {"default":"sb_secret_...", "<alias>":"sb_secret_..."}.
// Reemplaza a la legacy SUPABASE_SERVICE_ROLE_KEY (JWT) en Edge Functions.

function parseKeys(): Record<string, string> {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? ''
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

export function getSecretKey(): string {
  const keys = parseKeys()
  return keys.default ?? Object.values(keys)[0] ?? ''
}

export function getAllSecretKeys(): string[] {
  return Object.values(parseKeys()).filter(v => typeof v === 'string' && v.length > 0)
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function isValidSecretKey(token: string): boolean {
  if (!token) return false
  for (const key of getAllSecretKeys()) {
    if (timingSafeEqual(token, key)) return true
  }
  return false
}
