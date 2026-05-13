# AMD Service — Arquitectura del Proyecto SAV

> Documento de referencia técnica. Actualizar cada vez que se haga un cambio estructural.
> Última actualización: 2026-05-13 (sesión 5 — Integración Princity API)

---

## Visión General

Sistema de gestión de incidencias (SAV) para AMD Service, empresa de alquiler y gestión de equipos de impresión profesional en Dakar, Senegal. El sistema incluye un back-office para administradores, una app de campo para técnicos, un portal para clientes, un módulo de contadores de copias y un agente automatizado que procesa alertas del servicio Princity.

**Producción:** `https://amd-service.vercel.app`
**Repositorio:** `https://github.com/juanmy116/amd-service` (privado)
**Versión actual:** `v1.4`

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
- Invitación de equipo por email con redirección automática por rol

### 2. Portal Cliente (`/portal`) ✅
- Login con email/contraseña (Google OAuth pendiente de activar)
- Verificación de cuenta mediante número de contrato
- Dashboard: stats de máquinas e incidencias
- Visualización de máquinas e incidencias en tiempo real
- Apertura de nuevas incidencias

### 3. App de Campo — PWA Técnico (`/tech`) ✅
- Login para técnicos
- Escaneo de QR → ficha de la máquina con incidencias activas + mantenimiento pendiente
- Vista de intervenciones asignadas
- Formulario de intervención: informe + checkboxes de piezas + campo libre + estado
- Formulario de cierre de mantenimiento preventivo: piezas reemplazadas + notas; accesible solo desde el QR de la máquina (`qr_verified = true` garantizado)
- Auto-programación de la siguiente visita de mantenimiento al cerrar la actual
- Notificación Matrix de cierre enviada al room `#maintenance`
- Layout responsive: bottom nav en móvil ↔ sidebar en desktop

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
| `princity-alerts` | cada hora (`0 * * * *`) | `POST /v3/alerts` con `Alert.deactivationDate IS_NULL` | Detecta pannes y toner-bas; crea incidencias para pannes con máquina+contrato conocidos; notifica Matrix `#amd-alerts` |
| `princity-sync` | diario 06:00 UTC (`0 6 * * *`) | `GET /v1/contracts` + `GET /v1/devices?contract=X` (paralelizado en lotes de 10) | Detecta nuevos clientes y equipos; modo `normal` solo INSERT-si-no-existe; modo `initial` ejecuta `wipe_data_tables` + reimport completo |
| `princity-counters` | diario 02:00 UTC (`0 2 * * *`) | `POST /v3/billingCounters` con filtro `BillingCounter.deviceId EQ <id>` | Importa último contador del mes por máquina; aprende el `billing_day` por contrato |
| `princity-watchdog` | cada 2h (`30 */2 * * *`) | — (consulta `princity_health`) | Alerta Matrix + email si alguna función no se ejecuta en su umbral (alerts: 2h, sync: 2d, counters: 35d) |

**Helpers compartidos (`supabase/functions/_shared/`):**
- `princity-client.ts` — clase `PrincityClient` con `fetchAll()` (POST v3 lectura) y `getV1()` (GET v1). **Sin método POST a v1**: imposible escribir en Princity con el código actual.
- `db.ts` — `getAdminClient()`, `updateHealth()`, `writeLog()`
- `notify.ts` — `notifyMatrix(room, msg)`, `notifyAdmin()`, `notifyAlerts()`, `notifyEmail()` (Resend)

**Identificadores Princity en BD:**
- `clients.princity_company_id` (text, UNIQUE) — guarda el `prefix` del contrato Princity (ej. `"63"`)
- `clients.princity_prefix` (text) — copia legacy del mismo valor
- `machines.princity_device_id` (text, UNIQUE) — id Princity en formato `<contractPrefix>-<index>` (ej. `"63-0"`). Compatible con `/v3/billingCounters`.
- `machines.princity_pending` (boolean) — true si la máquina fue importada pero aún no tiene contrato manual creado

**Page admin `/admin/princity`:**
- Server Component que muestra 3 tarjetas de salud (`princity_health`), botón de importación inicial (Client Component con `useActionState` + `confirm()`) y tabla de los 20 últimos logs (`princity_api_logs`).
- Sidebar: entrada "Princity API" con icono `Plug`.

