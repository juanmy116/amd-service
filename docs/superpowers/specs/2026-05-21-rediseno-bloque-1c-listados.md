# Spec — Bloque 1c: Rediseño Listados `/admin`

**Fecha:** 2026-05-21
**Fase:** 1c del rediseño UI "Híbrido" (ver spec maestro `2026-05-20-rediseno-ui-app-sav-design.md`)
**Alcance:** 6 páginas de listado de `/admin` + 3 componentes compartidos + el Kanban + 1 añadido al sistema de diseño
**Prerequisitos:** Fase 0 (tokens + componentes UI) ✅ · Bloque 1a (chrome) ✅ · Bloque 1b (Dashboard) ✅

---

## Objetivo

Migrar las 6 páginas de listado de `/admin` y sus componentes a los tokens Tailwind v4 y componentes de Fase 0. Cambio puramente de presentación: no se toca lógica, queries, Server Actions ni filtros.

---

## Añadido al sistema de diseño

### Variante `violet` en `Badge`

El flujo de incidencias tiene 5 estados que necesitan 5 colores distinguibles. Las variantes actuales del `Badge` de Fase 0 (`solid`, `danger`, `success`, `warning`, `info`, `neutral`) no cubren los 5 con semántica limpia. Se añade una variante más:

- `src/app/globals.css` — en el bloque `@theme`, sección "Estados", añadir:
  - `--color-violet: #7C3AED`
  - `--color-violet-soft: #F5F3FF`
- `src/components/ui/Badge.tsx` — añadir a `VARIANTS`: `violet: 'bg-violet-soft text-violet'`. El orden: tras `info`, antes de `neutral`.

---

## Mapeo de estados a variantes `Badge`

Unificado para todas las páginas del bloque:

| Dominio | Valor → variante |
|---|---|
| Estado incidencia | `nouveau`→`info` · `assigné`→`violet` · `en_cours`→`warning` · `résolu`→`success` · `fermé`→`neutral` |
| Prioridad incidencia | `urgente`→`danger` · `haute`→`warning` · `normale`→`info` · `basse`→`neutral` |
| Estado contrato | `actif`→`success` · `suspendu`→`warning` · `terminé`→`neutral` |
| Estado visita maintenance | `fait`→`success` · `planifié`→`info` · `en_retard`→`danger` |
| Tipo máquina | `color`→`violet` · `noir_blanc`→`neutral` |
| Activo/Inactivo (clients, machines) | `actif`/`active`→`success` · inactivo→`neutral` |

---

## Patrón común de migración (todas las páginas)

- **Header:** `<h1>` migra de `style={{ fontFamily: 'Poppins' }}` + `text-gray-900` a `font-display text-ink`. Subtítulos de conteo: `text-gray-400`/`text-gray-500` → `text-ink-muted`.
- **Botón "Nouveau X":** el `<Link>` con `style={{ backgroundColor: '#BF0D0D' }}` migra a las clases de `buttonClasses('primary')` (importado de `@/components/ui/Button`), aplicadas directamente al `<Link>`.
- **Wrapper de tabla/lista:** `bg-white rounded-xl border border-gray-200` → componente `Card` de Fase 0.
- **`<thead>`:** patrón establecido en bloque 1b — `bg-neutral-soft border-b border-line-subtle`; cada `<th>`: `text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5`.
- **`<tbody>`:** `divide-y divide-line-subtle`; filas con `hover:bg-neutral-soft transition-colors`.
- **Celdas:** `text-gray-900` → `text-ink`, `text-gray-600`/`text-gray-700` → `text-ink-soft`, `text-gray-400`/`text-gray-500` → `text-ink-muted`. Enlaces con hover: `hover:text-accent`.
- **Empty states:** texto e iconos → `text-ink-muted`; iconos grandes decorativos → `text-line` o `text-ink-muted`.
- **Avisos de truncación:** `bg-amber-50 border-amber-200 text-amber-600` → `bg-warning-soft border-warning/30 text-warning`.
- **Badges de estado:** sustituir los `<span>` con clases hardcodeadas por el componente `Badge` con la variante del mapeo.

---

## Componentes compartidos

### `src/components/admin/SearchFilters.tsx`
- `input` y `select`: `border-gray-200` → `border-line`, `bg-white` → `bg-card`, texto → `text-ink`; focus ring → `focus:ring-accent/20 focus:border-accent`.
- Icono de búsqueda: `text-gray-400` → `text-ink-muted`.
- Botón "Effacer": `text-gray-500 hover:text-gray-900` → `text-ink-soft hover:text-ink`.
- Sin cambios de lógica (debounce, sync URL, cleanup intactos).

### `src/components/admin/ViewToggle.tsx`
- Contenedor: `border-gray-200 bg-gray-100` → `border-line bg-neutral-soft`.
- Estado activo: `bg-white text-gray-900 shadow-sm` → `bg-card text-ink shadow-card`.
- Estado idle: `text-gray-500 hover:text-gray-800` → `text-ink-soft hover:text-ink`.

### `src/components/admin/IncidentsListView.tsx`
- Wrapper → `Card`.
- Maps `STATUS_STYLE`/`PRIORITY_STYLE` (clases hardcodeadas) → componente `Badge` con el mapeo de estado y prioridad.
- `<thead>`, celdas, empty state → tokens según el patrón común.
- Nº incidente: `text-[#BF0D0D]` → `text-accent`.

