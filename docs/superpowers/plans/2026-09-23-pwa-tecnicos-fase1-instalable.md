# PWA técnicos — Fase 1: App instalable · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un técnico pueda «Añadir a pantalla de inicio» desde Safari y obtener la app «AMD SAV» (icono blanco sobre rojo, pantalla completa, abre en `/tech`, nada tapado por la barra de gestos), más una tarjeta que enseña a instalarla.

**Architecture:** manifest servido por una ruta propia (`/amd-sav.webmanifest`) y enlazado **solo** desde el layout de `/tech` (la web pública no debe ofrecerse como app). Iconos PNG generados una vez con `sharp` a partir del logo existente y versionados en `public/pwa/`. Service worker mínimo (`/sw.js`, sin caché) que sirve de base a la Fase 2 (push) y 4 (offline). La lógica pura (manifest, detección de modo instalado, rutas protegidas) vive en `src/lib/` con tests vitest.

**Tech Stack:** Next.js 16 (App Router, `Metadata`/`Viewport`), Tailwind v4, sharp, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-pwa-tecnicos-design.md` §Fase 1.

---

## Dos trampas detectadas al preparar el plan

1. **El nombre del manifest no puede empezar por `/tech`.** `src/proxy.ts` protege con
   `pathname.startsWith('/tech')`, así que `/tech.webmanifest` o `/tech-manifest.json` redirigirían
   a `/login` — y iOS descarga el manifest **sin cookies**. Por eso se llama `/amd-sav.webmanifest`
   y un test lo blinda (Task 2).
2. **`Permissions-Policy: geolocation=()`** en `next.config.ts` bloquea la geolocalización en todo
   el sitio. No afecta a esta fase, pero **la Fase 3 tiene que cambiarlo a `geolocation=(self)`**.
   Anotarlo en el spec (Task 8).

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `scripts/generate-pwa-icons.mjs` | Crear | Genera los 4 PNG desde `logo-amd-blanco.svg` |
| `public/pwa/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Crear (generados) | Iconos de la app |
| `src/lib/protected-routes.ts` + `.test.ts` | Crear | Lista única de prefijos protegidos (la usa `proxy.ts`) |
| `src/proxy.ts` | Modificar | Usar `isProtectedPath` |
| `src/lib/pwa/manifest.ts` + `.test.ts` | Crear | Objeto manifest tipado + ruta pública |
| `src/app/amd-sav.webmanifest/route.ts` | Crear | Sirve el manifest |
| `src/lib/pwa/display.ts` + `.test.ts` | Crear | ¿Está instalada? ¿Es iOS? ¿Mostrar la tarjeta? |
| `public/sw.js` | Crear | Service worker mínimo |
| `next.config.ts` | Modificar | Cabeceras de `/sw.js` |
| `src/components/tech/ServiceWorkerRegister.tsx` | Crear | Registra el SW en `/tech` |
| `src/components/tech/InstallCard.tsx` | Crear | Tarjeta «Installer l'application» |
| `src/app/tech/layout.tsx` | Modificar | `metadata` + `viewport` + zonas seguras + registro SW |
| `src/app/tech/tech-nav.tsx` | Modificar | Zona segura inferior |
| `src/app/tech/page.tsx` | Modificar | Insertar `InstallCard` |
| `tests/e2e/pwa.spec.ts` | Crear | Manifest y SW accesibles sin sesión |
| `docs/architecture.md`, spec | Modificar | Documentar |

Rama: `feat/pwa-tecnicos-fase1` desde `main` actualizado.

---

### Task 1: Iconos de la app

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create (salida): `public/pwa/*.png`

- [ ] **Step 1: Escribir el script**

