# Rediseño app SAV — Fase 0: Fundamentos · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear los tokens de diseño centralizados y los componentes de UI compartidos que sirven de base al rediseño "Híbrido" de las tres superficies de la app SAV.

**Architecture:** Los tokens se definen una sola vez en `src/app/globals.css` con el bloque `@theme` de Tailwind v4, que los expone como utilidades (`bg-chrome`, `text-ink`, `rounded-card`, etc.). Los componentes compartidos viven en `src/components/ui/` como componentes de presentación puros (sin estado, sin `'use client'`) y consumen esos tokens vía clases. Ninguna fase posterior vuelve a escribir colores de marca a mano.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, lucide-react.

**Spec de referencia:** `docs/superpowers/specs/2026-05-20-rediseno-ui-app-sav-design.md`

---

## Verificación en este proyecto

Este proyecto **no tiene una suite de tests unitarios** ni framework de tests (no hay Jest/Vitest). El patrón de verificación establecido — y el que usa este plan — es:

- `npm run typecheck` — ejecuta `tsc --noEmit`. Debe terminar sin errores.
- `npm run build` — `next build`. Debe completar sin errores.

La Fase 0 produce tokens y componentes aislados; su validación es de compilación y tipos. La **validación visual** de estos componentes ocurre en la Fase 1, cuando se usan dentro de páginas reales. Por eso este plan no crea ninguna página de demostración temporal (sería código muerto).

---

## Preparación

- [ ] **Crear la rama de trabajo desde `main` actualizado**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/redesign-phase-0
```

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/app/globals.css` (modificar) | Añadir el bloque `@theme` con todos los tokens de diseño |
| `src/components/ui/Card.tsx` (crear) | Contenedor base: superficie blanca con borde, radio y sombra |
| `src/components/ui/PanelHeader.tsx` (crear) | Cabecera de panel: título + enlace de acción opcional |
| `src/components/ui/Badge.tsx` (crear) | Píldora de estado con variantes |
| `src/components/ui/Button.tsx` (crear) | Botón con variantes + helper `buttonClasses` para enlaces |
| `src/components/ui/Avatar.tsx` (crear) | Iniciales sobre fondo rojo de marca |
| `src/components/ui/KpiCard.tsx` (crear) | Tarjeta KPI: icono, valor, etiqueta y tendencia |

Cada componente es un archivo con una responsabilidad única. Los imports se hacen por ruta directa (`@/components/ui/Card`), siguiendo el patrón del proyecto — no se crea un barrel `index.ts`.

---

## Task 1: Tokens de diseño en globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Añadir el bloque `@theme` justo después de `@import "tailwindcss";`**

Insertar este bloque entre la línea `@import "tailwindcss";` y la línea `:root {`. No se elimina ni modifica nada del CSS existente (las reglas `:root`, `body`, `.service-card`, `.btn-ghost` y el focus-ring de la web pública se conservan intactas).

```css
@theme {
  /* Chrome — navegación oscura */
  --color-chrome: #1A1A1E;
  --color-chrome-line: rgba(255, 255, 255, 0.07);
  --color-chrome-fg: #9A9AA2;
  --color-chrome-fg-strong: #FFFFFF;
  --color-chrome-hover: rgba(255, 255, 255, 0.06);

  /* Superficies — contenido claro */
  --color-page: #F6F6F7;
  --color-card: #FFFFFF;
  --color-line: #EAEAEC;
  --color-line-subtle: #F1F1F2;

  /* Texto */
  --color-ink: #18181B;
  --color-ink-soft: #71717A;
  --color-ink-muted: #A1A1AA;

  /* Acento de marca */
  --color-accent: #BF0D0D;
  --color-accent-dark: #7E0808;
  --color-accent-soft: #FEF2F2;

  /* Estados */
  --color-success: #16A34A;
  --color-success-soft: #ECFDF3;
  --color-warning: #D97706;
  --color-warning-soft: #FEF3C7;
  --color-neutral-soft: #F4F4F5;

  /* Radios */
  --radius-card: 13px;

  /* Sombras */
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.03);
  --shadow-raised: 0 4px 12px rgba(191, 13, 13, 0.28);

  /* Tipografía */
  --font-display: Poppins, system-ui, sans-serif;
  --font-sans: Inter, system-ui, sans-serif;
}
```

Notas: `@theme` con `--color-*` **añade** colores a la paleta de Tailwind sin borrar los de serie (`gray-*`, `red-*`, etc. siguen disponibles). Se evita el nombre `neutral` a secas porque colisionaría con la escala `neutral-50…950` de Tailwind; por eso el token de fondo neutro se llama `neutral-soft`.

- [ ] **Step 2: Verificar que el build compila el CSS**

