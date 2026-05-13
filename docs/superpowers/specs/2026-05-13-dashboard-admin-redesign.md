# Spec: Rediseño Dashboard Admin — AMD Service SAV

**Fecha:** 2026-05-13  
**Scope:** `/app/admin/page.tsx` + componentes en `/components/admin/`  
**Fuente de referencia visual:** Google Stitch — `tableau_de_bord_admin_amd_service`  
**Proyecto afectado:** SAV únicamente. El sitio web público (`/`) no se toca.

---

## Objetivo

Refactorizar el dashboard admin (`/admin`) en dos dimensiones simultáneas:

1. **Limpieza estructural:** extraer los componentes inline de `page.tsx` a archivos propios para que `page.tsx` sea un orquestador puro de datos y layout.
2. **Enriquecimiento de contenido:** añadir la tabla de incidencias recientes y un botón "Nouveau Ticket" en el header, adoptando la estructura propuesta por Stitch.

---

## Restricciones

- **Código limpio:** cero imports sin uso, cero variables sin uso, cero código comentado.
- **Sin romper nada:** cada paso es independiente y verificable. Los datos existentes (queries, tipos) no se modifican salvo la adición de `DashboardRecentIncidents`.
- **`rounded-*` y `shadow-*`:** se mantienen tal como están en el SAV. Son convenciones de dashboard interno, no del sitio público.
- **TypeScript sin errores** antes de considerar cada paso terminado.

---

## Arquitectura de componentes

### Estado actual

`page.tsx` (437 líneas) contiene:
- `getDashboardData()` — queries a Supabase
- `KpiCard` — componente inline
- `CsatStars` — componente inline
- `RateChip` — componente inline
- Layout completo del dashboard

### Estado objetivo

```
src/
├── app/admin/page.tsx                  ← orquestador: getDashboardData() + layout
└── components/admin/
    ├── DashboardKpiStrip.tsx           ← NUEVO — extrae KpiCard + CsatStars inline
    ├── DashboardCopiesBanner.tsx       ← NUEVO — extrae banner rojo de copias
    ├── DashboardRecentIncidents.tsx    ← NUEVO — tabla incidents récents (Stitch)
    ├── DashboardTechTable.tsx          ← NUEVO — extrae tabla de técnicos
    ├── DashboardStatusDist.tsx         ← NUEVO — extrae distribución de estados
    ├── DashboardCharts.tsx             ← EXISTENTE — sin cambios funcionales
    ├── AgendaPanel.tsx                 ← EXISTENTE — sin cambios (montado en layout.tsx)
    └── AgendaPanelWrapper.tsx          ← EXISTENTE — sin cambios (montado en layout.tsx)
```

**Regla de `page.tsx` tras el refactor:** solo contiene `getDashboardData()` y JSX de composición. Ningún componente inline, ninguna lógica de presentación.

---

## Layout

> **Nota arquitectónica:** `AgendaPanel` ya está montado en `layout.tsx` como panel persistente en todas las páginas admin (estructura: `Sidebar | main | AgendaPanel`). No se incluye en el grid del dashboard — ya está presente.

```
┌─────────────────────────────────────────────────────────────────┐
│  Tableau de bord    Vue direction — {fecha}  [+ Nouveau Ticket] │
├─────────────────────────────────────────────────────────────────┤
│  DashboardKpiStrip (grid 5 cols, full width)                    │
│  [ Clients ] [ Machines ] [ Contrats ] [ CSAT ] [ Incidents ]   │
├─────────────────────────────────────────────────────────────────┤
│  DashboardCopiesBanner (full width, condicional)                │
├─────────────────────────────────────────────────────────────────┤
│  DashboardRecentIncidents (full width)                          │
│  Tabla: título, client, statut, technicien, date — 8 filas máx  │
├─────────────────────────────────────────────────────────────────┤
│  DashboardCharts                                                 │
│  CsatTrendChart (col-span-3) │ IncidentsTrendChart (col-span-2) │
├─────────────────────────────────────────────────────────────────┤
│  DashboardTechTable (col-span-3) │ DashboardStatusDist (col-2)  │
└─────────────────────────────────────────────────────────────────┘
```

**Cambio en el header:** se añade el botón `+ Nouveau Ticket` (Link a `/admin/incidents/new`) alineado a la derecha, con el estilo rojo AMD ya usado en el resto del admin.

---

## Componentes nuevos

### `DashboardKpiStrip`

