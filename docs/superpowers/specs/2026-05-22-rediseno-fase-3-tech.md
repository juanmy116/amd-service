# Spec — Rediseño UI Híbrido · Fase 3: PWA Técnico `/tech`

**Fecha:** 2026-05-22  
**Contexto:** Fase 3 del rediseño visual "Híbrido" de la app SAV de AMD Service. Las Fases 0–2 ya están mergeadas en `main`. Esta fase migra la PWA del técnico.

---

## Objetivo

Migrar los 15 archivos de `src/app/tech/` y los 3 componentes en `src/components/tech/` al sistema de diseño Híbrido (tokens Tailwind v4 + componentes `Card` y `Badge`). Sin cambios de lógica, Server Actions ni rutas.

---

## Superficie Chrome vs. Contenido

| Superficie | Tokens | Archivos |
|---|---|---|
| Chrome (dark) | `bg-chrome`, `border-chrome-line`, `text-chrome-fg`, `text-chrome-fg-strong`, `bg-chrome-hover`, `text-accent` (activo) | `layout.tsx`, `tech-nav.tsx`, `tech-desktop-sidebar.tsx` |
| Contenido (light) | `bg-page`, `bg-card`, `border-line`, `border-line-subtle`, `text-ink`, `text-ink-soft`, `text-ink-muted` | Todo lo demás |

---

## Tokens disponibles (globals.css)

```
Chrome:    bg-chrome  border-chrome-line  text-chrome-fg  text-chrome-fg-strong  bg-chrome-hover
Fondo:     bg-page  bg-card
Bordes:    border-line  border-line-subtle
Texto:     text-ink  text-ink-soft  text-ink-muted
Acento:    bg-accent  text-accent  bg-accent-soft  border-accent  shadow-raised
Estados:   bg-success-soft text-success  bg-warning-soft text-warning
           bg-info-soft text-info  bg-violet-soft text-violet  bg-neutral-soft
Tipog.:    font-display  (= Poppins)
Radio:     rounded-[var(--radius-card)]  (= 13px)
Sombra:    shadow-card  shadow-raised
```

**Tokens NO disponibles:** `--color-danger` / `--color-danger-soft` no están definidos. Para banners de error de formulario conservar `bg-red-50 border-red-200 text-red-700`.

---

## Componentes UI (src/components/ui/)

- **`Card`**: `import { Card } from '@/components/ui/Card'` — div con `bg-card rounded-[var(--radius-card)] border border-line shadow-card`
- **`Badge`**: `import { Badge } from '@/components/ui/Badge'` + `import type { BadgeVariant } from '@/components/ui/Badge'`
  - Variantes: `info` | `violet` | `warning` | `success` | `neutral` | `danger` | `solid`

**IMPORTANTE:** Ambos son named exports (`export function Card`, `export function Badge`). Nunca usar `import Card from`.

---

## Mapeo de estados → Badge

```ts
const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const PRIORITY_BADGE: Record<string, BadgeVariant> = {
  basse: 'neutral', normale: 'info', haute: 'warning', urgente: 'danger',
}
```

---

## Archivos a modificar

### Chrome (dark)

**`src/app/tech/layout.tsx`**
- `bg-gray-50` → `bg-page`
- FAB `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent shadow-raised`

**`src/app/tech/tech-nav.tsx`**
- `bg-white border-t border-gray-200` → `bg-chrome border-t border-chrome-line`
- Activo: `text-red-600` → `text-accent`
- Inactivo: `text-gray-400 hover:text-gray-600` → `text-chrome-fg hover:text-chrome-fg-strong`

**`src/app/tech/tech-desktop-sidebar.tsx`**
- `bg-white border-r border-gray-200` → `bg-chrome border-r border-chrome-line`
- Todos los `border-gray-200` → `border-chrome-line`
- Logo badge: `style={{ backgroundColor }}` → `bg-accent`
- Logo "A": `style{{ fontFamily }}` → `font-display`
- Brand: `text-gray-900 style fontFamily` → `text-chrome-fg-strong font-display`
- Subtítulo: `text-gray-400` → `text-chrome-fg`
- Nav activo: `style={{ backgroundColor: '#BF0D0D' }} text-white` → `bg-accent/15 text-accent`
- Nav inactivo: `text-gray-600 hover:bg-gray-100 hover:text-gray-900` → `text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong`
- Username: `text-gray-400` → `text-chrome-fg`
- Logout: misma migración que nav inactivo

### Contenido (light)