Run: `npm run build`
Expected: el build completa sin errores. Tailwind genera las utilidades nuevas (`bg-chrome`, `text-ink`, `rounded-card`, `shadow-card`, etc.).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): add design tokens for the Hybrid restyle"
```

---

## Task 2: Componente Card

**Files:**
- Create: `src/components/ui/Card.tsx`

- [ ] **Step 1: Crear el componente**

`Card` es la superficie base reutilizable (panel/tarjeta). El padding NO se fija dentro: lo aporta quien la usa vía `className`, porque distintos contextos necesitan distinto padding (un panel con tabla usa padding 0; una KPI usa padding 16px).

```tsx
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-card border border-line rounded-card shadow-card ${className}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Card.tsx
git commit -m "feat(ui): add Card surface component"
```

---

## Task 3: Componente PanelHeader

**Files:**
- Create: `src/components/ui/PanelHeader.tsx`

- [ ] **Step 1: Crear el componente**

Cabecera estándar de panel: título a la izquierda, enlace de acción opcional a la derecha (p. ej. "Voir tout").

```tsx
import Link from 'next/link'

type Props = {
  title: string
  action?: { label: string; href: string }
}

export function PanelHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      {action && (
        <Link href={action.href} className="text-xs font-semibold text-accent hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PanelHeader.tsx
git commit -m "feat(ui): add PanelHeader component"
```

---

## Task 4: Componente Badge

**Files:**
- Create: `src/components/ui/Badge.tsx`

- [ ] **Step 1: Crear el componente**

Píldora de estado. Variante `solid` (rojo sólido, para "Urgent") y variantes suaves para el resto de estados.

```tsx
import type { ReactNode } from 'react'

const VARIANTS = {
  solid:   'bg-accent text-white',
  danger:  'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-neutral-soft text-ink-soft',
} as const

export type BadgeVariant = keyof typeof VARIANTS

type Props = {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

export function Badge({ children, variant = 'neutral', className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Badge.tsx
git commit -m "feat(ui): add Badge status pill component"
```

---

## Task 5: Componente Button

**Files:**
- Create: `src/components/ui/Button.tsx`

- [ ] **Step 1: Crear el componente**

Exporta `buttonClasses` (helper de clases, reutilizable para `<Link>` que parecen botón) y `Button` (envoltura sobre `<button>`). El componente no lleva `'use client'`: es de presentación; si un consumidor le pasa `onClick`, será el consumidor quien sea client component.

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const VARIANTS = {
  primary:   'bg-accent text-white shadow-raised hover:opacity-90',
  secondary: 'bg-card border border-line text-ink hover:bg-neutral-soft',
  ghost:     'text-ink-soft hover:bg-neutral-soft',
} as const

export type ButtonVariant = keyof typeof VARIANTS

export function buttonClasses(variant: ButtonVariant = 'primary'): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity ${VARIANTS[variant]}`
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  return (
    <button className={`${buttonClasses(variant)} ${className}`} {...rest}>
      {children}
    </button>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "feat(ui): add Button component and buttonClasses helper"
```

---

## Task 6: Componente Avatar

**Files:**
- Create: `src/components/ui/Avatar.tsx`

- [ ] **Step 1: Crear el componente**

Muestra hasta dos iniciales sobre el rojo de marca. El tamaño se controla con la prop `size` (en píxeles) para que el ancho, el alto y el tamaño de fuente escalen juntos de forma predecible.

```tsx
type Props = {
  name: string
  size?: number
}

export function Avatar({ name, size = 32 }: Props) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Avatar.tsx
git commit -m "feat(ui): add Avatar component"
```

---

## Task 7: Componente KpiCard

**Files:**
- Create: `src/components/ui/KpiCard.tsx`

- [ ] **Step 1: Crear el componente**

Tarjeta de indicador. Reutiliza `Card` (Task 2). El icono se pasa como `ReactNode` (el consumidor decide qué icono de `lucide-react` usar). `delta` es opcional: tendencia `up` (verde) o `down` (roja).

```tsx
import type { ReactNode } from 'react'
import { Card } from './Card'

type Props = {
  icon: ReactNode
  value: string | number
  label: string
  delta?: { text: string; trend: 'up' | 'down' }
}

export function KpiCard({ icon, value, label, delta }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          {icon}
        </div>
        {delta && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
              delta.trend === 'up' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
            }`}
          >
            {delta.text}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
    </Card>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/KpiCard.tsx
git commit -m "feat(ui): add KpiCard component"
```

---

## Task 8: Verificación final de la fase

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Typecheck completo**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 2: Build completo**

Run: `npm run build`
Expected: el build completa sin errores; las utilidades de los tokens nuevos se generan sin advertencias.

- [ ] **Step 3: Push de la rama**

```bash
git push -u origin feat/redesign-phase-0
```

La Fase 0 queda lista. Los tokens y los seis componentes están disponibles para que la Fase 1 (`/admin`) los consuma. La revisión visual se hará en la Fase 1, al verlos integrados en páginas reales.

---

## Notas para fases posteriores (fuera del alcance de Fase 0)

- `tailwind.config.ts` es un archivo legacy: en Tailwind v4 no se carga salvo que `globals.css` lo invoque con `@config`, cosa que no hace. No estorba al rediseño; su limpieza puede abordarse aparte.
- La migración de las páginas existentes a estos tokens y componentes (sustituyendo los `style={{ ... }}` y colores escritos a mano) es el contenido de las Fases 1, 2 y 3.
