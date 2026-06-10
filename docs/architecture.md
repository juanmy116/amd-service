# AMD Service — Arquitectura del Proyecto SAV

> Documento de referencia técnica. Actualizar cada vez que se haga un cambio estructural.
> Última actualización: 2026-06-09 — **core de facturación reconstruido, desplegado en prod y validado por gate E2E (GO)**. PRs #39–#50. Ver §Gate final y `docs/gate-final-facturacion-2026-06-08.md`.

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
- **Formulario de contratos** (`/admin/contracts/new` + `/admin/contracts/[id]`): selector de máquinas buscable en tiempo real (`MachineCombobox` con `@headlessui/react`) — filtra por marca, modelo o serial. Al seleccionar cliente muestra su ID Princity y el sufijo sugerido para el número de contrato (ej. `-007` para ID Princity `7`). Fix: edición de contrato con cliente inactivo siempre incluye ese cliente en la lista para no sobreescribir el `client_id`.
- Gestión y asignación de incidencias (Kanban drag & drop)
- Generación de QR por máquina (etiqueta imprimible con logo, datos y código QR)
- Módulo de contadores de copias agrupado por cliente
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
   - Lookup `machines` (verifica existencia)
   - INSERT en `incidents` con `opened_by=null`, `source='public'`, `machine_id` directo, campos de contacto
   - Email de notificación al equipo SAV (destino en la env var `SAV_NOTIFY_EMAIL`, fallback `savamdservice@gmail.com`; template `raw` via Resend, contenido HTML escapado)
5. Estado de éxito: mensaje de agradecimiento + número de referencia `SAV-YYYY-NNNN`

**Seguridad:** datos del reporter anónimo (`contact_name/phone/email`) son visibles solo en el detalle de admin. El portal del cliente los excluye con filtro `.or('source.is.null,source.neq.public')` en listado y detalle. Las incidencias públicas se vinculan por `machine_id` directo (sin `contract_machine_id`).

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

### 11. Dashboard Atelier (`/atelier`) ✅
- Kiosko de taller a pantalla completa para una TV de 32" conectada a una Raspberry Pi 3 — tema oscuro «centro de mando», auto-refresco cada 30 s
- Muestra todas las incidencias en Kanban (drag & drop = cambia estado) + mini-tablero de mantenimientos lun–vie + 4 tarjetas KPI
- Cuenta especial «Atelier»: rol `technician` + flag `profiles.is_dispatcher` → un *dispatcher* puede asignar incidencias y visitas de mantenimiento a los técnicos sin ser admin
- Las Server Actions de despacho validan `admin OR is_dispatcher` y escriben vía `createAdminClient()`; el middleware protege `/atelier` y `/dashboard` redirige ahí a los dispatchers

### 12. Sistema de Facturación (`/admin/billing-plans`, `/admin/facturation`, `/admin/factures`) ✅ — sesión 28-29 (núcleo Tasks 1-11)

Emisor de **facturas inmutables**, a partir del consumo real de contadores. Tres pantallas + un export. Tras el rediseño del core (Bloques A–E + 0/C, 2026-06-09), el flujo activo factura **por contrato y ciclo de aniversario** (regla 9); el detalle por bloque está en §Jerarquía de Datos (Bloques A/B/D/E/C/0). Esta sección resume la capa de aplicación.

- **Catálogo de planes** (`/admin/billing-plans`): CRUD de `billing_plans`. 3 tipos:
  - `per_copy` — solo precio por copia B&N + color.
  - `hybrid` — forfait fijo mensual + precio por copia.
  - `hybrid_tiered` — forfait fijo + precio por copia degresivo por tramos (`tiers` JSONB, validados crecientes en `validateTiers`).
  - No se borran (solo activar/desactivar). No se puede cambiar el `type` si el plan ya está asignado a alguna máquina (las facturas emitidas no se afectan por ser snapshot, pero el preview futuro sí).