**`src/app/tech/page.tsx`** (dashboard)
- Eliminar `STATUS_STYLE` y `PRIORITY_STYLE` string dicts
- Añadir Badge import + `STATUS_BADGE`/`PRIORITY_BADGE` BadgeVariant dicts
- Header móvil: `text-gray-400/900 style fontFamily` → tokens ink + `font-display`; btn logout `border-gray-200 bg-white` → `border-line bg-card`
- Header desktop: misma migración
- Stats cards: `bg-white rounded-xl border border-gray-200 p-4` → `bg-card rounded-[var(--radius-card)] border border-line p-4`
- Stat card urgente (condicional): `bg-red-50 border-red-100` → `bg-accent-soft border-accent/20`; `bg-white border-gray-200` → `bg-card border-line`
- Iconos stats: `bg-amber-50`→`bg-warning-soft`; `bg-green-50`→`bg-success-soft`; `bg-blue-50`→`bg-info-soft`
- `text-amber-600`→`text-warning`; `text-green-600`→`text-success`; `text-blue-600`→`text-info`
- Urgentes activos: `text-red-600/700/500` → `text-accent`; icon `text-red-600` urgente → `text-accent`
- Cards "Prochaine intervention" + lista móvil: `bg-white rounded-2xl border border-gray-200` → tokens bg-card/border-line
- `text-gray-900/500/400` → ink tokens
- Badges: string style → `<Badge>` component
- Desktop table: `bg-white rounded-xl...` → `<Card className="overflow-hidden">`, thead `bg-gray-50`→`bg-neutral-soft`, `border-gray-200`→`border-line`, th `font-medium text-gray-500`→`text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]`, tbody `divide-gray-100`→`divide-line-subtle`, hover `hover:bg-gray-50`→`hover:bg-neutral-soft`

**`src/app/tech/incidents/page.tsx`**
- h1: `text-gray-900 style fontFamily` → `text-ink font-display`

**`src/components/tech/TechIncidentList.tsx`**
- Eliminar `STATUS_STYLE` string dict; añadir `STATUS_BADGE: Record<string, BadgeVariant>` + Badge imports
- **Conservar** `PRIORITY_COLOR` hex dict completo (stripe + label text — orange `#F97316` no tiene token)
- Filter chips activo: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`; sin style
- Filter chips inactivo: `bg-white text-gray-500 border-gray-200` → `bg-card text-ink-muted border-line`
- Cards de incidencia: `bg-white rounded-xl border border-gray-200` → `bg-card rounded-[var(--radius-card)] border border-line`
- `text-gray-900/500/400` → ink tokens
- numero_incident `style={{ color: '#BF0D0D' }}` → `text-accent`
- Stripe `style={{ backgroundColor: PRIORITY_COLOR[...] }}` → **CONSERVAR** (hex funcional)
- Priority label `style={{ color: PRIORITY_COLOR[...] }}` → **CONSERVAR**
- Status badge: `className={STATUS_STYLE[...]}` → `<Badge variant={STATUS_BADGE[...]}>`
- Empty state: `text-gray-400` → `text-ink-muted`

**`src/app/tech/incidents/[id]/intervention-form.tsx`**
- Eliminar `STATUS_BADGE` string dict; añadir Badge imports + `STATUS_BADGE: Record<string, BadgeVariant>`
- Back btn: `border-gray-200 bg-white text-gray-600` → `border-line bg-card text-ink-muted`
- numero_incident `style={{ color: '#BF0D0D' }}` → `text-accent`
- h1: `text-gray-900 style fontFamily` → `text-ink font-display`
- Status badge: string style → `<Badge>`
- Machine info card: `bg-white rounded-2xl border border-gray-200` → `<Card className="p-4 space-y-3">`
- Machine icon: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`
- Textos: `text-gray-900/600/400` → ink tokens; `border-t border-gray-100` → `border-t border-line-subtle`
- Error banner `bg-red-50 border-red-200 text-red-700` → **CONSERVAR** (error de formulario)
- Form sections: `bg-white rounded-2xl border border-gray-200 p-4` → `<Card className="p-4">`
- Section titles: `text-gray-700` → `text-ink-soft`
- Radio/checkbox labels: `border-gray-200` → `border-line`; `text-gray-700` → `text-ink-soft`; `accent-red-600` → **CONSERVAR**
- Inputs/textarea: `border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-red-500` → `border-line text-ink placeholder-ink-muted focus:ring-accent`
- Submit: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`

**`src/app/tech/machines/page.tsx`**
- h1: `text-gray-900 style fontFamily` → `text-ink font-display`; subtítulo `text-gray-400` → `text-ink-muted`
- Table container: `bg-white rounded-xl border border-gray-200 overflow-hidden` → `<Card className="overflow-hidden">`
- thead: `bg-gray-50 border-gray-200` → `bg-neutral-soft border-line`; th → th pattern estándar
- tbody: `divide-gray-100` → `divide-line-subtle`; hover `hover:bg-gray-50` → `hover:bg-neutral-soft`
- Textos: ink tokens
- Type badge `<span>`: → `<Badge variant={m.type === 'color' ? 'violet' : 'neutral'}>` (necesita Badge import)
- Status activo: `text-green-700 bg-green-500` → `text-success bg-success`; inactivo `text-gray-400 bg-gray-300` → `text-ink-muted bg-line`

**`src/app/tech/planning/page.tsx`**
- h1 + textos header → ink tokens + `font-display`
- Sección "En retard": `text-red-500/600` (icon+label) → `text-accent`
- Overdue card: `bg-white rounded-2xl border-2 border-red-200` → `bg-card rounded-[var(--radius-card)] border-2 border-accent/30`
- Overdue icon: `bg-red-50 text-red-500` → `bg-accent-soft text-accent`
- Fecha overdue: `text-red-500` → `text-accent`
- Planned card: `bg-white rounded-2xl border border-gray-200` → card tokens
- Planned icon: `bg-blue-50 text-blue-500` → `bg-info-soft text-info`
- Fecha: `text-blue-500` → `text-info`
- Empty state + intervention cards: card tokens + ink tokens
- Intervention icon: `bg-gray-100 text-gray-500` → `bg-neutral-soft text-ink-muted`
- STATUS_BADGE string dict → `STATUS_BADGE: Record<string, BadgeVariant>`

**`src/app/tech/scan/page.tsx`**
- h1: tokens + `font-display`; descripción `text-gray-500` → `text-ink-muted`
- Desktop card: `bg-white rounded-xl border border-gray-200` → `<Card>`; textos ink tokens
- Icon desktop: `bg-gray-100 text-gray-400` → `bg-neutral-soft text-ink-muted`

**`src/app/tech/scan/[serie]/page.tsx`**
- Back btn + h1 → tokens
- Machine info card: `bg-white rounded-2xl border border-gray-200` → `<Card className="p-4 space-y-4">`
- Machine icon: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`
- `border-t border-gray-100` → `border-t border-line-subtle`
- Textos: ink tokens
- Type badge `<span>` → `<Badge variant={machine.type === 'color' ? 'violet' : 'neutral'}>`
- **Maintenance visit card (conditional border/bg):**
  - `style={{ borderColor: en_retard ? '#EF4444' : '#3B82F6' }}` → `className={border-2 ${v.status === 'en_retard' ? 'border-accent/50' : 'border-info/50'}}`
  - `style={{ backgroundColor: en_retard ? '#FEF2F2' : '#EFF6FF' }}` → `${v.status === 'en_retard' ? 'bg-accent-soft' : 'bg-info-soft'}`
  - `text-red-500` → `text-accent`; `text-blue-500` → `text-info`
