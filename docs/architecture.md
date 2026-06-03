# AMD Service — Arquitectura del Proyecto SAV

> Documento de referencia técnica. Actualizar cada vez que se haga un cambio estructural.
> Última actualización: 2026-06-03 (sesión 24 — refactor contratos N máquinas: tabla `contract_machines`, helpers TS, UI actualizada)

---

## Visión General

Sistema de gestión de incidencias (SAV) para AMD Service, empresa de alquiler y gestión de equipos de impresión profesional en Dakar, Senegal. El sistema incluye un back-office para administradores, una app de campo para técnicos, un portal para clientes, un módulo de contadores de copias y un agente automatizado que procesa alertas del servicio Princity.

**Producción:** `https://amd-service.vercel.app`
**Repositorio:** `https://github.com/juanmy116/amd-service` (privado)
**Versión actual:** `v1.7`

---

## Actores del Sistema

| Actor | Acceso | Creación de cuenta |
|---|---|---|
| **Admin AMD** | Back-office completo | Manual por AMD |
| **Técnico AMD** | App de campo (PWA) | Manual por AMD (invitación por email) |
| **Cliente** | Portal cliente | Registro propio + verificación por nº contrato |
| **Princity Sync** | Lectura API Princity (REST v1/v3) + escritura en BD | Automatizado (service_role, pg_cron) |

---

## Módulos

### 1. Back-office AMD (`/admin`) ✅
- Dashboard de dirección: KPIs globales, CSAT, incidencias por técnico, distribución de estados
- Gestión de clientes, máquinas y contratos
- Gestión y asignación de incidencias (Kanban drag & drop)
- Generación de QR por máquina (etiqueta imprimible con logo, datos y código QR)
- Módulo de contadores de copias agrupado por cliente
- Gestión de usuarios internos (técnicos y admins)
- Creación directa de cuentas: admin introduce email + contraseña temporal → cuenta activa al instante (`createUser` con `email_confirm: true`), sin flujo de invitación por email

### 2. Portal Cliente (`/portal`) ✅
- Login con email/contraseña (Google OAuth pendiente de activar)
- Verificación de cuenta mediante número de contrato
- Dashboard: stats de máquinas e incidencias
- Visualización de máquinas e incidencias en tiempo real
- Apertura de nuevas incidencias

### 3. App de Campo — PWA Técnico (`/tech`) ✅
- Login para técnicos
- Escaneo de QR → ficha de la máquina con incidencias activas + mantenimiento pendiente
- **Auto-transición 1er escaneo:** al cargar `/tech/scan/[serie]`, los incidentes `assigné` asignados al técnico pasan automáticamente a `en_cours` (usando `createAdminClient()` server-only). Registrado en `incident_history` con `comment: 'Mise en cours automatique — scan QR'`. Solo ejecuta si la máquina está activa (`machine.active`).
- Vista de intervenciones asignadas
- Formulario de intervención: informe + checkboxes de piezas + campo libre + estado
- Formulario de cierre de mantenimiento preventivo: piezas reemplazadas + notas; accesible solo desde el QR de la máquina (`qr_verified = true` garantizado)
- Auto-programación de la siguiente visita de mantenimiento al cerrar la actual
- Layout responsive: bottom nav en móvil ↔ sidebar en desktop

**Home page (`/tech`):**
- Stats bento 2×2: En cours · Urgents (fondo rojo si >0) · Résolus ce mois · Total assignés
- Widget "Prochaine intervention": incident activo ordenado por prioridad (urgente→haute→normale→basse), muestra cliente + título + badge prioridad
- FAB "Scanner une machine" fijo en layout, persistente en todas las páginas del PWA móvil (encima de la nav, `bottom-16 z-40`)
- Lista de interventions activas: tarjetas en móvil, tabla en desktop (incluye nombre cliente)

**Incidents page (`/tech/incidents`):**
- Chips de filtro client-side: Tous · Urgents · Aujourd'hui (componente `TechIncidentList`)
- Tarjetas con borde izquierdo de 4px coloreado por prioridad: urgente=`#BF0D0D` · haute=`#F97316` · normale=`#3B82F6` · basse=`#9CA3AF`
- Muestra cliente (`clients!client_id(nom_client)`) en cada tarjeta

**Navegación móvil (4 ítems):** Accueil · Incidents · Machines · Planning  
_(Scanner eliminado del nav; accesible vía FAB persistente)_

**Componentes (`src/components/tech/`):**
- `TechIncidentList.tsx` — Client Component: chips de filtro + tarjetas; exporta tipo `TechIncident`
- `AgendaPanel.tsx`, `MaintenanceVisitForm.tsx` — existentes

### 4. Módulo Contadores (`/admin/contadores`) ✅
- Vista principal agrupa máquinas por cliente con indicador ⚠ de relevés pendientes
- Clic en cliente → vista detalle con todas sus máquinas y sus últimos relevés
- Registro mensual de contadores totales (N&B + Color) por máquina
- Campo `day` para indicar el día exacto del mes en que se tomó el relevé
- Cálculo automático del delta mensual (copias impresas ese mes)
- Gestión de sustitución de máquinas con trazabilidad de equipo anterior
- Principio de inmutabilidad: los relevés no se editan, se anulan con motivo obligatorio
- Trazabilidad completa: cada relevé guarda nº serie + contrato + cliente en el momento del registro
- Gráfico de evolución mensual (últimos 12 meses) y tabla histórica con anomalías
- Detección visual de deltas negativos (⚠)

### 5. Integración Princity (4 Edge Functions vía API REST) ✅

> **Cambio de arquitectura (sesión 5):** la antigua integración IMAP (`princity-agent`) fue sustituida por una integración directa contra la API REST de Princity. Solo lectura por diseño — el `PrincityClient` no expone ningún método de mutación.

**API y autenticación:**
- Base URL custom: `https://amdservice.its-printer.com/api` (instancia self-hosted/white-label de Princity)
- Header: `App-auth-key: <PRINCITY_API_KEY>` en cada request
- Dos versiones convivientes:
  - **v1 (REST clásica, GET)** — usada para listar contratos y dispositivos
  - **v3 (POST con filtros tipo SQL)** — usada para queries con filtros (alerts, billingCounters)
- ⚠️ En esta instancia los endpoints `/v3/companies` y `/v3/devices` están bloqueados con `"Report query error"`. Por eso se usa `/v1/contracts` + `/v1/devices?contract=X` en su lugar.

**4 Edge Functions (Supabase, Deno, `verify_jwt: false`):**

| Edge Function | Frecuencia | Endpoints Princity | Función |
|---|---|---|---|
| `princity-alerts` | cada hora (`0 * * * *`) | `POST /v3/alerts` con `Alert.deactivationDate IS_NULL` | Detecta pannes y toner-bas; crea incidencias para pannes con máquina+contrato conocidos |
| `princity-sync` | diario 06:00 UTC (`0 6 * * *`) | `GET /v1/contracts` + `GET /v1/devices?contract=X` (paralelizado en lotes de 10) | Detecta nuevos clientes y equipos; modo `normal` solo INSERT-si-no-existe; modo `initial` ejecuta `wipe_data_tables` + reimport completo |
| `princity-counters` | 2× al día: 02:00 + 07:00 UTC (`0 2 * * *` y `0 7 * * *`) | `POST /v3/billingCounters` con filtro `BillingCounter.deviceId EQ <id>` | Importa último contador del mes por máquina; aprende el `billing_day` por contrato. Doble ejecución para cubrir variaciones horarias de Princity (idempotente por `(machine_id, year, month, status='actif')`) |
| `princity-watchdog` | cada 2h (`30 */2 * * *`) | — (consulta `princity_health`) | Alerta por email si alguna función no se ejecuta en su umbral (alerts: 2h, sync: 2d, counters: 35d) |

**Helpers compartidos (`supabase/functions/_shared/`):**
- `princity-client.ts` — clase `PrincityClient` con `fetchAll()` (POST v3 lectura) y `getV1()` (GET v1). **Sin método POST a v1**: imposible escribir en Princity con el código actual.
- `db.ts` — `getAdminClient()` (parsea `SUPABASE_SECRET_KEYS.default`), `updateHealth()`, `writeLog()`
- `secret-key.ts` — `getSecretKey()`, `getAllSecretKeys()`, `isValidSecretKey()` para parsear el JSON `SUPABASE_SECRET_KEYS` auto-inyectado por la plataforma
- `notify.ts` — `notifyEmail()` (Resend): envío de alertas del watchdog al admin

**Identificadores Princity en BD:**
- `clients.princity_company_id` (text, UNIQUE) — guarda el `prefix` del contrato Princity (ej. `"63"`)
- `clients.princity_prefix` (text) — copia legacy del mismo valor
- `machines.princity_device_id` (text, UNIQUE) — id Princity en formato `<contractPrefix>-<index>` (ej. `"63-0"`). Compatible con `/v3/billingCounters`.
- `machines.princity_pending` (boolean) — true si la máquina fue importada pero aún no tiene contrato manual creado

