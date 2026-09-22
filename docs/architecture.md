# AMD Service — Arquitectura del Proyecto SAV

> Documento de referencia técnica. Actualizar cada vez que se haga un cambio estructural.
> Última actualización: 2026-09-17 — **la encuesta CSAT por fin llega a alguien** (§7-bis): se envía al email del formulario del QR, el envío queda trazado y las opiniones se leen en `/admin/avis`, en la ficha de la avería y en una franja del tablero. Ese mismo día: **el kiosko del taller queda CERRADO: montado, sonando y verificado en la TV** (§11; PR #139 docs, tras #137 audio/insistencia). Sigue abierto: **el rate limiting no protege hoy** (§Seguridad) y **los 3 crons de Princity no importan nada** (§5). Anterior 2026-09-15: rótulo `SERVICE TECHNIQUE` en la etiqueta QR (PR #134, §6). Histórico 2026-09-11/15: kiosko del taller (§11, §11-bis, §11-ter, PRs #125–#131), permiso `can_bill` (#123) y candado de facturación (#122) — ya documentados en sus secciones.
>
> Anterior: 2026-06-25 — **foto adjunta a la incidencia** (el cliente adjunta una foto opcional al abrir la incidencia desde el portal **o desde el formulario público del QR `/signaler`**; la ven técnico, admin y cliente; bucket `incident-photos`, migración `20260625100000`). Histórico 2026-06-15: **tests RLS de cobertura completa** (88 tests de aislamiento por rol sobre todas las tablas sensibles, PR #93), **migración `middleware` → `proxy`** (convención Next.js 16, PR #94) y `main` protegida en GitHub (required check `typecheck · test · build`). Config de prod cerrada: `COMMERCIAL_EMAIL`, `NEXT_PUBLIC_APP_URL`. Histórico previo (2026-06-11): 3 capas de tests montadas (unit + aislamiento RLS + E2E Playwright, ver §Testing), endurecimiento RLS de `maintenance_visits` + `auth_rls_initplan`, borrado/terminación atómicos de contrato (`delete_contract`/`terminate_contract`), cabos de auditoría cerrados y reconstrucción limpia de la BD arreglada (P0-1). PRs #74–#85.

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
- **Listado de máquinas** (`/admin/machines`): se alimenta de la vista `v_machine_park` (parque derivado) para mostrar el **cliente actual** de cada máquina (línea de contrato abierta, `date_fin IS NULL`) o «—» si está en stock. Filtros: búsqueda (nº serie/marca/modelo), **cliente** (`?client=<id>` → `.eq('client_id', …)`), tipo y estado activo. El nombre del cliente se resuelve en memoria con la lista de `clients` que ya alimenta el desplegable.
- **Formulario de contratos** (`/admin/contracts/new` + `/admin/contracts/[id]`): selector de máquinas buscable en tiempo real (`MachineCombobox` con `@headlessui/react`) — filtra por marca, modelo o serial. Al seleccionar cliente muestra su ID Princity y el sufijo sugerido para el número de contrato (ej. `-007` para ID Princity `7`). Fix: edición de contrato con cliente inactivo siempre incluye ese cliente en la lista para no sobreescribir el `client_id`.
- Gestión y asignación de incidencias (Kanban drag & drop)
- Generación de QR por máquina (etiqueta imprimible con logo, datos y código QR)
- Módulo de contadores de copias agrupado por cliente
- **Opiniones de clientes** (`/admin/avis`): respuestas a las encuestas de satisfacción, con nota, comentario, quién la dejó y enlace a la avería; filtro «★ ≤ 2». Entrada «Avis clients» en el grupo **Service** de la sidebar (ver §7-bis)
- Gestión de usuarios internos (técnicos y admins)
- Gestión de **Leads** (`/admin/leads`): leads recibidos del formulario público de contacto del sitio web, con estado (nouveau / traité / archivé). Entrada "Leads" en el grupo **Pilotage** de la sidebar admin
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

> 🔴 **ESTADO REAL (2026-09-15): las tres funciones se ejecutan cada noche y NO importan nada.** Terminan sin error, se marcan `success` en `princity_health` y el watchdog no salta, pero no crean ni una fila. En `princity_api_logs`: `princity-alerts` **3 019 ejecuciones → 0 incidencias** (con **321 alertas activas** esperando en Princity), `princity-counters` **248 → 0 relevés**, `princity-sync` solo clientes (**0 máquinas**). Dos causas verificadas contra la API real: (1) la respuesta v3 devuelve la **clave corta** (`date`, `deviceId`, `endMono`…) mientras el código lee la larga (`entry['BillingCounter.date']`) → todo `undefined`; (2) `/v1/devices` exige el parámetro **`status`** (`ACTIVE|INACTIVE|DELETED`) y sin él responde `400 "Provided contract doesn't exist"` — mensaje engañoso que el `.catch(() => [])` se traga. **Todo lo que describe esta sección es el diseño previsto, no lo que ocurre hoy.** Pasos de corrección y aviso sobre la avalancha de alertas acumuladas: `docs/pendientes.md`, primera sección.

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

**Impresión en bloque por contrato** (`/admin/contracts/[id]/etiquettes`, Route Handler `GET` admin-only, PR #115): descarga un PDF con la etiqueta QR de **todas las máquinas activas** del contrato (4 por hoja A4, rejilla 2×2), generado con `pdf-lib` en `src/lib/labels-pdf.ts`. Cada etiqueta **replica el diseño de la etiqueta unitaria validada** (PR #66): cabecera roja con logo AMD blanco, solo `Machine` + `N° Série`, QR grande (nivel `H`) y el rótulo **`SERVICE TECHNIQUE`** en rojo, a dos líneas (PR #134; antes era la frase `Un problème ? Scannez pour contacter le SAV AMD` en 8 pt). El cuerpo difiere entre los dos rendus a propósito —20 pt en la etiqueta unitaria, 27 pt en el PDF— porque la celda del PDF (~92 mm) es más ancha que la etiqueta física (68 mm); el QR se redujo a 40 mm / 136 pt para dejar sitio al rótulo. El QR codifica la misma URL `/m/[serie]` (construida con `machineReportUrl` + `appBaseUrl`, helpers compartidos en `src/lib/qr.ts` y `src/lib/app-url.ts`). El logo es el SVG blanco rasterizado con `sharp` (pdf-lib solo embebe PNG/JPG); se incluye en la función serverless vía `outputFileTracingIncludes` (build standalone) y, si no se puede leer/rasterizar, dibuja un respaldo de texto. Botón "Imprimer toutes les étiquettes" en la ficha del contrato (visible si hay líneas abiertas).

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
   - Lookup `machines` (verifica existencia)
   - INSERT en `incidents` con `opened_by=null`, `source='public'`, `machine_id` directo, campos de contacto
   - Email de notificación al equipo SAV (destino en la env var `SAV_NOTIFY_EMAIL`, fallback `savamdservice@gmail.com`; template `raw` via Resend, contenido HTML escapado)
5. Estado de éxito: mensaje de agradecimiento + número de referencia `SAV-YYYY-NNNN`

**Seguridad:** datos del reporter anónimo (`contact_name/phone/email`) son visibles solo en el detalle de admin. El portal del cliente los excluye con filtro `.or('source.is.null,source.neq.public')` en listado y detalle. Las incidencias públicas se vinculan por `machine_id` directo (sin `contract_machine_id`).

### 7. Sistema CSAT ✅

> ✅ **Cadena verificada de punta a punta (2026-09-22):** `SAV-2026-0014` — el técnico resuelve con
> informe → el correo sale un segundo después → la avería se cierra sola → el cliente responde
> ⭐5 y se ve en `/admin/avis`. Y la contraprueba: `SAV-2026-0011`, resuelta desde la oficina,
> **no** generó encuesta (verrou, §Verrou de résolution). De la prueba salió el PR #149: las
> estrellas de la encuesta se encendían de una en una.
- Al resolver un ticket, se envía email al cliente vía Resend
- Email contiene enlace único con token de 7 días
- El cliente valora de 1 a 5 + comentario opcional
- Página pública `/csat/[token]` sin autenticación
- Respuestas almacenadas en `csat_responses`

#### 7-bis. Destinatario, trazabilidad y lectura de las opiniones (2026-09-17)

> **Por qué este bloque existe.** Hasta el 2026-09-17 **no se había enviado ni una sola encuesta**
> en toda la vida de la app (0 filas con `sent_at`, 0 respuestas). No era un bug suelto: el sistema
> se diseñó para un portal de clientes que aún no existe (**0 cuentas de portal de 68 clientes
> activos**), y `sendCsatForIncident` descartaba de entrada toda incidencia sin
> `contract_machine_id` — justo las del **QR público**, que son las únicas que hay. Encima, el
> comentario del cliente se guardaba y **no se mostraba en ninguna pantalla**.

- **Destinatario en cascada.** `resolveCsatRecipient` (`src/lib/csat.ts`, **lógica pura y testeada**)
  elige: `incidents.contact_email` → email de la cuenta de portal del cliente → nadie. El del
  formulario va **primero** a propósito: es quien reportó la avería y quien vivió la intervención.
- **Separación puro/servidor.** `src/lib/csat.ts` (puro, sin `server-only`) y
  **`src/lib/csat.server.ts`** (`sendCsatForIncident`, Supabase admin). Mismo patrón que
  `quartiers.ts` / `quartiers.server.ts`. Sin esa separación la lógica no es testeable: importar el
  módulo de servidor desde vitest revienta con `server-only`.
- **El email es obligatorio en el formulario del QR** (`/signaler/[serie]`), en navegador **y en
  servidor** (`validateContactEmail`, `src/lib/publicIncident.ts`). Riesgo asumido y documentado:
  quien no tenga email a mano no puede avisar de la avería. ⚠️ La columna `incidents.contact_email`
  **sigue siendo nullable en BD** a propósito: hay incidencias anteriores sin email.
- **Nada falla en silencio.** `csat_responses.sent_to` / `sent_at` registran a dónde y cuándo se
  envió. Si no hay destinatario, o si el envío del email falla, se anota en `incident_history` y
  **la incidencia NO se cierra** (se queda en `résolu` para poder reintentar). `sendEmail` no lanza
  cuando el proveedor rechaza el envío — devuelve `{ error }` —, así que hay que mirar su retorno;
  y además puede lanzar si revienta el `fetch`. Un `sent_at` que miente es peor que no tenerlo.
- **Dónde se leen las opiniones:** página **`/admin/avis`** (lista con filtro ★≤2, sobre la vista
  `v_csat_feedback`), bloque **«Avis du client»** en la ficha de la avería, y **franja roja en el
  tablero** de `/admin` con los avisos de 1-2 estrellas de los últimos 7 días. La franja **no tiene
  estado «visto»**: se va sola a los 7 días (misma decisión que en el kiosko, PR #137 — un botón de
  «ya lo he visto» se acaba pulsando sin mirar).
- Componente compartido `src/components/ui/Stars.tsx` (lista y ficha).
- **Los cuatro caminos que llevan una avería a `résolu` disparan la encuesta**: PWA técnico, kanban
  admin, kiosko del taller (delega en el kanban) y **la ficha de admin** (`updateIncidentAction`).
  Esta última **no lo hacía** y se detectó en la revisión: era el mismo fallo del PR escondido en otra
  puerta — sin encuesta, sin rastro, y la avería ahí clavada en `résolu` para siempre (quien la
  cierra es el propio proceso de la encuesta).
- ⚠️ **El envío va dentro de `after()` de `next/server`**, no en un `.catch()` suelto. En serverless
  una promesa lanzada y no esperada muere cuando la función termina, y estas acciones hacen
  `redirect(...)` justo después: resultado, ni email ni rastro. `after()` existe para esto y la
  documentación de Next dice expresamente que **se ejecuta aunque la respuesta acabe en `redirect`**.
- **Caducidad del enlace:** `CSAT_VALIDITY_DAYS = 7` (`src/lib/csat.ts`) es la única fuente — el
  default de la BD, lo que valida `/csat/[token]` y lo que promete el email. Al enviar se **refresca**
  `expires_at`: si no, un reintento semanas después mandaría un token ya muerto y lo apuntaría como
  enviado. Y si la encuesta ya salió y sigue vigente, **no se reenvía** (`isSurveyStillValid`).
- ⚠️ **Las notas internas NO se enseñan al cliente.** `incident_history` se pinta en el portal del
  cliente y en la ficha admin; el portal filtra **en la consulta** (`.not('new_status','is',null)`)
  para que el texto no viaje siquiera al navegador. El discriminador es **`new_status IS NULL`**, no
  «ambos null»: la línea «Incident créé» tiene `old_status` null y **sí** debe verse.
- `/admin/avis` distingue **error de carga** (lanza → `admin/error.tsx`, patrón WP-5b del repo) de
  **lista vacía**, y lee con tope explícito de 300 avis avisando si trunca — el tope mudo de
  PostgREST (1000) haría que la media mintiera en silencio.
- Migraciones: `20260917100000_csat_feedback` (columnas + vista) y **`20260917110000_csat_feedback_grants`**
  (`REVOKE ... FROM PUBLIC, anon` + `GRANT SELECT TO authenticated, service_role`). La primera no los
  llevó y funcionaba solo por los privilegios por defecto de Supabase — que además concedían acceso a
  `anon`; en una base limpia (`db reset`) la pantalla habría fallado con *permission denied*.
- ⚠️ **La Edge Function `send-email` hay que desplegarla aparte** (`supabase functions deploy
  send-email`): no viaja con Vercel.

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

### 8b. Formulario Público de Contacto (`/api/contact` + `/contact`) ✅
Route handler que recibe el formulario de contacto del sitio web público y captura leads comerciales.

- **Persistencia (crítica):** inserta el lead en la tabla `leads` vía `service_role` (campos `name`, `email`, `company`, `phone`, `needs`, `message`; `status` default `nouveau`).
- **Notificación (best-effort):** notifica al equipo comercial por email (template `raw` vía Resend, destino en la env var `COMMERCIAL_EMAIL`). Si el email falla, el lead ya quedó persistido — no se pierde.
- **Rate limiting:** `contact` API (3/h por IP).
- **Gestión:** pantalla admin `/admin/leads` para revisar y cambiar el estado de los leads (nouveau / traité / archivé).

### 10. Sistema de Mantenimiento Preventivo (`/admin/maintenance`) ✅
- Planes de mantenimiento por contrato: frecuencia mensual (30 días) o trimestral (90 días)
- **Granular por máquina (Fase 3):** al crear un plan se genera **una visita por cada línea activa del contrato** (`contract_machines`). Cada `maintenance_visit` pertenece a una máquina concreta vía `contract_machine_id`.
- Admin crea plan → primera tanda de visitas (una por máquina) → sistema auto-genera la siguiente visita **por máquina** al cerrar cada una
- Auto-programación de la siguiente visita usa la frecuencia override de la línea (`maintenance_frequency_override`) o, si no existe, la del plan
- Back-office: lista con KPIs (total, en retard, esta semana), formulario nuevo plan, detalle con historial
- Edge Function `maintenance-cron` con pg_cron diario a las 8h UTC:
  - Marca visitas atrasadas como `en_retard`
- Cierre de visita vía QR: técnico escanea la máquina → ve mantenimiento pendiente → formulario con checklist de piezas + notas → `qr_verified = true`. El cierre **valida que el QR escaneado corresponde a la `contract_machine_id` de la visita**
- Cierre atómico vía RPC `close_maintenance_visit` (SECURITY DEFINER, idempotente): marca la visita como `fait`, inserta piezas y programa la siguiente visita en una sola transacción
- Piezas reemplazadas guardadas en `maintenance_parts` (catálogo `parts` + campo libre)

> **¿Cómo se sabe que un técnico hizo el mantenimiento?** (pregunta del usuario, 2026-09-22).
> Porque **no hay forma de cerrarlo sin estar delante de la máquina**: la única ruta es
> `/tech/scan/<serie>/maintenance/<visitId>` y la RPC compara la serie escaneada con la de la
> visita — si no coinciden, rechaza (`visit_not_found`). Ni un admin puede marcarlo hecho desde el
> escritorio. Al cerrar quedan `done_at` (hora real), `done_by` (quién), `qr_verified = true`, las
> notas y las piezas; se programa sola la siguiente visita y sale un aviso a Matrix. Se consulta en
> `/admin/maintenance` (próxima, última hecha, «En retard») y en la ficha del plan.
>
> 🔴 **Lo que NO funciona es el caso contrario: el aviso de «EN RETARD» no se envía nunca.** El cron
> busca visitas `scheduled_date >= hoy` **y** `matrix_notified = false`; una atrasada falla las dos.
> Un mantenimiento sin hacer no genera ninguna alerta: solo se ve entrando a mirar la pantalla.
> Detalle y propuesta de arreglo en `docs/pendientes.md`.
>
> ⚠️ **Sin válvula de escape:** un mantenimiento hecho sin escanear (etiqueta despegada, móvil sin
> batería) **no se puede registrar de ninguna manera** y esa visita queda `en_retard` para siempre.
> En las averías se decidió lo contrario a propósito (el QR es semáforo, nunca bloqueo — ver
> §Verrou de résolution). Pendiente de decidir si aquí compensa el bloqueo duro.
>
> ✅ **Corregido el 2026-09-22 (PR #151):** la ficha del plan (`/admin/maintenance/[id]`) devolvía
> **404 desde el 21 de mayo**. Los tres enlaces del listado —cliente, contrato y «Détail»— apuntan
> ahí, así que la sección entera parecía rota. La consulta pedía `profiles(full_name)` dentro de
> `maintenance_visits`, que tiene dos claves ajenas a `profiles` (`done_by` y la `assigned_to` que
> añadió el kiosko del taller): PostgREST responde `PGRST201` y la página llamaba a `notFound()`.
> Se rompió **a distancia y en silencio**, sin tocar el fichero.

### 11. Dashboard Atelier (`/atelier`) ✅

> 🔴 **Gotcha de la TV (2026-09-22, PR #147):** el menú desplegable de un `<select>` **lo pinta el
> sistema, no la página**. Las `<option>` heredaban el `text-white` del kiosko y el navegador las
> dibujaba sobre su propio fondo blanco ⇒ la lista de motivos del verrou salía **en blanco sobre
> blanco**. Al añadir cualquier `<select>` al kiosko, fijarle color y fondo propios
> (`[&>option]:bg-white [&>option]:text-[#15151C]`). Y tras desplegar, **recargar el navegador de
> la Pi (F5)**: el kiosko refresca datos, no código.
- Kiosko de taller a pantalla completa para una TV de 32" conectada a una Raspberry Pi 3 — tema oscuro «centro de mando», auto-refresco cada 30 s
- **Dos vistas** (conmutador en la cabecera, `AtelierHeader`):
  - `/atelier` — **vista carte** (2026-09-14): 4 columnas → `PanneList` | **mapa (Dakar / Région)** | `MaintenanceList`
  - `/atelier/kanban` — el kanban de siempre, con drag & drop para cambiar estado. Se conserva íntegro
- Cuenta especial «Atelier»: rol `technician` + flag `profiles.is_dispatcher` → un *dispatcher* puede asignar incidencias y visitas de mantenimiento a los técnicos sin ser admin
- Las Server Actions de despacho validan `admin OR is_dispatcher` y escriben vía `createAdminClient()`; el proxy (`src/proxy.ts`) protege `/atelier` y `/dashboard` redirige ahí a los dispatchers
- **Montaje del kiosko (Raspberry Pi 3 + DietPi):** `docs/kiosque-atelier-raspberry.md` — instalación, arranque automático, opción que permite el aviso sonoro y reinicio nocturno
- ✅ **En servicio y verificado de punta a punta (2026-09-17):** el kiosko del taller pasó la lista del paso 7 del runbook, **incluida la única prueba que vale** — una incidencia de prueba hizo **sonar la campana sola**, sin tocar la pantalla. El audio de la Raspberry se configuró el 2026-09-16 (paso 4-ter). ⚠️ Dos cosas del aparato, no del código: su **IP no está reservada** en el router (la Pi pasó de `192.168.2.106` a `192.168.2.114` cuando esa dirección se la quedó un móvil — ver «Encontrar la Raspberry en la red» en el runbook) y el **silencio nocturno depende de su reloj** (zona `Africa/Dakar`)

#### 11-ter. Vista carte (entrega 2 del rediseño, 2026-09-14) — PR #126

Diseño completo en `docs/superpowers/specs/2026-09-11-atelier-dashboard-carte-design.md`.

- **Consultas:** `src/app/atelier/data.ts` (`getBoardData` para la carte, `getKanbanData` para el kanban). Cubre los **dos caminos** de una incidencia: línea de contrato y `machine_id` directo (formulario público del QR) — sin ese rescate esas incidencias salen sin cliente ni zona.
- **Lógica pura y testeada:** `src/lib/atelier/board.ts` (orden por antigüedad, filtros por estado y zona, conteo por zona, ventana de mantenimientos, antigüedad en francés, detección de averías nuevas), `src/lib/atelier/mapFrame.ts` (`latLngToPercent` en Web Mercator + `bubbleRadius`) y `src/lib/atelier/mapView.ts` (reparto burbujas/chips por vista, `isBubbleActive`, `viewForQuartier`).
- **Mapa — DOS vistas** (conmutador `DAKAR / RÉGION` sobre el mapa), ambas Esri World Imagery tratada (saturación 0,30 · velo azul `rgba(10,20,38,.5)`) y **servidas en local**, 1100 × 1000 px: la Raspberry no necesita Internet ni servicio de mapas.
  - `public/images/atelier/dakar.jpg` → `DAKAR_FRAME`, ~34 × 31 km, el casco urbano de Almadies a Rufisque.
  - `public/images/atelier/region.jpg` → `REGION_FRAME`, ~79 × 71 km, hasta **Diass** (aeropuerto AIBD, máquinas de 2AS), Diamniadio, Thiès y Mbour (2026-09-15).
  - El `extent` REAL devuelto por el servicio está en cada frame; **si se regenera una imagen hay que actualizarlo** (pedir la exportación con `f=json`). Atribución «Imagery: Esri, Maxar» visible, obligatoria.
  - ⚠️ **Las dos imágenes son casi cuadradas a propósito y la caja del mapa lleva su `aspectRatio`** (`width: min(100%, 110cqh)` sobre un contenedor `container-type: size`). Con las fotos apaisadas de la primera versión, `object-cover` recortaba un tercio del ancho del hueco —que en la TV mide entre 1,04 y 1,19— y **las burbujas se desplazaban hasta 200 px respecto al terreno**: sobre una foto de satélite sin rótulos no se nota a simple vista.
- **Burbujas:** una por quartier, tamaño según nº de avisos con tope (Mermoz, Liberté y Point E están a 2 km y se solaparían). Cuentan **solo lo pendiente** (`isPendingMaintenance`), o al pulsarlas las columnas saldrían vacías. En la vista **Région**, todo lo que cabe en la foto de Dakar se agrupa en una sola burbuja «Dakar» (a esa escala los barrios se pisarían).
- **Chips:** «Tout» (quita el filtro), una por ciudad agrupando sus zonas, las zonas de Dakar fuera del encuadre de la foto, y «Sans quartier» para los avisos sin ubicar. Un chip cuya zona se ve en la otra foto **cambia de vista al pulsarlo** (`viewForQuartier`); lo que no está en ninguna (Touba, Kaolack, Saint-Louis, Ziguinchor) solo filtra las listas.
- **Ficha** (`IncidentDetail` / `MaintenanceDetail`): ocupa el sitio del mapa, con las dos listas visibles. Asignar técnico y cambiar estado; el cambio de estado **delega** en `updateIncidentStatusAction` de `/admin/incidents` (historial, `resolved_at` y CSAT en un único sitio). La foto del cliente se muestra entera (`object-contain`) y se amplía en `PhotoLightbox`, **dentro de la app**: abrirla en una pestaña nueva dejaba el kiosko sin salida posible (Chromium va a pantalla completa, sin barra). Se cierra con «Fermer», Escape o clic fuera.
- **Estado compartido** (`AtelierBoard`): filtros **y vista del mapa** sincronizados mapa↔listas; auto-refresco **pausado** mientras hay ficha abierta o filtro activo (`isBusy`), y vuelta sola a la vista general (Dakar, sin filtros) tras 2 min sin tocar nada (`needsReset`). Son dos condiciones distintas a propósito: la vista Région entra en la segunda pero **no** en la primera, porque mirar el mapa no es trabajar sobre una avería y pausar ahí el refresco dejaba la TV muda ante una panne nueva.
- **Aviso de avería nueva** (`NewIncidentAlert`): campana (`public/sounds/nouvelle-panne.mp3`, generada para el proyecto) + cartel 12 s. Detecta comparando identificadores entre refrescos (`findNewIncidents`), sin conexión permanente con la base; en la primera carga NO suena. Los navegadores bloquean el audio sin interacción previa: la Raspberry arranca Chromium con `--autoplay-policy=no-user-gesture-required` (ver runbook), y si falla aparece un botón «Activer le son». **Que el navegador reproduzca no basta**: la salida de audio de la Raspberry y el volumen de la TV son otra cosa (paso 4-ter del runbook). Para probar *esa* parte sin inventarse una avería, la cabecera lleva un botón de altavoz (`SoundTestButton`) que suena la campana a demanda. Ojo con no pedirle más: al nacer de un clic, el navegador siempre le deja sonar, así que **no** diagnostica la falta de `--autoplay-policy` — eso solo lo delata el aviso de una panne real, que intenta sonar sin que nadie haya tocado nada. ✅ **Esa prueba se hizo en la instalación del taller el 2026-09-17 y sonó sola**: la cadena entera —navegador, autoplay, salida de audio y TV— está verificada.
- **Insistencia hasta que alguien se hace cargo** (PR #137, 2026-09-16). El aviso de entrada es
  efímero —cartel 12 s, campana 5 s— y un técnico en intervención se lo pierde entero. Por eso el
  kiosko además **no se calla mientras quede una panne en `nouveau`**: `unattendedIncidents()`
  (`src/lib/atelier/board.ts`) las detecta y `UnattendedBanner` pinta una franja bajo la cabecera
  que **no se va sola ni con un clic** («2 pannes non prises en charge · la plus ancienne il y a
  47 min»), más un **recordatorio sonoro cada 5 min**. **No hay estado «visto» nuevo**: el estado
  de la incidencia ya dice si alguien se hizo cargo, y reconocer = **asignarla** (se puede desde
  el propio kiosko), no pulsar un botón que se aprende a pulsar sin mirar. La franja se calcula
  sobre **todas** las pannes, no sobre las filtradas: un filtro de quartier olvidado en la
  pantalla no puede esconder una avería sin atender. Va **en el flujo, no flotando**: en una TV
  encendida todo el día, un cartel superpuesto acabaría tapando la panne de la que habla.
- **Duración y horario de la campana** (PR #137). `playAlertSound()` (`src/lib/atelier/sound.ts`)
  repite el fichero (~2 s) **en bucle 5 s** y lo apaga con un fundido de 250 ms — cortar a media
  campanada se oye como un fallo. `canRing()` la limita a **7:00–18:59, hora local del aparato**,
  todos los días: una alarma repitiéndose de madrugada en un taller vacío no avisa a nadie. ⚠️
  Depende del **reloj de la Raspberry** (zona `Africa/Dakar`). Dos excepciones deliberadas: de
  noche **la franja roja sigue en pantalla** (se calla el sonido, no el aviso) y el **botón del
  altavoz** de la cabecera suena a cualquier hora, porque al nacer de un clic callarse parecería
  una avería del equipo.
- **Tamaño:** `font-size` del documento al **115 %** solo en el kiosko (`KIOSK_FONT_SCALE` en `src/app/atelier/layout.tsx`), decidido viéndolo en la TV real. ⚠️ **No usar `--force-device-scale-factor` en la Raspberry Pi 3: deja la pantalla en blanco.**

> **Trampas que costaron una ronda de revisión cada una:** (1) pedir todas las incidencias no cerradas con `limit(400)` ordenadas por antigüedad **vacía el tablero** cuando se acumulan résolu sin cerrar → se filtra por estado en la BD; (2) los estados reales de `maintenance_visits` son `planifié`/`fait`/`en_retard`; (3) Tailwind solo genera clases **literales**, `bg-${tone}/20` no llega al CSS; (4) `latLngToPercent` redondea a 4 decimales o React avisa de desajuste al hidratar; (5) la caja del mapa **tiene que** conservar la proporción de la foto o las burbujas se separan del terreno sin que se note; (6) las fotos del bucket privado viajan por `https://<proyecto>.supabase.co` y hay que declararlo en `img-src` de la CSP (`next.config.ts`) — al faltar, el `<img>` salía en blanco mientras abrir la URL a pelo funcionaba.

#### 11-bis. Ubicación por quartier (entrega 1 del rediseño del kiosko, 2026-09-11)

Base de datos de la futura **carte de Dakar** del kiosko (diseño completo en `docs/superpowers/specs/2026-09-11-atelier-dashboard-carte-design.md`).

- Tabla **`quartiers`** (`code` PK, `label`, `ville`, `lat`, `lng`, `sort_order`, `active`): catálogo de zonas **y** fuente de las coordenadas con las que el mapa pinta cada burbuja. 21 filas sembradas por migración: 13 barrios de Dakar (Plateau, Médina, Point E, Mermoz, Liberté, Ouakam, Almadies, Yoff, Parcelles, Hann, Pikine, Keur Massar, Rufisque) + Diamniadio, Thiès, Mbour, Diass, Touba, Kaolack, Saint-Louis y Ziguinchor. Añadir una zona es un `INSERT`, sin desplegar código.
- **RLS:** `quartiers_select_authenticated` (cualquier autenticado lee — el kiosko usa cuenta `technician` + `is_dispatcher`) y `quartiers_admin_all` (solo admin escribe). Cubierto por `tests/rls/quartiers-isolation.test.ts`.
- **`clients.quartier_code`** y **`machines.quartier_code`** (ambas FK a `quartiers.code`, nullable). La de máquina solo se rellena si esa máquina está en **otra sede** que su cliente.
- Regla de resolución, en `src/lib/quartiers.ts`: `resolveQuartierCode(machine, client)` = quartier de la máquina ?? quartier del cliente ?? `null` (→ «Sans quartier», no se pinta en el mapa).
- **Relleno automático** (`20260911150100_quartiers_backfill.sql`): deduce el quartier del texto de `adresse`. Medido contra los 68 clientes activos → **63 clasificados, 5 sin deducir**. Solo toca filas con `quartier_code IS NULL`, así que es reejecutable y no pisa correcciones manuales. ⚠️ El primer `WHEN` es el del aeropuerto **a propósito**: «AEROPORT» hoy es el **AIBD, en Diass** (no el antiguo LSS de Yoff), y sin esa regla delante 2AS y 2AS TECHNCS caerían a 45 km de su sitio.
- **UI:** desplegable `QuartierSelect` (agrupado por ciudad) en la ficha de cliente —justo bajo la dirección— y en la de máquina («si différent du client»); columna `Quartier` y filtro `Sans quartier` en `/admin/clients`. El catálogo se carga con `getQuartiers()` (`src/lib/quartiers.server.ts`).

### 12. Sistema de Facturación (`/admin/billing-plans`, `/admin/facturation`, `/admin/factures`) ✅ — sesión 28-29 (núcleo Tasks 1-11)

Emisor de **facturas inmutables**, a partir del consumo real de contadores. Tres pantallas + un export. Tras el rediseño del core (Bloques A–E + 0/C, 2026-06-09), el flujo activo factura **por contrato y ciclo de aniversario** (regla 9); el detalle por bloque está en §Jerarquía de Datos (Bloques A/B/D/E/C/0). Esta sección resume la capa de aplicación.

> #### ⭐ Rediseño 2026-06-17 — facturación por CADENA y FECHA REAL (SUSTITUYE al «ciclo de aniversario / mes natural»)
>
> El modelo de «ciclo de aniversario» y «mes natural» descrito en esta sección y en los Bloques B/E quedó
> **superado** por el rediseño a **cadena por fecha real + línea** (spec `docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md`, gate `docs/gate-final-facturacion-cadena-2026-06-18.md`). Desbloquea facturar por «periodo a medida» (fechas reales de lectura). Cambios clave del modelo vigente:
>
> - **Lectura anclada a FECHA REAL y a LÍNEA.** `machine_counters` gana `reading_date` (= `make_date(year,month,day)`, `day` NOT NULL) y `contract_machine_id` (la línea/puesto vigente **en la fecha** de la lectura, resuelto por `getLineForMachineAtDate`). Unicidad por `(machine_id, reading_date) WHERE status='actif'` → pueden convivir dos lecturas del mismo mes natural en días distintos (corrige P0-1). Atribución del consumo **por línea**, no por contrato (corrige P0-3).
> - **Cadena mensual (no ciclo de calendario).** Se factura **un mes cada vez, en secuencia**: el mes a facturar = `último_facturado + 1`; la fecha de la lectura **solo ancla el primer mes** (regla dual **N7** en `computeInvoiceMonth`: día 1-28 → mes anterior al vencimiento; día 29-31 → mismo mes, clampeado a fin de mes). El cierre de un tramo = la lectura real NO facturada **más antigua** posterior a la apertura. Núcleo: `computeLineChainConsumption` + orden canónico `compareCountersByReading` (por `reading_date, recorded_at, id`). El estado de la cadena se persiste **por línea** en `invoice_lines` (`opening/closing_counter_id`, `*_reading_date`, `*_counter_bw/color`).
> - **Mes solo-fijo (N8/N10).** Un mes sin lectura de cierre se factura **solo forfait** (`is_estimated`); el punto de partida NO avanza; las copias se acumulan en la siguiente factura con lectura, sin perderse ni duplicarse. La factura estimada nunca se corrige.
> - **Emisión endurecida** (`emit_contract_invoice`, mig. `20260617170000`): la RPC NO confía en el payload — valida pertenencia de línea (V1), de lecturas + vigencia (V2), no-reutilización de cierres incl. breakdown (V3), secuencia de mes (V4) y persiste `contract_id` validado.
> - **Cierres por línea + fecha** (mig. `20260617180000`): `return_machine_to_stock`/`terminate_contract`/`replace_contract_machine` toman la referencia de cierre de la **misma línea** con `reading_date ≤ date_fin` (no «el último contador de la máquina»). Orden de locks alineado contrato→línea (evita deadlock con `delete_contract`).
> - **Guards por línea** (mig. `20260617200000`): `delete_contract` y el guard de cambio de cliente (`update_contract_with_lines`) cuentan el historial por `contract_id` **o** por `contract_machine_id` (cubre lecturas que Princity ata con `contract_id` NULL); `delete_contract` además bloquea si hay `invoices` (registro contable inmutable).
> - **billing_day:** se mantiene 1-31 en todas las capas (CHECK + RPCs + UI); la semántica fin de mes la da N7 (sin cambio de CHECK).
> - **Princity** etiqueta por la fecha real de `BillingCounter.date` (no por `now()`) y resuelve la línea vigente en esa fecha.
> - **Gate E2E** (`tests/rls/gate-facturation-e2e.test.ts`): la cadena completa (siembra → `buildContractInvoiceDraft` → `emit_contract_invoice` → factura inmutable) contra Postgres real; los 14 casos del §9 cubiertos (ver doc del gate).
>
> Lo que NO cambia: inmutabilidad de facturas, RLS admin-only, planes de tarifa y redondeo FCFA, dedup por `(contract_id, period_year, period_month) WHERE status='emise'`. Las menciones a `computeLineConsumptionCycle` / «ciclo de aniversario» / `period_start-period_end` más abajo describen el modelo anterior y se conservan como historial.

- **Catálogo de planes** (`/admin/billing-plans`): CRUD de `billing_plans`. 4 tipos:
  - `per_copy` — solo precio por copia B&N + color.
  - `hybrid` — forfait fijo mensual + precio por copia.
  - `hybrid_tiered` — forfait fijo + precio por copia degresivo por tramos **MARGINALES** (escalonado: cada bloque de copias a su propio precio, como el IRPF). `applyTiers` en `src/lib/billing.ts`.
  - `tiered_total` — forfait fijo + precio por copia degresivo **AL VOLUMEN TOTAL** (el volumen total del mes determina UN único precio por copia, aplicado a TODAS las copias). Es la **tarifa real de AMD** ("fixe + copie dégressive au volume"). `applyTiersTotal` en `src/lib/billing.ts`. Comparte la estructura `tiers` y `validateTiers` con `hybrid_tiered`; solo cambia la aritmética. Consecuencia querida (gancho comercial): como los precios bajan al subir de tramo, cruzar un umbral puede abaratar el total (efecto salto). B&N y color usan cada uno su propia escala dentro de la misma tabla `tiers` (se carga la UNIÓN de los cortes de ambos canales). Plan en prod: «AMD Dégressif (volume)».
  - Los tipos `hybrid_tiered` y `tiered_total` se agrupan en `TIERED_TYPES`; los helpers `usesTiers/usesFixed/usesFlat` centralizan qué campos aplican por tipo.
  - No se borran (solo activar/desactivar). No se puede cambiar el `type` si el plan ya está asignado a alguna máquina (las facturas emitidas no se afectan por ser snapshot, pero el preview futuro sí).
- **Asignación por máquina**: cada línea `contract_machines` referencia un `billing_plan_id` + overrides opcionales (`price_bw_override`, `price_color_override`, `fixed_fee_override`). Se editan en `ContractForm` (selector + campos filtrados por tipo de plan) y se persisten vía las RPC `create/update_contract_with_lines` (que ahora incluyen estos campos).
- **Preview por contrato/ciclo** (`/admin/facturation`): selector de contrato + mes-ancla. `buildContractInvoiceDraft` (en `src/lib/invoicing.ts`) deriva el ciclo de aniversario del `billing_day` del contrato y calcula el consumo de cada línea con `computeLineConsumptionCycle`, cruzándolo con la tarifa **vigente al inicio del ciclo** (`resolveEffectiveTariffAsOf`). La lectura final del ciclo es el `end_counter` de la línea (si se cerró por reemplazo dentro del ciclo) o el relevé activo más reciente dentro del ciclo; la inicial es el `start_counter` (si la línea nació en el ciclo) o el relevé previo más reciente. Máquinas sin punto de lectura → línea `is_estimated` (forfait sí, consumo 0). *(La vía mensual por cliente — `buildClientInvoiceDraft` — fue eliminada en WP-3.)*
- **Aritmética del consumo — fuente única, política por caller (decisión consciente).** La resta `final − inicial` (con guard de null) vive en una sola primitiva `counterDelta(final, initial)` de `src/lib/counters.ts`, usada **tanto** por la facturación (`computeLineConsumptionCycle`) **como** por la pantalla de Contadores (`calcDeltas`). Lo que diverge a propósito es la **selección de puntos** (Contadores empareja relevés consecutivos por máquina; facturación combina relevés normales con `start_counter`/`end_counter` de la línea) y la **política sobre el resultado** (Contadores muestra el delta tal cual, negativos incluidos, como anomalía visible; facturación trata null/negativo como `is_estimated` → solo forfait). **Invariante: para una línea sin reemplazo ambos caminos deben dar el mismo número** — protegido por `src/lib/invoicing.test.ts` (vitest, `npm test`).
- **Emisión** (RPC transaccional SECURITY DEFINER): flujo **único** `emit_contract_invoice` (por contrato/ciclo). La RPC legacy `emit_invoice` por cliente/mes fue **eliminada** (WP-3, `DROP FUNCTION`, migración `20260610102000`) para descartar el riesgo de doble facturación. Numera (`FACT-YYYY-NNNN` vía `next_invoice_number()`/`invoice_counters`), inserta cabecera + líneas en una transacción. Bloquea doble emisión (índices únicos parciales `WHERE status='emise'`). Líneas estimadas → confirmación explícita del admin. **Coherencia contable validada en BD antes de insertar (P1-1)** y **factura inmutable por trigger** (Bloque C): el snapshot de plan/tarifas/deltas no se puede alterar ni borrar, solo anular (`emise → annulee`).
- **Candado de facturación (Capa 1, `20260904120000`, 2026-09-04).** Interruptor global para arrancar el SAV en producción con la **facturación APAGADA** durante la fase de prueba. Tabla singleton `billing_settings` (fila única `id=true`) con `billing_enabled boolean` (**default `false`**). Trigger `BEFORE INSERT` en `invoices` (`trg_guard_billing_enabled`) que lanza `billing_disabled` mientras el flag esté en false — aplica a **todos los roles, incl. `service_role`** (mismo espíritu que la inmutabilidad). Defensa en profundidad en 3 niveles: (1) la UI `/admin/facturation` oculta los botones «Émettre»/«Forcer» y muestra un aviso (la **preview sigue disponible** para verificar montos); (2) la Server Action `emitContractInvoiceAction` corta temprano (`isBillingEnabled()` de `src/lib/billing-lock.ts`, fail-safe = apagado si la lectura falla); (3) el trigger en BD como barrera final. **Para ENCENDER cuando el SAV se valide:** `UPDATE public.billing_settings SET billing_enabled = true, updated_at = now() WHERE id;`. Tests: `tests/rls/billing-lock.test.ts` + `globalSetup` que lo abre para las suites RLS/E2E que emiten. ⏳ **Capa 2 pendiente** (confirmación antes de emitir, `docs/pendientes.md`): implementar **antes** de encender.

- **Permiso de facturación (`profiles.can_bill`, `20260911130000`, 2026-09-11).** Separa **administrar el SAV** de **facturar**. Hasta entonces `/admin` era todo-o-nada: cualquier `role = 'admin'` veía también la facturación. Al incorporar personal de AMD que gestiona el día a día (clientes, máquinas, contadores, contratos, incidencias, mantenimiento) pero **no debe ver la facturación**, se añade el flag `can_bill` (default **false**), mismo patrón que `is_dispatcher`. **Siguen siendo `role = 'admin'`**, así que `is_admin()` y todas las policies existentes se comportan igual — lo único que `can_bill` gobierna es la facturación. Tres capas: (1) el Sidebar oculta el grupo «Facturation»; (2) `requireBilling()` (`src/lib/auth.ts`) sustituye a `requireAdmin()` en las **7 rutas** (`/admin/facturation`, `/admin/factures[/id][/xlsx]`, `/admin/billing-plans[/new][/id]`) y las **6 Server Actions** de facturación — un admin sin permiso que escriba la URL a mano es redirigido a `/admin`; (3) RLS: `invoices` e `invoice_lines` pasan a `can_bill()`. ⚠️ **`billing_plans` es el caso especial:** la página de **Contratos** (que sí usan) necesita leer los planes para asignar la tarifa de cada línea, así que se separó **lectura** (`is_admin()`) de **escritura** (`can_bill()`) — pueden asignar una tarifa existente a un contrato, pero no crear ni editar tarifas. `billing_settings` se dejó como estaba (la app lo lee con `service_role`, que ignora RLS). Los admin que ya existían recibieron `can_bill = true` en la propia migración, así que nadie perdió acceso. Tests: `tests/rls/billing-permission.test.ts`. 🔄 **Cómo deshacerlo** (junto con el candado y los 3 usuarios creados ese día): `docs/rollback-2026-09-11.md`.
- **Vista de facturas** (`/admin/factures` + `/admin/factures/[id]`): lista + detalle de solo lectura. Acciones: descargar hoja `.xlsx`, enviar por email a los admins, anular (con motivo; no se edita, se anula y se reemite).
- **Export `.xlsx`** (`src/lib/invoice-xlsx.ts`, ExcelJS): hoja interna AMD con fórmulas verificables (`D+ROUND(E*F,0)+ROUND(G*H,0)` para planos; literal para los tipos por tramos `hybrid_tiered` y `tiered_total`, cuyo importe vive en los tramos). Route handler `/admin/factures/[id]/xlsx` (`runtime='nodejs'`) para descarga; `emailInvoiceAction` la adjunta vía `send-email` a `BILLING_NOTIFY_EMAILS`. **WP-5 (P2-1):** ambos comprueban el `error` de la query de `invoice_lines` y abortan (envío/descarga) ante fallo técnico o factura sin líneas — nunca se genera un documento con cabecera+total pero sin líneas.
- **Moneda:** FCFA (`XOF`), redondeo a entero por línea. **`clients.id` es BIGINT** → `invoices.client_id` es BIGINT.
- **Reemplazo de máquina a mitad de mes** ("puesto de servicio"): botón "Remplacer la machine" en el contrato → RPC transaccional `replace_contract_machine(p_payload jsonb)` (SECURITY DEFINER, service_role). Cierra la línea saliente (`date_fin` + `end_counter_bw/color`), abre la entrante encadenada vía `replaces_contract_machine_id` (con `start_counter_bw/color`, heredando plan + overrides del puesto). **Los contadores de inicio/cierre del reemplazo viven en columnas de `contract_machines`** (`start_counter_*`/`end_counter_*`), NO como filas de `machine_counters` — para no violar el índice único parcial `machine_counters_one_active_per_month`. La factura **consolida las líneas encadenadas (A→B→C…) en un único puesto**: un solo forfait, tramos sobre el consumo combinado, con `breakdown` por máquina y `has_replacement=true`.

> Estado: **core de facturación reconstruido, desplegado en prod y validado (2026-06-09)**. Núcleo (PR #34/#35/#36) + rediseño completo: Bloques A–E del motor (PRs #40–45), Bloque 0 soporte (#39), Bloque C soporte (#46), **P1-5 vigencia de tarifas (#48)**. Las **11 migraciones desplegadas a la BD viva** (reconciliación previa del historial git↔BD vía `supabase migration repair` + `db push`). **Gate final E2E PASADO (GO)** — ver §Gate final. ⚠️ **Pendiente operativo (no código):** hoy hay **0 contratos reales**; cargar los contratos reales (máquinas desde stock con su lectura, plan, `billing_day`) antes de emitir la primera factura real. Acción manual aparte: definir `BILLING_NOTIFY_EMAILS` en `.env.local` y Vercel (sin ella el botón "Envoyer par email" falla de forma controlada; el resto funciona).

---

## Buzón de Contadores por Email (Fase 1 del agente supervisor de contadores)

Captura automática de contadores enviados por email (fotos/PDF) para los equipos fuera de Princity. Es la **primera de cuatro capacidades** de un "agente supervisor de contadores" (las otras: asistente de preguntas a admins, recordatorios a los 2 trabajadores, vigilante de descuadres). Spec: `docs/superpowers/specs/2026-06-12-buzon-contadores-email-design.md`; plan: `docs/superpowers/plans/2026-06-12-buzon-contadores-email.md`.

**Flujo:** email a la dirección del agente (en pruebas la `…@cloudmailin.net` que asigna CloudMailin; en prod `contadores@amd-service.com` con dominio propio) → **CloudMailin** (proveedor de inbound email, plan free 10.000/mes, formato **JSON normalized**, adjuntos base64 inline) hace POST a `receive-counter-email?secret=…` → ésta valida la firma (header `X-Counter-Webhook-Secret` **o** query `?secret=`, timing-safe) y parsea el JSON de forma tolerante (`envelope`/`headers`/`attachments[].content|content_base64`, `file_name|filename`), sube cada adjunto al bucket privado `counter-images`, crea una fila en `pending_counter_imports` y dispara `parse-counter-image` (vía `EdgeRuntime.waitUntil`) → ésta llama a **Claude Sonnet** (`claude-sonnet-4-6`, tool_use) que extrae serial + contadores, y luego a la RPC `process_counter_extraction` → un **admin revisa en `/admin/contadores/pendientes`** y confirma con un clic → RPC `import_counter_from_pending` inserta en `machine_counters` (rechaza con `no_active_line` si la máquina no tiene contrato activo). Nada se factura sin confirmación humana.

- **Semáforo (en SQL, `process_counter_extraction`):** 🟢 `green` (serial casa con `machines.numero_serie` activo + todas las validaciones pasan) · 🟡 `amber` (casa pero algo chirría: confianza <0.80, sumas cruzadas Ricoh, contador decreciente, salto, **duplicado de mes** —`V_DUP_MONTH`: ya hay lectura confirmada del mes; `V_DUP_PENDING`: otra lectura de la misma máquina y mes **aún en la cola**) · 🔴 `red` (no es hoja de contador, serial ilegible o sin match). Códigos en `validation_errors` (`V_CONF`, `V_CROSS_BW`, `V_NONDECR_BW`, `V_NO_MATCH`, `V_DUP_MONTH`, `V_DUP_PENDING`, …); la UI los traduce a francés (`validation-labels.ts`).
- **Tabla `pending_counter_imports`** (cola + audit log, RLS admin select/update, INSERT solo `service_role`). Estados: `pending_review` → `confirmed`/`rejected`/`failed_extraction`. Idempotencia por `image_hash_sha256` (UNIQUE): el **reenvío del mismo fichero NO crea fila nueva**, sino que incrementa `duplicate_count`/`last_duplicate_at` en la original (RPC `register_counter_duplicate`) — antes se descartaba en silencio; la UI muestra "Photo renvoyée X fois".
- **Bucket `counter-images`** (privado, primer uso de Storage en el repo). Imágenes vía signed URL TTL 1h en la UI.
- **RPCs SECURITY DEFINER (service_role):** `process_counter_extraction(p_pending_id, p_extracted)` (match + validaciones + semáforo) · `import_counter_from_pending(p_pending_id, p_reviewed_by, p_overrides)` (confirma → `machine_counters`; rechaza con `no_active_line` si la máquina no tiene línea de contrato activa) · `register_counter_duplicate(p_hash)` (incrementa el contador de reenvíos de una foto ya recibida). Migraciones `20260612104341_counter_imports.sql` y `20260614170000_counter_duplicate_awareness.sql` (detección de duplicados).
- **Edge Functions:** `receive-counter-email` (webhook, `verify_jwt:false`, firma propia), `parse-counter-image` (OCR 1 imagen = 1 lectura, usada por el **email**) y `parse-counter-document` (OCR de **documento entero**, usada por la **subida manual** desde la app). Aviso de lote vía template `counter_batch_processed` en `send-email`; si un correo trae **solo reenvíos** (0 nuevas), aviso `raw` "Photo déjà reçue".
- **Secrets (Supabase Edge Functions, NUNCA Vercel):** `ANTHROPIC_API_KEY`, `COUNTER_WEBHOOK_SECRET`, `COUNTER_NOTIFY_EMAILS`, `COUNTER_INBOX_ADDRESS`.

#### Subida manual desde la app — «documento entero → IA» (2026-06-19, rediseño)
- **Dos vías de entrada a la MISMA cola:** (1) **email** (CloudMailin → `receive-counter-email` → `parse-counter-image`, **1 foto = 1 lectura**), y (2) **subida manual** desde `/admin/contadores/pendientes` (botón "Ajouter une photo / un PDF").
- **Flujo manual:** `uploadCounterDocumentAction` (Server Action) valida el documento (PDF o imagen, ≤10 MB), lo sube al bucket en `counter-images/manual/{year}/{month}/{docHash}.{ext}` (**dedup a nivel de documento**: si ya hay filas con ese `image_path`, no re-dispara → no re-paga la IA) y dispara `parse-counter-document` → ésta **trocea el PDF con `pdf-lib`** (sin renderizar; trozos de 16 págs con solape de 1), llama a **Claude** por trozo (`READINGS_TOOL` devuelve un **array** de lecturas; reintenta ante 429/5xx; espaciado para no saturar), **deduplica por serial**, e inserta una fila por lectura llamando a la MISMA RPC `process_counter_extraction`. Hash de fila por **índice** (`{docHash}:{i}`) → único. Al terminar, **email-resumen** a `COUNTER_NOTIFY_EMAILS` (avisa si algún trozo falló → análisis incompleto). Trabaja en background (`EdgeRuntime.waitUntil`).
- **Por qué documento entero:** lee formatos que el método foto-a-foto no podía (Ricoh CCITT, **Pantum a 2 páginas**, **HP PageWide** en francés) y evita el límite por minuto de la IA (2-3 llamadas vs ~46). Coste ≈ $0,30/PDF. La UI de revisión muestra para las filas-PDF un enlace al **`#page=N`** del PDF (la página exacta), y `<img>` para las del email.
- **Deuda documentada:** el **email** sigue con el método antiguo (1 foto = 1 lectura) — no fiable a largo plazo (tope 512 KB CloudMailin); a unificar en el futuro con el motor de documento entero. Ver `docs/pendientes.md` §6-bis.

> Estado: **CERRADO — DESPLEGADO Y FUNCIONANDO POR EMAIL REAL (2026-06-12).** B1 (datos/RPCs) + B2/B3 (Edge Functions `parse-counter-image` y `receive-counter-email`, `verify_jwt:false`, auth propia) + B4 (UI `/admin/contadores/pendientes`) + B5 (aviso de lote) operativos. Secrets en Supabase: `ANTHROPIC_API_KEY`, `COUNTER_WEBHOOK_SECRET`, `COUNTER_NOTIFY_EMAILS`. **Cartero = CloudMailin** (inbound, plan free 10.000/mes, formato **JSON normalized**); `receive-counter-email` tolera su formato (`envelope`/`headers`/`attachments[].content`) + secret por `?secret=` query. **Gate E2E real PASADO:** email desde Gmail con foto Ricoh adjunta → CloudMailin → OCR 🟢 green (serial+contadores exactos, 0.98 conf, $0.011).
>
> **Cierre 2026-06-12 (sesión de remate):** (a) **`send-email` redesplegado vía CLI (v16)** con el template `counter_batch_processed` → el **aviso de lote ya funciona** (smoke test: HTTP 200 + email recibido); antes fallaba controlado. (b) **Reenvío `admin@test-sav.site` → CloudMailin activado y validado E2E**: forwarder en Hostinger (sin tocar MX/DNS, buzón admin intacto), para recibir contadores en una dirección AMD normal en vez de la `@cloudmailin.net`. Gotcha: Hostinger confirma el forwarder con un enlace enviado al destino (lo capta el robot, CloudMailin free no guarda el body) → se capturó vía volcado temporal y se activó; andamiaje limpiado sin residuos. Gate real: foto desde Gmail a `admin@test-sav.site` → 🔴 `V_NO_MATCH` correcto (máquina de prueba no existe en `machines`).
>
> ⚠️ **Único pendiente (opcional, para producción real con clientes):** conectar **dominio propio** en CloudMailin + MX de un **subdominio** (ej. `contadores.test-sav.site` o el de prod) en Hostinger, para usar `contadores@amd-service.com` en vez de la dirección `@cloudmailin.net`. *(Un forwarder hacia la dirección del robot vale para test, pero en prod conviene la vía subdominio+MX: el robot se traga los correos de servicio como las confirmaciones.)* Las capacidades 2-4 del agente supervisor (asistente, recordatorios, vigilante) siguen sin empezar.
>
> **Mejora 2026-06-14 — detección de duplicados (PR #91, `9a39e1e`):** antes la idempotencia por hash descartaba **en silencio** el reenvío del mismo fichero (parecía que "no llegaban los correos") y el doble-relevé-del-mes solo se veía contra lecturas confirmadas. Ahora: (1) **nivel 1** — el reenvío del mismo fichero incrementa `duplicate_count`/`last_duplicate_at` (RPC `register_counter_duplicate`) y, si el correo trae solo reenvíos, manda aviso `raw`; la UI muestra "Photo renvoyée X fois". (2) **nivel 2** — nuevo `V_DUP_PENDING`: otra lectura de la misma máquina y mes **aún en la cola** → 🟡. (3) UI traduce los códigos `V_*` a francés (`validation-labels.ts`). Acción de diseño: **marcar 🟡 y dejar decidir al admin** (no bloquear; el bloqueo real al confirmar la 2ª lo cubre el guard existente). Migración `20260614170000`; `receive-counter-email` v7. Gate E2E nivel 1 real pasado.

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
| Facturación / hojas de cálculo | ExcelJS v4.4.0 (`.xlsx` con fórmulas, server-only, `runtime='nodejs'`) |
| Kanban | `@dnd-kit/core` + `@dnd-kit/utilities` |
| Selector buscable | `@headlessui/react` v2.2.10 (Combobox — compatible React 19) |
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
              └── Visitas (maintenance_visits — 1 por máquina, contract_machine_id, auto-programadas)
                    └── Piezas reemplazadas (maintenance_parts → parts)
```

### Modelo N máquinas por contrato (`contract_machines`) — ✅ COMPLETO + cleanup legacy aplicado (2026-06-05)

Un contrato puede tener varias máquinas. La vinculación se gestiona mediante la tabla `contract_machines`:

- **`date_debut` / `date_fin`** — período de la vinculación. `date_fin IS NULL` = línea abierta (máquina actualmente asignada).
- **`statut`** — `actif | suspendu | terminé`. Una máquina con `date_fin IS NULL` y `statut = suspendu` sigue bloqueada para otro contrato hasta que se le asigne `date_fin`.
- **Índice único parcial** `contract_machines_one_open_per_machine (machine_id) WHERE date_fin IS NULL`: una máquina solo puede tener una línea abierta a la vez, independientemente del `statut`.
- **Overrides por línea**: `billing_day_override` y `maintenance_frequency_override` (columnas de `contract_machines`) anulan el valor por defecto del contrato para esa máquina concreta. Nota: el motor de facturación del Bloque E rige el ciclo por `contracts.billing_day`; `billing_day_override` queda como día de captura, no de ciclo (ver §Módulo de Facturación, E2).
- **Incidencias internas**: se vinculan **solo** por `incidents.contract_machine_id` (UUID), que referencia la línea. La columna `incidents.machine_id` queda `NULL` en incidencias internas.
- **Incidencias públicas** (`source='public'`, vía QR): se vinculan por `incidents.machine_id` directo (sin `contract_machine_id`).
  - **RLS de máquinas para el técnico — incluye incidencias públicas** (migración `20260609130000_tech_machines_rls_include_machine_id.sql`, 2026-06-10): `auth_tech_assigned_machine_ids()` (que alimenta la policy `tech_machines_select`) hace `UNION` de las máquinas vía `contract_machine_id` **y** las de incidencias `machine_id` directas asignadas al técnico. Antes solo derivaba de `contract_machine_id`, por lo que un técnico asignado a una incidencia pública no podía ver la máquina → 404 al escanear y sección Machines vacía. La página de scan ya contemplaba ambos tipos; esto alinea la RLS.
- **Mantenimiento granular**: cada `maintenance_visit` referencia una `contract_machine_id` (una visita por máquina). Ver §10.
- **Cleanup legacy aplicado** (migración `20260605000000_cleanup_legacy_contracts.sql`): se hizo **DROP** de las columnas legacy `contracts.machine_id`, `contracts.lieu_installation` e `incidents.contract_id`, además de su FK `incidents_contract_id_fkey`. El modelo viejo 1↔1 ya no existe en la BD.

> **Flujo de creación desacoplado (sin dependencia circular):**
> 1. Crear cliente (`/admin/clients/new`) — solo datos del cliente
> 2. Crear máquina (`/admin/machines/new` individual o `/admin/machines/import` en bloque vía CSV) — solo datos de la máquina
> 3. Crear contrato (`/admin/contracts/new`) — une cliente + N máquinas (solo muestra máquinas sin línea abierta en otro contrato); cada máquina se puede configurar con overrides de facturación y mantenimiento
> 4. Crear plan de mantenimiento (`/admin/maintenance/new`) — enlazado al contrato

### Parque y stock — estado DERIVADO (Bloque A del core de facturación, 2026-06-08)

El estado **alquilada / en stock** de una máquina **no se materializa** en ninguna columna: se **deriva** de `contract_machines` (única fuente de verdad, ya garantizada por `contract_machines_one_open_per_machine`):

- **alquilada** ⟺ existe una línea con `date_fin IS NULL`.
- **en stock** ⟺ no existe ninguna línea abierta.

Decisión del dueño (evitar desincronización en dinero). `machines.active`/`localisation` quedan como metadatos descriptivos, no rigen facturación. Un futuro "en taller vs disponible" sería un dato informativo aparte.

- **Vista `v_machine_park`** (`security_invoker=true`): expone por máquina `louee` (bool), su línea abierta (`open_line_id`, `open_contract_id`, `open_date_debut`), `numero_contrat` y `client_id`. SELECT solo para `authenticated`/`service_role`.

- **Vista `v_machine_parts_history`** (`security_invoker=true`, mig. `20260616103252`): historial unificado de piezas/tóner cambiados por máquina, uniendo `incident_parts` (averías) y `maintenance_parts` (mantenimiento). Columnas: `machine_id`, `source` ('incident'|'maintenance'), `source_id`, `reference`, `part_id`, `part_name`, `description`, `quantity`, `changed_at`, `category`, `technician_id`, `technician_name`. Al ser security_invoker hereda la RLS: el cliente no ve `incident_parts` (no tiene policy) → la vista no le expone el desglose. La consume la página admin `/admin/machines/[serie]/pieces` (Fase 1 del historial de piezas).

- **Referencia de rendimiento de piezas** (Fase 2 del historial, mig. `20260616111117`):
  - Tabla `part_yield_specs` (admin-only): fichas del fabricante — `(marque, modele, part_id, expected_yield, unit ∈ copies_bw/color/total/mois, source ∈ fabricant/estimé)`, UNIQUE(marque,modele,part_id,unit). Se cargan por SQL.
  - Vista `v_part_yield_baseline` (`security_invoker`): rendimiento aprendido = copias_total medias entre cambios consecutivos de la misma pieza en la misma máquina, agregado por (marque, modele, part_id) + `samples`.
  - Vista `v_part_yield_effective` (`security_invoker`): rendimiento efectivo en copies_total = ficha del fabricante (`unit='copies_total'`) si existe, si no el baseline; expone `yield_source` ('fabricant'|'historique'). Base para el agente de anomalías (Fase 3). Las fichas se pre-filtran a `unit='copies_total'` ANTES del `FULL JOIN` (mig. `20260616133323`) — fichas en otra unidad no entran (evita duplicar/contaminar). ⚠️ El enlace ficha↔máquina es por igualdad de texto `marque`/`modele`: cargar fichas con los valores exactos de `machines` o no casan (no alerta, sin error).

- **Agente de anomalías de consumo** (Fase 3 del historial, mig. `20260616115502`):
  - Tabla `machine_anomalies` (admin-only): cola de revisión — `(machine_id, part_id, anomaly_type, light ∈ amber/red, reason, metrics jsonb, status ∈ open/ack/dismissed/resolved)`. Índice único parcial: una anomalía abierta por (machine, part, type).
  - Vista `v_machine_part_consumption` (`security_invoker`, endurecida en mig. `20260616121054`: `GREATEST(0,…)` + `DISTINCT ON` determinista): copias desde el último cambio de cada pieza + rendimiento esperado; respeta reemplazos (misma época de máquina).
  - Lógica pura testeable en `src/lib/anomalies.ts` (`evaluateConsumption`): regla `consumo_alto_sin_cambio` (ámbar ≥80% / rojo ≥100% del rendimiento; exige `samples>=3` si es aprendido). Reglas `consumo_excesivo`/`desviacion_modelo` diferidas.
  - Recálculo atómico vía RPC `replace_consumption_anomalies(p_rows jsonb)` (`SECURITY INVOKER`, `service_role`, mig. `20260616133505`): `recalcAnomaliesAction` calcula con `evaluateConsumption` y persiste el conjunto en una transacción.
  - UI `/admin/anomalies`: cola con semáforos + acciones (Résolu/Acquitter/Écarter) + botón "Recalculer" (`recalcAnomaliesAction`); banner contador en el dashboard `/admin`. Cron automático diferido hasta que haya datos.
  - Gate de integración end-to-end: `tests/rls/anomalies-e2e.test.ts` (cadena completa con datos sintéticos). 9 migraciones de la feature en prod (`20260616094356`–`133505`), drift cero.

**El stock es la frontera entre clientes** (regla de negocio): una máquina nunca pasa directa de un cliente a otro; siempre Cliente A → stock → Cliente B. Dos eventos del ciclo de vida, vía RPC atómica (`SECURITY DEFINER`, `service_role`), con Server Actions en `src/app/admin/contracts/[id]/stock-actions.ts`:

- **`return_machine_to_stock(p_payload)`** — motivo (a) resiliación: cierra la línea con su `end_counter_bw/color` **real** (lectura al retirar) + `date_fin` + `statut='terminé'`. La máquina queda en stock; no factura mientras lo está. Valida que el cierre no sea inferior a la mayor lectura conocida. **No encadena** (`replaces_contract_machine_id` queda NULL en cualquier futura asignación).
- **`assign_machine_from_stock(p_payload)`** — rotación de parque (cliente nuevo): la máquina debe estar en stock; **exige `start_counter_bw/color` real** (puede no ser 0: copias de prueba del taller) y abre una línea **nueva NO encadenada**. Es un alquiler independiente, no un reemplazo.

Diferencia clave con el **reemplazo** (`replace_contract_machine`, motivo (b) reparación en taller): el reemplazo **sí encadena** el puesto (`replaces_contract_machine_id`) y consolida en una sola línea de factura; la rotación de parque **no**. Como los puntos de corte (`start_counter`/`end_counter`) viven en `contract_machines` y no en `machine_counters`, una rotación A→stock→B **dentro del mismo mes** no colisiona con el índice `machine_counters_one_active_per_month`, y cada cliente factura su tramo sin cruzar el historial del otro (tests en `src/lib/invoicing.test.ts`, describe «Bloque A»).

### Motor de facturación por línea (Bloque B del core, 2026-06-08)

`buildContractInvoiceDraft` (`src/lib/invoicing.ts`) factura **por línea/contrato**, no por máquina física:

- **Atribución por contrato (P0-3)**: los relevés de `machine_counters` se cargan con su `contract_id` y se reparten a cada línea con `countersForLine()`: una línea solo ve los relevés de **su** `contract_id` (o heredados sin atribuir cuyo día cae en su intervalo de vigencia). Una misma máquina que rotó por varios contratos ya no mezcla consumos. Tanto Princity como la entrada manual de contadores rellenan `contract_id`/`client_id` desde la línea abierta.
- **Bloqueo por fallo técnico (P0-7)**: cada query comprueba su `error`; un fallo de lectura lanza `BillingDataError` y **bloquea preview y emisión** (la página muestra un «Blocage technique»), en vez de degradar a líneas estimadas con consumo 0. Es un estado **distinto** de "falta el dato real".
- **Punto inicial explícito (P0-4)**: `create_contract_with_lines` persiste `start_counter_bw/color` por línea (migración `20260608130000`), para que el primer mes de una máquina nueva facture desde su lectura inicial y no se pierda el consumo. Añadir una máquina a un contrato existente desde stock usa `assign_machine_from_stock` (Bloque A), que ya exige la lectura. `ContractForm` por sí solo no captura `start_counter` al crear una línea nueva; sin él, el primer mes queda estimado (visible), nunca pérdida silenciosa.
- **«Forcer la facturation» (regla 8)**: cuando falta legítimamente el relevé de algún equipo, el admin puede forzar la emisión (`confirm_estimated`); esas líneas se facturan al forfait, marcadas `is_estimated` (traza en la factura). Es una acción **intencional de admin**, distinta del bloqueo técnico (P0-7), que no se puede forzar.
- **Reasignación intra-mes (P1-3)**: resuelta por los cortes en la línea (Bloque A) + la atribución por contrato; el índice `machine_counters_one_active_per_month` se mantiene a propósito (los cortes no son filas de `machine_counters`).

### Reglas temporales y de negocio (Bloque D del core, 2026-06-08)

- **Estados contrato/línea (P1-6)** — `isLineBillable()` en `src/lib/invoicing.ts`, usado por `buildContractInvoiceDraft` y `listBillableContracts`: una línea/contrato `suspendu` **no factura** (servicio pausado). `terminé` **no** se filtra por statut — lo gobierna `date_fin` (factura el mes de cierre de una retirada/reemplazo y se excluye después, preservando H-D6). Caso borde: un contrato `terminé` con una línea aún abierta (`date_fin IS NULL`) excluye esa línea huérfana para no facturar sin fin.
- **Cambio de cliente controlado (P1-4)** — `update_contract_with_lines` (migración `20260608140100`) **bloquea** cambiar `contracts.client_id` si el contrato ya tiene historial (≥1 línea de factura emitida o ≥1 relevé): error `client_change_forbidden_history`. Para un cambio de cliente real → contrato nuevo. No reasigna el pasado.
- **Reemplazo conserva el puesto (P1-7)** — `replace_contract_machine` (migración `20260608140000`) ahora hereda en la línea entrante también `billing_day_override`, `maintenance_frequency_override` y `notes` (antes solo precio), con override opcional por payload.
- **Mantenimiento sigue a la máquina nueva (P1-8)** — el reemplazo migra las `maintenance_visits` futuras y no realizadas (`status <> 'fait' AND scheduled_date >= fecha`) de la línea saliente a la entrante, para no programar mantenimientos sobre la máquina retirada.
- **Vigencia temporal de tarifas (P1-5)** — ✅ resuelto. Historial append-only de tarifas: tablas `billing_plan_versions` (precios del plan) y `contract_machine_override_versions` (overrides de la línea), cada versión con `effective_from`. Se capturan por **trigger** (`tg_billing_plan_version`, `tg_cm_override_version`, ambos `SECURITY DEFINER`) en cualquier alta/cambio de precio — independiente del camino, sin tocar `update_contract_with_lines`. `buildContractInvoiceDraft` resuelve la tarifa **vigente al inicio del ciclo facturado** (`asOf = period_start`) vía `resolveEffectiveTariffAsOf`/`pickVersionAsOf` (`src/lib/billing.ts`); fallback al precio actual del plan si faltara historial. Política: planes → fallback a la versión más antigua; **overrides → estricto** (un override futuro no aplica a un ciclo anterior). El **backfill** data cada plan/override existente con sus valores actuales → comportamiento idéntico hasta el primer cambio real. Las facturas ya emitidas son snapshot y no cambian; esto solo protege meses pasados aún sin facturar. *(Fuera de alcance: cambios de precio programados a fecha futura — hoy rigen desde la fecha del cambio.)* Migración `20260609120000`.

### Ciclo de facturación por aniversario (Bloque E del core, regla 9) — ✅ COMPLETO (E1+E2 en `main`, PRs #43/#44)

Cambia el periodo de facturación de **mes natural** a **ciclo de aniversario por contrato**: del `billing_day` del contrato al día anterior del mismo día del mes siguiente. **Día único por contrato → una sola factura por contrato/ciclo** con todas sus máquinas. Entrega **por fases**:

- **E1 (motor de cálculo, este PR — solo lectura, sin tocar `invoices`/`emit_invoice`):**
  - `computeBillingCycle(billingDay, anchorYear, anchorMonth)` → `{start, end}` ISO. Caso fin de mes con clamp (ej. day 31 anclado en enero → `[01-31, 02-27]`; día 1 → mes natural). Tests: bisiesto, cruce de año, 31→febrero.
  - `computeLineConsumptionCycle(line, counters, periodStart, periodEnd)` — consumo por **rango de fechas** del ciclo (no mes natural): final = relevé activo más reciente dentro del ciclo (la captura del `billing_day`), o `end_counter` si se cerró por reemplazo en el ciclo; base = relevé activo más reciente anterior al inicio, o `start_counter` si la línea arrancó en el ciclo. Misma política estimado/negativo que el mensual.
  - `buildContractInvoiceDraft(contractId, anchorYear, anchorMonth)` → `ContractDraft` (periodo del ciclo + `period_year`/`period_month` como mes-ancla). Reusa la atribución por contrato (P0-3), `isLineBillable` (P1-6) y la consolidación de reemplazos (helper compartido `consolidateReplacements`, una sola implementación para no divergir — P2-8). `listBillableContracts` lista candidatos por ventana amplia.
- **E2 (persistencia + UI):**
  - Migración `20260608150000`: `invoices` gana `contract_id`, `period_start`, `period_end` (DATE, **aditivos**, no rompen facturas legacy ni el flujo viejo) + índice único `(contract_id, period_start) WHERE emise`. RPC **nueva** `emit_contract_invoice` (paralela a `emit_invoice`, **no lo toca** → cero colisión con el Bloque C), que **nace con la validación de coherencia contable (P1-1)**: contrato existe y cliente coincide, ≥1 línea, `amount_total = componentes` por línea, cabecera = suma de líneas, sin negativos, no-duplicado por contrato/ciclo.
  - Server Action `src/app/admin/facturation/contract-actions.ts` (`emitContractInvoiceAction`). Incluye validación P2-3 de entrada. **Manejo de errores (WP-4):** devuelve `{ error }` (patrón `useActionState`) en vez de `throw` — los `throw` en Server Actions invocadas por `<form>` quedan enmascarados por Next.js en producción; `ContractInvoicePreview` muestra el mensaje al admin. El `redirect` en éxito queda fuera de `try/catch`.
  - UI: `facturation/page.tsx` migrada a **selector de contrato** (`listBillableContracts` + `buildContractInvoiceDraft`); nuevo componente `ContractInvoicePreview` (muestra el rango del ciclo + jour de facturation, botón «Forcer la facturation», bloqueo técnico P0-7). El detalle de factura muestra el rango del ciclo si existe.
  - `billing_day_override` por máquina **deja de regir el ciclo** (el ciclo es por contrato vía `contracts.billing_day`): queda como día de captura, no de ciclo.
  - **Índice legacy restringido** (E2): `invoices_client_period_emise_unique` se recreó con `WHERE status='emise' AND contract_id IS NULL` para que dos contratos del mismo cliente anclados al mismo mes no colisionaran en la terna `(client_id, period_year, period_month)`. El no-duplicado por contrato lo cubre `invoices_contract_cycle_emise_unique (contract_id, period_start)` + el `EXISTS` de la RPC. *(**Retirado en WP-3b**, migración `20260611100000`: al eliminar la vía por cliente en WP-3, ninguna factura tiene ya `contract_id IS NULL`, así que el índice quedó huérfano. La unicidad vigente es solo la de contrato/ciclo.)*

> **Limpieza realizada (WP-3, 2026-06-10):** retirado el flujo legacy por cliente —`buildClientInvoiceDraft`, `listBillableClients`, `emitInvoiceAction`, `FacturationPreview`, el tipo `ClientDraft`— y `DROP FUNCTION emit_invoice` (migración `20260610102000`). La emisión vigente es **solo** `emit_contract_invoice` (por contrato/ciclo). Motivo: la unicidad legacy `(client_id, year, month)` y la de ciclo `(contract_id, period_start)` no se solapaban → riesgo de **doble facturación** del mismo consumo. La función `computeLineConsumption` (variante mensual) fue **retirada en WP-3b** (2026-06-11) tras portar su cobertura de tests (coincidencia con Contadores, política de negativos, H-D7, retirada/alta de stock, rotación A→stock→B) a `computeLineConsumptionCycle`; en la misma entrega se retiró el índice huérfano `invoices_client_period_emise_unique` (migración `20260611100000`).

### Bloque C del core — blindaje contable en BD (✅ en `main`, PR #46, 2026-06-09)

Capa de integridad **en base de datos** (migraciones/RPC, banda `20260609 08:xx` → ordena tras el motor). No toca el motor de cálculo (`invoicing.ts`/`counters.ts`). Construida **sobre** las piezas del motor sin machacarlas:

- **Facturas inmutables (P0-5, `20260609080000`)** — triggers `trg_invoices_immutable` y `trg_invoice_lines_immutable` (ver tablas `invoices`/`invoice_lines`). FK `invoice_lines → invoices` pasa a `ON DELETE RESTRICT`. La promesa de snapshot inmutable deja de depender solo de la RLS/UI: la BD la garantiza ante cualquier `UPDATE`/`DELETE`, incluido `service_role`.
- **Coherencia contable (P1-1, `20260609081000`)** — validación de cuadre del snapshot **antes** de insertar, en ambas RPC de emisión (`emit_contract_invoice` ya la traía del motor; se añadió a `emit_invoice` legacy).
- **Desglose persistido (P2-6, `20260609081000`)** — columna `invoice_lines.breakdown`; ambas RPC la persisten (el draft ya la calculaba; antes se descartaba). Trazabilidad del consumo consolidado por reemplazo.
- **Pertenencia de líneas (P0-6, `20260609082000`)** — `update_contract_with_lines` exige `contract_id = p_contract_id` en toda operación por `id` de línea (inmutabilidad de máquina, edición, retirada). Un `id` de otro contrato → `line_not_in_contract`. Conserva el guard P1-4 del motor.
- **Guards de contadores en edición (WP-2, `20260610101000`, auditoría 2026-06-10)** — `update_contract_with_lines` cierra tres fugas de contadores: (1) el alta de línea nueva **persiste** `start_counter_bw/color` (antes se perdían → reabría el bug P0-4 de facturar "0 estimado" el primer ciclo); (2) el retiro **rechaza** una línea ya cerrada (`date_fin NOT NULL` → `line_already_closed`, evita pisar cierres por reemplazo); (3) el retiro **persiste** `end_counter_bw/color` si llegan en el payload (antes se ignoraban). Nota: NO exige `end_counter` obligatorio (el form de edición aún no lo envía; forzarlo rompería la única vía de retiro conectada a UI). Para atribución completa del consumo al retirar, usar `return_machine_to_stock` o que el form envíe el contador de cierre.
- **Invariantes de la cadena de reemplazos (P2-5, `20260609083000`)** sobre `contract_machines.replaces_contract_machine_id`: `CHECK` no autorreferencia; índice único parcial (una saliente no puede ser reemplazada por dos entrantes); trigger `trg_cm_replacement_invariants` (enlace dentro del **mismo contrato** + **sin ciclos**). Protege al motor que recorre la cadena para consolidar.

> Validación SQL real (inmutabilidad, payload descuadrado/IDs cruzados rechazados, breakdown persistido, anulación funcionando) → diferida al **gate E2E final** sobre BD real (plan Supabase FREE no permite ramas de BD).

### Bloque 0 del core — arreglos aislados (✅ en `main`, PR #39, 2026-06-09)

Correcciones de bajo riesgo, fuera del motor de cálculo:

- **Rollback fuera del camino de migraciones (P0-1)** — `20260603120856_..._rollback.sql` movido de `supabase/migrations/` a `supabase/rollbacks/` (+ README). Ya no se ejecuta en una reconstrucción limpia / `db reset`.
- **Fix migración `terminé` (P1-9)** — el INSERT de datos de `20260603120559` deriva `date_fin` para contratos `terminé` (`GREATEST(date_debut, COALESCE(date_renouvellement, date_debut))`), respetando el CHECK `contract_machines_termine_has_date_fin`. **Excepción de edición in-situ de migración aplicada**, aprobada por el dueño y documentada en `docs/decisiones-tecnicas.md` (el fix-forward es imposible: la reconstrucción aborta dentro de esa misma migración).
- **Cierre del flujo de reemplazo defectuoso (P0-2)** — eliminado `replaceLine()` (`removeLine()+addLine()`) de `ContractForm`. El único flujo de reemplazo es el atómico `ReplaceMachineModal → replace_contract_machine`.
- **Validaciones de entrada (P2-2, P2-3)** — `validateTiers` (`billing.ts`) valida tipo/finitud de `up_to`/`price_bw`/`price_color`; `facturation/actions.ts` valida `client_id`/`year`/`month`; CHECK de rango `invoices.period_year` (`20260608080000`). Tests vitest en `src/lib/billing.test.ts`.
- **P0-7 (fallo técnico ≠ dato ausente)** lo asumió el owner del motor por tocar `invoicing.ts` (documentado en Bloque B).

### Gate final — ✅ PASADO (GO, 2026-06-09)

E2E que valida todo el core sobre datos sintéticos en prod: **`docs/gate-final-facturacion-2026-06-08.md`** (resultado completo en su §RESULTADO). Estilo del gate previo (PR #36): **código TS real** + **RPC reales** en DO blocks con `service_role`, datos `GATEF`/2027, **limpieza verificada por SELECT**. Resultado: **A 10/10 · B 6/6 · C 4/4 · D · E**, 5 facturas emitidas (cabecera = Σ líneas), **inmutabilidad probada** (UPDATE/DELETE sobre factura emitida → bloqueados), y **prod restaurada a su foto inicial** (66 clients · 108 machines · 0 contracts · 0 invoices, 0 residuos). Veredicto **GO** (verificación SQL independiente del supervisor). El esquema quedó **desplegado** y limpio de datos de prueba. **Regla de oro cumplida: no se facturó a ningún cliente real.**

> **Coordinación (fix-forward) — ✅ resuelta:** `update_contract_with_lines` (función compartida) la reescribió el Bloque C SOBRE la versión `20260608140100` conservando el guard P1-4 (migración `20260609082000`, P0-6). Migraciones del motor en banda `20260608_12xxxx`–`15xxxx`; las de soporte en `20260608_08xxxx` (Bloque 0) y `20260609_08xxxx` (Bloque C) → orden global sin dependencias rotas.

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
  → Técnico completa formulario + piezas → résolu (el informe es OBLIGATORIO, ver §Verrou)
  → sendCsatForIncident: Resend envía CSAT al contacto del QR (o a la cuenta de portal)
    + auto-transición résolu → fermé — SOLO si el email sale de verdad (§7-bis)
```

> **Flujo QR automático (sesión 12):** el 1er escaneo QR del técnico dispara `assigné → en_cours` sin acción manual. Al resolver (`résolu`), `src/lib/csat.server.ts` envía el email CSAT y cierra automáticamente a `fermé` (guard `.eq('status','résolu')` + comprobación de filas actualizadas antes de insertar en `incident_history`). El admin puede seguir cerrando manualmente desde el kanban en casos donde no hay portal cliente.

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
  → INSERT incidents (source='public', opened_by=null, machine_id directo)
  → Email notificación a savamdservice@gmail.com
  → Muestra número de referencia SAV-YYYY-NNNN
```

---

## Verrou de résolution — ninguna avería se cierra sin rastro

✅ **Completo, en producción y PROBADO EN USO REAL (2026-09-22)**, TV del taller incluida — con un
fallo encontrado y corregido en la prueba (PR #147: la lista de motivos salía en blanco sobre blanco
en la TV; el menú de un `<select>` lo pinta el sistema y las `<option>` heredaban el texto blanco del
kiosko). Plan: `docs/plan-cierre-averias-2026-09-18.md`. PRs #143 (cimientos +
puerta del técnico), #144 (las 4 puertas de oficina), #145 (consecuencias visibles) y #146 (el
candado de BD). En producción con el merge de cada PR; el trigger, además, con el `supabase db push`
de la migración `20260922100000` — sin ese push el candado no existe en la base aunque el código
esté desplegado.

### El problema

Había **cinco** puntos del código que escribían `status = 'résolu'` y **ninguno** exigía nada: ni
informe, ni escaneo del QR. Una avería podía quedar resuelta con `assigned_to = NULL` y sin una
línea escrita. Peor: como el envío de la encuesta es lo que archiva la avería, el cliente recibía
una encuesta de satisfacción por una intervención que nadie había documentado, y la avería quedaba
cerrada en blanco. El mantenimiento preventivo sí tenía prueba de presencia física
(`maintenance_visits.qr_verified`); las averías nunca la recibieron.

### Las dos vías

| Vía | Quién | Qué exige | Dónde acaba |
|---|---|---|---|
| `intervention` | el técnico, con la máquina delante | **informe obligatorio** (`rapport_intervention`) | `résolu` → la encuesta la archiva en `fermé` |
| `bureau` | oficina (tablero admin, kanban del kiosko, ficha del kiosko, ficha admin) | **motivo** (lista) + **explicación** (mínimo 10 caracteres) | **directo a `fermé`**, sin encuesta |

La marca la pone **la puerta de entrada**, no lo que se escriba: si el formulario de oficina fuese
igual que el del técnico, una resolución bien redactada sería indistinguible de una intervención
real — peor que antes, porque hoy un informe vacío al menos es una señal.

### Una sola regla, cuatro puertas y la pantalla

`src/lib/resolution.ts` (puro, sin Supabase, probado con vitest) concentra todo:

- `buildResolution()` — valida la vía y devuelve las columnas a escribir.
- `requiresOfficeResolution(old, new, via)` — **¿hay que pedir justificación?** Solo al cerrar algo
  que estaba **vivo**, solo si no hay rastro ya, y tanto para `résolu` como para `fermé` (si no,
  «Fermé» sería el atajo barato justo porque «Résolu» hace preguntas). La usan las Server Actions
  **y** la interfaz: cuando cada lado decidía por su cuenta salía un campo obligatorio que no
  existía en pantalla.
- `finalResolutionStatus(status, via)` — una resolución que no va a generar encuesta se archiva en
  el acto: `résolu` es una sala de espera de la que solo saca el envío del CSAT.
- `clearResolution()` — reabrir borra vía, motivo, nota, escaneo **y el informe**. Sin esto la
  segunda resolución heredaría el rastro de la primera; el informe era el hueco más fino, porque el
  formulario del técnico lo rellena con lo que ya hubiera y una avería reabierta en mayo se cerraba
  con el texto de marzo sin escribir una línea. No se pierde: la puerta que reabre lo archiva antes
  en `incident_history` (`archivedReportNote()` + `historyComment()`, que junta esa nota con el
  comentario escrito a mano en vez de quedarse con uno). Si el técnico **reescribe** el informe al
  reabrir, ese texto es suyo y se conserva. `resolved_at` se conserva (lo usan los recuentos).
  La copia se escribe **antes** de borrar nada: si no entra, la avería no se toca.
- `sendsSurvey(via)` — solo `intervention` pide opinión al cliente.

### El QR: semáforo, nunca bloqueo

Escanear el QR de la máquina con la avería abierta marca `qr_verified` y guarda `qr_scanned_by`
(`src/lib/scan.server.ts`). La ficha lo enseña en verde **solo si quien escaneó es quien resolvió**.
No bloquea nunca: una etiqueta despegada o un móvil sin cobertura no pueden dejar a un técnico sin
poder cerrar lo que acaba de arreglar — buscaría un atajo y volveríamos al principio.

### El candado (migración `20260922100000_guard_incident_resolution.sql`)

Trigger `trg_guard_incident_resolution`, BEFORE INSERT OR UPDATE sobre `incidents`. Misma idea que
`tg_invoices_immutable` o el candado de facturación: si mañana aparece una sexta puerta —una Edge
Function, un importador, una llamada con la `service_role` key— no podrá archivar una avería viva
sin decir cómo se resolvió. Rechaza `résolu`/`fermé` viniendo de un estado **vivo** cuando falta la
vía, falta el informe (`intervention`) o falta el motivo/explicación (`bureau`).

Al **reabrir**, el propio trigger vacía el rastro (vía, motivo, explicación, escaneo y el informe
si no se ha reescrito). Sin eso el candado se saltaba en dos movimientos: poner la avería en un
estado vivo sin limpiar nada y cerrarla acto seguido aprovechando el rastro viejo — la visita de
mayo cerrada con el informe de marzo. La limpieza no puede depender de que la aplicación se acuerde.

También impide **borrar o vaciar** el rastro mientras la avería siga resuelta — las tres piezas, no
solo la vía: sin esa regla el candado valdría «de un solo movimiento», porque dos UPDATE seguidos
—uno en regla y otro dejando la vía en NULL, o el informe en blanco— daban una avería marcada
«Intervention» sin una línea escrita.

No toca: el histórico (una avería que ya estaba resuelta o cerrada **sin** rastro se puede seguir
editando y archivando — nunca lo tuvo y no se le inventa), el cierre automático tras la encuesta
(`résolu → fermé`) ni la reapertura. Cubierto por `tests/rls/incident-resolution-guard.test.ts`
(nueve rechazos y seis caminos legítimos, contra un Supabase real en el job `rls` del CI).

### Qué se ve

- `/admin/incidents` (lista): columna **Résolution** — verde `Intervention`, ámbar `Bureau` con el
  motivo debajo — y filtro por vía (solo en la vista de lista: las abiertas no tienen vía todavía).
- Ficha de la avería: tarjeta **Résolution** con vía, motivo, explicación y el semáforo del QR.
- Kiosko: al archivar desde el taller, `ArchivedToast` confirma durante 8 segundos qué avería se
  archivó — el tablero solo muestra averías vivas, así que la tarjeta desaparece y, sin el aviso,
  parecería que no ha funcionado.

### Subproducto

El desplegable de motivos es, desde el primer día, una estadística: dentro de unos meses podrá
responder *«qué porcentaje de lo que cerramos en oficina son falsas alarmas de Princity»* — dato que
cruza directo con el problema de los crons silenciosos (§Integración Princity).

---

## Flujo de Mantenimiento Preventivo

```
Admin crea plan en /admin/maintenance/new
  → Selecciona contrato (solo contratos sin plan activo)
  → Elige frecuencia: mensual (30 días) o trimestral (90 días)
  → Indica fecha primera visita + notas opcionales
  → Se crea maintenance_plan + UNA maintenance_visit (status: planifié) POR CADA línea activa
    del contrato (cada visita lleva su contract_machine_id)

Edge Function maintenance-cron (diario 8h UTC, via pg_cron + pg_net):
  → Visitas con scheduled_date < hoy y status='planifié' → status='en_retard'

Técnico va a la instalación
  → Escanea QR de la máquina → /tech/scan/[serie]
  → Ve card "Maintenance planifiée" (azul) o "Maintenance en retard" (roja)
  → Pulsa la card → /tech/scan/[serie]/maintenance/[visitId]
  → Rellena checklist 12 piezas + campo libre + notas
  → Pulsa "Clôturer la maintenance" → RPC close_maintenance_visit (atómico, idempotente):
    → Valida que el QR escaneado corresponde a la contract_machine_id de la visita
    → visit: status='fait', done_at=now(), done_by=user.id, qr_verified=true
    → Inserta filas en maintenance_parts para cada pieza marcada
    → Crea la siguiente maintenance_visit de ESA máquina (scheduled_date actual + frecuencia
      override de la línea, o del plan; +30/90 días)
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

### `GET /v1/devices?contract=63&status=ACTIVE` — equipos de un contrato

> ⚠️ **`status` es OBLIGATORIO** (`ACTIVE` · `INACTIVE` · `DELETED`). Sin él la API responde `400 "Provided contract doesn't exist"` — mensaje engañoso: el contrato existe. Para el catálogo completo hay que pedir los tres estados (2026-09-15: 58 + 6 + 118 = **182 equipos**). `princity-sync` llama sin `status` y por eso no importa ninguna máquina (ver §5).

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

> ⚠️ **La petición usa el nombre LARGO, la respuesta devuelve el CORTO.** En `fieldIds` y en los filtros hay que escribir `BillingCounter.date` / `Alert.description` (la API lo exige así), pero las entradas de la respuesta llegan con la clave sin prefijo. Verificado contra la API real el 2026-09-15; **leer la clave larga devuelve `undefined`** y es la causa de que `princity-counters` y `princity-alerts` no importen nada (ver §5 y `docs/pendientes.md`).
>
> ```jsonc
> // POST /v3/billingCounters  → respuesta real
> { "entries": [ { "date": "2026-09-15", "deviceId": "17-0", "endMono": 42497, "endColor": 28210 } ],
>   "numberOfAll": 38765 }
>
> // POST /v3/alerts → respuesta real
> { "entries": [ { "severityLevel": "WARNING", "companyId": "34", "code": 801,
>                  "description": "Non détecté(e) : Magasin 1 {12201}",
>                  "activationDate": "2024-10-09T10:11:08.847+00:00", "deviceId": "34-0" } ],
>   "numberOfAll": 321 }
> ```

### `POST /v3/alerts` — alertas en curso
fieldIds usados: `Alert.activationDate`, `Alert.severityLevel`, `Alert.description`, `Alert.deviceId`, `Alert.code`, `Alert.companyId`.
Idempotencia en BD: clave compuesta `(princity_alert_code, princity_device_id_raw, received_at)`.

### `POST /v3/billingCounters` — contadores diarios por máquina
fieldIds usados: `BillingCounter.date`, `BillingCounter.startMono`, `BillingCounter.endMono`, `BillingCounter.startColor`, `BillingCounter.endColor`.
Filtro: `BillingCounter.deviceId EQ <princity_device_id>`. Orden: `BillingCounter.date DESC`, limit 1.
**El filtro por fecha NO funciona**: `{ key: 'BillingCounter.date', type: 'GTE', value: '2026-08-01' }` responde `400 "Not able to deserialize data provided."`. Para barrer un rango hay que pedir sin filtro, ordenar `DESC` y paginar (`offset`/`limit`, máx. 1000) hasta rebasar la fecha buscada.

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
| `can_bill` | boolean | default: **false** — permiso de FACTURACIÓN (solo aplica a `role = admin`). Ver «Permiso de facturación» |
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
Vincula cliente ↔ N máquinas (vía `contract_machines`). El número de contrato es la llave del portal cliente.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `numero_contrat` | text | unique |
| `client_id` | bigint | FK → clients |
| `date_debut` | date | |
| `date_renouvellement` | date | nullable |
| `statut` | enum | actif / suspendu / terminé |
| `billing_day` | smallint | nullable — día de facturación por defecto del contrato (1–31); sobreescribible por línea en `contract_machines.billing_day_override` |
| `maintenance_frequency` | text | nullable — frecuencia de mantenimiento por defecto (`mensuel` / `trimestriel`); sobreescribible por línea en `contract_machines.maintenance_frequency_override` |
| `created_at` | timestamptz | |

> Las columnas legacy `machine_id` y `lieu_installation` (modelo 1↔1) fueron eliminadas en el cleanup del 2026-06-05. La vinculación con máquinas vive ahora en `contract_machines`.

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
| `contract_machine_id` | UUID | FK → contract_machines, **nullable** — vínculo de las incidencias internas (NULL en públicas) |
| `machine_id` | text | FK → machines.numero_serie, nullable — usado en incidencias públicas (`source='public'`); NULL en internas |
| `opened_by` | UUID | FK → profiles, nullable (null en incidentes públicos) |
| `assigned_to` | UUID | FK → profiles (técnico), nullable |
| `title` | text | |
| `description` | text | nullable |
| `category` | enum | panne / maintenance / consommable / autre |
| `priority` | enum | basse / normale / haute / urgente |
| `status` | enum | nouveau / assigné / en_cours / résolu / fermé |
| `rapport_intervention` | text | informe del técnico, nullable |
| `autres_pieces` | text | piezas libres, nullable |
| `resolved_via` | text | `intervention` / `bureau`, nullable — cómo se resolvió. NULL = sin resolver o histórico anterior al verrou |
| `resolution_reason` | text | solo si `bureau`: `fausse_alerte` / `telephone` / `client` / `technicien_non_enregistre` / `doublon` / `autre` |
| `resolution_note` | text | explicación de quien resolvió (el informe del técnico, o la justificación de oficina) |
| `qr_verified` | boolean NOT NULL DEFAULT false | true si alguien escaneó el QR físico con la avería abierta. **Semáforo, nunca bloqueo** |
| `qr_scanned_by` | UUID | FK → profiles, nullable — quién escaneó. El verde exige que sea quien resolvió |
| `contact_name` | text | nullable — nombre del reporter (incidentes públicos vía QR) |
| `contact_phone` | text | nullable — teléfono del reporter |
| `contact_email` | text | nullable — email del reporter (opcional en el formulario) |
| `source` | text | nullable — `'public'` para incidentes del formulario QR; null para el resto |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | trigger automático |
| `resolved_at` | timestamptz | nullable |
| `closed_at` | timestamptz | nullable |

> **`numero_incident` (SAV-YYYY-NNNN):** contador secuencial por año, reseteado el 1 de enero. Generado por `public.next_incident_number()` (upsert atómico sobre `incident_counters`). Asignado por el trigger `trg_set_incident_numero` BEFORE INSERT. Visible en Kanban, vista lista admin, detalle admin, PWA técnico (lista + detalle) y portal cliente (lista + detalle).

> **Vinculación internas vs públicas:** las incidencias **internas** se vinculan solo por `contract_machine_id` (con `machine_id=NULL`); las **públicas** (`source='public'`) por `machine_id` directo (con `contract_machine_id=NULL`). La columna legacy `contract_id` y su FK `incidents_contract_id_fkey` fueron eliminadas en el cleanup del 2026-06-05.

> **Verrou de résolution (2026-09-22, PRs #143/#144/#145 + candado):** tres CHECK garantizan la coherencia (`resolved_via` ∈ {intervention, bureau}; `resolution_reason` de la lista; el motivo es **exclusivo** de la vía `bureau`) y el trigger `trg_guard_incident_resolution` (BEFORE INSERT OR UPDATE) impide que una avería **viva** pase a `résolu` o a `fermé` sin rastro. Ver §Verrou de résolution.

> **Incidentes públicos (`source='public'`):** creados por `submitPublicIncident` sin autenticación, con `opened_by=null` y `contract_machine_id` nullable. El detalle admin muestra una sección "Contact" con badge "Public". El portal cliente los excluye con `.or('source.is.null,source.neq.public')`.

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
Catálogo de piezas disponibles para intervenciones (14 piezas). Espejo en cliente: `src/lib/parts.ts` (fuente única importada por los formularios del técnico y las actions). Ids 1–12 originales; 13 = `ADF`, 14 = `Poubelle Transfer` (mig. `20260616094356`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | smallint PK | identity |
| `name` | text | unique |

---

### Tabla: `incident_parts`
Piezas reemplazadas por intervención (tabla puente).

| Campo | Tipo | Notas |
|---|---|---|
| `incident_id` | UUID PK | FK → incidents (ON DELETE CASCADE) |
| `part_id` | smallint PK | FK → parts |
| `quantity` | int | NOT NULL DEFAULT 1, CHECK > 0 (mig. `20260616094356`) |

Escritura vía RPC `set_incident_parts(p_incident_id, p_parts jsonb)` (`SECURITY INVOKER`, mig. `20260616101329`): reemplaza el set de piezas de forma atómica (borra + reinserta en una transacción), respetando la RLS del técnico.

---

### Tabla: `incident_photos`
Foto adjunta a una incidencia. El cliente puede adjuntar **una foto (opcional)** al abrir la
incidencia desde el portal (`/portal/incidents/new`); la ven el técnico asignado, el admin y el
propio cliente en la ficha de detalle (componente compartido `src/components/IncidentPhotos.tsx`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID | FK → incidents, `ON DELETE CASCADE` |
| `uploaded_by` | UUID | FK → profiles, nullable |
| `storage_path` | text | ruta en `incident-photos`: `incidents/{user_id}/{year}/{month}/{sha256}.{ext}` (namespaced por usuario para que dos clientes con la misma imagen no colisionen) |
| `created_at` | timestamptz | |

> **Bucket `incident-photos`** (privado, migración `20260625100000_incident_photos`): política
> `incident_photos_service_all` (service_role). El navegador sube la foto **directa a Storage** con
> una URL firmada (`prepareIncidentPhotoUploadAction` → `createSignedUploadUrl`), esquivando el tope
> de 4,5 MB de las Server Actions de Vercel — mismo patrón que `counter-images`. La lectura usa
> signed URLs TTL 1h generadas server-side con el admin client. Validación (solo imágenes JPG/PNG/WEBP,
> ≤10 MB, hash `isSha256Hex` anti path-traversal) en `src/lib/incidentPhotos.ts`. La preparación de la
> URL firmada la centraliza el helper server-only `createIncidentPhotoUploadUrl(prefix, …)` en
> `src/lib/incidentPhotoUpload.ts` (lo comparten ambos flujos). Componente de subida compartido
> `src/components/IncidentPhotoUpload.tsx` (prop `prepareAction`).
>
> **Dos flujos de entrada:** (1) **portal del cliente** (`/portal/incidents/new`, autenticado, path
> `incidents/{user_id}/…`); (2) **formulario público del QR** (`/signaler/[serie]`, anónimo, path
> `incidents/public/{uuid}/…` con UUID aleatorio server-generado): `preparePublicIncidentPhotoUploadAction`
> protegida con rate limit `public_photo_upload` (6/h por IP+serie). La foto la ven admin y el técnico asignado.
>
> **Modelo de seguridad de la asociación foto↔incidencia** (la RLS NO valida `storage_path`): al asociar,
> el portal exige que el path empiece por `incidents/{user.id}/` (anti-IDOR entre clientes) y el público
> lo valida con un regex estricto del patrón con UUID; ambos comprueban además que el objeto exista en
> Storage (`incidentPhotoExists`, evita filas rotas si el cron de huérfanas ya lo borró). El UUID del path
> público (solo entregado a quien sube) impide construir la ruta de la foto de otro reporte.
>
> **Limpieza de huérfanas (cron):** la foto se sube antes de enviar el formulario; un form abandonado
> deja un objeto sin fila. La Edge Function `cleanup-orphan-incident-photos` (cron diario 02:30 UTC,
> migración `20260625110000`) borra los objetos del bucket sin fila en `incident_photos` y con > 24 h,
> vía la RPC `orphan_incident_photo_paths()` (SECURITY DEFINER, service_role).
>
> **Vista del despachador (Atelier):** el `AssignPanel` de `/atelier` muestra la foto del cliente + la
> descripción del problema al asignar (cargadas server-side con el admin client en `atelier/page.tsx`,
> firma en lote con `createSignedUrls`). No requiere policy RLS: el Atelier ya lee todo con service_role.
>
> ⚠️ **La CSP tiene que dejar pasar el dominio de Supabase** (`img-src` en `next.config.ts`). Las URL
> firmadas salen de `https://<proyecto>.supabase.co`, así que sin esa entrada el navegador bloquea el
> `<img>` y la foto se ve como un hueco vacío — en `/atelier`, en `/admin` y en el portal — mientras
> abrir la misma URL en una pestaña sigue funcionando (navegar no pasa por `img-src`). Corregido el
> 2026-09-15, detectado en el kiosko del taller.
>
> **RLS de la tabla** (la autorización vive aquí, no en Storage): `admin_all_incident_photos` (admin),
> `client_incident_photos_select`/`_insert` (cliente, vía `auth_client_contract_machine_ids()`;
> el INSERT exige `uploaded_by = auth.uid()`), `tech_incident_photos_select` (técnico, vía
> `auth_tech_incident_ids()` — mismo patrón que `incident_parts`/`incident_history`).

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
| `sent_to` | text | nullable — dirección a la que se envió la encuesta (2026-09-17) |
| `sent_at` | timestamptz | nullable — cuándo se envió. **NULL = nunca llegó a salir** |

> **Ojo al contar encuestas enviadas:** la fila se crea con su token ANTES de intentar el envío, así
> que existir no significa haberse enviado. La señal buena es `sent_at IS NOT NULL`. Un fallo de
> email deja la fila (token reutilizable en el siguiente intento) con `sent_at` a NULL. `UNIQUE
> (incident_id)`: una encuesta como mucho por avería.

> **Vista `v_csat_feedback`** (migración `20260917100000`, `security_invoker = true`): una fila por
> opinión **respondida** (`responded_at is not null`) con la avería y el cliente ya resueltos
> (`numero_incident`, `contact_name`, `contact_email`, `machine_id`, `nom_client`). Alimenta
> `/admin/avis`. Hereda la RLS de `csat_responses`, que es admin-only.

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

> **Guard de facturación (migración `wipe_guard_invoices`, 2026-06-10):** la función aborta con excepción si existe **cualquier** factura en `invoices` (emitida o anulada). Motivo: el `TRUNCATE ... CASCADE` arrastra `invoices → invoice_lines` por FK y **no dispara** los triggers de inmutabilidad, por lo que sin el guard podría borrar facturas (documentos contables inmutables) de forma silenciosa. El `EXISTS` sin filtro por `status` es deliberado (postura conservadora).

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
| `contract_machine_id` | UUID NOT NULL | FK → contract_machines — máquina concreta de la visita (mantenimiento granular) |
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

### Tabla: `leads`
Leads recibidos del formulario público de contacto del sitio web (`/api/contact`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `name` | text | nombre del contacto |
| `email` | text | |
| `company` | text | nullable |
| `phone` | text | nullable |
| `needs` | text | CHECK `rental` / `sales` / `management` / `maintenance` / `other` |
| `message` | text | nullable |
| `status` | text | CHECK `nouveau` / `traité` / `archivé`, default `nouveau` |
| `created_at` | timestamptz | default: now() |

> **RLS:** política `admin_all` (solo admin gestiona) con `WITH CHECK`. Permiso a `anon` revocado. El INSERT público se hace vía `service_role` desde el route handler `/api/contact`. Gestión desde la pantalla admin `/admin/leads`.

---

### Tabla: `billing_plans` (facturación, sesión 28-29)
Catálogo de tipos de facturación AMD. Migración `20260606000000_billing_plans.sql`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `name` | text | UNIQUE |
| `type` | text | CHECK `per_copy` / `hybrid` / `hybrid_tiered` / `tiered_total` |
| `fixed_fee` | numeric(10,4) | nullable (NULL en `per_copy`) |
| `price_bw` / `price_color` | numeric(10,6) | nullable (NULL en `hybrid_tiered` y `tiered_total`) |
| `tiers` | jsonb | `[{up_to, price_bw, price_color}]` (en `hybrid_tiered` y `tiered_total`) |
| `active` | boolean | default true |

> CHECK por tipo (coherencia de campos) + `CHECK >= 0` de no-negatividad. RLS `billing_plans_admin_all` (`USING + WITH CHECK` vía `is_admin()`).
> El tipo `tiered_total` se añadió en la migración `20260611210609_billing_tiered_total.sql` (amplía el CHECK de `type` en `billing_plans` y `billing_plan_versions`; añade `billing_plans_tiered_total_check` con la misma coherencia que `hybrid_tiered`). Misma estructura de datos que `hybrid_tiered`; solo cambia la aritmética (precio único al volumen total, `applyTiersTotal`).
> La misma migración añade a `contract_machines`: `billing_plan_id` (FK), `price_bw_override`, `price_color_override`, `fixed_fee_override` (todos nullable, con CHECK ≥ 0).

### Tabla: `invoices` (facturación, sesión 28-29 + Bloques E/C del core)
Cabecera de factura emitida. Migración base `20260606000100_invoices.sql`; columnas de ciclo añadidas por el Bloque E (`20260608150000`). **Inmutable en BD** salvo anulación auditada (Bloque C).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `numero_facture` | text | UNIQUE, `FACT-YYYY-NNNN` (vía `next_invoice_number()` + tabla `invoice_counters`) |
| `client_id` | **bigint** | FK → clients.id (que es BIGINT) |
| `client_name` | text | snapshot |
| `contract_id` | UUID | **Bloque E**, FK → contracts ON DELETE RESTRICT. Factura por contrato/ciclo. **NULL en facturas legacy por cliente/mes** |
| `period_year` / `period_month` | int | en facturas por ciclo, el **mes-ancla** del ciclo |
| `period_start` / `period_end` | date | **Bloque E**, periodo real del ciclo de aniversario (NULL en legacy) |
| `status` | text | CHECK `emise` / `annulee` |
| `has_estimated` | boolean | true si contiene líneas sin relevé |
| `has_replacement` | boolean | true si algún puesto consolidó un reemplazo en el periodo |
| `currency` | text | default `XOF` |
| `total_amount` | numeric(14,2) | |
| `issued_by` / `annulled_by` | UUID | FK → profiles |
| `annulation_reason` | text | nullable |

> **Índice único parcial:** `invoices_contract_cycle_emise_unique (contract_id, period_start) WHERE status='emise' AND contract_id IS NOT NULL` (no-duplicado por contrato/ciclo, Bloque E). *(El índice legacy `invoices_client_period_emise_unique` — vía por cliente — se retiró en WP-3b, migración `20260611100000`.)*
> **Inmutabilidad en BD (Bloque C, `20260609080000`):** trigger `trg_invoices_immutable` (`BEFORE UPDATE OR DELETE`, todos los roles incl. `service_role`) que **solo** permite la transición auditada `emise → annulee` tocando exclusivamente los campos de anulación; bloquea cualquier otro `UPDATE` y todo `DELETE`. La comparación OLD/NEW se hace por **diff jsonb** quitando solo `status` + campos de anulación → protege automáticamente columnas nuevas/futuras. La acción de anulación (`factures/[id]/actions.ts`) hace exactamente esa transición.

### Tabla: `invoice_lines` (facturación, sesión 28-29)
Snapshot inmutable por máquina: plan, tarifa efectiva y consumo congelados al emitir.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `invoice_id` | UUID | FK → invoices **ON DELETE RESTRICT** (Bloque C; antes CASCADE — ya no se borra una factura) |
| `contract_id` / `numero_contrat` / `machine_id` / `machine_label` | — | refs + snapshots |
| `plan_name` / `billing_type` | text | snapshot |
| `fixed_fee` / `price_bw` / `price_color` / `tiers` | — | snapshot tarifa efectiva |
| `delta_bw` / `delta_color` | int | consumo facturado |
| `is_estimated` | boolean | true si faltaba relevé |
| `amount_fixed` / `amount_bw` / `amount_color` / `amount_total` | numeric(14,2) | redondeados a entero |
| `breakdown` | jsonb | **Bloque C** (`20260609081000`): desglose por máquina del consumo consolidado cuando la línea agrupa un reemplazo (A→B→C…). NULL si no aplica |

> **RPC de emisión única** (SECURITY DEFINER, guard `service_role`, invocada con `admin.rpc`; el draft lo calcula `src/lib/invoicing.ts`, compartido con el preview):
> - **`emit_contract_invoice(p_payload)`** — flujo **activo y único** (Bloque E, por contrato/ciclo). La llama `facturation/contract-actions.ts`.
> - ~~`emit_invoice(p_payload)`~~ — flujo legacy por cliente/mes **eliminado** (WP-3, `20260610102000`, `DROP FUNCTION`).
>
> **Coherencia contable en BD (P1-1):** `emit_contract_invoice` valida **antes** de insertar — ≥1 línea, cliente/contrato existe y coincide, importes no negativos, `amount_total = fixed+bw+color` por línea, cabecera = suma de líneas; persiste `breakdown`.
> **Inmutabilidad (Bloque C):** trigger `trg_invoice_lines_immutable` → snapshot puro, ni `UPDATE` ni `DELETE`.
> Migración `20260606000300_billing_in_contract_rpcs.sql`: `create/update_contract_with_lines` persisten los campos billing por línea. `update_contract_with_lines` reescrita por el Bloque D (`20260608140100`, guard P1-4 cambio de cliente) y el Bloque C (`20260609082000`, P0-6 pertenencia de líneas al contrato).

---

### Tabla: `pending_counter_imports` (agente de contadores por email, 2026-06-12)
Cola de revisión + audit log de los contadores recibidos por email. Migración `20260612104341_counter_imports.sql`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `image_path` | text | ruta en el bucket `counter-images`. Email: `{year}/{month}/{hash}.{ext}` (1 foto). Subida manual: `manual/{year}/{month}/{docHash}.{ext}` (el **mismo PDF para todas** sus filas) |
| `image_size_bytes` | int | |
| `image_hash_sha256` | text | **UNIQUE**. Email: hash de los bytes del adjunto (idempotencia por fichero). Subida manual: hash sintético por lectura (`{docHash}:{índice}`) → único por fila; la idempotencia del documento la da el dedup por `image_path` en la acción |
| `duplicate_count` / `last_duplicate_at` | int / timestamptz | nº de reenvíos del mismo fichero + último (migración `20260614170000`) |
| `source` | text | CHECK `email` / `whatsapp` / `manual` |
| `email_from` / `email_subject` / `email_message_id` | text | metadatos del correo (nullable) |
| `extraction_model` | text | p.ej. `claude-sonnet-4-6` |
| `extraction_cost_usd` | numeric(10,6) | coste de la lectura IA |
| `extracted_data` | jsonb | `{serial, date_iso, counter_bw, counter_color, copier_*, printer_*, confidence, is_valid_counter_sheet, issues[]}` |
| `matched_machine_id` | text | FK → `machines(numero_serie)` ON DELETE SET NULL (resultado del match por serial) |
| `validation_errors` | jsonb | códigos que fallaron (`V_CONF`, `V_CROSS_BW`, `V_NONDECR_BW`, `V_NO_MATCH`, `V_DUP_MONTH`, `V_DUP_PENDING`…) |
| `light` | text | CHECK `green` / `amber` / `red` (semáforo) |
| `status` | text | CHECK `pending_review` / `confirmed` / `rejected` / `failed_extraction` |
| `imported_counter_id` | uuid | FK → `machine_counters` (poblado al confirmar) |
| `reviewed_by` / `reviewed_at` / `rejection_reason` / `notes` | — | auditoría de la revisión |

> **Bucket `counter-images`** (privado, primer uso de Storage en el repo): políticas `counter_images_service_all` (service_role) + `counter_images_admin_read` (admin vía `is_admin()`); la UI usa signed URLs TTL 1h. RLS de la tabla: `pci_admin_select`/`pci_admin_update` (admin), INSERT solo `service_role`.
> **RPCs SECURITY DEFINER (guard `service_role`):** `process_counter_extraction(p_pending_id, p_extracted)` (match por serial + validaciones de forma/datos + fija `light`/`validation_errors`; incluye `V_DUP_PENDING` = otra lectura de la misma máquina y mes aún en la cola) · `import_counter_from_pending(p_pending_id, p_reviewed_by, p_overrides)` (confirma → INSERT en `machine_counters`; respeta `machine_counters_one_active_per_month`; rechaza `no_active_line` sin contrato activo) · `register_counter_duplicate(p_hash)` (cuenta los reenvíos del mismo fichero). Detalle del flujo y estado en §"Buzón de Contadores por Email".

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
| `/admin/incidents` | `numero_incident`, `title`, `machine_id` | `client`, `status`, `priority` + toggle vista | Pre-lookup contratos por client_id → líneas `contract_machines.id` → `contract_machine_id.in.(...)` |
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
`Card`, `PanelHeader`, `Badge` (variantes solid/danger/success/warning/info/violet/neutral), `Button` (+ `buttonClasses`), `Avatar`. (El dashboard usa su propio `KpiCard` local en `DashboardKpiStrip`.)

**Componentes admin reutilizables** — `src/components/admin/`:
`MachineCombobox` — selector buscable de máquinas (Headless UI Combobox, filtra por marque/modele/numero_serie, prop `invalid` para estado de error). Usado en `ContractForm` para líneas nuevas.

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
- **Recursión infinita resuelta** mediante funciones `SECURITY DEFINER`: `auth_tech_incident_ids`, `auth_tech_incident_contract_ids` (reescrita: deriva vía `contract_machine_id`), `auth_tech_incident_machine_ids`, `auth_tech_assigned_client_ids` (reescrita: deriva vía `contract_machine_id`), `auth_client_contract_ids`, `auth_client_machine_ids`. Las dos reescritas ya no usan `incidents.contract_id` (columna eliminada).
- **Aislamiento RLS de `maintenance_visits` (2026-06-11):** antes `tech_read_visits`/`tech_update_visits` filtraban solo por rol → cualquier técnico veía/editaba las visitas de otro. Ahora un técnico ve "las suyas + las de sus máquinas" vía la función `auth_tech_visit_ids()` (`assigned_to = él` OR `contract_machine_id` de una máquina en `auth_tech_assigned_machine_ids()`). `admin_all_visits` intacta. Migración `20260611150000`.
- **`auth_rls_initplan` + índice (2026-06-11):** las ~19 policies que llamaban `auth.uid()` por fila reescritas a `(SELECT auth.uid())` (se evalúa una vez por query) preservando la semántica exacta; advisor `auth_rls_initplan` = 0 en toda la BD. Nuevo índice `incidents_assigned_to_idx` (columna por la que filtran todas las queries del técnico y su RLS). Migración `20260611140000`.
- **RPCs SECURITY DEFINER de contratos/mantenimiento** (todas con guard `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION`):
  - `create_contract_with_lines(payload jsonb)` — crea contrato + sus N líneas `contract_machines` atómicamente
  - `update_contract_with_lines(p_contract_id uuid, payload jsonb)` — actualiza contrato y reconcilia sus líneas
  - `delete_contract(p_contract_id uuid)` — borrado atómico: comprueba dependencias (incidencias/relevés/mantenimiento) y borra en una sola transacción con `FOR UPDATE` (P2-4, reemplaza al antiguo `can_delete_contract` + DELETE separados que tenían ventana TOCTOU). Devuelve `{deleted}` o el desglose de dependencias. Migración `20260611120000`.
  - `terminate_contract(p_payload jsonb)` — terminación de contrato: en una transacción cierra TODAS las líneas abiertas exigiendo la lectura final del contador de cada máquina (misma validación que `return_machine_to_stock`: `end >= max(último relevé activo, start_counter)`), marca el contrato `terminé`, devuelve las máquinas al stock y borra las visitas de mantenimiento futuras no realizadas. Exige que el payload cubra todas las líneas abiertas (`lines_mismatch`). UI: `TerminateContractModal` + sección "Clôture du contrat" en `/admin/contracts/[id]`. Migración `20260611160000`.
  - `close_maintenance_visit(...)` — cierre atómico e idempotente de visita (marca `fait`, inserta piezas, programa siguiente)
  - **Eliminadas (Fase 4, modelo viejo, 0 usos):** `create_client_with_contract`, `create_machine_with_contract`
- **`profiles` — protección de columnas privilegiadas (2026-06-10):** `authenticated` solo puede hacer `UPDATE` de `(full_name, phone)`; el `GRANT UPDATE` a nivel tabla está revocado y un trigger `BEFORE UPDATE` rechaza cualquier cambio de `role`/`is_dispatcher` salvo `service_role`. Cierra la escalada a admin vía `PATCH /rest/v1/profiles`.
- **`client_profiles` — sin auto-vinculación (2026-06-10):** revocado el `INSERT` directo a `authenticated` y eliminada la policy `client_own_profile_insert`. La única vía de vincular un usuario a un cliente es la verificación de contrato+email (`portal/verify`), que hace el upsert con `service_role`. Cierra el acceso cross-tenant.
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca expuesto al cliente
- **`machine_counters`** accesible únicamente por admins — datos de facturación
- **Rate limiting** con Upstash Redis (sliding window) en endpoints públicos: login (5/15m por IP+email), signup (3/h por IP), verify contrato (10/h por IP+user), CSAT (5/h por IP+token), contact API (3/h por IP), **formulario público QR (2/h · 5/24h por `IP:serie`)**. Helper centralizado en `src/lib/rate-limit.ts`, con **dos comportamientos distintos que conviene no confundir**:

  - **Sin credenciales de Upstash** (`UPSTASH_REDIS_REST_URL`/`TOKEN` ausentes) → **fail-CLOSED en producción real** (WP-7): deniega, en vez de dejar pasar todo en silencio. Se evalúa con `VERCEL_ENV === 'production'` (no `NODE_ENV`, que vale `'production'` también en los previews de Vercel) → previews/dev quedan permisivos.
  - **Con credenciales pero backend caído** (host borrado, sin red, timeout) → **fail-OPEN**: permite la petición y registra el error (PR #128, 2026-09-14). Es deliberado: ese día la base gratuita de Upstash se borró por inactividad, `limiter.limit()` empezó a lanzar y la Server Action de login reventaba con un 500 — **nadie podía entrar en la aplicación**, ni con la contraseña correcta; solo seguían dentro quienes ya tenían sesión. Un limitador caído no puede dejar a la empresa fuera de su propia app.

  🔴 **ESTADO REAL (sigue así a 2026-09-17): no hay rate limiting efectivo.** Las variables siguen definidas en Vercel pero apuntan a una base que ya no existe, así que **todos** los endpoints públicos caen en la segunda rama y se permiten. La única protección contra fuerza bruta en el login es hoy la que aplica Supabase Auth por su cuenta. Rehacer el limitador está pendiente en `docs/pendientes.md`.

### Robustez de errores en UI (2026-06-10) — WP-5 / WP-5b

- **WP-5 (P2-1):** envío/descarga de facturas abortan ante fallo técnico de lectura de `invoice_lines` (nunca un documento sin líneas). Ver §Módulo de Facturación.
- **WP-5b (P2-4):** las páginas de `/admin` que cargan datos comprueban el `error` de sus queries y **lanzan** (`throw new Error('DATA_FETCH_ERROR')`) ante un fallo TÉCNICO de Supabase, en vez de renderizar una tabla vacía indistinguible de "no hay registros" (o, en `team`, crashear crudo con `users.map` sobre `undefined`). Cubre los listados (clients, contracts, machines, incidents, leads, factures, billing-plans, maintenance, princity, contadores, calendrier, team) y el **detalle de contrato** (`contracts/[id]`: selects vacíos por error de BD podrían llevar a guardar el cliente/máquina/plan equivocado). Un **error boundary** de segmento (`src/app/admin/error.tsx`, `'use client'`) muestra "Erreur technique / Réessayer" conservando el chrome del back-office (el boundary re-lanza `NEXT_REDIRECT`/`notFound`, así que no interfiere con auth ni 404). El módulo de **facturación** mantiene su patrón propio `BillingDataError` (capturado inline en su page para mostrar el bloqueo sin subir al boundary).

### Auditoría de seguridad — Higiene de config (2026-06-10) — WP-7

| # | Severidad | Descripción | Fix |
|---|---|---|---|
| 1 | P2 | Rate limiting *fail-open*: si faltaban las credenciales de Upstash en producción, `checkRateLimit` dejaba pasar todo en silencio. | Fail-closed en producción real (`VERCEL_ENV === 'production'`, no `NODE_ENV` — que también es `'production'` en previews); permisivo en preview/dev. `src/lib/rate-limit.ts` |
| 2 | P2 | `gate-backup-*.json` con PII (clientes, NINEA, teléfonos) no estaba en `.gitignore`. | `.gitignore`: `gate-backup-*.json` / `*backup*.json` + `.claude/worktrees/`; el backup se movió fuera del árbol del repo. |
| 3 | P2 | CSRF de `/api/contact` eludible (`origin.includes(host)`, y sin `Origin` se saltaba). | Exige `Origin` y `new URL(origin).host === host`. |
| 4 | P3 | Email de notificación SAV hardcodeado (`savamdservice@gmail.com`) en `signaler/[serie]/actions.ts`. | Variable de entorno `SAV_NOTIFY_EMAIL` (con fallback al valor anterior). |
| 5 | P3 | Dependencia `resend` en `package.json` sin uso (los emails van por Edge Function). | Eliminada de `package.json` + lock. |

### Auditoría de seguridad — Infra/RLS (2026-06-10) — WP-1

Hallazgos P0 confirmados con SQL real contra producción y corregidos en el PR WP-1 (migraciones aún por aplicar en el momento de redactar).

| # | Severidad | Descripción | Fix |
|---|---|---|---|
| 1 | P0 CRÍTICO | Escalada a admin: `authenticated` tenía `GRANT UPDATE` sobre todas las columnas de `profiles` (incl. `role`, `is_dispatcher`); la policy solo restringía la fila. Un usuario podía `PATCH /rest/v1/profiles` con `{"role":"admin"}`. | `REVOKE UPDATE` + `GRANT UPDATE (full_name, phone)` + trigger anti-escalada. Migración `secure_profiles_role` |
| 2 | P0 CRÍTICO | Cross-tenant: la policy de INSERT de `client_profiles` solo validaba `profile_id`, no `client_id` → auto-vinculación a cualquier empresa saltándose `verifyContractAction`. | DROP policy INSERT + REVOKE; vinculación solo vía `service_role` en `portal/verify`. Migración `secure_client_profiles_insert` |
| 3 | P0 CRÍTICO | `wipe_data_tables` borraba facturas vía `TRUNCATE … CASCADE` (no dispara triggers de inmutabilidad). | Guard que aborta si existe cualquier factura. Migración `wipe_guard_invoices` |

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
| `UPSTASH_REDIS_REST_URL` | URL REST de la base Upstash Redis para rate limiting. ⚠️ Definir en **Production y Preview** (con fail-closed por `VERCEL_ENV`, en prod real su ausencia deniega los endpoints públicos). |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de la base Upstash Redis para rate limiting (ver nota arriba). |
| `SAV_NOTIFY_EMAIL` | Destino de la notificación de incidencia pública (`/signaler`). Fallback `savamdservice@gmail.com` si no se define. (WP-7) |
| `COMMERCIAL_EMAIL` | Destino de la notificación de lead del formulario de contacto. |

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
- **Clientes Supabase tipados (`<Database>`)**: `createAdminClient()` y `createClient()` (server) están parametrizados con el tipo `Database` de `src/lib/supabase/types.ts`, así que las queries devuelven tipos reales (columnas, joins to-one, enums). Regenerar `types.ts` tras CUALQUIER cambio de schema con `supabase gen types` / MCP `generate_typescript_types`; un `types.ts` desactualizado tipa contra una realidad falsa. Patrones de cast aún legítimos y por qué: (1) `as unknown as Json` para payloads `jsonb` de RPC (objeto nominal serializable, no satisface `Json` sin index signature); (2) `as any` en `.insert()` de `incidents` (la columna `numero_incident` la rellena un trigger pero el tipo generado la exige); (3) joins con **FK-hint** (`clients!client_id(...)`) el generador los infiere inconsistentemente como array → cast al shape real; (4) campos de dominio guardados como `text` con CHECK (ej. `billing_plans.type`, `maintenance_frequency`) → cast a la unión literal, justificado por el constraint. Los joins to-one normales (`clients(...)`, `machines(...)`) ya NO necesitan cast.
- NO pasar Client Components como `React.ReactNode` props a otros Client Components
- Recharts solo en Client Components (`'use client'`)
- `formData.get('campo')` devuelve `null` si vacío → usar `?? ''` antes de `.trim()`
- Auth check en Server Actions: `await requireAdmin()` o `await requireTechnician()` desde `@/lib/auth` — devuelven `{ user, profile, supabase }`
- Validación de enums en Server Actions: `parseEnum(formData.get('x'), ENUM_CONST)` desde `@/lib/enums` — devuelve el valor tipado o `null`
- Rate limiting en endpoints públicos: `checkRateLimit('login', identifier)` desde `@/lib/rate-limit` antes de cualquier procesamiento. IP del cliente: `getClientIp()` en Server Actions, `getClientIpFromHeaders(req.headers)` en route handlers

---

## Testing (3 capas)

Montadas en 2026-06-11 (cierra el plan de tests de `docs/pendientes.md` §1). Cada capa tiene su comando y, las de integración, su propio job de CI que levanta un **Supabase local efímero (Docker)** — separados del CI normal porque éste no tiene Supabase.

- **Unit (vitest)** — `npm test`. Lógica pura en `src/lib` (`billing`, `invoicing`, `counters`, `qr`, `incident`). `include: src/**/*.test.ts`. Corre en el CI normal (`ci.yml`: typecheck + test + build).
- **Aislamiento RLS (vitest + Supabase local)** — `npm run test:rls` (config `vitest.rls.config.ts`, `tests/rls/`). **Cobertura completa (88 tests, PR #93):** parque (machines/contracts/contract_machines/clients/machine_counters), facturación (invoices/invoice_lines/billing_plans), mantenimiento (visits/plans), perfiles (visibilidad + escalada de privilegios bloqueada) y tablas internas admin-only (leads, princity_*, pending_counter_imports, csat_responses). Aislamiento de `incident_photos` por rol (cliente dueño / técnico asignado / ajenos) en `tests/rls/incident-photos-isolation.test.ts`. Job `.github/workflows/rls.yml`: `supabase start` → **grant a `service_role` Y `authenticated`** (replica los default privileges de prod; sin el grant a `authenticated`, las tablas nuevas darían 0 filas por permiso denegado en vez de por RLS) + re-aplica la restricción de columna de `profiles` → tests firmando como cada rol. Escenario base reutilizable en `tests/rls/scenario.ts` (2 clientes + 2 técnicos + admin); aserción anti-falso-verde `expectEmpty` en `tests/rls/assert.ts` (exige `error===null` + 0 filas; vive aparte de `helpers.ts` porque éste lo reutiliza Playwright, que no corre bajo vitest). Helpers en `tests/rls/helpers.ts` (crear usuarios por rol, sign-in, fixtures, cleanup `*.test`).
- **E2E (Playwright + app + Supabase local)** — `npm run test:e2e` (`playwright.config.ts`, `tests/e2e/`). Job `.github/workflows/e2e.yml`: `supabase start` → grants a los 3 roles → `build`+`start` → Chromium. Specs: login por rol + recorrido SAV (admin asigna → `assigné` → técnico ve en `/tech` → `/tech/scan/<serie>` → `en_cours` + `incident_history`). Reutiliza los helpers de RLS.
- **Notas de reproducibilidad (aprendidas al montar los tests):** (1) la cadena de migraciones **ahora sí se reconstruye desde cero** — se arregló un `REVOKE` sobre funciones legacy inexistentes (`20260508182457`, con `to_regprocedure` condicional) que abortaba `db reset` (cerró de verdad el P0-1, que estaba mal dado por resuelto). (2) El Postgres local del CLI no reproduce las **default privileges** de Supabase → los jobs otorgan grants explícitos (RLS solo `service_role`; E2E los 3 roles, porque los **embeddings de PostgREST** como `/tech/incidents` necesitan `GRANT SELECT` a `authenticated`). El aislamiento lo garantizan las RLS policies, no estos grants.

---

## Roadmap

### Auditoría técnica post-refactor ✅ COMPLETADA (2026-06-04/05)
Seis entregas en producción tras el refactor de contratos N máquinas (PR #23):
- [x] **Fase 1 — hotfixes de BD** (PR #25): índices de rendimiento. Migración `20260603210000_fase1_indices`
- [x] **Fase 2 — RPCs atómicas de contratos** (PR #26): `create_contract_with_lines`, `update_contract_with_lines` (SECURITY DEFINER, guard service_role). Migración `20260604120000_fase2_rpcs_contratos`. *(El antiguo `can_delete_contract` fue reemplazado por `delete_contract` atómico y eliminado — migración `20260611130000`.)*
- [x] **Fase 3 — mantenimiento granular por máquina** (PR #27): `maintenance_visits.contract_machine_id`; una visita por línea activa del contrato; auto-programación por máquina con frecuencia override. Migración `20260604130000_fase3_maintenance_granular`
- [x] **Hotfix cierre de mantenimiento** (PR #28): RPC `close_maintenance_visit` atómica e idempotente. Migración `20260604140000_close_maintenance_visit_rpc`
- [x] **Formulario de contacto + leads** (PR #29): tabla `leads` + route handler `/api/contact` (persiste lead + notifica a `COMMERCIAL_EMAIL`) + pantalla admin `/admin/leads`. Migraciones `20260604150000_leads` y `20260604160000_leads_permissions_hardening`
- [x] **Fase 4 — cleanup legacy** (PR #30 + DROP + hotfix atelier PR #31): DROP de `contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id` + FK; eliminadas `create_client_with_contract` y `create_machine_with_contract`; reescritas `auth_tech_incident_contract_ids` y `auth_tech_assigned_client_ids` para derivar vía `contract_machine_id`. Migración `20260605000000_cleanup_legacy_contracts`

> **Nota sobre timestamps de migración:** los timestamps de los archivos de migración difieren de los `version` registrados en la BD por el MCP — es el comportamiento establecido del proyecto.

### Fase 1 — SAV ✅ COMPLETADO
- [x] Schema de BD (13 tablas + RLS)
- [x] Auth (email/password, redirección por rol, proxy `src/proxy.ts`)
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

### Mejoras formulario de contratos ✅ (sesión 27, 2026-06-05) — PRs #32 y #33
- [x] **PR #32** — `MachineCombobox`: selector buscable en tiempo real con `@headlessui/react`. Filtra por marca, modelo o serial. Prop `invalid` muestra borde rojo al enviar vacío. Reset de query al cerrar sin seleccionar. Validación por línea añadida a `updateContractAction`.
- [x] **PR #33** — Hint Princity en selector de cliente: al seleccionar un cliente muestra su ID Princity y el sufijo sugerido para el número de contrato. Fix bug preexistente: edición de contrato con cliente inactivo ya no sobreescribe el `client_id` con el primero de la lista.

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
- [x] Operativo: cuentas reales creadas (2026-05-26) — Abdoul Marena, Mamadou Lamine, Ousmane Diop, Ousmane Sy + Atelier (dispatcher)

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
