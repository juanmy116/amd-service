import { techManifest } from '@/lib/pwa/manifest'

export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(techManifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  })
}