**Page admin `/admin/princity`:**
- Server Component que muestra 3 tarjetas de salud (`princity_health`), botón de importación inicial (Client Component con `useActionState` + `confirm()`) y tabla de los 20 últimos logs (`princity_api_logs`).
- Sidebar: entrada "Princity API" con icono `Plug`.

**Bug crítico resuelto en `wipe_data_tables`:** PostgREST bloquea `DELETE` sin `WHERE` clause cuando se llama vía `db.rpc()` desde Edge Functions. La función original usaba `DELETE FROM tabla` y fallaba silenciosamente. Migración `wipe_data_tables_use_truncate` (2026-05-13): se cambió a `TRUNCATE TABLE ... RESTART IDENTITY CASCADE`. Además se revocó `EXECUTE` a `anon` y `authenticated` por seguridad (advisor lo detectó como crítico).

### 6. Pasarela QR (`/m/[serie]`) ✅
Punto de entrada universal para los QR físicos de máquinas. Server Component que detecta el rol del usuario y redirige:
- **Técnico / admin** → `/tech/scan/[serie]`
- **Cliente** → `/portal/incidents/new?machine=[serie]` (máquina preseleccionada si pertenece al contrato)
- **Sin sesión** → `/signaler/[serie]` (formulario público — PR #19)

El QR imprimible (`/admin/machines/[serie]/qr`) apunta a esta ruta desde PR #18. Los QR anteriores apuntaban directamente a `/tech/scan/` y siguen funcionando para técnicos.

### 6b. Formulario Público de Incidentes (`/signaler/[serie]`) ✅ — PR #19 (2026-05-22)
Ruta pública **sin autenticación** para que cualquier persona abra un incidente escaneando el QR de una máquina.

**Flujo:**
1. Usuario escanea el QR → `/m/[serie]` → sin sesión → `/signaler/[serie]`
2. Server Component carga la máquina vía `createAdminClient()` → `notFound()` si no existe
3. Formulario (Client Component): banner máquina + Nom * + Téléphone * + Email (optionnel) + Description * (máx. 500 chars con contador)
4. Server Action `submitPublicIncident`:
   - Sanitización: strip HTML, control chars, allowlist teléfono `[0-9 +\-().]`, límite server-side en todos los campos
   - Rate limit: `${ip}:${serie}` — 2/hora y 5/día (Upstash Redis, limiters `public_incident_hourly` / `public_incident_daily`)
   - Si superado → estado `rateLimited` con mensaje "Il y a déjà un incident en attente…"
   - Lookup `machines` (verifica existencia) + lookup `contracts` activo (obtiene `contract_id` si existe)
   - INSERT en `incidents` con `opened_by=null`, `source='public'`, campos de contacto
   - Email de notificación a `savamdservice@gmail.com` (template `raw` via Resend, contenido HTML escapado)
5. Estado de éxito: mensaje de agradecimiento + número de referencia `SAV-YYYY-NNNN`

**Seguridad:** datos del reporter anónimo (`contact_name/phone/email`) son visibles solo en el detalle de admin. El portal del cliente los excluye con filtro `.or('source.is.null,source.neq.public')` en listado y detalle. La página tech detail usa query condicional para evitar crash con `contract_id=null`.

### 7. Sistema CSAT ✅
- Al resolver un ticket, se envía email al cliente vía Resend
- Email contiene enlace único con token de 7 días
- El cliente valora de 1 a 5 + comentario opcional
- Página pública `/csat/[token]` sin autenticación
- Respuestas almacenadas en `csat_responses`

### 7. Dashboard de Dirección (`/admin`) ✅
- KPIs: clientes activos, máquinas activas, contratos activos, incidentes abiertos, CSAT medio, copias este mes
- Gráfico CSAT tendencia (últimos 6 meses) — LineChart
- Gráfico incidencias por mes (últimos 6 meses) — BarChart
- Tabla de performance por técnico: total, resueltos, en curso, tasa de resolución
- Distribución de estados de incidencias (barras CSS)
- Tabla "Incidents récents": 8 últimos incidents abiertos con cliente, técnico, estado y fecha
- Botón "Nouveau Ticket" en la cabecera → `/admin/incidents/new`

**Componentes (`src/components/admin/`):**
- `DashboardKpiStrip.tsx` — franja de 5 KPI cards (clientes, máquinas, contratos, incidents, CSAT)
- `DashboardCopiesBanner.tsx` — banner rojo AMD con copias del mes (oculto si 0)
- `DashboardRecentIncidents.tsx` — Server Component con fetch propio; tabla de incidents abiertos
- `DashboardTechTable.tsx` — tabla de performance del equipo técnico; exporta tipo `TechPerf`
- `DashboardStatusDist.tsx` — barras CSS de distribución de estados
- `DashboardCharts.tsx` — `CsatTrendChart` + `IncidentsTrendChart` (Recharts, Client Components)

### 8. Sitio Web Público (`/`) ✅

Sitio de marketing B2B en francés con 6 páginas + layout compartido (Navigation + Footer).

| Ruta | Contenido |
|---|---|
| `/` | Home: hero vídeo, value bar, prueba de servicio, bento soluciones, planes, logos clientes, soporte técnico, beneficios, CTA |
| `/location` | **Página core del negocio.** Location d'imprimante & photocopieur — SEO-first, con counter animado en stats, PlanCards rediseñadas (blanco puro + botón rojo), foto real AMD |
| `/services` | Servicios técnicos: venta, gestión de parc, maintenance, consommables. Banner de remisión a `/location` |
| `/why` | Pourquoi AMD: problemas → soluciones, comparativo achat vs AMD |
| `/cases` | 4 casos de uso con métricas (grande entreprise, admin, PME, ONG) |
| `/faq` | Preguntas frecuentes por categoría (AccordionItem) |
| `/contact` | Formulario de contacto + sidebar informativa |

**Componentes clave:**
- `Navigation.tsx` — sticky, dark navy, activo por pathname, menú móvil
- `Footer.tsx` — 4 columnas: brand, nav, services, contact
- `PhotoFrame.tsx` — `<figure>` con `next/image fill`, sin créditos
- `PlanCards.tsx` — 3 tarjetas de equipos (framer-motion, fondo blanco, botón rojo `#BF0D0D`)
- `LocationStats.tsx` — barra de 4 stats con contador animado (requestAnimationFrame + ease-out cúbico, `prefers-reduced-motion` respetado)
- `ServicesBento.tsx`, `BenefitsList.tsx`, `ClientLogos.tsx`, `HeroVideo.tsx`, `HeroStats.tsx`

**Navegación (orden):** Accueil · **Location** · Services · Pourquoi AMD · Cas d'usage · FAQ · Contact

**Fotos reales AMD:** almacenadas en `public/images/Photos/` (photo01–photo11). Referenciadas en `src/lib/visuals.ts` mediante claves semánticas (`locationHero`, `locationDetail`, etc.)

**SEO — página `/location`:**
- `<title>`: *"Location d'imprimante & photocopieur à Dakar — AMD Service"*
- Keywords principales: `location imprimante Dakar`, `location photocopieur Dakar`, `coût par copie Sénégal`, `louer imprimante entreprise Dakar`
- Competidores directos identificados: AFAM (Sharp), NexaPrint (MPS)

### 10. Sistema de Mantenimiento Preventivo (`/admin/maintenance`) ✅
- Planes de mantenimiento por contrato: frecuencia mensual (30 días) o trimestral (90 días)
- Admin crea plan → primera visita programada → sistema auto-genera siguientes visitas al cerrar cada una
- Back-office: lista con KPIs (total, en retard, esta semana), formulario nuevo plan, detalle con historial
- Edge Function `maintenance-cron` con pg_cron diario a las 8h UTC:
  - Marca visitas atrasadas como `en_retard`
- Cierre de visita vía QR: técnico escanea la máquina → ve mantenimiento pendiente → formulario con checklist de piezas + notas → `qr_verified = true`
- Piezas reemplazadas guardadas en `maintenance_parts` (catálogo `parts` + campo libre)

### 11. Dashboard Atelier (`/atelier`) ✅
- Kiosko de taller a pantalla completa para una TV de 32" conectada a una Raspberry Pi 3 — tema oscuro «centro de mando», auto-refresco cada 30 s
- Muestra todas las incidencias en Kanban (drag & drop = cambia estado) + mini-tablero de mantenimientos lun–vie + 4 tarjetas KPI
- Cuenta especial «Atelier»: rol `technician` + flag `profiles.is_dispatcher` → un *dispatcher* puede asignar incidencias y visitas de mantenimiento a los técnicos sin ser admin
- Las Server Actions de despacho validan `admin OR is_dispatcher` y escriben vía `createAdminClient()`; el middleware protege `/atelier` y `/dashboard` redirige ahí a los dispatchers

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Base de datos | Supabase (PostgreSQL 17, proyecto `myyejbviunyvywfukysj`, us-east-2) |
| Auth | Supabase Auth (email/password + Google OAuth pendiente) |
| Backend / lógica | Next.js Server Actions + Supabase Edge Functions |
| Frontend | Next.js 16 App Router + TypeScript + Tailwind CSS v4 |
| App técnico | PWA mobile-first (Next.js, mismo repo) |
| Emails transaccionales | Resend (`noreply@amd-service.com`, dominio verificado) |
| Integración Princity | 4 Edge Functions (`princity-alerts` cada hora, `princity-sync` diario, `princity-counters` diario, `princity-watchdog` cada 2h) sobre API REST Princity v1+v3 |
| Mantenimiento preventivo | Edge Function `maintenance-cron`, cron diario 8h UTC vía pg_cron + pg_net |
| QR por máquina | Librería `qrcode`, generado en back-office, página imprimible |
| Gráficos | Recharts (módulo Compteurs + Dashboard de dirección) |
| Kanban | `@dnd-kit/core` + `@dnd-kit/utilities` |
| Scanner QR | `@zxing/browser` (PWA técnico) |
| Hosting frontend | Vercel (Next.js) |

---

## Jerarquía de Datos

```
Cliente
  └── Contrato (nº contrato = llave de verificación del portal)
        ├── Líneas contrato-máquina (contract_machines — N por contrato)
        │     └── Máquina (numero_serie = PK de todo el sistema)
        │           ├── Incidencias (contract_machine_id → contract_machines)
        │           │     ├── Piezas reemplazadas (incident_parts → parts)
        │           │     ├── Fotos de intervención (incident_photos)
        │           │     ├── Historial de cambios de estado (incident_history)
        │           │     └── Respuesta CSAT (csat_responses)
        │           └── Contadores mensuales (machine_counters — inmutables)
        └── Plan de mantenimiento (maintenance_plans — 1 por contrato)
              └── Visitas (maintenance_visits — auto-programadas)
                    └── Piezas reemplazadas (maintenance_parts → parts)
```

### Modelo N máquinas por contrato (`contract_machines`) — sesión 24

Un contrato puede tener varias máquinas. La vinculación se gestiona mediante la tabla `contract_machines`:

- **`date_debut` / `date_fin`** — período de la vinculación. `date_fin IS NULL` = línea abierta (máquina actualmente asignada).
- **`statut`** — `actif | suspendu | terminé`. Una máquina con `date_fin IS NULL` y `statut = suspendu` sigue bloqueada para otro contrato hasta que se le asigne `date_fin`.
- **Índice único parcial** `contract_machines_one_open_per_machine (machine_id) WHERE date_fin IS NULL`: una máquina solo puede tener una línea abierta a la vez, independientemente del `statut`.
- **Overrides por línea**: `billing_day_override` y `maintenance_frequency_override` anulan el valor por defecto del contrato para esa máquina concreta. Los helpers `resolveBillingDay()` y `resolveMaintenanceFrequency()` en `src/lib/contract-machines.ts` aplican la lógica override→fallback.
- **Incidencias**: `incidents.contract_machine_id` (UUID) referencia la línea. La columna `incidents.machine_id` queda `NULL` en incidencias internas (XOR garantizado por constraint). Las incidencias públicas (`source='public'`) conservan `machine_id`.
- **PR-cleanup** pendiente (5-7 días post-merge): eliminar `contracts.machine_id`, `contracts.lieu_installation` e `incidents.contract_id` (columnas legacy, ya sin uso en la app).

> **Flujo de creación desacoplado (sin dependencia circular):**
> 1. Crear cliente (`/admin/clients/new`) — solo datos del cliente
> 2. Crear máquina (`/admin/machines/new` individual o `/admin/machines/import` en bloque vía CSV) — solo datos de la máquina
> 3. Crear contrato (`/admin/contracts/new`) — une cliente + N máquinas (solo muestra máquinas sin línea abierta en otro contrato); cada máquina se puede configurar con overrides de facturación y mantenimiento
> 4. Crear plan de mantenimiento (`/admin/maintenance/new`) — enlazado al contrato

### Importador CSV de máquinas (`/admin/machines/import`) — sesión 23

Para dar de alta en bloque las máquinas que **no están en Princity**:
- Flujo 2 pasos: upload CSV → preview con validaciones → confirmar import.
- Parser `papaparse` (BOM UTF-8, exports Excel OK). Helper en `src/lib/csv-import.ts`.
- Columnas requeridas: `numero_serie`, `marque`, `modele`, `type` (`color` | `noir_blanc`).
- Columnas opcionales: `nom_client` (informacional para preview, machines no tiene `client_id`), `localisation`.
- Marca distintiva: las máquinas creadas reciben `princity_device_id=NULL` + `princity_pending=false`. El cron `princity-counters` ya filtra por `princity_device_id IS NOT NULL` → no las toca.
- Idempotencia: serie duplicada en BD → marcada «Déjà existant», NO se actualiza.
- Tamaño máximo CSV: 1 MB.
- **Prerequisito de la Fase B OCR de contadores** (spec en `docs/superpowers/specs/2026-05-26-ocr-contadores.md`).

---

## Flujo de una Incidencia

### Creada por Princity (automática)
```
pg_cron `princity-alerts-hourly` (cada hora)
  → Edge Function princity-alerts → POST /v3/alerts (filtro Alert.deactivationDate IS_NULL)
  → Para cada alerta: lookup machine por princity_device_id, lookup contrato activo
  → Insert en princity_alerts con idempotencia (code + device_id_raw + received_at)
  → Si alert_type = 'panne' y machine+contract conocidos → incidents (status: nouveau)
  → Admin asigna técnico → incidents (status: assigné)
  → Técnico escanea QR → /tech/scan/[serie] → auto-transición assigné → en_cours (automático)
  → Técnico completa formulario + piezas → résolu
  → sendCsatForIncident: Resend envía CSAT + auto-transición résolu → fermé (automático)
```

> **Flujo QR automático (sesión 12):** el 1er escaneo QR del técnico dispara `assigné → en_cours` sin acción manual. Al resolver (`résolu`), `src/lib/csat.ts` envía el email CSAT y cierra automáticamente a `fermé` (guard `.eq('status','résolu')` + comprobación de filas actualizadas antes de insertar en `incident_history`). El admin puede seguir cerrando manualmente desde el kanban en casos donde no hay portal cliente.

### Creada por el cliente (portal)
```
Cliente logueado → selecciona máquina → abre incidencia
  → incidents (status: nouveau)
  → (mismo flujo desde asignación)
```

### Creada vía QR público (sin autenticación) — PR #19
```
Cualquier persona escanea el QR de la máquina
  → /m/[serie] → sin sesión → /signaler/[serie]
  → Rellena formulario (nombre, teléfono, email opcional, descripción 500 chars)
  → submitPublicIncident: sanitiza + rate limit (2/h · 5/día por IP:serie)
  → Si rate limit superado → mensaje "Il y a déjà un incident en attente…"
  → INSERT incidents (source='public', opened_by=null, contract_id según contrato activo)
  → Email notificación a savamdservice@gmail.com
  → Muestra número de referencia SAV-YYYY-NNNN
```

---

## Flujo de Mantenimiento Preventivo

```
Admin crea plan en /admin/maintenance/new
  → Selecciona contrato (solo contratos sin plan activo)
  → Elige frecuencia: mensual (30 días) o trimestral (90 días)
  → Indica fecha primera visita + notas opcionales
  → Se crea maintenance_plan + primera maintenance_visit (status: planifié)

Edge Function maintenance-cron (diario 8h UTC, via pg_cron + pg_net):
  → Visitas con scheduled_date < hoy y status='planifié' → status='en_retard'

Técnico va a la instalación
  → Escanea QR de la máquina → /tech/scan/[serie]
  → Ve card "Maintenance planifiée" (azul) o "Maintenance en retard" (roja)
  → Pulsa la card → /tech/scan/[serie]/maintenance/[visitId]
  → Rellena checklist 12 piezas + campo libre + notas
  → Pulsa "Clôturer la maintenance"
    → visit: status='fait', done_at=now(), done_by=user.id, qr_verified=true
    → Inserta filas en maintenance_parts para cada pieza marcada
    → Crea siguiente maintenance_visit (scheduled_date = scheduled_date actual + 30/90 días)
    → Redirige a /tech/scan/[serie]
```

> **Prueba de presencia física:** el formulario solo es accesible via `/tech/scan/[serie]/maintenance/[visitId]` (requiere escanear el QR físico de la máquina). `qr_verified = true` es implícito y no falsificable sin acceso físico al equipo.

---

## Flujo del Módulo Contadores

```
Admin va a /admin/contadores → lista de clientes con nº máquinas y estado relevés
  → Hace clic en un cliente → /admin/contadores/cliente/[clientId]
  → Ve tabla de máquinas del cliente con último relevé y delta
  → Hace clic en "Détail" de una máquina → /admin/contadores/[serie]
  → Ve gráfico mensual + tabla histórica
  → Rellena formulario: día (opcional), mes, año, contador N&B total, contador Color total
  → Sistema verifica que no exista relevé activo para ese mes
  → Sistema captura automáticamente contrato y cliente vigentes
  → Relevé guardado como inmutable (status: 'actif')

Si hay que corregir un relevé:
  → Clic en "Annuler" → modal con motivo obligatorio
  → Relevé pasa a status: 'annule' (conservado en BD, no borrado)
  → Admin introduce nuevo relevé correcto

Si se sustituye una máquina:
  → Admin marca "Remplacement de machine" en el formulario
  → Indica nº serie de la máquina anterior
  → El primer delta de la nueva máquina se muestra como "Inicio" (no se calcula)
  → Historial de máquina anterior conservado e interconectado
```

---

## Estructura de las Respuestas Princity API

### `GET /v1/contracts` — fuente de clientes
```json
[
  {
    "prefix": "63",
    "location": {
      "active": true,
      "name": "RAGNI NOVEA SARL",
      "street": "IMM JAIS 3EME ETAGE C3...",
      "postalCode": "11000",
      "city": "DAKAR",
      "phone": null, "email": null,
      "maintainer": { "name": "...", "email": "...", "phone": "..." }
    },
    "timezone": "Africa/Dakar",
    "taxNumber": "0094113312V2",
    "settlementMethod": "PER_PAGE_GLOBAL"
  }
]
```
Mapeo: `prefix → clients.princity_company_id`, `location.name → nom_client`, `location.street → adresse`, `location.city → ville`, `taxNumber → ninea`.

> **Nota sobre `ninea`:** la API copia exactamente lo que Princity tiene. Como Princity no exige el campo `taxNumber`, muchos contratos vienen con `null` y por tanto el `ninea` queda vacío en la BD. No es un bug: refleja la realidad de los datos en Princity. Si se necesita el NINEA completo, hay que registrarlo desde Princity o editarlo manualmente en `/admin/clients`.

### `GET /v1/devices?contract=63` — equipos de un contrato
```json
[
  {
    "id": "63-0",
    "serial": "W513J200483",
    "mac": "00:26:73:57:81:67",
    "hostname": "192.168.1.35",
    "deviceModel": { "name": "Aficio MP C4502", "manufacturer": "Ricoh", "color": true },
    "deviceStatus": "ACTIVE"
  }
]
```
Mapeo: `id → machines.princity_device_id`, `serial → numero_serie` (PK), `deviceModel.color → type` (color/noir_blanc), `deviceModel.name → modele`, `deviceStatus === "ACTIVE" → active`.

### `POST /v3/alerts` — alertas en curso
fieldIds usados: `Alert.activationDate`, `Alert.severityLevel`, `Alert.description`, `Alert.deviceId`, `Alert.code`, `Alert.companyId`.
Idempotencia en BD: clave compuesta `(princity_alert_code, princity_device_id_raw, received_at)`.

### `POST /v3/billingCounters` — contadores diarios por máquina
fieldIds usados: `BillingCounter.date`, `BillingCounter.startMono`, `BillingCounter.endMono`, `BillingCounter.startColor`, `BillingCounter.endColor`.
Filtro: `BillingCounter.deviceId EQ <princity_device_id>`. Orden: `BillingCounter.date DESC`, limit 1.

### Clasificación de `alert_type`
- `severity = "error"` y `description` NO contiene "toner" → `panne` (crea incidencia)
- `description` contiene "toner" o "niveau bas" → `toner_bas` (solo se registra en BD)
- resto → `autre`

---

## Schema de Base de Datos

### Supabase Project
- **ID:** `myyejbviunyvywfukysj`
- **Host:** `db.myyejbviunyvywfukysj.supabase.co`
- **Región:** us-east-2
- **PostgreSQL:** 17

---

### Tabla: `profiles`
Extiende `auth.users`. Se crea automáticamente vía trigger al registrar un usuario.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | FK → auth.users |
| `role` | enum | client / technician / admin |
| `full_name` | text | nullable |
| `phone` | text | nullable |
| `is_dispatcher` | boolean | default: false — true solo en la cuenta «Atelier» (acceso a `/atelier` + permiso de despacho) |
| `created_at` | timestamptz | default: now() |

> **FKs hacia `profiles` — `ON DELETE SET NULL`:** las 6 referencias desde `incidents` (`opened_by`, `assigned_to`), `incident_history` (`changed_by`), `incident_photos` (`uploaded_by`) y `maintenance_visits` (`done_by`, `assigned_to`) usan `ON DELETE SET NULL`. Al borrar un perfil, esos registros se conservan y solo pierden el enlace — permite eliminar técnicos sin perder el historial.

---

### Tabla: `clients`
Empresas clientes de AMD.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | identity |
| `nom_client` | text | unique |
| `ninea` | text | unique, nullable |
| `email` | text | nullable |
| `telephone` | text | nullable |
| `adresse` | text | nullable |
| `ville` | text | nullable |
| `active` | boolean | default: true |
| `princity_company_id` | text | **UNIQUE**, nullable — `prefix` del contrato Princity |
| `princity_prefix` | text | nullable — copia legacy del mismo valor |
| `princity_id` | bigint | unique, nullable — id numérico legacy (CSV antiguo) |

---

### Tabla: `machines`
Una fila por máquina física. El número de serie es la clave de todo el sistema.

| Campo | Tipo | Notas |
|---|---|---|
| `numero_serie` | text PK | identificador único |
| `marque` | text | |
| `modele` | text | |
| `type` | enum | color / noir_blanc |
| `localisation` | text | nullable |
| `active` | boolean | default: true |
| `princity_device_id` | text | **UNIQUE**, nullable — id Princity formato `<prefix>-<index>` (ej. `"63-0"`) |
| `princity_pending` | boolean | default: true — true mientras la máquina no tiene contrato manual creado |

> El QR de cada máquina codifica: `https://amd-service.vercel.app/tech/scan/[numero_serie]`

---

### Tabla: `contracts`
Vincula cliente ↔ máquina. El número de contrato es la llave del portal cliente.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `numero_contrat` | text | unique |
| `client_id` | bigint | FK → clients |
| `machine_id` | text | FK → machines.numero_serie |
| `date_debut` | date | |
| `date_renouvellement` | date | nullable |
| `lieu_installation` | text | nullable |
| `statut` | enum | actif / suspendu / terminé |
| `created_at` | timestamptz | |

---

### Tabla: `client_profiles`
Vincula usuario del portal con empresa cliente.

| Campo | Tipo | Notas |
|---|---|---|
| `profile_id` | UUID PK | FK → profiles |
| `client_id` | bigint PK | FK → clients |
| `verified_at` | timestamptz | |

---

### Tabla: `incidents`
Núcleo del sistema SAV.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `numero_incident` | text UNIQUE NOT NULL | Identificador humano `SAV-YYYY-NNNN`, asignado por trigger BEFORE INSERT |
| `contract_id` | UUID | FK → contracts, **nullable** (null en incidentes públicos sin contrato activo) |
| `machine_id` | text | FK → machines.numero_serie |
| `opened_by` | UUID | FK → profiles, nullable (null en incidentes públicos) |
| `assigned_to` | UUID | FK → profiles (técnico), nullable |
| `title` | text | |
| `description` | text | nullable |
| `category` | enum | panne / maintenance / consommable / autre |
| `priority` | enum | basse / normale / haute / urgente |
| `status` | enum | nouveau / assigné / en_cours / résolu / fermé |
| `rapport_intervention` | text | informe del técnico, nullable |
| `autres_pieces` | text | piezas libres, nullable |
| `contact_name` | text | nullable — nombre del reporter (incidentes públicos vía QR) |
| `contact_phone` | text | nullable — teléfono del reporter |
| `contact_email` | text | nullable — email del reporter (opcional en el formulario) |
| `source` | text | nullable — `'public'` para incidentes del formulario QR; null para el resto |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | trigger automático |
| `resolved_at` | timestamptz | nullable |
| `closed_at` | timestamptz | nullable |

> **`numero_incident` (SAV-YYYY-NNNN):** contador secuencial por año, reseteado el 1 de enero. Generado por `public.next_incident_number()` (upsert atómico sobre `incident_counters`). Asignado por el trigger `trg_set_incident_numero` BEFORE INSERT. Visible en Kanban, vista lista admin, detalle admin, PWA técnico (lista + detalle) y portal cliente (lista + detalle).

> **Incidentes públicos (`source='public'`):** creados por `submitPublicIncident` sin autenticación, con `opened_by=null` y `contract_id` nullable. El detalle admin muestra una sección "Contact" con badge "Public". El portal cliente los excluye con `.or('source.is.null,source.neq.public')`. La página tech/incidents/[id] usa query condicional para no crashear con `contract_id=null`.

---

### Tabla: `incident_counters`
Contador secuencial por año para `numero_incident`.

| Campo | Tipo | Notas |
|---|---|---|
| `year` | int PK | año natural (ej. 2026) |
| `last_number` | int NOT NULL | último número emitido para ese año |

RLS activado, sin políticas. Solo accesible vía `service_role` o vía la función SECURITY DEFINER `next_incident_number()`.

**Función `next_incident_number()`** SECURITY DEFINER, REVOKE a anon/authenticated. Upsert atómico sobre `incident_counters` → devuelve `SAV-{year}-{lpad 4}`.

**Función `set_incident_numero()`** SECURITY DEFINER. Trigger handler que rellena `NEW.numero_incident` si llega NULL.

**Trigger `trg_set_incident_numero`**: BEFORE INSERT ON `incidents` → ejecuta `set_incident_numero()`.

---

### Tabla: `incident_history`
Audit trail de cambios de estado.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID | FK → incidents |
| `changed_by` | UUID | FK → profiles, nullable |
| `old_status` | text | nullable |
| `new_status` | text | nullable |
| `comment` | text | nullable |
| `created_at` | timestamptz | |

---

### Tabla: `parts`
Catálogo de piezas disponibles para intervenciones.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | smallint PK | identity |
| `name` | text | unique |

---

### Tabla: `incident_parts`
Piezas reemplazadas por intervención (tabla puente).

| Campo | Tipo | Notas |
|---|---|---|
| `incident_id` | UUID PK | FK → incidents |
| `part_id` | smallint PK | FK → parts |

---

### Tabla: `incident_photos`
Fotos adjuntas a una intervención.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID | FK → incidents |
| `uploaded_by` | UUID | FK → profiles, nullable |
| `storage_path` | text | ruta en Supabase Storage |
| `created_at` | timestamptz | |

---

### Tabla: `csat_responses`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID | FK → incidents, unique |
| `token` | text | unique, generado automáticamente |
| `rating` | smallint | 1 a 5, nullable hasta que se responda |
| `comment` | text | nullable |
| `responded_at` | timestamptz | nullable — se rellena al responder |
| `created_at` | timestamptz | default: now() |
| `expires_at` | timestamptz | default: now() + 7 days |

---

### Tabla: `princity_alerts`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `received_at` | timestamptz | `Alert.activationDate` de Princity |
| `client_raw` | text | `Alert.companyId` de la API (antes era nombre del email) |
| `client_id` | bigint | FK → clients, nullable |
| `machine_id` | text | FK → machines.numero_serie, nullable |
| `site` | text | nullable (no usado en API; legacy IMAP) |
| `severity` | text | nullable — `Alert.severityLevel` |
| `competence_level` | text | nullable (legacy IMAP) |
| `ip_address` | text | nullable (legacy IMAP) |
| `mac_address` | text | nullable (legacy IMAP) |
| `modele` | text | nullable (legacy IMAP) |
| `description` | text | nullable — `Alert.description` |
| `alert_type` | enum | panne / toner_bas / autre |
| `incident_id` | UUID | FK → incidents, nullable |
| `processed` | boolean | default: false |
| `processed_at` | timestamptz | nullable |
| `princity_alert_code` | int | nullable — `Alert.code` (idempotencia) |
| `princity_device_id_raw` | text | nullable — `Alert.deviceId` raw (idempotencia) |

> **Idempotencia:** unique index sobre `(princity_alert_code, princity_device_id_raw, received_at)` para que reintentos no dupliquen alertas.

---

### Tabla: `princity_api_logs`
Log de cada ejecución de las 4 Edge Functions Princity.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `function_name` | text | `princity-alerts` / `princity-sync` / `princity-counters` / `princity-watchdog` |
| `endpoint_called` | text | nullable — endpoint(s) Princity invocado(s) |
| `status` | enum | success / partial / error |
| `records_processed` | int | |
| `records_created` | int | |
| `error_message` | text | nullable |
| `executed_at` | timestamptz | default: now() |

RLS: solo lectura para admins. La página `/admin/princity` muestra los 20 últimos registros.

---

### Tabla: `princity_health`
Estado de salud de cada función Princity. 3 filas predefinidas (alerts, sync, counters) que el watchdog vigila.

| Campo | Tipo | Notas |
|---|---|---|
| `function_name` | text PK | una fila por función monitorizada |
| `last_success_at` | timestamptz | nullable — última ejecución OK |
| `last_error_at` | timestamptz | nullable — último error |
| `last_error_message` | text | nullable |
| `alert_sent` | boolean | default: false — true si el watchdog ya alertó (evita duplicados) |

**Umbrales del watchdog:**
- `princity-alerts` → 2 horas
- `princity-sync` → 2 días
- `princity-counters` → 35 días

Si `last_success_at` supera el umbral y `alert_sent = false`, envía email a `info@amd-service.com` y pone `alert_sent = true`. Cuando la función vuelve a tener éxito, `alert_sent` se resetea.

---

### Función SQL: `wipe_data_tables()`
**SECURITY DEFINER**, ejecutable solo por `service_role` (revoke a anon/authenticated tras advisor de seguridad).

Usa `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` (no `DELETE` — PostgREST bloquea DELETE sin WHERE vía RPC). Limpia en orden FK: `maintenance_parts → maintenance_visits → maintenance_plans → incident_parts → incident_photos → incident_history → csat_responses → incidents → machine_counters → princity_alerts → client_profiles → contracts → machines → clients`.

Invocada **solo** desde `princity-sync` en `mode: 'initial'` (botón rojo manual en `/admin/princity` con confirmación JavaScript).

---

### Tabla: `machine_counters`
**Núcleo de negocio.** Registros inmutables de contadores mensuales por máquina.

> **Principio de integridad:** un relevé no se modifica ni se borra. Se anula con motivo obligatorio y se crea uno nuevo. Esto garantiza trazabilidad absoluta para la facturación por coste de copia.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `machine_id` | text | FK → machines.numero_serie |
| `contract_id` | UUID | FK → contracts — capturado en el momento del relevé |
| `client_id` | bigint | FK → clients — capturado en el momento del relevé |
| `year` | int | CHECK 2020–2100 |
| `month` | int | CHECK 1–12 |
| `day` | int | CHECK 1–31, nullable — día del mes en que se tomó el relevé |
| `counter_bw` | int | contador total N&B en ese momento (≥ 0) |
| `counter_color` | int | contador total Color en ese momento (≥ 0) |
| `status` | text | actif / annule |
| `annule_by` | UUID | FK → profiles — quién anuló |
| `annule_at` | timestamptz | cuándo se anuló |
| `annulation_reason` | text | motivo obligatorio al anular |
| `is_replacement_start` | boolean | true si es el primer relevé de una máquina sustituta |
| `previous_machine_id` | text | FK → machines — máquina que reemplaza |
| `notes` | text | observaciones libres |
| `recorded_by` | UUID | FK → profiles — quién introdujo el relevé |
| `recorded_at` | timestamptz | default: now() |

**Delta mensual** = `counter_bw` (mes actual) − `counter_bw` (mes anterior activo)
Calculado en tiempo de consulta en JavaScript. No se almacena en BD.

**Sustitución de máquina:** cuando `is_replacement_start = true`, el delta del primer mes no se calcula. El historial de la máquina anterior se conserva vinculado por `previous_machine_id`.

---

### Tabla: `maintenance_plans`
Un plan por contrato. Define la frecuencia y notas del mantenimiento.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `contract_id` | UUID | FK → contracts, UNIQUE |
| `frequency` | enum | mensuel / trimestriel |
| `notes` | text | puntos a verificar en cada visita, nullable |
| `active` | boolean | default: true |
| `created_at` | timestamptz | default: now() |

---

### Tabla: `maintenance_visits`
Una fila por visita programada o realizada.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `plan_id` | UUID | FK → maintenance_plans |
| `scheduled_date` | date | fecha planificada de la visita |
| `done_at` | timestamptz | fecha/hora real de cierre, nullable |
| `done_by` | UUID | FK → profiles (técnico que la realizó), nullable |
| `assigned_to` | UUID | FK → profiles (técnico planificado), nullable — asignable desde el Dashboard Atelier |
| `status` | text | planifié / en_retard / fait |
| `qr_verified` | boolean | true si se cerró vía escaneo QR |
| `notes` | text | notas del técnico al cerrar, nullable |
| `matrix_notified` | boolean | legacy — ya no se usa (Matrix retirado del proyecto) |
| `created_at` | timestamptz | default: now() |

---

### Tabla: `maintenance_parts`
Piezas reemplazadas en una visita de mantenimiento.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `visit_id` | UUID | FK → maintenance_visits |
| `part_id` | smallint | FK → parts, nullable (null si es pieza libre) |
| `description` | text | descripción libre para piezas no catalogadas, nullable |
| `quantity` | smallint | default: 1 |

---

## Búsqueda y Filtros del Back-Office (sesión 14, 2026-05-19)

Patrón compartido aplicado a 6 páginas admin para búsqueda + filtros vía `searchParams` en URL, con defensa contra SQL/PostgREST injection.

**Helper compartido `src/lib/search.ts`:**
- `sanitizeSearchQuery(input)` — strip de control chars + `"` + `\` + `;`, colapso de espacios, longitud 2–80
- `escapeIlike(input)` — escape de wildcards `%` y `_`
- `buildIlikePattern(query)` — `%escapado%`
- `buildSafeOr(columns, query)` — envuelve el patrón en `"…"` para que comas/paréntesis del usuario no rompan el DSL de `.or()`
- `parseBooleanParam`, `parsePositiveIntParam`, `firstParam` — validación de filtros tipados
- Enum whitelisting reutilizando `parseEnum` de `src/lib/enums.ts`

**Componentes:**
- `src/components/admin/SearchFilters.tsx` — input search (debounce 300 ms, `maxLength=80`) + selects de filtro, sincroniza con URL vía `router.replace` + `startTransition`
- `src/components/admin/ViewToggle.tsx` — toggle Kanban ↔ Liste (`?view=list|kanban`, default kanban)
- `src/components/admin/IncidentsListView.tsx` — vista lista alternativa al Kanban en `/admin/incidents`

**Páginas con búsqueda + filtros:**

| Página | Search columns | Filtros | Cross-table |
|---|---|---|---|
| `/admin/clients` | `nom_client`, `ninea`, `ville` | `active` | — |
| `/admin/machines` | `numero_serie`, `marque`, `modele` | `type`, `active` | — |
| `/admin/contracts` | `numero_contrat` + nom_client | `statut` | Pre-lookup `clients.id` → `client_id.in.(...)` |
| `/admin/incidents` | `numero_incident`, `title`, `machine_id` | `client`, `status`, `priority` + toggle vista | Pre-lookup `contracts.id` por client_id → `contract_id.in.(...)` |
| `/admin/maintenance` | nom_client + `numero_contrat` | `frequency`, status visita (JS) | Pre-lookup clients + contracts |
| `/admin/contadores` | nom_client (JS) | `month`, `year` | Filtro JS sobre datos cargados |

**Defensas activas en todas las páginas:**
- Patrón ILIKE escapado y envuelto en `"…"` (PostgREST-safe)
- Whitelist de columnas (constantes hardcoded, nunca input del usuario)
- Enum/booleano/int validados antes del `.eq()`
- `.limit()` siempre presente (200–300)
- RLS aplicada (uso `createClient()`, no `createAdminClient()`)
- Cuando un cross-table lookup devuelve 0 IDs, se fuerza el filtro a un UUID imposible para no fugar resultados
- React escapa por defecto, sin `dangerouslySetInnerHTML`

**Nombres clicables:** en todas las tablas de listado, los nombres relevantes (cliente, máquina, contrato, incidente) son enlaces al detalle con estilo negro/gris por defecto y rojo `#BF0D0D` + subrayado al hover.

---

## Sistema de Diseño (Rediseño UI «Híbrido»)

Rediseño visual de la app interna iniciado en sesión 15 — **presentación pura**, sin cambios de lógica, Server Actions ni rutas. Estilo "Híbrido": navegación oscura + contenido claro. Multi-fase; ver specs/planes en `docs/superpowers/`.

**Tokens de diseño** — bloque `@theme` de Tailwind v4 en `src/app/globals.css`:
- Chrome (navegación oscura): `chrome`, `chrome-line`, `chrome-fg`, `chrome-fg-strong`, `chrome-hover`
- Superficies: `page`, `card`, `line`, `line-subtle`
- Texto: `ink`, `ink-soft`, `ink-muted`
- Acento de marca: `accent` (`#BF0D0D`), `accent-dark`, `accent-soft`
- Estados: `success`/`success-soft`, `warning`/`warning-soft`, `info`/`info-soft`, `violet`/`violet-soft`, `neutral-soft`
- Radios/sombras/tipografía: `radius-card`, `shadow-card`, `shadow-raised`, `font-display` (Poppins), `font-sans` (Inter)

**Componentes UI compartidos** — `src/components/ui/` (sin barrel, imports directos):
`Card`, `PanelHeader`, `Badge` (variantes solid/danger/success/warning/info/violet/neutral), `Button` (+ `buttonClasses`), `Avatar`, `KpiCard`.

**Progreso:** ✅ **COMPLETO** — las 3 superficies de la app interna migradas. Solo la web pública (`/`) conserva el estilo antiguo, a propósito.
- Fase 0 (sistema de diseño) ✅
- `/admin` completamente migrado — bloques 1a (chrome) ✅, 1b (Dashboard) ✅, 1c (Listados) ✅, 1d (detalles/formularios) ✅, 1e (secundarias: calendrier, team, princity, contadores/detalle, QR) ✅
- Fase 2 `/portal` + `/login` + `/csat` ✅ (merge `1850c09`)
- Fase 3 `/tech` ✅ (merge `33d7746`)

**Notas de implementación bloque 1e:** `VISIT_COLOR`/`INCIDENT_COLOR` en calendrier son hex values para FullCalendar (librería externa) — no se migran a tokens Tailwind. `fontFamily: 'Helvetica, Arial, sans-serif'` y `@media print` en la etiqueta QR son tipografía de impresión — se mantienen intactos. `ROLE_STYLE` eliminado en team/page → sustituido por `ROLE_VARIANT` + `Badge` component.

**Notas de implementación Fase 3 (`/tech`):** `tech-nav.tsx` y `tech-desktop-sidebar.tsx` usan tokens chrome (navegación oscura); `AgendaPanel.tsx` es superficie de contenido (`bg-card`, no chrome) pese a ser un panel lateral. `PRIORITY_COLOR` en `TechIncidentList.tsx` conserva hex values (incluye naranja `#F97316` sin token equivalente) para la franja lateral de prioridad. `accent-red-600` se mantiene en los `input` radio/checkbox de `intervention-form.tsx` y `MaintenanceVisitForm.tsx`.

---

## Seguridad

- **RLS activado** en todas las tablas
- **Políticas por rol:** admin acceso total, technician acceso a sus incidencias, client acceso a sus contratos/máquinas/incidencias
- **Recursión infinita resuelta** mediante 6 funciones `SECURITY DEFINER`: `auth_tech_incident_ids`, `auth_tech_incident_contract_ids`, `auth_tech_incident_machine_ids`, `auth_tech_assigned_client_ids`, `auth_client_contract_ids`, `auth_client_machine_ids`
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca expuesto al cliente
- **`machine_counters`** accesible únicamente por admins — datos de facturación
- **Rate limiting** con Upstash Redis (sliding window) en endpoints públicos: login (5/15m por IP+email), signup (3/h por IP), verify contrato (10/h por IP+user), CSAT (5/h por IP+token), contact API (3/h por IP), **formulario público QR (2/h · 5/24h por `IP:serie`)**. Helper centralizado en `src/lib/rate-limit.ts`. Fail-open con `console.error` si faltan credenciales en producción

### Auditoría de seguridad — Princity (2026-05-13, sesión 5)

| # | Severidad | Descripción | Fix |
|---|---|---|---|
| P1 | CRÍTICO | `wipe_data_tables()` ejecutable por roles `anon` + `authenticated` (detectado por Supabase Advisor). Cualquiera con la anon key podía borrar todos los datos vía `/rest/v1/rpc/wipe_data_tables`. | REVOKE EXECUTE a anon/authenticated/PUBLIC; GRANT solo a service_role |
| P2 | ALTO | Sin UNIQUE en `clients.princity_company_id` y `machines.princity_device_id` → riesgo de duplicación en futuros syncs | ALTER TABLE ADD CONSTRAINT UNIQUE (migration `princity_integrity_hardening`) |
| P3 | MEDIO | `wipe_data_tables` usaba `DELETE FROM ...` que PostgREST bloquea vía RPC (`DELETE requires WHERE`). Causaba fallos silenciosos. | Cambiar a `TRUNCATE ... CASCADE` (migration `wipe_data_tables_use_truncate`) |
| P4 | CONTROL | Verificación de que `PrincityClient` no expone método POST a `/v1/*` (endpoints destructivos `device/activate`, `markAsDeleted`, etc.) | Grep + audit del shared client; solo `fetchAll` y `getV1`. |

### Auditoría de seguridad (2026-05-12 — Codex)

**✅ Fixes aplicados (sesión 4):**

| # | Severidad | Descripción | Archivo | Fix |
|---|---|---|---|---|
| #5 | CRÍTICO | Next.js 15→16 (SSRF, path traversal, DoS) | `package.json` | Actualización `16.2.4→16.2.6` + `overrides: postcss>=8.5.14` |
| #10 | ALTO | Cabeceras de seguridad incompletas; `camera=()` bloqueaba scanner QR | `next.config.ts` | CSP + HSTS + `camera=(self)` global |
| #1 | CRÍTICO | Portal verify: cualquier usuario vinculable a cualquier contrato conociendo solo el nº | `portal/verify/actions.ts` | Validación email cliente vs. email auth + re-linking bloqueado + error opaco |
| #7 | MEDIO | Patrón de auth check duplicado en 14 Server Actions | `src/lib/auth.ts` (nuevo) | Helpers `requireAdmin()` / `requireTechnician()`. Perfil ausente → `/login`; rol incorrecto → `/dashboard`. −87 líneas netas. PR #1 |
| #9 | MEDIO | Enums sin validar en Server Actions (`category`, `priority`, `status`, `statut`, `type`, `role`, `frequency`) — un form manipulado podía enviar valores arbitrarios | `src/lib/enums.ts` (nuevo) + 11 actions | Constantes centralizadas + helper `parseEnum()` genérico. Cada action valida el valor contra la lista permitida y devuelve error claro si no encaja. PR #2 |
| #8 | MEDIO/BAJO | Rate limiting ausente en login, registro, verify contrato, CSAT, contact API | `src/lib/rate-limit.ts` (nuevo) + 5 endpoints | Upstash Redis sliding window. Identificadores diferenciados por endpoint (IP+email en login, IP+token en CSAT, etc.). Mensajes opacos al cliente para no facilitar enumeración. PR #3 |
| #6 | MEDIO | Schema de BD y políticas RLS no versionadas en repo (vivían solo en Supabase remoto) | `supabase/migrations/` (28 archivos, antes vacío) | Volcado de las 28 migraciones registradas en Supabase a archivos SQL en el repo. Cubre schema completo + 41 políticas RLS + funciones SECURITY DEFINER + crons. Permite recrear la BD entera desde cero. PR #4 |

**⏳ Pendientes (por orden de prioridad):**

| # | Severidad | Descripción | Archivo |
|---|---|---|---|
| #3 | ALTO | Cierre visita mantenimiento: cruzar `machine.numero_serie` vs `serie` URL | `tech/scan/[serie]/maintenance/[visitId]/actions.ts` | ✅ Commit `4040c08` |
| #2 | ALTO | Scan page: role check explícito + `machine.active` validado | `tech/scan/[serie]/page.tsx` | ✅ Commit `efe506e` |
| #4 | MEDIO/ALTO | Incident detail técnico: role check + `assigned_to` guard con `notFound()` opaco | `tech/incidents/[id]/page.tsx` | ✅ Commit `6438b5c` |

**⏳ Pendientes:** ninguno de la auditoría Codex.

### Auditoría de seguridad — Privilege escalation RPCs (2026-05-17, sesión 12)

| # | Severidad | Descripción | Fix |
|---|---|---|---|
| R1 | ALTO | `create_client_with_contract` y `create_machine_with_contract` eran SECURITY DEFINER con `GRANT EXECUTE TO authenticated` sin guard interno. Cualquier usuario logueado (cliente, técnico) podía invocarlas vía `/rest/v1/rpc/` y crear clientes/máquinas/contratos saltándose RLS. | 1) `REVOKE FROM PUBLIC, anon, authenticated` 2) `GRANT TO service_role` 3) Guard whitelist `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION`. Migración `20260517000000_fix_rpc_privilege_escalation.sql`. PR #5 |