**Bug crítico resuelto en `wipe_data_tables`:** PostgREST bloquea `DELETE` sin `WHERE` clause cuando se llama vía `db.rpc()` desde Edge Functions. La función original usaba `DELETE FROM tabla` y fallaba silenciosamente. Migración `wipe_data_tables_use_truncate` (2026-05-13): se cambió a `TRUNCATE TABLE ... RESTART IDENTITY CASCADE`. Además se revocó `EXECUTE` a `anon` y `authenticated` por seguridad (advisor lo detectó como crítico).

### 6. Sistema CSAT ✅
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

### 8. Servidor Matrix ✅
- Synapse autoalojado en VPS Hostinger (`matrix.test-sav.site`)
- Bot `princity-bot` con 3 salas activas:
  - `#amd-alerts:test-sav.site` — alertas SAV (pannes/toner) desde `princity-alerts`
  - `#maintenance:test-sav.site` (`!cRNbjhiPvuwhJESDyd:test-sav.site`) — equipo de técnicos para mantenimiento preventivo
  - `#Admin:test-sav.site` (`MATRIX_ADMIN_ROOM_ID`) — notificaciones de gestión: nuevos clientes/equipos Princity, fin de importación inicial, alertas del watchdog
- Acceso por el equipo AMD vía cliente Element

### 9. Sitio Web Público (`/`) ✅

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
  - Envía alerta Matrix al room `#maintenance` para visitas de los próximos 3 días (una sola vez por visita)
- Cierre de visita vía QR: técnico escanea la máquina → ve mantenimiento pendiente → formulario con checklist de piezas + notas → `qr_verified = true` + notificación Matrix de confirmación
- Piezas reemplazadas guardadas en `maintenance_parts` (catálogo `parts` + campo libre)

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
| Mensajería interna | Matrix/Synapse autoalojado + cliente Element |
| Integración Princity | 4 Edge Functions (`princity-alerts` cada hora, `princity-sync` diario, `princity-counters` diario, `princity-watchdog` cada 2h) sobre API REST Princity v1+v3 |
| Mantenimiento preventivo | Edge Function `maintenance-cron`, cron diario 8h UTC vía pg_cron + pg_net |
| QR por máquina | Librería `qrcode`, generado en back-office, página imprimible |
| Gráficos | Recharts (módulo Compteurs + Dashboard de dirección) |
| Kanban | `@dnd-kit/core` + `@dnd-kit/utilities` |
| Scanner QR | `@zxing/browser` (PWA técnico) |
| Hosting frontend | Vercel (Next.js) |
| Hosting Matrix | VPS Hostinger + Docker + Traefik |

---

## Jerarquía de Datos

```
Cliente
  └── Contrato (nº contrato = llave de verificación del portal)
        ├── Máquina (nº serie = PK de todo el sistema)
        │     ├── Incidencias
        │     │     ├── Piezas reemplazadas (incident_parts → parts)
        │     │     ├── Fotos de intervención (incident_photos)
        │     │     ├── Historial de cambios de estado (incident_history)
        │     │     └── Respuesta CSAT (csat_responses)
        │     └── Contadores mensuales (machine_counters — inmutables)
        └── Plan de mantenimiento (maintenance_plans — 1 por contrato)
              └── Visitas (maintenance_visits — auto-programadas)
                    └── Piezas reemplazadas (maintenance_parts → parts)
```

> **Flujo de creación desacoplado (sin dependencia circular):**
> 1. Crear cliente (`/admin/clients/new`) — solo datos del cliente
> 2. Crear máquina (`/admin/machines/new`) — solo datos de la máquina
> 3. Crear contrato (`/admin/contracts/new`) — une cliente + máquina (solo muestra máquinas sin contrato activo)
> 4. Crear plan de mantenimiento (`/admin/maintenance/new`) — enlazado al contrato

---

## Flujo de una Incidencia

### Creada por Princity (automática)
```
pg_cron `princity-alerts-hourly` (cada hora)
  → Edge Function princity-alerts → POST /v3/alerts (filtro Alert.deactivationDate IS_NULL)
  → Para cada alerta: lookup machine por princity_device_id, lookup contrato activo
  → Insert en princity_alerts con idempotencia (code + device_id_raw + received_at)
  → Si alert_type = 'panne' y machine+contract conocidos → incidents (status: nouveau)
  → Notificación Matrix al equipo SAV (#amd-alerts) — 🔴 panne / 🟡 toner_bas
  → Admin asigna técnico → incidents (status: assigné)
  → Técnico en campo escanea QR → /tech/scan/[serie] → ve incidencias activas
  → Técnico actualiza estado → en_cours
  → Técnico completa formulario + piezas → résolu
  → Admin cierra → fermé
  → Resend envía CSAT al cliente
```