**Props:**
```typescript
type Props = {
  clients: number
  machines: number
  contracts: number
  openIncidents: number
  avgCsat: number
  csatCount: number
}
```

**Contenido:** los 5 KPI cards actuales (Clients, Machines, Contrats, CSAT, Incidents ouverts). Extrae `KpiCard` y `CsatStars` que hoy son inline en `page.tsx`. `CsatStars` solo se usa aquí, por lo que vive dentro de este archivo como función interna, no exportada.

---

### `DashboardCopiesBanner`

**Props:**
```typescript
type Props = {
  totalCopies: number
}
```

**Contenido:** banner rojo AMD con total de copias del mes y enlace a `/admin/contadores`. Se renderiza solo si `totalCopies > 0`.

---

### `DashboardRecentIncidents`

**Server Component independiente.** Sin props — hace su propio fetch.

**Query:**
```typescript
supabase
  .from('incidents')
  .select(`
    id, title, status, priority, created_at,
    clients!client_id ( nom_client ),
    profiles!assigned_to ( full_name )
  `)
  .not('status', 'in', '("résolu","fermé")')
  .order('created_at', { ascending: false })
  .limit(8)
```

**Columnas de la tabla:**

| Columna | Origen | Fallback |
|---|---|---|
| Titre | `incidents.title` | — |
| Client | `clients.nom_client` | `—` |
| Statut | `incidents.status` | badge por estado |
| Technicien | `profiles.full_name` | `Non assigné` |
| Date | `incidents.created_at` | formato `dd MMM` |

**Estado vacío:** si no hay incidencias abiertas, fila única con `"Aucun incident ouvert"`.  
**Header:** incluye enlace `"Voir tout →"` a `/admin/incidents`.

**`RateChip`** (actualmente inline en `page.tsx`) se mueve a `DashboardTechTable` ya que solo lo usa ese componente.

---

### `DashboardTechTable`

**Props:**
```typescript
type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

type Props = {
  techPerf: TechPerf[]
}
```

**Contenido:** tabla de performance por técnico. Extrae `RateChip` como función interna no exportada.

---

### `DashboardStatusDist`

**Props:**
```typescript
type Props = {
  statusDist: Record<string, number>
  statusTotal: number
}
```

**Contenido:** barras de distribución de estados de incidencias con enlace al kanban.

---

## Datos — `getDashboardData()` en `page.tsx`

Sin cambios en queries ni en tipos. Solo se eliminan los componentes inline. El retorno sigue siendo el mismo objeto con `stats`, `totalCopies`, `avgCsat`, `csatTrend`, `incidentsTrend`, `statusDist`, `statusTotal`, `techPerf`, `today`, `currentMonthLabel`.

---

## Manejo de errores y estados vacíos

- Server Components: sin try/catch adicional. Next.js App Router delega errores al `error.tsx` del admin.
- Valores nulos de Supabase: ya cubiertos por `?? []` y `?? 0` en `getDashboardData()`.
- `DashboardRecentIncidents`: usa `?? []` sobre el resultado y renderiza estado vacío si length === 0.
- `client_id` null → muestra `"—"`. `assigned_to` null → muestra `"Non assigné"`.

---

## Orden de ejecución (paso a paso)

Cada paso es un commit independiente y verificable:

| Paso | Acción | Archivo(s) |
|---|---|---|
| 1 | Crear `DashboardKpiStrip` (extrae KpiCard + CsatStars) | nuevo + page.tsx |
| 2 | Crear `DashboardCopiesBanner` (extrae banner) | nuevo + page.tsx |
| 3 | Crear `DashboardTechTable` (extrae tabla + RateChip) | nuevo + page.tsx |
| 4 | Crear `DashboardStatusDist` (extrae distribución) | nuevo + page.tsx |
| 5 | Crear `DashboardRecentIncidents` (nuevo, fetch propio) | nuevo |
| 6 | Actualizar `page.tsx`: nuevo layout con todos los componentes + botón header | page.tsx |

Al finalizar el paso 6, `page.tsx` no debe contener ningún componente inline ni lógica de presentación.

---

## Fuera de scope

- Sitio web público (`/`) — no se toca.
- `AgendaPanel.tsx` y `AgendaPanelWrapper.tsx` — ya en `layout.tsx`, no se modifican.
- `DashboardCharts.tsx` — se integra sin cambios.
- `layout.tsx` — no se toca. La estructura `Sidebar | main | AgendaPanel` se mantiene.
- Otros módulos del SAV (`/portal`, `/tech`, `/admin/*`) — no se tocan.
