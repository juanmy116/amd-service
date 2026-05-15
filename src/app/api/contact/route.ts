import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

const VALID_NEEDS = new Set(['rental', 'sales', 'management', 'maintenance', 'other'])

export async function POST(req: NextRequest) {
  // Block cross-origin requests (CSRF prevention)
  const origin = req.headers.get('origin')
  if (origin) {
    const host = req.headers.get('host') ?? ''
    if (!origin.includes(host)) {
      return NextResponse.json({ success: false, message: 'Requête non autorisée.' }, { status: 403 })
    }
  }

  const ip = getClientIpFromHeaders(req.headers)
  const ok = await checkRateLimit('contact', ip)
  if (!ok) {
    return NextResponse.json({ success: false, message: 'Trop de demandes. Réessayez plus tard.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Corps de requête invalide.' }, { status: 400 })
  }

  const name    = typeof body.name    === 'string' ? body.name.trim()    : ''
  const email   = typeof body.email   === 'string' ? body.email.trim()   : ''
  const company = typeof body.company === 'string' ? body.company.trim() : ''
  const phone   = typeof body.phone   === 'string' ? body.phone.trim()   : ''
  const needs   = typeof body.needs   === 'string' ? body.needs          : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!name    || name.length    > 100) return NextResponse.json({ success: false, message: 'Nom invalide.' },        { status: 422 })
  if (!email   || email.length   > 254) return NextResponse.json({ success: false, message: 'Email invalide.' },      { status: 422 })
  if (!company || company.length > 150) return NextResponse.json({ success: false, message: 'Entreprise invalide.' }, { status: 422 })
  if (!phone   || phone.length   > 30)  return NextResponse.json({ success: false, message: 'Téléphone invalide.' },  { status: 422 })
  if (!VALID_NEEDS.has(needs))          return NextResponse.json({ success: false, message: 'Besoin invalide.' },     { status: 422 })
  if (message.length > 2000)            return NextResponse.json({ success: false, message: 'Message trop long.' },   { status: 422 })

  // TODO: Supabase — store lead
  // TODO: Mailjet — send confirmation email

  return NextResponse.json({ success: true, message: 'Message reçu' }, { status: 200 })
}