- **Asignación por máquina**: cada línea `contract_machines` referencia un `billing_plan_id` + overrides opcionales (`price_bw_override`, `price_color_override`, `fixed_fee_override`). Se editan en `ContractForm` (selector + campos filtrados por tipo de plan) y se persisten vía las RPC `create/update_contract_with_lines` (que ahora incluyen estos campos).
- **Preview por contrato/ciclo** (`/admin/facturation`): selector de contrato + mes-ancla. `buildContractInvoiceDraft` (en `src/lib/invoicing.ts`) deriva el ciclo de aniversario del `billing_day` del contrato y calcula el consumo de cada línea con `computeLineConsumptionCycle`, cruzándolo con la tarifa **vigente al inicio del ciclo** (`resolveEffectiveTariffAsOf`). La lectura final del ciclo es el `end_counter` de la línea (si se cerró por reemplazo dentro del ciclo) o el relevé activo más reciente dentro del ciclo; la inicial es el `start_counter` (si la línea nació en el ciclo) o el relevé previo más reciente. Máquinas sin punto de lectura → línea `is_estimated` (forfait sí, consumo 0). *(La vía mensual por cliente — `buildClientInvoiceDraft` — fue eliminada en WP-3.)*
- **Aritmética del consumo — fuente única, política por caller (decisión consciente).** La resta `final − inicial` (con guard de null) vive en una sola primitiva `counterDelta(final, initial)` de `src/lib/counters.ts`, usada **tanto** por la facturación (`computeLineConsumption`) **como** por la pantalla de Contadores (`calcDeltas`). Lo que diverge a propósito es la **selección de puntos** (Contadores empareja relevés consecutivos por máquina; facturación combina relevés normales con `start_counter`/`end_counter` de la línea) y la **política sobre el resultado** (Contadores muestra el delta tal cual, negativos incluidos, como anomalía visible; facturación trata null/negativo como `is_estimated` → solo forfait). **Invariante: para una línea sin reemplazo ambos caminos deben dar el mismo número** — protegido por `src/lib/invoicing.test.ts` (vitest, `npm test`).
- **Emisión** (RPC transaccional SECURITY DEFINER): flujo **único** `emit_contract_invoice` (por contrato/ciclo). La RPC legacy `emit_invoice` por cliente/mes fue **eliminada** (WP-3, `DROP FUNCTION`, migración `20260610102000`) para descartar el riesgo de doble facturación. Numera (`FACT-YYYY-NNNN` vía `next_invoice_number()`/`invoice_counters`), inserta cabecera + líneas en una transacción. Bloquea doble emisión (índices únicos parciales `WHERE status='emise'`). Líneas estimadas → confirmación explícita del admin. **Coherencia contable validada en BD antes de insertar (P1-1)** y **factura inmutable por trigger** (Bloque C): el snapshot de plan/tarifas/deltas no se puede alterar ni borrar, solo anular (`emise → annulee`).
- **Vista de facturas** (`/admin/factures` + `/admin/factures/[id]`): lista + detalle de solo lectura. Acciones: descargar hoja `.xlsx`, enviar por email a los admins, anular (con motivo; no se edita, se anula y se reemite).
- **Export `.xlsx`** (`src/lib/invoice-xlsx.ts`, ExcelJS): hoja interna AMD con fórmulas verificables (`D+ROUND(E*F,0)+ROUND(G*H,0)` para planos; literal para tiered). Route handler `/admin/factures/[id]/xlsx` (`runtime='nodejs'`) para descarga; `emailInvoiceAction` la adjunta vía `send-email` a `BILLING_NOTIFY_EMAILS`. **WP-5 (P2-1):** ambos comprueban el `error` de la query de `invoice_lines` y abortan (envío/descarga) ante fallo técnico o factura sin líneas — nunca se genera un documento con cabecera+total pero sin líneas.
- **Moneda:** FCFA (`XOF`), redondeo a entero por línea. **`clients.id` es BIGINT** → `invoices.client_id` es BIGINT.
- **Reemplazo de máquina a mitad de mes** ("puesto de servicio"): botón "Remplacer la machine" en el contrato → RPC transaccional `replace_contract_machine(p_payload jsonb)` (SECURITY DEFINER, service_role). Cierra la línea saliente (`date_fin` + `end_counter_bw/color`), abre la entrante encadenada vía `replaces_contract_machine_id` (con `start_counter_bw/color`, heredando plan + overrides del puesto). **Los contadores de inicio/cierre del reemplazo viven en columnas de `contract_machines`** (`start_counter_*`/`end_counter_*`), NO como filas de `machine_counters` — para no violar el índice único parcial `machine_counters_one_active_per_month`. La factura **consolida las líneas encadenadas (A→B→C…) en un único puesto**: un solo forfait, tramos sobre el consumo combinado, con `breakdown` por máquina y `has_replacement=true`.

