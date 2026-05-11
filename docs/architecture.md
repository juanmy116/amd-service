# AMD Service — Arquitectura del Proyecto SAV

> Documento de referencia técnica. Actualizar cada vez que se haga un cambio estructural.
> Última actualización: 2026-05-11 (sesión 2)

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
| **Agente Princity** | Lectura de email + escritura en BD | Automatizado (service_role) |

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

### 5. Agente Princity (`princity-agent` Edge Function) ✅
- Monitoriza la cuenta IMAP `admin@test-sav.site` cada hora vía pg_cron + pg_net
- Parsea emails de alerta de Princity mediante regex
- Extrae: número de serie, cliente, IP, MAC, severidad, descripción
- Para alertas técnicas (`panne`) → crea incidencia automáticamente
- Para alertas de toner bajo → registra en `princity_alerts` sin crear incidencia
- Notifica al equipo en tiempo real vía Matrix (`#amd-alerts:test-sav.site`)

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
- Bot `princity-bot` en sala `#amd-alerts:test-sav.site`
- Recibe notificaciones automáticas del agente Princity en tiempo real
- Sala `#maintenance:test-sav.site` (`!cRNbjhiPvuwhJESDyd:test-sav.site`) para el equipo de técnicos
- Acceso por el equipo AMD vía cliente Element

### 9. Sistema de Mantenimiento Preventivo (`/admin/maintenance`) ✅
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
| Alertas Princity | Edge Function `princity-agent`, cron cada hora vía pg_cron + pg_net |
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
Email Princity → Agente Edge Function (cada hora) → princity_alerts
  → Si alert_type = 'panne' → incidents (status: nouveau)
  → Notificación Matrix al equipo SAV (#amd-alerts)
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

## Estructura del Email de Princity

Ejemplo real de email recibido:
```
Nouvelle alerte - 2AS
Client:             2AS
Site:               FRET EXPORT CARGO 2AS, 11000 MBOUR
Niveau de compétence: Experto
Niveau de sévérité: Error
Périphérique:       28-39 (W542J500806 / 00:26:73:46:57:2b / 192.168.4.40)
Modèle:             Ricoh Aficio MP C5502
Description:        Niveau bas : Toner magenta {10074}
```

Campos extraídos por el agente:
- `W542J500806` → `machines.numero_serie`
- `2AS` → match con `clients.nom_client`
- `192.168.4.40` → `princity_alerts.ip_address`
- `00:26:73:46:57:2b` → `princity_alerts.mac_address`
- `Niveau de compétence` → informativo
- `Niveau de sévérité` → determina `alert_type`
- `Description` → `alert_type` (panne / toner_bas / autre)

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
| `received_at` | timestamptz | |
| `client_raw` | text | nombre del cliente en el email |
| `client_id` | bigint | FK → clients, nullable |
| `machine_id` | text | FK → machines.numero_serie, nullable |
| `site` | text | nullable |
| `severity` | text | nullable |
| `competence_level` | text | nullable |
| `ip_address` | text | nullable |
| `mac_address` | text | nullable |
| `modele` | text | nullable |
| `description` | text | nullable |
| `alert_type` | enum | panne / toner_bas / autre |
| `incident_id` | UUID | FK → incidents, nullable |
| `processed` | boolean | default: false |
| `processed_at` | timestamptz | nullable |

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
- **Auditoría de seguridad (2026-05-10):** revisión white-box completa. Fixes: auth en team/admin actions, open redirect en auth callback, validación API contact, ownership check en portal incidents

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
| `IMAP_HOST` | `imap.hostinger.com` |
| `IMAP_USER` | `admin@test-sav.site` |
| `IMAP_PASSWORD` | Contraseña del buzón Hostinger |
| `MATRIX_HOMESERVER_URL` | `https://matrix.test-sav.site` |
| `MATRIX_ACCESS_TOKEN` | Token del bot `princity-bot` |
| `MATRIX_ROOM_ID` | `!PHCHbjijoJZsTYfRoK:test-sav.site` (sala SAV/alertas) |
| `MATRIX_MAINTENANCE_ROOM_ID` | `!cRNbjhiPvuwhJESDyd:test-sav.site` (sala mantenimiento) |

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
- [x] Agente Princity (IMAP → BD → Matrix)
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

### Fase 3 — Pendiente
- [ ] Google OAuth (añadir URL producción en Google Cloud Console)
- [ ] Parser Excel de Princity → inserción automática en contadores
- [ ] Exportación de contadores a PDF/Excel para facturación
- [ ] Agente IA para asignación automática de técnicos
- [ ] Cuentas de técnicos: invitar los 4 técnicos al room Matrix `#maintenance`
