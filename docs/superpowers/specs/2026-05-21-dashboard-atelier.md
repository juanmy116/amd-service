# Spec — Dashboard Atelier (kiosko de taller)

**Fecha:** 2026-05-21
**Tipo:** Nueva feature
**Alcance:** Dashboard de taller en modo kiosko para una TV de 32" conectada a una Raspberry Pi 3, con cuenta de usuario especial "Atelier" y permisos de despacho.

---

## Objetivo

Crear un dashboard a pantalla completa, optimizado para una TV de 32" vista a distancia, que muestre en tiempo (casi) real todas las incidencias SAV en formato Kanban y los mantenimientos de la semana. El técnico que esté en el taller, usando un ratón conectado a la Raspberry Pi, puede asignar incidencias y visitas de mantenimiento a los demás técnicos directamente desde la pantalla.

**Por qué:** dar visibilidad operativa en el taller y permitir el despacho de trabajo sin necesidad de un admin.

---

## Cuenta Atelier y modelo de permisos

### La cuenta

- La cuenta "Atelier" es un usuario de Supabase Auth normal, con rol `technician` (NO admin) — la TV es una sesión físicamente expuesta, por lo que la cuenta debe tener privilegios mínimos.
- Se distingue con un flag nuevo: **`profiles.is_dispatcher boolean NOT NULL DEFAULT false`**. Solo la cuenta Atelier lo tiene en `true`.
- **Puesta en marcha (manual, fuera del código):** la cuenta de Supabase Auth se crea manualmente (formulario `/admin/team/new` o panel de Supabase) y luego se activa su flag con `UPDATE profiles SET is_dispatcher = true WHERE id = '<uuid>'`. No puede ir en una migración versionada porque los usuarios de auth los gestiona Supabase.

### Permisos del dispatcher

Un perfil con `is_dispatcher = true` puede, además de lo que puede un técnico normal:
- Cambiar el estado de cualquier incidencia (drag en el Kanban)
- Asignar cualquier incidencia a cualquier técnico
- Asignar cualquier visita de mantenimiento a cualquier técnico

Los técnicos normales **no** ganan ningún permiso. La condición de autorización en todas las Server Actions de despacho es: `caller.role === 'admin' OR caller.is_dispatcher === true`.

### Acceso y enrutado

- Ruta propia: **`/atelier`**. Se añade a `PROTECTED_ROUTES` del middleware.
- `/dashboard` (redirector por rol) comprueba `is_dispatcher` **antes** que el rol: si `is_dispatcher` → redirige a `/atelier`; si no, lógica normal (`admin`→`/admin`, `technician`→`/tech`, `client`→`/portal`).
- Como Atelier tiene rol `technician`, la RLS de técnico limitaría sus datos. Por eso:
  - **Lecturas:** el Server Component de `/atelier` lee vía `createAdminClient()` (bypassa RLS — patrón ya usado en el proyecto): incidencias `nouveau`/`assigné`/`en_cours` (todas) + `résolu` de la semana actual + visitas de mantenimiento lun–vie de la semana + lista de técnicos.
  - **Escrituras:** las Server Actions de despacho validan el guard y escriben vía `createAdminClient()`.
- RLS sin cambios — no se añaden políticas nuevas.

---

## El dashboard (`/atelier`)

### Layout (modo kiosko, tema oscuro)

Pantalla completa 16:9, fondo oscuro tipo "centro de mando", sin sidebar ni chrome de navegación. Estructura vertical:

1. **Cabecera** — logo "AMD · Atelier" + reloj/fecha en vivo.
2. **Franja de 4 tarjetas KPI.**
3. **Kanban de incidencias** (zona protagonista).
4. **Mini-tablero de mantenimientos lun–vie** (franja inferior).

Texto grande y alto contraste para legibilidad a distancia. El conjunto cabe en una pantalla 16:9 sin scroll.

### KPIs (4 tarjetas)

| KPI | Cálculo |
|---|---|
| Sans assigner | incidencias abiertas (no `fermé`) con `assigned_to` nulo |
| En cours | incidencias con `status = 'en_cours'` |
| Urgentes | incidencias abiertas con `priority = 'urgente'` |
| Résolus cette semaine | incidencias con `resolved_at` dentro de la semana actual |

La tarjeta "Sans assigner" se resalta en rojo cuando es > 0 (es lo accionable para despachar).

### Kanban de incidencias

- **Columnas por estado:** `nouveau`, `assigné`, `en_cours`, `résolu`. Las `fermé` se excluyen del tablero. Las columnas `nouveau`/`assigné`/`en_cours` muestran todas sus incidencias (trabajo abierto, naturalmente acotado); la columna `résolu` muestra solo las resueltas dentro de la **semana actual** (evita que crezca sin límite y refleja las victorias recientes).
- **Drag & drop:** arrastrar una tarjeta entre columnas cambia su estado (vía `updateIncidentStatusAction`).
- **Tarjeta:** muestra `numero_incident`, título, cliente y el **nombre del técnico asignado** (o "Sans technicien" resaltado en rojo si no tiene).
- **Clic en una tarjeta** → abre el `AssignPanel` (panel lateral rápido de asignación).
- Componente propio `AtelierKanban` — el tratamiento visual (oscuro, tamaño TV) difiere demasiado del `KanbanBoard` de `/admin` para reutilizarlo; usa `@dnd-kit` directamente.

### Mini-tablero de mantenimientos

- Componente `AtelierMaintenanceWeek`: 5 columnas, una por día laborable (lunes–viernes) de la **semana actual**.
- Cada columna lista las `maintenance_visits` con `scheduled_date` en ese día.
- Cada tarjeta de visita muestra el cliente y el técnico asignado (o "À assigner" si `assigned_to` es nulo).
- **Clic en una tarjeta** → abre el `AssignPanel`.

