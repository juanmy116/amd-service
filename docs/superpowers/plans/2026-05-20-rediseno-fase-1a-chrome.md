# Rediseño app SAV — Fase 1a: Chrome de /admin · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el estilo "Híbrido" al marco (chrome) del back-office `/admin`: sidebar oscura, fondo de página claro y skeleton de carga migrado a los tokens de diseño.

**Architecture:** El chrome de `/admin` son tres archivos: el layout, la sidebar y el skeleton de carga. Se migran de colores escritos a mano (`#F5F5F5`, `#BF0D0D`, `bg-white`, `bg-gray-*`) a los tokens de la Fase 0 (`bg-page`, `bg-chrome`, `bg-accent`, `bg-card`, `border-line`, etc.). La sidebar pasa de blanca a oscura y agrupa sus 10 enlaces en secciones; toda su funcionalidad actual (colapsable, navegación, cierre de sesión) se conserva intacta.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, lucide-react.

**Spec de referencia:** `docs/superpowers/specs/2026-05-20-rediseno-ui-app-sav-design.md`

---

## Verificación en este proyecto

Este proyecto no tiene suite de tests unitarios. La verificación es:
- `npm run typecheck` — `tsc --noEmit`. Sin errores.
- `npm run build` — `next build`. Sin errores.

La validación visual (sidebar oscura, contraste, estados activos) se hará en el preview de Vercel cuando el bloque 1a se abra como PR.

---

## Preparación

- [ ] **Confirmar que estás en la rama de trabajo**

La rama `feat/redesign-phase-1a-chrome` ya existe y contiene este plan. La implementación se hace sobre ella.

```bash
git branch --show-current   # debe imprimir: feat/redesign-phase-1a-chrome
```

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `src/app/admin/layout.tsx` (modificar) | Fondo de página: de `#F5F5F5` inline a la clase `bg-page` |
| `src/components/admin/Sidebar.tsx` (modificar) | Rediseño completo a sidebar oscura con secciones agrupadas y avatar de usuario |
| `src/app/admin/loading.tsx` (modificar) | Skeleton: superficies y bordes migrados a tokens |

---

## Task 1: Fondo de página en el layout de /admin

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Sustituir el color de fondo inline por el token**

En `src/app/admin/layout.tsx`, el `<div>` raíz usa un color inline. Reemplazar esta línea:

```tsx
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F5F5F5' }}>
```

por:

```tsx
    <div className="flex h-screen overflow-hidden bg-page">
```

