import type { MetadataRoute } from 'next'

// Manifest de la PWA de técnicos. NO se usa la convención `app/manifest.ts` porque Next lo
// enlazaría en TODAS las páginas, y la web pública no debe ofrecerse como «app AMD SAV».
// Solo lo enlaza el layout de /tech.
export const MANIFEST_PATH = '/amd-sav.webmanifest'

const RED = '#BF0D0D'

export const techManifest: MetadataRoute.Manifest = {
  name: 'AMD SAV',
  short_name: 'AMD SAV',
  description: 'Interventions et maintenances AMD Service',
  lang: 'fr',
  // Identidad estable de la app instalada, aunque cambie start_url.
  id: '/tech',
  start_url: '/tech',
  scope: '/',
  display: 'standalone',
  background_color: RED,
  theme_color: RED,
  icons: [
    { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