### Creada por el cliente (portal)
```
Cliente logueado → selecciona máquina → abre incidencia
  → incidents (status: nouveau)
  → (mismo flujo desde asignación)
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
  → Visitas con scheduled_date en los próximos 3 días y matrix_notified=false:
      → Envía mensaje Matrix al room #maintenance
      → "🔧 MAINTENANCE PLANIFIÉE — [fecha] / Cliente / Máquina / Contrato / Frec. / Notas / Qui prend en charge ?"
      → matrix_notified = true

Técnico recibe notificación Element → va a la instalación
  → Escanea QR de la máquina → /tech/scan/[serie]
  → Ve card "Maintenance planifiée" (azul) o "Maintenance en retard" (roja)
  → Pulsa la card → /tech/scan/[serie]/maintenance/[visitId]
  → Rellena checklist 12 piezas + campo libre + notas
  → Pulsa "Clôturer la maintenance"
    → visit: status='fait', done_at=now(), done_by=user.id, qr_verified=true
    → Inserta filas en maintenance_parts para cada pieza marcada
    → Crea siguiente maintenance_visit (scheduled_date = scheduled_date actual + 30/90 días)
    → Envía Matrix: "✅ MAINTENANCE EFFECTUÉE / Cliente / Máquina / Técnico / Próxima visita: [fecha]"
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
- `description` contiene "toner" o "niveau bas" → `toner_bas` (solo notifica Matrix)
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
| `created_at` | timestamptz | default: now() |

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
| `contract_id` | UUID | FK → contracts |
| `machine_id` | text | FK → machines.numero_serie |
| `opened_by` | UUID | FK → profiles, nullable |
| `assigned_to` | UUID | FK → profiles (técnico), nullable |
| `title` | text | |
| `description` | text | nullable |
| `category` | enum | panne / maintenance / consommable / autre |
| `priority` | enum | basse / normale / haute / urgente |
| `status` | enum | nouveau / assigné / en_cours / résolu / fermé |
| `rapport_intervention` | text | informe del técnico, nullable |
| `autres_pieces` | text | piezas libres, nullable |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | trigger automático |
| `resolved_at` | timestamptz | nullable |
| `closed_at` | timestamptz | nullable |

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

Si `last_success_at` supera el umbral y `alert_sent = false`, envía Matrix + email a `info@amd-service.com` y pone `alert_sent = true`. Cuando la función vuelve a tener éxito, `alert_sent` se resetea.

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
| `done_by` | UUID | FK → profiles (técnico), nullable |
| `status` | text | planifié / en_retard / fait |
| `qr_verified` | boolean | true si se cerró vía escaneo QR |
| `notes` | text | notas del técnico al cerrar, nullable |
| `matrix_notified` | boolean | true si ya se envió alerta previa Matrix |
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

## Seguridad

- **RLS activado** en todas las tablas
- **Políticas por rol:** admin acceso total, technician acceso a sus incidencias, client acceso a sus contratos/máquinas/incidencias
- **Recursión infinita resuelta** mediante 6 funciones `SECURITY DEFINER`: `auth_tech_incident_ids`, `auth_tech_incident_contract_ids`, `auth_tech_incident_machine_ids`, `auth_tech_assigned_client_ids`, `auth_client_contract_ids`, `auth_client_machine_ids`
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca expuesto al cliente
- **`machine_counters`** accesible únicamente por admins — datos de facturación

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

**⏳ Pendientes (por orden de prioridad):**

| # | Severidad | Descripción | Archivo |
|---|---|---|---|
| #3 | ALTO | Cierre visita mantenimiento: cruzar `machine.numero_serie` vs `serie` URL | `tech/scan/[serie]/maintenance/[visitId]/actions.ts` | ✅ Commit `4040c08` |
| #2 | ALTO | Scan page: role check explícito + `machine.active` validado | `tech/scan/[serie]/page.tsx` | ✅ Commit `efe506e` |
| #4 | MEDIO/ALTO | Incident detail técnico: role check + `assigned_to` guard con `notFound()` opaco | `tech/incidents/[id]/page.tsx` | ✅ Commit `6438b5c` |

**⏳ Pendientes (próxima sesión):**

| # | Severidad | Descripción | Archivo |
|---|---|---|---|
| #7 | MEDIO | Helpers `requireAdmin()` / `requireTechnician()` — consolidar patrón repetido | `src/lib/auth.ts` (nuevo) |
| #9 | MEDIO | Enum sin validación en Server Actions (category, priority, status, statut) | múltiples |
| #8 | MEDIO/BAJO | Rate limiting ausente en login, registro, verify contrato, CSAT, contact API | múltiples |
| #6 | MEDIO | Políticas RLS no versionadas en repo | solo en Supabase remoto |

---

## Variables de Entorno (Vercel)

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon para el cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role para Server Actions |
| `RESEND_API_KEY` | API key de Resend |
| `RESEND_FROM` | `AMD Service <noreply@amd-service.com>` |
| `NEXT_PUBLIC_APP_URL` | `https://amd-service.vercel.app` |
| `MATRIX_HOMESERVER_URL` | `https://matrix.test-sav.site` |
| `MATRIX_ACCESS_TOKEN` | Token del bot Matrix (`princity-bot`) |
| `MATRIX_MAINTENANCE_ROOM_ID` | ID del room `#maintenance` en Matrix |