### AssignPanel (panel de asignación rápida)

- Panel lateral mínimo, compartido por el Kanban y el mantenimiento.
- Muestra la lista de técnicos (perfiles con `role = 'technician'`). Un clic en un técnico = asignado, el panel se cierra.
- Incluye una opción para desasignar.
- Llama a `assignIncidentAction` o `assignMaintenanceVisitAction` según el tipo de tarjeta abierta.

---

## Server Actions (`src/app/atelier/actions.ts`)

Todas validan `caller.role === 'admin' OR caller.is_dispatcher === true`; si no, devuelven error de autorización. Escriben vía `createAdminClient()`.

### `assignIncidentAction(incidentId, technicianId | null)`
- Actualiza `incidents.assigned_to`.
- **Automatismo:** si la incidencia está en `status = 'nouveau'` y se le asigna un técnico (`technicianId` no nulo), su estado pasa a `assigné`.
- Desasignar (`technicianId = null`) no cambia el estado.

### `assignMaintenanceVisitAction(visitId, technicianId | null)`
- Actualiza `maintenance_visits.assigned_to`.

### `updateIncidentStatusAction` (existente, se modifica)
- Archivo `src/app/admin/incidents/kanban-actions.ts`.
- El guard actual es solo `role === 'admin'`. Se amplía a `role === 'admin' OR is_dispatcher === true`, para que el drag del Kanban funcione tanto en `/atelier` como en `/admin`.

---

## Modo kiosko

- **Auto-refresco:** componente cliente `AutoRefresh` con `setInterval` que llama a `router.refresh()` cada **30 segundos** — reejecuta el Server Component y recarga los datos. Sin websockets (simple y suave en la Raspberry Pi 3).
- Tras cada asignación o cambio de estado, un `router.refresh()` inmediato refleja el cambio sin esperar al ciclo de 30 s.
- **Sesión persistente:** la sesión de Supabase se auto-renueva con el refresh token (el middleware ya lo gestiona). La pantalla permanece logueada indefinidamente; solo tras reiniciar la Raspberry hay que iniciar sesión una vez.
- **Robustez:** un fallo de refresco (corte de red) no vacía la pantalla — se mantiene el último dato bueno.

---

## Cambios en base de datos

Una migración: `supabase/migrations/<timestamp>_atelier_dispatcher.sql`
- `ALTER TABLE profiles ADD COLUMN is_dispatcher boolean NOT NULL DEFAULT false`
- `ALTER TABLE maintenance_visits ADD COLUMN assigned_to uuid REFERENCES profiles(id)`
- Sin cambios de RLS.

---

## Archivos

### Nuevos
| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/<ts>_atelier_dispatcher.sql` | columnas `is_dispatcher` y `assigned_to` |
| `src/app/atelier/layout.tsx` | layout kiosko (pantalla completa, oscuro) |
| `src/app/atelier/page.tsx` | Server Component: guard + lectura de datos + KPIs |
| `src/app/atelier/actions.ts` | `assignIncidentAction`, `assignMaintenanceVisitAction` |
| `src/components/atelier/AtelierHeader.tsx` | cabecera + reloj en vivo |
| `src/components/atelier/AtelierKpis.tsx` | las 4 tarjetas KPI |
| `src/components/atelier/AtelierKanban.tsx` | Kanban oscuro TV con drag & drop |
| `src/components/atelier/AtelierMaintenanceWeek.tsx` | mini-tablero mantenimientos lun–vie |
| `src/components/atelier/AssignPanel.tsx` | panel lateral de asignación rápida |
| `src/components/atelier/AutoRefresh.tsx` | auto-refresco del kiosko |

### Modificados
| Archivo | Cambio |
|---|---|
| `src/middleware.ts` | `/atelier` añadido a `PROTECTED_ROUTES` |
| `src/app/dashboard/page.tsx` | comprueba `is_dispatcher` antes del redirect por rol |
| `src/lib/auth.ts` | nuevo helper `requireDispatcher()` |
| `src/app/admin/incidents/kanban-actions.ts` | guard de `updateIncidentStatusAction` ampliado a admin-o-dispatcher |
| `src/components/admin/KanbanBoard.tsx` | las tarjetas muestran el nombre del técnico asignado |
| `src/app/admin/incidents/page.tsx` | pasa `technicianName` a `kanbanIncidents` |

---

## Fuera de alcance

- No cambia el rol ni los permisos de los técnicos normales.
- No se toca la web pública ni el resto del rediseño UI "Híbrido".
- La creación de la cuenta de Supabase Auth para Atelier es un paso manual de puesta en marcha.
- No hay realtime por websockets — el refresco es por polling cada 30 s.
- No se gestiona el aprovisionamiento de la Raspberry Pi (SO, navegador en modo kiosko) — es configuración de hardware ajena al repositorio.

---

## Plan de pruebas

- `npx tsc --noEmit` limpio y `npm run build` correcto.
- Con la cuenta Atelier (`is_dispatcher = true`): login redirige a `/atelier`.
- El Kanban muestra todas las incidencias no cerradas; el drag cambia el estado.
- Clic en una tarjeta abre el `AssignPanel`; asignar un técnico actualiza la tarjeta; asignar a una incidencia `nouveau` la pasa a `assigné`.
- El mini-tablero muestra las visitas lun–vie de la semana; se pueden asignar.
- Un técnico normal NO puede asignar ni cambiar estados (las Server Actions rechazan).
- El dashboard se auto-refresca cada 30 s.
- El `KanbanBoard` de `/admin/incidents` muestra el nombre del técnico en las tarjetas.