No se cambia nada más del archivo (la lógica de auth, `Sidebar`, `main`, `AgendaPanelWrapper` quedan igual).

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): use bg-page token for admin layout background"
```

---

## Task 2: Sidebar oscura

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

Reemplazar TODO el contenido de `src/components/admin/Sidebar.tsx` por exactamente esto:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Printer, FileText,
  AlertCircle, UserCog, LogOut, BarChart2, Wrench, CalendarDays,
  ChevronLeft, ChevronRight, Plug,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { Avatar } from '@/components/ui/Avatar'

const NAV_GROUPS = [
  {
    label: 'Pilotage',
    items: [
      { href: '/admin',            label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
      { href: '/admin/clients',    label: 'Clients',         icon: Users },
      { href: '/admin/machines',   label: 'Machines',        icon: Printer },
      { href: '/admin/contadores', label: 'Compteurs',       icon: BarChart2 },
      { href: '/admin/contracts',  label: 'Contrats',        icon: FileText },
    ],
  },
  {
    label: 'Service',
    items: [
      { href: '/admin/incidents',   label: 'Incidents SAV', icon: AlertCircle },
      { href: '/admin/maintenance', label: 'Maintenance',   icon: Wrench },
      { href: '/admin/calendrier',  label: 'Calendrier',    icon: CalendarDays },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/admin/team',     label: 'Équipe',       icon: UserCog },
      { href: '/admin/princity', label: 'Princity API', icon: Plug },
    ],
  },
]

export default function Sidebar({ fullName }: { fullName: string | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} h-screen flex flex-col bg-chrome shrink-0 overflow-x-hidden transition-all duration-200`}
    >
      {/* Marca + botón colapsar */}
      <div className={`flex items-center h-16 border-b border-chrome-line shrink-0 ${collapsed ? 'justify-center px-2' : 'px-4 justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="font-display text-sm font-bold text-white">A</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-chrome-fg-strong leading-none truncate">
                AMD Service
              </p>
              <p className="text-xs text-chrome-fg mt-0.5">Back-office</p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong transition-colors shrink-0"
            title="Réduire"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Navegación */}
      <nav className={`flex-1 py-3 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-full py-2 mb-1 rounded-lg text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong transition-colors"
            title="Développer"
          >
            <ChevronRight size={15} />
          </button>
        )}

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-chrome-fg">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                      collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                    } ${
                      active
                        ? 'bg-accent text-white shadow-raised'
                        : 'text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong'
                    }`}
                  >
                    <Icon size={18} />
                    {!collapsed && label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuario + cierre de sesión */}
      <div className={`py-3 border-t border-chrome-line shrink-0 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className={`flex items-center gap-2.5 mb-2 ${collapsed ? 'justify-center' : 'px-1'}`}>
          <Avatar name={fullName || 'AMD'} size={collapsed ? 30 : 32} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-chrome-fg-strong truncate">{fullName || 'Administrateur'}</p>
              <p className="text-[11px] text-chrome-fg">Administrateur</p>
            </div>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? 'Déconnexion' : undefined}
            className={`flex items-center rounded-lg text-sm font-medium text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong transition-colors w-full ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <LogOut size={18} />
            {!collapsed && 'Déconnexion'}
          </button>
        </form>
      </div>
    </aside>
  )
}
```

Notas de lo que cambia respecto al original:
- `bg-white` → `bg-chrome`; `border-gray-200` → `border-chrome-line`; se elimina el `border-r` (el contraste oscuro/claro ya separa la sidebar del contenido).
- El array plano `NAV` pasa a `NAV_GROUPS` con tres secciones (`Pilotage`, `Service`, `Système`) que cubren los mismos 10 enlaces. Los títulos de sección se ocultan cuando la sidebar está colapsada.
- El logo deja de usar `style={{ backgroundColor: '#BF0D0D' }}` y usa `bg-accent`.
- Item activo: deja de usar `style={{ backgroundColor: '#BF0D0D' }}` y usa `bg-accent text-white shadow-raised`.
- Textos: tonos de `text-gray-*` → `text-chrome-fg` / `text-chrome-fg-strong`; hover `hover:bg-gray-100` → `hover:bg-chrome-hover`.
- El pie de la sidebar añade el componente `Avatar` (Fase 0) con las iniciales del usuario y la etiqueta de rol "Administrateur" (el layout ya garantiza que solo un admin llega aquí). Se conserva el botón `Déconnexion` y la `signOut` Server Action.

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat(admin): redesign sidebar with dark chrome and grouped nav"
```

---

## Task 3: Skeleton de carga con tokens

**Files:**
- Modify: `src/app/admin/loading.tsx`

- [ ] **Step 1: Migrar superficies y bordes a tokens**

En `src/app/admin/loading.tsx`, las tarjetas del skeleton usan `bg-white`, `border-gray-200`, `border-gray-100` y `rounded-xl`. Aplicar estas sustituciones en TODO el archivo (los rectángulos placeholder grises `bg-gray-50/100/200` se conservan: son marcadores de carga neutros, no superficies del sistema):

- Reemplazar todas las apariciones de `bg-white` por `bg-card`
- Reemplazar todas las apariciones de `border-gray-200` por `border-line`
- Reemplazar todas las apariciones de `border-gray-100` por `border-line-subtle`
- Reemplazar todas las apariciones de `rounded-xl` por `rounded-card`

No se cambia la estructura del skeleton ni los rectángulos `bg-gray-*` internos.

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/loading.tsx
git commit -m "feat(admin): migrate loading skeleton to design tokens"
```

---

## Task 4: Verificación final del bloque

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Typecheck completo**

Run: `npm run typecheck`
Expected: termina sin errores.

- [ ] **Step 2: Build completo**

Run: `npm run build`
Expected: el build completa sin errores.

- [ ] **Step 3: Push de la rama**

```bash
git push -u origin feat/redesign-phase-1a-chrome
```

El bloque 1a queda listo. El marco de `/admin` ya tiene el estilo Híbrido; las páginas de contenido se migran en los bloques 1b–1e. La validación visual se hace en el preview de Vercel del PR.

---

## Notas para bloques posteriores (fuera del alcance de 1a)

- El `loading.tsx` imita la estructura del dashboard; cuando el bloque 1b rediseñe el dashboard, puede requerir un reajuste menor de este skeleton.
- Las páginas de contenido de `/admin` (dashboard, listados, detalles, formularios) siguen usando colores escritos a mano; se migran en los bloques 1b–1e.