```js
// Genera los iconos de la PWA de técnicos («AMD SAV») a partir del logo blanco, sobre el rojo
// corporativo. Se ejecuta a mano cuando cambie el logo; los PNG resultantes se versionan.
//   node scripts/generate-pwa-icons.mjs
import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'

const RED = { r: 0xbf, g: 0x0d, b: 0x0d }
const OUT = 'public/pwa'
const logo = await readFile('public/images/logos/logo-amd-blanco.svg')

// logoRatio = ancho del logo respecto al lado del icono. El maskable deja más margen porque
// Android lo recorta en círculo (zona segura = 80 % central).
const ICONS = [
  { file: 'icon-192.png',          size: 192, logoRatio: 0.78 },
  { file: 'icon-512.png',          size: 512, logoRatio: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, logoRatio: 0.6 },
  { file: 'apple-touch-icon.png',  size: 180, logoRatio: 0.78 },
]

await mkdir(OUT, { recursive: true })

for (const { file, size, logoRatio } of ICONS) {
  const logoPng = await sharp(logo).resize({ width: Math.round(size * logoRatio) }).png().toBuffer()
  // channels: 3 ⇒ sin canal alfa. iOS pinta de NEGRO cualquier transparencia del apple-touch-icon.
  await sharp({ create: { width: size, height: size, channels: 3, background: RED } })
    .composite([{ input: logoPng, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`)
  console.log(`✓ ${OUT}/${file} (${size}×${size})`)
}
```

- [ ] **Step 2: Ejecutarlo**

Run: `node scripts/generate-pwa-icons.mjs`
Expected: 4 líneas `✓ public/pwa/... (N×N)`.

- [ ] **Step 3: Verificar tamaño y ausencia de alfa**

Run: `for f in public/pwa/*.png; do sips -g pixelWidth -g hasAlpha "$f"; done`
Expected: anchos 192 / 512 / 512 / 180 y `hasAlpha: no` en los cuatro.

- [ ] **Step 4: Mirarlos** (abrir `public/pwa/icon-512.png` y `icon-maskable-512.png`): logo blanco centrado, legible, sin recortes.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-pwa-icons.mjs public/pwa/
git commit -m "feat(pwa): iconos AMD SAV generados desde el logo blanco"
```

---

### Task 2: Rutas protegidas en un solo sitio

**Files:**
- Create: `src/lib/protected-routes.ts`, `src/lib/protected-routes.test.ts`
- Modify: `src/proxy.ts:4,35`

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { isProtectedPath } from './protected-routes'

describe('isProtectedPath', () => {
  it('protege las cuatro zonas privadas', () => {
    for (const p of ['/admin', '/portal/x', '/tech', '/tech/incidents/1', '/atelier']) {
      expect(isProtectedPath(p)).toBe(true)
    }
  })

  it('deja públicos los ficheros de la PWA (iOS los pide sin cookies)', () => {
    expect(isProtectedPath('/amd-sav.webmanifest')).toBe(false)
    expect(isProtectedPath('/sw.js')).toBe(false)
  })

  it('documenta la trampa: cualquier ruta que EMPIECE por /tech queda protegida', () => {
    expect(isProtectedPath('/tech.webmanifest')).toBe(true)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/protected-routes.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/lib/protected-routes.ts`:

```ts
// Prefijos que exigen sesión (los aplica src/proxy.ts). Comparación por `startsWith`, así que
// cualquier fichero público que empiece por uno de ellos (p. ej. `/tech.webmanifest`) quedaría
// tras el login — por eso el manifest de la PWA se llama `/amd-sav.webmanifest`.
export const PROTECTED_ROUTES = ['/admin', '/portal', '/tech', '/atelier'] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some(r => pathname.startsWith(r))
}
```

En `src/proxy.ts`: borrar `const PROTECTED_ROUTES = [...]` (línea 4), añadir
`import { isProtectedPath } from '@/lib/protected-routes'` y sustituir la línea 35 por:

```ts
  const isProtected = isProtectedPath(pathname)
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/protected-routes.test.ts && npm run typecheck`
Expected: 3 tests PASS, typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/protected-routes.ts src/lib/protected-routes.test.ts src/proxy.ts
git commit -m "refactor(proxy): rutas protegidas en src/lib/protected-routes con test"
```

---

### Task 3: Manifest

**Files:**
- Create: `src/lib/pwa/manifest.ts`, `src/lib/pwa/manifest.test.ts`, `src/app/amd-sav.webmanifest/route.ts`

- [ ] **Step 1: Test que falla**

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isProtectedPath } from '@/lib/protected-routes'
import { MANIFEST_PATH, techManifest } from './manifest'

describe('techManifest', () => {
  it('abre la app de técnicos a pantalla completa', () => {
    expect(techManifest.name).toBe('AMD SAV')
    expect(techManifest.short_name).toBe('AMD SAV')
    expect(techManifest.start_url).toBe('/tech')
    expect(techManifest.scope).toBe('/') // /login y /dashboard deben seguir dentro de la app
    expect(techManifest.display).toBe('standalone')
  })

  it('todos los iconos existen en public/', () => {
    for (const icon of techManifest.icons ?? []) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true)
    }
  })

  it('incluye un icono maskable de 512', () => {
    expect(techManifest.icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }))
  })

  it('se sirve fuera de las rutas protegidas', () => {
    expect(isProtectedPath(MANIFEST_PATH)).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/pwa/manifest.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/lib/pwa/manifest.ts`:

```ts
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
  start_url: '/tech',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: RED,
  theme_color: RED,
  icons: [
    { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
```

`src/app/amd-sav.webmanifest/route.ts`:

```ts
import { techManifest } from '@/lib/pwa/manifest'

export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(techManifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  })
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/pwa/manifest.test.ts && npm run typecheck`
Expected: 4 tests PASS.

Run: `npm run dev` y en otra terminal `curl -si http://localhost:3000/amd-sav.webmanifest | head -5`
Expected: `HTTP/1.1 200` y `content-type: application/manifest+json` (sin redirección a `/login`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/manifest.ts src/lib/pwa/manifest.test.ts src/app/amd-sav.webmanifest/route.ts
git commit -m "feat(pwa): manifest AMD SAV servido en /amd-sav.webmanifest"
```

---

### Task 4: Detección de modo instalado

**Files:**
- Create: `src/lib/pwa/display.ts`, `src/lib/pwa/display.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { installHint } from './display'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const MAC = IPAD_DESKTOP_UA

describe('installHint', () => {
  it('ya instalada ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, dismissed: false })).toBe('none')
  })

  it('cerrada por el técnico ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: true })).toBe('none')
  })

  it('iPhone en Safari ⇒ pasos de iOS', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('ios')
  })

  it('iPad (se anuncia como Mac pero es táctil) ⇒ pasos de iOS', () => {
    expect(installHint({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('ios')
  })

  it('Android ⇒ indicación genérica', () => {
    expect(installHint({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('other')
  })

  it('ordenador (sin pantalla táctil) ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: MAC, maxTouchPoints: 0, standalone: false, dismissed: false })).toBe('none')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/pwa/display.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

```ts
// Qué tarjeta de instalación enseñar al técnico. Puro (sin `window`) para poder testearlo;
// el componente le pasa los datos del navegador.
export type InstallHint = 'none' | 'ios' | 'other'

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
  if (isIOS) return 'ios'
  if (/Android/.test(userAgent)) return 'other'
  return 'none'
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/pwa/display.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/display.ts src/lib/pwa/display.test.ts
git commit -m "feat(pwa): installHint decide qué guía de instalación mostrar"
```

---

### Task 5: Service worker mínimo

**Files:**
- Create: `public/sw.js`, `src/components/tech/ServiceWorkerRegister.tsx`
- Modify: `next.config.ts` (función `headers()`)

- [ ] **Step 1: `public/sw.js`**

```js
// Service worker de la PWA de técnicos. Fase 1: no cachea NADA (sin manejador `fetch`), solo
// existe y toma el control al instante. La Fase 2 añadirá `push`/`notificationclick` y la
// Fase 4 la caché de solo lectura.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
```

- [ ] **Step 2: Cabeceras en `next.config.ts`** — añadir un segundo objeto al array que devuelve
`headers()`, después del de `source: '/(.*)'`:

```ts
      {
        // El navegador debe pedir siempre la última versión del service worker; si se cachea,
        // un arreglo tardaría días en llegar a los móviles.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type',  value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
```

- [ ] **Step 3: `src/components/tech/ServiceWorkerRegister.tsx`**

```tsx
'use client'

import { useEffect } from 'react'

// Registra /sw.js al entrar en /tech. Silencioso si el navegador no lo soporta: la app funciona
// igual, solo sin las capacidades que llegarán en fases siguientes.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(err => {
      console.error('[pwa] registro del service worker fallido', err)
    })
  }, [])
  return null
}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck`
Expected: sin errores.

Run (con `npm run dev` en marcha): `curl -sI http://localhost:3000/sw.js | grep -i -E "content-type|cache-control"`
Expected: `application/javascript; charset=utf-8` y `no-cache, no-store, must-revalidate`.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/components/tech/ServiceWorkerRegister.tsx next.config.ts
git commit -m "feat(pwa): service worker mínimo y sus cabeceras"
```

---

### Task 6: Layout de `/tech` — metadatos, zonas seguras y registro

**Files:**
- Modify: `src/app/tech/layout.tsx`, `src/app/tech/tech-nav.tsx:18`

- [ ] **Step 1: Metadatos y viewport** — en `src/app/tech/layout.tsx`, añadir arriba:

```tsx
import type { Metadata, Viewport } from 'next'
import { MANIFEST_PATH } from '@/lib/pwa/manifest'
import { ServiceWorkerRegister } from '@/components/tech/ServiceWorkerRegister'

// Solo /tech se ofrece como app instalable (ver src/lib/pwa/manifest.ts).
export const metadata: Metadata = {
  manifest: MANIFEST_PATH,
  appleWebApp: { capable: true, title: 'AMD SAV', statusBarStyle: 'default' },
  icons: { apple: '/pwa/apple-touch-icon.png' },
}

// viewportFit: 'cover' hace que env(safe-area-inset-*) tenga valor en el iPhone instalado;
// sin él, la barra de gestos tapa la navegación inferior.
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#BF0D0D',
}
```

- [ ] **Step 2: Zonas seguras en el layout** — en el JSX de `TechLayout`:
  - `<div className="max-w-lg mx-auto lg:max-w-none pb-20 lg:pb-0">` →
    `<div className="max-w-lg mx-auto lg:max-w-none pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">`
  - `<div className="lg:hidden fixed bottom-16 left-0 right-0 ...">` (botón «Scanner une machine») →
    sustituir `bottom-16` por `bottom-[calc(4rem+env(safe-area-inset-bottom))]`.
  - Añadir `<ServiceWorkerRegister />` como primer hijo del `<div className="min-h-screen bg-page">`.

- [ ] **Step 3: Zona segura en la navegación** — en `src/app/tech/tech-nav.tsx:18`, añadir
`pb-[env(safe-area-inset-bottom)]` al `<nav>`:

```tsx
    <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-chrome border-t border-chrome-line z-10 pb-[env(safe-area-inset-bottom)]">
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run build`
Expected: ambos OK; en la salida del build aparece la ruta `/amd-sav.webmanifest` como estática (○).

Con `npm run dev`, iniciar sesión como técnico y en `view-source:` de `/tech` comprobar:
`<link rel="manifest" href="/amd-sav.webmanifest">`, `<link rel="apple-touch-icon" ...>`,
`<meta name="apple-mobile-web-app-title" content="AMD SAV">`, `viewport-fit=cover`.
En `/` (web pública) **no** debe aparecer el `rel="manifest"`.

- [ ] **Step 5: Commit**

```bash
git add src/app/tech/layout.tsx src/app/tech/tech-nav.tsx
git commit -m "feat(pwa): /tech enlaza el manifest, registra el SW y respeta las zonas seguras"
```

---

### Task 7: Tarjeta «Installer l'application»

**Files:**
- Create: `src/components/tech/InstallCard.tsx`
- Modify: `src/app/tech/page.tsx` (tras el bloque «Header móvil», antes de «Header desktop»)

- [ ] **Step 1: Componente**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, Smartphone, X } from 'lucide-react'
import { INSTALL_DISMISSED_KEY, installHint, type InstallHint } from '@/lib/pwa/display'

function readDismissed(): boolean {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1' } catch { return false }
}

// Guía para instalar la app en la pantalla de inicio. Solo se ve en móvil, mientras la app se use
// desde el navegador. El técnico puede cerrarla (recordado en este aparato).
export function InstallCard() {
  const [hint, setHint] = useState<InstallHint>('none')

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setHint(installHint({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone,
      dismissed: readDismissed(),
    }))
  }, [])

  if (hint === 'none') return null

  function dismiss() {
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1') } catch { /* modo privado: se cierra igual */ }
    setHint('none')
  }

  return (
    <div className="relative rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-2 mb-3 pr-8">
        <Smartphone size={18} className="text-accent" />
        <p className="text-sm font-semibold text-ink">Installez l&apos;application AMD SAV</p>
      </div>
      {hint === 'ios' ? (
        <ol className="space-y-2 text-sm text-ink">
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">1.</span> Touchez
            <Share size={16} className="text-info" aria-label="Partager" /> en bas de Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">2.</span> Choisissez
            <SquarePlus size={16} aria-hidden /> « Sur l&apos;écran d&apos;accueil »
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-accent">3.</span> Touchez « Ajouter »
          </li>
        </ol>
      ) : (
        <p className="text-sm text-ink">
          Ouvrez le menu du navigateur (⋮) et choisissez « Installer l&apos;application ».
        </p>
      )}
      <p className="text-xs text-ink-muted mt-3">
        Ensuite, ouvrez AMD SAV depuis l&apos;écran d&apos;accueil et reconnectez-vous une fois.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Insertarla en `/tech`** — en `src/app/tech/page.tsx`, importar
`import { InstallCard } from '@/components/tech/InstallCard'` y colocar `<InstallCard />`
justo después del cierre del `div` «Header móvil».

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm test`
Expected: sin errores; la suite completa en verde (incluye los 13 tests nuevos).

Manual con `npm run dev` + DevTools en modo iPhone (Chrome «Toggle device toolbar», iPhone 14):
la tarjeta aparece con los 3 pasos; al pulsar ✕ desaparece y no vuelve al recargar. En modo
escritorio no aparece.

- [ ] **Step 4: Commit**

```bash
git add src/components/tech/InstallCard.tsx src/app/tech/page.tsx
git commit -m "feat(pwa): tarjeta que guía la instalación en /tech"
```

---

### Task 8: E2E + documentación

**Files:**
- Create: `tests/e2e/pwa.spec.ts`
- Modify: `docs/architecture.md`, `docs/superpowers/specs/2026-09-22-pwa-tecnicos-design.md`

- [ ] **Step 1: E2E** — sin sesión, como lo pide iOS:

```ts
import { test, expect } from '@playwright/test'

// iOS descarga el manifest y el service worker SIN cookies: si el proxy los mandara a /login,
// «Añadir a pantalla de inicio» crearía un marcador de Safari en vez de la app.
test.describe('PWA técnicos — ficheros públicos', () => {
  test('el manifest responde sin sesión', async ({ request }) => {
    const res = await request.get('/amd-sav.webmanifest', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/manifest+json')
    const body = await res.json()
    expect(body.name).toBe('AMD SAV')
    expect(body.start_url).toBe('/tech')
  })

  test('el service worker responde sin sesión y sin caché', async ({ request }) => {
    const res = await request.get('/sw.js', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('no-store')
  })

  test('los iconos responden sin sesión', async ({ request }) => {
    for (const path of ['/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/apple-touch-icon.png']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(200)
    }
  })
})
```

Run: `npm run test:e2e -- tests/e2e/pwa.spec.ts` (necesita Supabase local en Docker, ver
`reference_tests_rls_fase2`; si no está disponible en local, lo valida el job `e2e.yml` del PR).
Expected: 3 passed.

- [ ] **Step 2: Documentación**
  - `docs/architecture.md`: sección «PWA de técnicos» con: manifest en `/amd-sav.webmanifest`
    (y por qué no `app/manifest.ts` ni un nombre que empiece por `/tech`), iconos en `public/pwa/`
    regenerables con `node scripts/generate-pwa-icons.mjs`, `public/sw.js` sin caché, zonas seguras.
  - Spec, §Fase 3: añadir el prerrequisito «cambiar `Permissions-Policy` de `geolocation=()` a
    `geolocation=(self)` en `next.config.ts`».

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pwa.spec.ts docs/architecture.md docs/superpowers/specs/2026-09-22-pwa-tecnicos-design.md
git commit -m "test(pwa): manifest, SW e iconos públicos + docs"
```

---

### Task 9: Verificación final y prueba en iPhone

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build` — los tres en verde.
- [ ] **Step 2:** push + PR (`feat/pwa-tecnicos-fase1`). Esperar CI verde (`typecheck · test · build` + `e2e`).
- [ ] **Step 3: Prueba en iPhone real sobre la URL de *preview* de Vercel del PR** (antes de mergear):
  1. Safari → `<preview>/login` → entrar con un técnico (`testsav`) → en `/tech` se ve la tarjeta.
  2. Compartir → «Sur l'écran d'accueil»: el icono es el rojo con el logo blanco y el nombre «AMD SAV».
  3. Abrir desde el icono: pantalla completa, sin barra de Safari; pide login **una vez** y aterriza en `/tech`.
  4. La tarjeta ya **no** aparece.
  5. La barra inferior y el botón «Scanner une machine» quedan **por encima** de la barra de gestos.
  6. Escanear un QR sigue funcionando (la cámara dentro de la app instalada).
  7. Cerrar la app del todo y reabrirla: sigue con la sesión iniciada.
- [ ] **Step 4:** con los 7 puntos OK → `/code-review` → merge.