---

## Páginas

### `clients/page.tsx`
Tabla directa. El indicador activo/inactivo pasa a usar el componente `Badge` con texto plano sin icono (`actif`→`success`, `inactif`→`neutral`), unificado con `machines`. Los imports `CheckCircle`/`XCircle` quedan sin uso y se eliminan. Empty state con icono `Users` → tokens.

### `machines/page.tsx`
Tabla. Badge de tipo (`color`→`violet`, `noir_blanc`→`neutral`) con `Badge`. El indicador activo/inactivo (actualmente punto + texto) pasa también a `Badge` con texto plano (`active`→`success`, `inactive`→`neutral`), unificado con `clients`. Botón QR: `border-gray-200` → `border-line`, hover → tokens.

> **Decisión:** activo/inactivo se renderiza igual en `clients` y `machines` (mismo `Badge`, sin icono ni punto) para que el indicador sea coherente en todo el bloque. Es un pequeño cambio de presentación más allá de la pura migración de color, pero evita dos tratamientos distintos para el mismo concepto.

### `contracts/page.tsx`
Tabla. Map `STATUT_STYLE` → `Badge` (`actif`→`success`, `suspendu`→`warning`, `terminé`→`neutral`).

### `incidents/page.tsx`
Header + `ViewToggle` + `SearchFilters` + Kanban/Liste. La página solo migra header y aviso de truncación a tokens; el render de las dos vistas delega en `KanbanBoard` e `IncidentsListView` (migrados aparte).

### `maintenance/page.tsx`
Tabla + franja de 3 mini-KPIs. La tabla sigue el patrón común. Map `STATUS_CFG` → `Badge` (`fait`→`success`, `planifié`→`info`, `en_retard`→`danger`). Los 3 mini-KPIs (`Plans`, `En retard`, `À faire cette sem.`): wrapper `Card`, iconos y valores mantienen sus colores semánticos (`text-ink`/`text-accent`/`text-warning`) — el rojo y el amber son señales funcionales. Subtítulo del header con conteos `en retard`/`cette semaine` → `text-accent`/`text-warning`.

### `contadores/page.tsx`
No es tabla: lista de tarjetas-enlace agrupadas por cliente. Cada tarjeta → `Card` (con `hover:border-line`/`hover:shadow-raised`). El cuadro de icono (`#BF0D0D18` + `Building2`) → `bg-accent-soft text-accent`. Estados "À jour"/"manquant" → `text-success`/`text-warning`. La tarjeta "Sans contrat actif" (borde discontinuo) → `border-line` discontinuo + tokens.

---

## Kanban — `src/components/admin/KanbanBoard.tsx`

Archivo único con `IncidentCard`, `KanbanColumn` y `KanbanBoard`.

- **`IncidentCard`:** `bg-white rounded-lg border-gray-200` → `bg-card rounded-card border-line`; nº incidente `text-[#BF0D0D]` → `text-accent`; título/textos → tokens; el badge `PRIORITY_STYLE` → componente `Badge` con el mapeo de prioridad. Estados de drag (`shadow-2xl`, `opacity-30`, `hover:shadow-sm`) intactos.
- **`KanbanColumn`:** título `text-gray-700` → `text-ink`; chip de conteo `bg-gray-100 text-gray-400` → `bg-neutral-soft text-ink-soft`; zona de drop `bg-gray-50`/`bg-gray-100` (hover) → `bg-page`/`bg-neutral-soft`; borde dashed activo → `border-line`. Empty state → `text-ink-muted`.
- **`COLUMNS`:** los `dot` de cada columna (`bg-blue-500`, `bg-purple-500`, etc.) se mantienen — son indicadores funcionales de estado ya distinguibles.
- La lógica `@dnd-kit` (sensores, drag, optimistic update, Server Action) NO se toca.

---

## Archivos modificados (12)

| Archivo | Cambio |
|---|---|
| `src/app/globals.css` | tokens `--color-violet` / `--color-violet-soft` |
| `src/components/ui/Badge.tsx` | variante `violet` |
| `src/components/admin/SearchFilters.tsx` | inputs/selects → tokens |
| `src/components/admin/ViewToggle.tsx` | toggle → tokens |
| `src/components/admin/IncidentsListView.tsx` | `Card` + `Badge` + tokens |
| `src/components/admin/KanbanBoard.tsx` | tokens + `Badge` para prioridad |
| `src/app/admin/clients/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/machines/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/contracts/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/incidents/page.tsx` | header + tokens |
| `src/app/admin/maintenance/page.tsx` | header + tabla + mini-KPIs + tokens |
| `src/app/admin/contadores/page.tsx` | header + tarjetas por cliente + tokens |

---

## Fuera de alcance

- Lógica de datos, queries Supabase, Server Actions, filtros de búsqueda: sin cambios.
- Comportamiento del drag & drop del Kanban: intacto.
- Páginas de detalle/formularios (`[id]`, `new`, componentes `*Form`): son del bloque 1d.
- `tailwind.config.ts` legacy: limpieza aparte, no bloqueante.