> Estado: **core de facturación reconstruido, desplegado en prod y validado (2026-06-09)**. Núcleo (PR #34/#35/#36) + rediseño completo: Bloques A–E del motor (PRs #40–45), Bloque 0 soporte (#39), Bloque C soporte (#46), **P1-5 vigencia de tarifas (#48)**. Las **11 migraciones desplegadas a la BD viva** (reconciliación previa del historial git↔BD vía `supabase migration repair` + `db push`). **Gate final E2E PASADO (GO)** — ver §Gate final. ⚠️ **Pendiente operativo (no código):** hoy hay **0 contratos reales**; cargar los contratos reales (máquinas desde stock con su lectura, plan, `billing_day`) antes de emitir la primera factura real. Acción manual aparte: definir `BILLING_NOTIFY_EMAILS` en `.env.local` y Vercel (sin ella el botón "Envoyer par email" falla de forma controlada; el resto funciona).

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
- **Overrides por línea**: `billing_day_override` y `maintenance_frequency_override` anulan el valor por defecto del contrato para esa máquina concreta. Los helpers `resolveBillingDay()` y `resolveMaintenanceFrequency()` en `src/lib/contract-machines.ts` aplican la lógica override→fallback.
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

**El stock es la frontera entre clientes** (regla de negocio): una máquina nunca pasa directa de un cliente a otro; siempre Cliente A → stock → Cliente B. Dos eventos del ciclo de vida, vía RPC atómica (`SECURITY DEFINER`, `service_role`), con Server Actions en `src/app/admin/contracts/[id]/stock-actions.ts`:

- **`return_machine_to_stock(p_payload)`** — motivo (a) resiliación: cierra la línea con su `end_counter_bw/color` **real** (lectura al retirar) + `date_fin` + `statut='terminé'`. La máquina queda en stock; no factura mientras lo está. Valida que el cierre no sea inferior a la mayor lectura conocida. **No encadena** (`replaces_contract_machine_id` queda NULL en cualquier futura asignación).
- **`assign_machine_from_stock(p_payload)`** — rotación de parque (cliente nuevo): la máquina debe estar en stock; **exige `start_counter_bw/color` real** (puede no ser 0: copias de prueba del taller) y abre una línea **nueva NO encadenada**. Es un alquiler independiente, no un reemplazo.

Diferencia clave con el **reemplazo** (`replace_contract_machine`, motivo (b) reparación en taller): el reemplazo **sí encadena** el puesto (`replaces_contract_machine_id`) y consolida en una sola línea de factura; la rotación de parque **no**. Como los puntos de corte (`start_counter`/`end_counter`) viven en `contract_machines` y no en `machine_counters`, una rotación A→stock→B **dentro del mismo mes** no colisiona con el índice `machine_counters_one_active_per_month`, y cada cliente factura su tramo sin cruzar el historial del otro (tests en `src/lib/invoicing.test.ts`, describe «Bloque A»).

### Motor de facturación por línea (Bloque B del core, 2026-06-08)

`buildClientInvoiceDraft` (`src/lib/invoicing.ts`) factura **por línea/contrato**, no por máquina física:

- **Atribución por contrato (P0-3)**: los relevés de `machine_counters` se cargan con su `contract_id` y se reparten a cada línea con `countersForLine()`: una línea solo ve los relevés de **su** `contract_id` (o heredados sin atribuir cuyo día cae en su intervalo de vigencia). Una misma máquina que rotó por varios contratos ya no mezcla consumos. Tanto Princity como la entrada manual de contadores rellenan `contract_id`/`client_id` desde la línea abierta.
- **Bloqueo por fallo técnico (P0-7)**: cada query comprueba su `error`; un fallo de lectura lanza `BillingDataError` y **bloquea preview y emisión** (la página muestra un «Blocage technique»), en vez de degradar a líneas estimadas con consumo 0. Es un estado **distinto** de "falta el dato real".
- **Punto inicial explícito (P0-4)**: `create_contract_with_lines` persiste `start_counter_bw/color` por línea (migración `20260608130000`), para que el primer mes de una máquina nueva facture desde su lectura inicial y no se pierda el consumo. Añadir una máquina a un contrato existente desde stock usa `assign_machine_from_stock` (Bloque A), que ya exige la lectura. `ContractForm` por sí solo no captura `start_counter` al crear una línea nueva; sin él, el primer mes queda estimado (visible), nunca pérdida silenciosa.
- **«Forcer la facturation» (regla 8)**: cuando falta legítimamente el relevé de algún equipo, el admin puede forzar la emisión (`confirm_estimated`); esas líneas se facturan al forfait, marcadas `is_estimated` (traza en la factura). Es una acción **intencional de admin**, distinta del bloqueo técnico (P0-7), que no se puede forzar.
- **Reasignación intra-mes (P1-3)**: resuelta por los cortes en la línea (Bloque A) + la atribución por contrato; el índice `machine_counters_one_active_per_month` se mantiene a propósito (los cortes no son filas de `machine_counters`).

### Reglas temporales y de negocio (Bloque D del core, 2026-06-08)

- **Estados contrato/línea (P1-6)** — `isLineBillable()` en `src/lib/invoicing.ts`, usado por `buildClientInvoiceDraft` y `listBillableClients`: una línea/contrato `suspendu` **no factura** (servicio pausado). `terminé` **no** se filtra por statut — lo gobierna `date_fin` (factura el mes de cierre de una retirada/reemplazo y se excluye después, preservando H-D6). Caso borde: un contrato `terminé` con una línea aún abierta (`date_fin IS NULL`) excluye esa línea huérfana para no facturar sin fin.
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
  - El draft mensual por cliente (`buildClientInvoiceDraft`) **sigue intacto** (función legacy; la UI ya no la usa tras E2).
- **E2 (persistencia + UI):**
  - Migración `20260608150000`: `invoices` gana `contract_id`, `period_start`, `period_end` (DATE, **aditivos**, no rompen facturas legacy ni el flujo viejo) + índice único `(contract_id, period_start) WHERE emise`. RPC **nueva** `emit_contract_invoice` (paralela a `emit_invoice`, **no lo toca** → cero colisión con el Bloque C), que **nace con la validación de coherencia contable (P1-1)**: contrato existe y cliente coincide, ≥1 línea, `amount_total = componentes` por línea, cabecera = suma de líneas, sin negativos, no-duplicado por contrato/ciclo.
  - Server Action `src/app/admin/facturation/contract-actions.ts` (`emitContractInvoiceAction`). Incluye validación P2-3 de entrada. **Manejo de errores (WP-4):** devuelve `{ error }` (patrón `useActionState`) en vez de `throw` — los `throw` en Server Actions invocadas por `<form>` quedan enmascarados por Next.js en producción; `ContractInvoicePreview` muestra el mensaje al admin. El `redirect` en éxito queda fuera de `try/catch`.
  - UI: `facturation/page.tsx` migrada a **selector de contrato** (`listBillableContracts` + `buildContractInvoiceDraft`); nuevo componente `ContractInvoicePreview` (muestra el rango del ciclo + jour de facturation, botón «Forcer la facturation», bloqueo técnico P0-7). El detalle de factura muestra el rango del ciclo si existe.
  - `billing_day_override` por máquina **deja de regir el ciclo** (el ciclo es por contrato vía `contracts.billing_day`): queda como día de captura, no de ciclo.
  - **Índice legacy restringido**: `invoices_client_period_emise_unique` se recrea con `WHERE status='emise' AND contract_id IS NULL`. Sin esto, dos contratos del mismo cliente anclados al mismo mes compartirían la terna `(client_id, period_year, period_month)` → `unique_violation` al emitir el segundo (B2B con varios contratos por cliente). El no-duplicado por contrato lo cubre `invoices_contract_cycle_emise_unique (contract_id, period_start)` + el `EXISTS` de la RPC. **Gate final debe cubrir:** «cliente con 2 contratos, mismo mes-ancla, ambos emitidos → sin colisión».

> **Limpieza realizada (WP-3, 2026-06-10):** retirado el flujo legacy por cliente —`buildClientInvoiceDraft`, `listBillableClients`, `emitInvoiceAction`, `FacturationPreview`, el tipo `ClientDraft`— y `DROP FUNCTION emit_invoice` (migración `20260610102000`). La emisión vigente es **solo** `emit_contract_invoice` (por contrato/ciclo). Motivo: la unicidad legacy `(client_id, year, month)` y la de ciclo `(contract_id, period_start)` no se solapaban → riesgo de **doble facturación** del mismo consumo. La función `computeLineConsumption` (variante mensual) se conserva temporalmente solo por cobertura de tests de escenarios stock/reemplazo; su retirada está agendada (WP-3b) junto con portar esa cobertura a `computeLineConsumptionCycle`.

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
  → INSERT incidents (source='public', opened_by=null, machine_id directo)
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
| `type` | text | CHECK `per_copy` / `hybrid` / `hybrid_tiered` |
| `fixed_fee` | numeric(10,4) | nullable (NULL en `per_copy`) |
| `price_bw` / `price_color` | numeric(10,6) | nullable (NULL en `hybrid_tiered`) |
| `tiers` | jsonb | `[{up_to, price_bw, price_color}]` (solo `hybrid_tiered`) |
| `active` | boolean | default true |

> CHECK por tipo (coherencia de campos) + `CHECK >= 0` de no-negatividad. RLS `billing_plans_admin_all` (`USING + WITH CHECK` vía `is_admin()`).
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

> **Índices únicos parciales:** `invoices_contract_cycle_emise_unique (contract_id, period_start) WHERE status='emise' AND contract_id IS NOT NULL` (no-duplicado por contrato/ciclo, Bloque E) y `invoices_client_period_emise_unique (client_id, period_year, period_month) WHERE status='emise' AND contract_id IS NULL` (restringido al flujo legacy por cliente — Bloque E; sin esta restricción dos contratos del mismo cliente anclados al mismo mes colisionarían).
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
- **RPCs SECURITY DEFINER de contratos/mantenimiento** (todas con guard `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION`):
  - `create_contract_with_lines(payload jsonb)` — crea contrato + sus N líneas `contract_machines` atómicamente
  - `update_contract_with_lines(p_contract_id uuid, payload jsonb)` — actualiza contrato y reconcilia sus líneas
  - `can_delete_contract(p_contract_id uuid)` — comprueba si un contrato puede borrarse (sin dependencias)
  - `close_maintenance_visit(...)` — cierre atómico e idempotente de visita (marca `fait`, inserta piezas, programa siguiente)
  - **Eliminadas (Fase 4, modelo viejo, 0 usos):** `create_client_with_contract`, `create_machine_with_contract`
- **`profiles` — protección de columnas privilegiadas (2026-06-10):** `authenticated` solo puede hacer `UPDATE` de `(full_name, phone)`; el `GRANT UPDATE` a nivel tabla está revocado y un trigger `BEFORE UPDATE` rechaza cualquier cambio de `role`/`is_dispatcher` salvo `service_role`. Cierra la escalada a admin vía `PATCH /rest/v1/profiles`.
- **`client_profiles` — sin auto-vinculación (2026-06-10):** revocado el `INSERT` directo a `authenticated` y eliminada la policy `client_own_profile_insert`. La única vía de vincular un usuario a un cliente es la verificación de contrato+email (`portal/verify`), que hace el upsert con `service_role`. Cierra el acceso cross-tenant.
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca expuesto al cliente
- **`machine_counters`** accesible únicamente por admins — datos de facturación
- **Rate limiting** con Upstash Redis (sliding window) en endpoints públicos: login (5/15m por IP+email), signup (3/h por IP), verify contrato (10/h por IP+user), CSAT (5/h por IP+token), contact API (3/h por IP), **formulario público QR (2/h · 5/24h por `IP:serie`)**. Helper centralizado en `src/lib/rate-limit.ts`. **Fail-CLOSED en producción real** (WP-7): si faltan las credenciales de Upstash, deniega (no deja pasar todo en silencio). Se evalúa con `VERCEL_ENV === 'production'` (no `NODE_ENV`, que vale `'production'` también en los previews de Vercel) → previews/dev quedan permisivos.

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
- NO pasar Client Components como `React.ReactNode` props a otros Client Components
- Recharts solo en Client Components (`'use client'`)
- `formData.get('campo')` devuelve `null` si vacío → usar `?? ''` antes de `.trim()`
- Auth check en Server Actions: `await requireAdmin()` o `await requireTechnician()` desde `@/lib/auth` — devuelven `{ user, profile, supabase }`
- Validación de enums en Server Actions: `parseEnum(formData.get('x'), ENUM_CONST)` desde `@/lib/enums` — devuelve el valor tipado o `null`
- Rate limiting en endpoints públicos: `checkRateLimit('login', identifier)` desde `@/lib/rate-limit` antes de cualquier procesamiento. IP del cliente: `getClientIp()` en Server Actions, `getClientIpFromHeaders(req.headers)` en route handlers

---

## Roadmap

### Auditoría técnica post-refactor ✅ COMPLETADA (2026-06-04/05)
Seis entregas en producción tras el refactor de contratos N máquinas (PR #23):
- [x] **Fase 1 — hotfixes de BD** (PR #25): índices de rendimiento. Migración `20260603210000_fase1_indices`
- [x] **Fase 2 — RPCs atómicas de contratos** (PR #26): `create_contract_with_lines`, `update_contract_with_lines`, `can_delete_contract` (SECURITY DEFINER, guard service_role). Migración `20260604120000_fase2_rpcs_contratos`
- [x] **Fase 3 — mantenimiento granular por máquina** (PR #27): `maintenance_visits.contract_machine_id`; una visita por línea activa del contrato; auto-programación por máquina con frecuencia override. Migración `20260604130000_fase3_maintenance_granular`
- [x] **Hotfix cierre de mantenimiento** (PR #28): RPC `close_maintenance_visit` atómica e idempotente. Migración `20260604140000_close_maintenance_visit_rpc`
- [x] **Formulario de contacto + leads** (PR #29): tabla `leads` + route handler `/api/contact` (persiste lead + notifica a `COMMERCIAL_EMAIL`) + pantalla admin `/admin/leads`. Migraciones `20260604150000_leads` y `20260604160000_leads_permissions_hardening`
- [x] **Fase 4 — cleanup legacy** (PR #30 + DROP + hotfix atelier PR #31): DROP de `contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id` + FK; eliminadas `create_client_with_contract` y `create_machine_with_contract`; reescritas `auth_tech_incident_contract_ids` y `auth_tech_assigned_client_ids` para derivar vía `contract_machine_id`. Migración `20260605000000_cleanup_legacy_contracts`

> **Nota sobre timestamps de migración:** los timestamps de los archivos de migración difieren de los `version` registrados en la BD por el MCP — es el comportamiento establecido del proyecto.

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