---

## Variables de Entorno (Vercel)

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon para el cliente |
| `SUPABASE_SECRET_KEY` | Nueva generación (`sb_secret_*`) — usada por `createAdminClient()` para acceso a BD (bypassa RLS) **y** como Bearer hacia la Edge Function `send-email`. |
| `NEXT_PUBLIC_APP_URL` | `https://amd-service.vercel.app` |
| `UPSTASH_REDIS_REST_URL` | URL REST de la base Upstash Redis para rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de la base Upstash Redis para rate limiting |

> Resend (`RESEND_API_KEY`, `RESEND_FROM`) vive como secret de Supabase Edge Functions, no en Vercel — la app Next.js delega el envío de emails a la Edge Function `send-email`. La `SUPABASE_SERVICE_ROLE_KEY` legacy ha sido eliminada del entorno (PR #8).

## Secrets Supabase Edge Functions

| Secret | Uso |
|---|---|
| `PRINCITY_BASE_URL` | `https://amdservice.its-printer.com/api` |
| `PRINCITY_API_KEY` | Header `App-auth-key` de la API Princity (solo lectura, ver auditoría) |
| `RESEND_API_KEY` | API key Resend para emails del watchdog |

> Los antiguos secrets `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` quedaron obsoletos tras retirar `princity-agent`. Pueden borrarse del dashboard de Supabase.

---

## Patrones de Código Importantes

- `params: Promise<{ id: string }>` → `const { id } = await params` (Next.js 16)
- Server Actions con `useActionState` en Client Components
- `createAdminClient()` → usa `service_role`, bypassa RLS — solo para operaciones que lo requieren
- NO pasar Client Components como `React.ReactNode` props a otros Client Components
- Recharts solo en Client Components (`'use client'`)
- `formData.get('campo')` devuelve `null` si vacío → usar `?? ''` antes de `.trim()`
- Auth check en Server Actions: `await requireAdmin()` o `await requireTechnician()` desde `@/lib/auth` — devuelven `{ user, profile, supabase }`
- Validación de enums en Server Actions: `parseEnum(formData.get('x'), ENUM_CONST)` desde `@/lib/enums` — devuelve el valor tipado o `null`
- Rate limiting en endpoints públicos: `checkRateLimit('login', identifier)` desde `@/lib/rate-limit` antes de cualquier procesamiento. IP del cliente: `getClientIp()` en Server Actions, `getClientIpFromHeaders(req.headers)` en route handlers

---

## Roadmap

### Fase 1 — SAV ✅ COMPLETADO
- [x] Schema de BD (13 tablas + RLS)
- [x] Auth (email/password, redirección por rol, middleware)
- [x] Back-office AMD (clientes, máquinas, contratos, incidents kanban, equipo)
- [x] Portal cliente (registro, verificación contrato, dashboard, incidencias)
- [x] PWA técnico (dashboard, intervenciones, scanner QR, machines)
- [x] Edge Function `send-email` con Resend (5 plantillas) — `verify_jwt: false` + validación interna del Bearer contra `SUPABASE_SECRET_KEYS`
- [x] Sistema CSAT (email + token + página pública)
- [x] ~~Agente Princity (IMAP)~~ — **sustituido en sesión 5 por integración API directa** (ver Fase 2.7)
- [x] QR por máquina (etiqueta imprimible)

### Fase 2 — Contadores ✅ COMPLETADO
- [x] Tabla `machine_counters` (inmutable, con trazabilidad)
- [x] Módulo Compteurs: lista agrupada por cliente con indicador de relevés pendientes
- [x] Vista detalle por cliente (`/admin/contadores/cliente/[clientId]`)
- [x] Detalle por máquina: gráfico + historial + formulario
- [x] Campo `day` en relevé (día exacto del mes, opcional)
- [x] Annulation avec motif obligatoire
- [x] Gestión de sustitución de máquinas

### Fase 2.5 — Dashboard de Dirección ✅ COMPLETADO
- [x] KPIs globales (clientes, máquinas, contratos, incidentes, CSAT, copias)
- [x] Gráfico tendencia CSAT (6 meses)
- [x] Gráfico incidencias por mes (6 meses)
- [x] Tabla performance equipo técnico
- [x] Distribución de estados de incidencias
- [x] Skeleton de carga (`loading.tsx`)

### Fase 2.6 — Mantenimiento Preventivo ✅ COMPLETADO
- [x] Tablas `maintenance_plans`, `maintenance_visits`, `maintenance_parts` con RLS
- [x] Edge Function `maintenance-cron` (pg_cron diario 8h UTC): marca `en_retard`
- [x] Back-office: lista con KPIs, formulario nuevo plan, detalle con historial de visitas
- [x] PWA técnico: card de mantenimiento pendiente en ficha de máquina (QR scan)
- [x] Formulario de cierre vía QR: checklist 12 piezas + campo libre + notas
- [x] Auto-programación de la siguiente visita al cerrar la actual
- [x] `qr_verified = true` como prueba implícita de presencia física
- [x] Flujo de creación desacoplado: cliente → máquina → contrato → plan mantenimiento

### Fase 2.8 — Rediseño PWA Técnico ✅ COMPLETADO (sesión 6, 2026-05-13)
- [x] Home: stats bento 2×2 (En cours, Urgents, Résolus ce mois, Total assignés)
- [x] Widget "Prochaine intervention": incident activo más urgente con join a clients
- [x] FAB Scanner persistente en layout (bottom-16, lg:hidden) — elimina botón inline
- [x] Nav móvil: Scanner → Machines (4 ítems: Accueil, Incidents, Machines, Planning)
- [x] `TechIncidentList` Client Component: chips de filtro + tarjetas con borde de prioridad
- [x] Join `clients!client_id(nom_client)` en queries de home e incidents
- [x] Desktop table actualizada: columna Cliente añadida

### Fase 2.7 — Integración Princity API ✅ COMPLETADO (sesión 5, 2026-05-13)
- [x] Migración a API REST Princity (v1 + v3), retirada del antiguo `princity-agent` IMAP
- [x] `PrincityClient` shared (`fetchAll` POST v3 read-only + `getV1` GET) — sin método de escritura
- [x] 4 Edge Functions: `princity-alerts` (hourly), `princity-sync` (daily), `princity-counters` (daily), `princity-watchdog` (2h)
- [x] Tablas nuevas: `princity_api_logs`, `princity_health`
- [x] Columnas Princity en `clients` (princity_company_id UNIQUE) y `machines` (princity_device_id UNIQUE, princity_pending)
- [x] Función `wipe_data_tables()` con TRUNCATE (resuelto bug PostgREST con DELETE sin WHERE)
- [x] Página de control `/admin/princity` (Server Component + health cards + log table + initial import button)
- [x] Importación inicial validada: 65 clientes + 90 máquinas
- [x] pg_cron jobs vía pg_net invocando las 4 funciones
- [x] Hardening: REVOKE EXECUTE de `wipe_data_tables` a anon/authenticated; UNIQUE en columnas Princity

### Fase 2.9 — Flujo QR Automático de Incidencias ✅ COMPLETADO (sesión 12, 2026-05-17)
- [x] 1er escaneo QR del técnico → `assigné → en_cours` automático (Server Component, `createAdminClient()`, ejecuta después del guard `machine.active`)
- [x] `résolu → fermé` automático tras envío de email CSAT (`src/lib/csat.ts`: guard `.eq('status','résolu')` + comprobación de filas actualizadas antes de insertar en `incident_history`)
- [x] Tarjetas de incidentes `en_cours` en ficha QR: borde ámbar + CTA "Faire l'intervention →"
- [x] Admin puede seguir cerrando manualmente desde kanban (para casos sin portal cliente)

### Fase 2.8 — Búsqueda + filtros admin & numero_incident ✅ COMPLETADO (sesión 14, 2026-05-19)
- [x] Migración `20260519092101_add_numero_incident.sql` — columna `numero_incident` NOT NULL UNIQUE + tabla `incident_counters` + funciones + trigger + backfill
- [x] Helper `src/lib/search.ts` (sanitización ILIKE + escape PostgREST + validaciones tipadas)
- [x] Componente `SearchFilters` reutilizable (debounce + sync URL searchParams)
- [x] Componente `ViewToggle` Kanban ↔ Liste para `/admin/incidents`
- [x] Componente `IncidentsListView` con columnas: Nº, Titre, Client, Machine, Statut, Priorité, Technicien, Date
- [x] Búsqueda + filtros aplicados a 6 páginas admin: clients, machines, contracts, incidents, maintenance, contadores
- [x] Nombres clicables en todas las tablas (cliente, máquina, contrato, incidente) → detalle, hover rojo `#BF0D0D`
- [x] `numero_incident` SAV-YYYY-NNNN visible en Kanban admin, lista admin, detalle admin, PWA técnico (lista + detalle), portal cliente (lista + detalle)

### Fase 3 — Sitio Web & SEO (en curso)
- [x] Página `/location` — core del negocio, SEO-optimizada para Dakar
- [x] Separación Services → Location (rental/managed) + Services (técnicos)
- [x] Navegación actualizada: Location antes de Services
- [x] PlanCards rediseñadas (blanco puro, botón rojo, fotos más grandes)
- [x] LocationStats con counter animado (framer-motion)
- [x] Fotos reales AMD renombradas y referenciadas en visuals.ts
- [x] Créditos de fotos eliminados de PhotoFrame
- [x] Estudio de keywords para Dakar/Sénégal (AFAM, NexaPrint identificados)
- [ ] Redirect 301 `/services` → `/location` cuando Google indexe
- [ ] Página de precios/tarifs explícita (ventaja vs NexaPrint)
- [ ] Resto de fotos AMD asignadas a páginas (photo01–10)
- [ ] Google OAuth (añadir URL producción en Google Cloud Console)
- [ ] Parser Excel de Princity → inserción automática en contadores
- [ ] Exportación de contadores a PDF/Excel para facturación
- [ ] Agente IA para asignación automática de técnicos

### Fase 4 — Rediseño UI «Híbrido» (en curso, sesiones 15–20)
- [x] Fase 0 — sistema de diseño: tokens `@theme` + 6 componentes UI compartidos (PR #12)
- [x] `/admin` bloque 1a — chrome: layout + sidebar oscura + loading skeleton (PR #13)
- [x] `/admin` bloque 1b — Dashboard: KPIs, paneles y gráficas (PR #14)
- [x] `/admin` bloque 1c — Listados: 6 páginas + SearchFilters/ViewToggle/IncidentsListView + Kanban (PR #15)
- [x] `/admin` bloque 1d — 5 formularios + 2 páginas de detalle (`incidents/[id]`, `maintenance/[id]`) (PR #20, merge `ea216fe`)
- [x] `/admin` bloque 1e — secundarias: `team/page`, `TeamMemberForm`, `calendrier/page`, `princity/page`, `contadores/[serie]/page`, `machines/[serie]/qr/page` (PR #21, merge `b141c21`, sesión 20 — 2026-05-22)
- [ ] Fase 2 — `/portal` + `/login` + `/csat`
- [ ] Fase 3 — `/tech` (PWA técnico)

### Dashboard Atelier ✅ COMPLETADO (sesión 16, 2026-05-21)
- [x] Migración `is_dispatcher` (profiles) + `assigned_to` (maintenance_visits) — PR #16
- [x] Ruta `/atelier` — kiosko de taller: Kanban + mantenimientos lun–vie + KPIs, auto-refresco (PR #16)
- [x] Fix: FKs hacia `profiles` a `ON DELETE SET NULL` — permite borrar técnicos (PR #17)
- [ ] Operativo: crear las cuentas reales de los técnicos AMD en `/admin/team/new`

### Pasarela QR cliente ✅ COMPLETADO (sesión 17, 2026-05-21) — PR #18 (`6c7865b`)
- [x] Nueva ruta `/m/[serie]` — pasarela universal para QR de máquinas:
  - Técnico / admin → `/tech/scan/[serie]` (flujo existente intacto)
  - Cliente → `/portal/incidents/new?machine=[serie]`
  - Sin sesión → `/signaler/[serie]` (actualizado en PR #19)
- [x] QR de etiqueta imprimible actualizado: apunta a `/m/[serie]` en vez de `/tech/scan/[serie]`
- [x] Formulario `/portal/incidents/new` acepta `?machine=`: preselecciona automáticamente la máquina del cliente (banner verde) o avisa si la máquina no pertenece a su contrato (banner naranja)
- ⚠️ Los QR ya impresos en papel apuntan al flujo antiguo (`/tech/scan/`); funcionan para técnicos pero no usan la pasarela. Regenerar etiquetas para activar el flujo cliente.

### Formulario público de incidentes ✅ COMPLETADO (sesión 18, 2026-05-22) — PR #19 (`693c2be`)
- [x] Nueva ruta `/signaler/[serie]` — formulario público sin auth, estilo AMD (shell idéntica al CSAT)
- [x] Sanitización defensiva: strip HTML + control chars en todos los campos; allowlist teléfono; límite 500 chars descripción server-side
- [x] Rate limiting por `IP:serie`: 2 incidentes/hora y 5/día (Upstash Redis, limiters `public_incident_hourly`/`public_incident_daily`)
- [x] Migración `20260522120000_public_incident_form.sql`: `contract_id` nullable + columnas `contact_name/phone/email/source` en `incidents`
- [x] Email de notificación a `savamdservice@gmail.com` al recibir incidente público (template `raw` via Resend, HTML escapado)
- [x] Detalle admin `/admin/incidents/[id]`: sección "Contact" con badge "Public" cuando `contact_name IS NOT NULL`
- [x] **3 fixes de seguridad** detectados en code review (5 agentes Sonnet) antes del merge:
  - `tech/incidents/[id]`: crash PGRST116 con `contract_id=null` → query condicional + `.maybeSingle()`
  - `portal/incidents` (lista + detalle): incidentes públicos excluidos con `.or('source.is.null,source.neq.public')`
  - Rate limit: identificador `${ip}:${serie}` en vez de solo `serie`