## Secrets Supabase Edge Functions

| Secret | Uso |
|---|---|
| `PRINCITY_BASE_URL` | `https://amdservice.its-printer.com/api` |
| `PRINCITY_API_KEY` | Header `App-auth-key` de la API Princity (solo lectura, ver auditoría) |
| `RESEND_API_KEY` | API key Resend para emails del watchdog |
| `MATRIX_HOMESERVER_URL` | `https://matrix.test-sav.site` |
| `MATRIX_ACCESS_TOKEN` | Token del bot `princity-bot` |
| `MATRIX_ROOM_ID` | `!PHCHbjijoJZsTYfRoK:test-sav.site` (sala SAV/alertas) |
| `MATRIX_MAINTENANCE_ROOM_ID` | `!cRNbjhiPvuwhJESDyd:test-sav.site` (sala mantenimiento) |
| `MATRIX_ADMIN_ROOM_ID` | sala `#Admin` para notificaciones de gestión (nuevos clientes/equipos, watchdog) |

> Los antiguos secrets `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` quedaron obsoletos tras retirar `princity-agent`. Pueden borrarse del dashboard de Supabase.

---

## Patrones de Código Importantes

- `params: Promise<{ id: string }>` → `const { id } = await params` (Next.js 16)
- Server Actions con `useActionState` en Client Components
- `createAdminClient()` → usa `service_role`, bypassa RLS — solo para operaciones que lo requieren
- NO pasar Client Components como `React.ReactNode` props a otros Client Components
- Recharts solo en Client Components (`'use client'`)
- `formData.get('campo')` devuelve `null` si vacío → usar `?? ''` antes de `.trim()`
- Auth check en todos los Server Actions de admin: `getUser()` + role check en `profiles`

---

## Roadmap

### Fase 1 — SAV ✅ COMPLETADO
- [x] Schema de BD (13 tablas + RLS)
- [x] Auth (email/password, redirección por rol, middleware)
- [x] Back-office AMD (clientes, máquinas, contratos, incidents kanban, equipo)
- [x] Portal cliente (registro, verificación contrato, dashboard, incidencias)
- [x] PWA técnico (dashboard, intervenciones, scanner QR, machines)
- [x] Edge Function `send-email` con Resend (5 plantillas)
- [x] Sistema CSAT (email + token + página pública)
- [x] ~~Agente Princity (IMAP → BD → Matrix)~~ — **sustituido en sesión 5 por integración API directa** (ver Fase 2.7)
- [x] Servidor Matrix (Synapse en VPS, bot integrado)
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
- [x] Edge Function `maintenance-cron` (pg_cron diario 8h UTC): marca `en_retard` + alertas Matrix previas
- [x] Back-office: lista con KPIs, formulario nuevo plan, detalle con historial de visitas
- [x] PWA técnico: card de mantenimiento pendiente en ficha de máquina (QR scan)
- [x] Formulario de cierre vía QR: checklist 12 piezas + campo libre + notas
- [x] Auto-programación de la siguiente visita al cerrar la actual
- [x] Notificación Matrix de confirmación de cierre
- [x] `qr_verified = true` como prueba implícita de presencia física
- [x] Room Matrix `#maintenance` separado del room SAV
- [x] Flujo de creación desacoplado: cliente → máquina → contrato → plan mantenimiento

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
- [ ] Cuentas de técnicos: invitar los 4 técnicos al room Matrix `#maintenance`