- Incidents: `border-amber-300` (en_cours) → `border-warning/50`; `border-gray-200` → `border-line`
- "Faire l'intervention" `style={{ color: '#BF0D0D' }}` → `text-accent`
- STATUS_STYLE string dict → `STATUS_BADGE: Record<string, BadgeVariant>`

**`src/components/tech/MaintenanceVisitForm.tsx`**
- Back btn → tokens
- h1 `text-gray-900 style fontFamily` → `text-ink font-display`
- Status text: `text-red-600` (en retard) → `text-accent`; `text-blue-600` (planifiée) → `text-info`
- Data `text-gray-400` → `text-ink-muted`
- Info card: `bg-white rounded-2xl border border-gray-200` → `<Card className="p-4 space-y-3">`
- Machine icon: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`
- Textos: ink tokens; `border-t border-gray-100` → `border-t border-line-subtle`
- Error banner `bg-red-50 border-red-200 text-red-700` → **CONSERVAR**
- Form sections: `bg-white rounded-2xl border border-gray-200 p-4` → `<Card className="p-4">`
- Section titles `text-gray-700` → `text-ink-soft`
- Checkboxes: `border-gray-200` → `border-line`; `accent-red-600` → **CONSERVAR**
- Input/textarea: `border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-red-500` → tokens + `focus:ring-accent`
- Submit: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`

**`src/components/tech/AgendaPanel.tsx`** (panel lateral derecho — superficie contenido, NO chrome)
- `bg-white border-l border-gray-200` → `bg-card border-l border-line`
- Header sticky: `bg-white` → `bg-card`; `border-b border-gray-100` → `border-b border-line-subtle`
- h2: `text-gray-900 style fontFamily` → `text-ink font-display`; fecha `text-gray-400` → `text-ink-muted`
- Sección labels: `text-gray-500` → `text-ink-muted`
- Hover: `hover:bg-gray-50` → `hover:bg-neutral-soft`
- Status dots: `bg-red-500` → `bg-accent`; `bg-blue-400` → `bg-info`
- Fecha overdue `text-red-500` → `text-accent`; normal `text-gray-400` → `text-ink-muted`
- Divider: `border-t border-gray-100` → `border-t border-line-subtle`
- "Voir tout": `text-gray-400 hover:text-gray-600` → `text-ink-muted hover:text-ink-soft`
- Empty state `text-gray-300` → `text-ink-muted`
- Textos: `text-gray-800` → `text-ink-soft`; `text-gray-400` → `text-ink-muted`
- AlertTriangle `text-gray-300` → `text-ink-muted/40`
- STATUS_BADGE string dict → `STATUS_BADGE: Record<string, BadgeVariant>`

---

## Archivos NO modificados

- `src/app/tech/scan/qr-scanner.tsx` — funcionalidad pura (cámara), sin UI a migrar
- `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx` — solo llama a MaintenanceVisitForm, sin markup propio
- `src/app/tech/incidents/[id]/page.tsx` — solo llama a InterventionForm, sin markup propio
