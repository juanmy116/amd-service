# Spec — Bloque 1b: Rediseño Dashboard `/admin`

**Fecha:** 2026-05-20  
**Fase:** 1b del rediseño UI "Híbrido" (ver spec maestro `2026-05-20-rediseno-ui-app-sav-design.md`)  
**Alcance:** `src/app/admin/page.tsx` + 6 componentes `Dashboard*` en `src/components/admin/`  
**Prerequisitos:** Fase 0 (tokens + componentes UI) ✅ · Bloque 1a (chrome) ✅

---

## Decisiones de diseño

### KPI cards
- **Iconos con color por tipo de dato** — cada KPI usa su propio par de colores para icono y fondo de icono (no el rojo de marca uniforme).
- **Fondo con gradiente diagonal** — cada tarjeta tiene un `linear-gradient(135deg, <color-suave> 0%, #FFFFFF 55%)`. No se puede expresar con utilidades Tailwind v4 → se aplica con `style` inline.
- Colores por KPI:

| KPI | Color icono | Fondo icono | Fondo tarjeta (desde) |
|---|---|---|---|
| Clients actifs | `#3B82F6` | `#DBEAFE` | `#EFF6FF` |
| Machines actives | `#10B981` | `#D1FAE5` | `#ECFDF5` |
| Contrats actifs | `#8B5CF6` | `#EDE9FE` | `#F5F3FF` |
| CSAT moyen | `#F59E0B` | `#FDE68A` | `#FFFBEB` |
| Incidents ouverts | `#BF0D0D` | `#FECACA` | `#FEF2F2` |

- La tarjeta CSAT mantiene su slot especial de estrellas debajo del valor numérico.
- Bordes: `border border-line rounded-card shadow-card` (tokens Fase 0, sin borde de color).

### CopiesBanner
- Concepto sin cambios: banner rojo full-width con total de copias del mes.
- Migración: `style={{ backgroundColor: '#BF0D0D' }}` → `bg-accent`; texto → `text-white`.

### Tablas y paneles
- Todos los wrappers `bg-white rounded-xl border border-gray-200` → `Card` (Fase 0).
- Cabeceras de panel → `PanelHeader` (Fase 0).
- Status badges en `DashboardRecentIncidents` → `Badge` (Fase 0), variantes:
  - `nouveau` → `solid` (azul)
  - `assigné` → `warning`
  - `en_cours` → `neutral`
- Colores de texto de tabla: `text-gray-400` → `text-ink-muted`, `text-gray-600` → `text-ink-soft`, `text-gray-900` → `text-ink`.
- Hover de filas: `hover:bg-gray-50/60` → `hover:bg-neutral-soft`.

### `RateChip` en `DashboardTechTable`
Se mantienen los colores semánticos hardcodeados (`bg-green-100 text-green-700`, etc.) — son señales funcionales de rendimiento, no decoración, y no tienen equivalente directo en los tokens del sistema.

### Cabecera de página (`page.tsx`)
- `h1`: añadir `font-display` (Poppins), migrar `text-gray-900` → `text-ink`.
- Fecha: `text-gray-400` → `text-ink-muted`.
- Botón "Nouveau Ticket": el `<Link>` actual usa `style` inline. Migrar a clases de token: `bg-accent hover:bg-accent-dark text-white rounded-card` (los mismos valores que el `Button` primary de Fase 0, aplicados directamente al `<Link>` para no romper la semántica de navegación).

### Charts
- Internos de Recharts (`DashboardCharts.tsx`) no se modifican.
- Los wrappers de CSAT y de Incidentes que viven en `page.tsx` se migran de divs inline a `Card` + `PanelHeader`.

---

## Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `src/app/admin/page.tsx` | Header → tokens · wrappers de charts → Card+PanelHeader |
| `src/components/admin/DashboardKpiStrip.tsx` | KpiCard local reescrito con gradiente + colores por KPI |
| `src/components/admin/DashboardCopiesBanner.tsx` | `style` inline → `bg-accent` |
| `src/components/admin/DashboardRecentIncidents.tsx` | Card+PanelHeader · Badge · colores → tokens |
| `src/components/admin/DashboardStatusDist.tsx` | Card+PanelHeader · colores → tokens |
| `src/components/admin/DashboardTechTable.tsx` | Card+PanelHeader · colores → tokens |
| `src/components/admin/DashboardCharts.tsx` | Sin cambios |

---

## Fuera de alcance

- Lógica de datos (`getDashboardData` en `page.tsx`): sin cambios.
- Server Actions, queries Supabase: sin cambios.
- Estructura de layout o rutas: sin cambios.
- `tailwind.config.ts` legacy (limpieza aparte, no bloqueante).
