# Buzón de Contadores por Email (Fase 1 del Agente Supervisor) — Documento de Diseño

> Fecha: 2026-06-12
> Estado: Aprobado en conversación · pendiente de revisión del spec escrito
> Proyecto: AMD Service SAV
> Reemplaza el enfoque de Fase B/C de `2026-05-26-ocr-contadores.md` (subida manual) por entrada por email.

---

## 0. Encuadre: esto es la primera de cuatro capacidades

El objetivo final es un **"agente supervisor de contadores"** con cuatro capacidades independientes:

1. **Recepción de contadores por email/WhatsApp** ← **ESTE SPEC** (solo email; WhatsApp = fase posterior).
2. Asistente de preguntas a admins (cuántas máquinas tiene un cliente, su contrato, stock vs asignada).
3. Recordatorios a los 2 trabajadores (qué contadores tomar diaria/semanalmente + retrasos).
4. Vigilante de descuadres/incoherencias en facturas y BD.

Cada capacidad se diseña, planifica e implementa por separado. Este documento cubre **solo la capacidad 1, canal email**.

---

## 1. Resumen

Un buzón de email recibe fotos/PDF de hojas de contador (enviadas por clientes, técnicos o los 2 trabajadores de AMD). El agente, por cada adjunto: guarda la imagen, la lee con una IA de visión (Claude Sonnet), **casa el número de serie con un equipo que ya existe en la base de datos**, corre comprobaciones automáticas y deja el resultado en una **cola de revisión** con un semáforo (🟢/🟡/🔴). **Nada entra a `machine_counters` (la base de la facturación) sin la confirmación de un admin con un clic.** Al terminar de procesar un lote, avisa por email/notificación interna ("se han procesado X contadores").

**Por qué ahora:** AMD recibe estas hojas de un volumen estimado de 20-100 equipos/mes fuera de Princity y hoy se transcriben a mano. El cliente no cambia de hábito (sigue mandando la foto); el admin deja de teclear y solo confirma.

**Decisiones tomadas (esta sesión):**
- **Nivel de confianza:** cola de revisión SIEMPRE. Ninguna lectura se auto-importa sin ojo humano (cambio respecto al spec de mayo, que auto-importaba si todas las validaciones pasaban).
- **Canal:** email primero; WhatsApp (entrada y avisos) en fase posterior, enchufándose al mismo motor.
- **Buzón abierto:** remitentes = clientes, técnicos o trabajadores. La identificación de la máquina NO depende del remitente.
- **Identificación:** por `numero_serie` leído de la hoja ↔ equipo existente en `machines`. Los equipos deben estar ya creados; si el serial no casa o no se lee, la lectura va a 🔴 para asignación manual.
- **Email de entrada configurable:** `admin@test-sav.site` (test, ya existente) → `contadores@amd-service.com` (producción, se creará al final). Es una variable de entorno, no se hardcodea.
- **Aviso de lote:** por email/notificación interna en fase 1; por WhatsApp en fase posterior.
- **Entrada:** fotos (JPEG/PNG/WebP) **y PDF**.
- **Marcas:** Ricoh y Pantum mayoritarias + una tercera. La IA lee cualquier formato; la validación de sumas cruzadas solo se aplica cuando la hoja las trae (Ricoh).

---

## 2. Arquitectura general (el recorrido de una foto)

```
  Cliente / técnico / trabajador
        │  email con 1+ adjuntos (foto/PDF) a admin@test-sav.site
        ▼
  📮 EL CARTERO  (servicio de email entrante → webhook)
        │  entrega el email + adjuntos a una Edge Function
        ▼
  📥 receive-counter-email  (Edge Function, Supabase)
        │  por cada adjunto: valida MIME/tamaño, guarda en bucket privado,
        │  crea una fila en pending_counter_imports (status inicial), e invoca…
        ▼
  👁️ parse-counter-image  (Edge Function, Supabase)
        │  descarga el adjunto, llama a Claude Sonnet (visión, tool_use),
        │  extrae: serial, contadores B&N/color, fecha, is_valid_counter_sheet
        ▼
  🔗 emparejador + comprobaciones (dentro de parse-counter-image)
        │  casa serial ↔ machines.numero_serie; corre validaciones; fija el semáforo
        ▼
  📥 BANDEJA  /admin/contadores/pendientes
        🟢 cuadra + máquina identificada      → [Confirmer] (1 clic)
        🟡 leída pero dudosa                   → [Réviser]
        🔴 sin máquina / no es un contador     → [Assigner] o [Rejeter]
        │
        ▼  (admin confirma)
  ✅ import_counter_from_pending  (RPC SECURITY DEFINER)
        │  INSERT en machine_counters (lectura ya facturable)
        ▼
  🔔 AVISO DE LOTE  "Se han procesado X contadores (Y listos, Z requieren atención)"
        por email/notificación interna (vía send-email / Resend)
```

### Piezas (nuevas vs reaprovechadas del spec de mayo)

| Pieza | Tipo | Estado |
|---|---|---|
| 📮 El cartero (email entrante → webhook) | Servicio externo + config DNS | 🆕 Nuevo |
| `receive-counter-email` | Edge Function (`verify_jwt:false`, valida firma del proveedor) | 🆕 Nuevo |
| `counter-images` | Bucket Storage privado | ♻️ Del spec de mayo |
| `parse-counter-image` | Edge Function (lectura IA + match + validaciones) | ♻️ Del spec de mayo (ajustada) |
| `pending_counter_imports` | Tabla cola/audit | ♻️ Del spec de mayo (ajustada) |
| `import_counter_from_pending` | RPC SECURITY DEFINER | ♻️ Del spec de mayo |
| `/admin/contadores/pendientes` | Página de revisión | ♻️ Del spec de mayo |
| Aviso de lote | Plantilla en `send-email` | 🆕 Nuevo (reusa Resend) |

---

## 3. El cartero (email entrante)

Recibir emails en `admin@test-sav.site` y entregarlos al agente requiere un **proveedor de "inbound email parsing"** que convierta cada correo recibido (con sus adjuntos) en una llamada HTTP (webhook) a `receive-counter-email`.

- **Recomendación a confirmar en el plan:** evaluar **Resend Inbound** primero (ya se usa Resend para el envío y el dominio puede compartir proveedor); alternativas equivalentes: Mailgun Routes, SendGrid Inbound Parse, CloudMailin.
- **Requisito de configuración (acción manual, no código):** apuntar los registros **MX** del dominio `test-sav.site` al proveedor elegido. ⚠️ Si `admin@test-sav.site` se usa hoy como buzón normal con otro proveedor, cambiar los MX lo afectaría — a resolver antes de conectar.
- **Seguridad:** `receive-counter-email` valida la **firma del webhook** del proveedor (rechaza llamadas no firmadas) antes de procesar nada.
- **Configurable:** la dirección aceptada vive en una variable de entorno (`COUNTER_INBOX_ADDRESS`), de modo que pasar de test a producción sea un cambio de configuración.

---

## 4. Impacto en base de datos

### Tabla nueva: `pending_counter_imports`

Basada en la del spec de mayo, con ajustes para esta fase. Campos principales:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `image_path` | text NOT NULL | Path en bucket `counter-images` (`{year}/{month}/{uuid}.{ext}`) |
| `image_size_bytes` | int NOT NULL | |
| `image_hash_sha256` | text NOT NULL UNIQUE | Idempotencia + duplicados |
| `source` | text NOT NULL | `email` (fase 1); `whatsapp`/`manual` reservados |
| `email_from` | text nullable | Remitente del correo |
| `email_subject` | text nullable | |
| `email_message_id` | text nullable | Para agrupar adjuntos del mismo correo en un "lote" |
| `extraction_model` | text NOT NULL | p.ej. `claude-sonnet-4-6` |
| `extraction_cost_usd` | numeric(10,6) NOT NULL default 0 | |
| `extracted_at` | timestamptz NOT NULL default now() | |
| `extracted_data` | jsonb NOT NULL | `{ serial, date_iso, counter_bw, counter_color, raw_fields{}, confidence, is_valid_counter_sheet, issues[] }` |
| `matched_machine_id` | text nullable FK `machines(numero_serie)` | Resultado del match por serial |
| `validation_errors` | jsonb NOT NULL default `'[]'` | Códigos [V1..Vn] que fallaron |
| `light` | text NOT NULL | Semáforo: `green` · `amber` · `red` |
| `status` | text NOT NULL | `pending_review` · `confirmed` · `rejected` · `failed_extraction` |
| `imported_counter_id` | uuid nullable FK `machine_counters(id)` | Poblado al confirmar |
| `reviewed_by` | uuid nullable FK `profiles(id)` | |
| `reviewed_at` | timestamptz nullable | |
| `rejection_reason` / `notes` | text nullable | |

> **Diferencia clave con mayo:** no existe el estado `auto_imported`. Todas las filas nacen en `pending_review` con su semáforo; el `status` solo pasa a `confirmed`/`rejected` por acción de un admin. `light` (green/amber/red) es la guía visual; `status` es el ciclo de vida.

Índices: `(status, extracted_at DESC)` (listar cola), `(image_hash_sha256)` UNIQUE, `(matched_machine_id)`.
RLS: SELECT/UPDATE solo `admin`; INSERT solo `service_role`.

### Bucket `counter-images`
Privado. Path `{year}/{month}/{uuid}.{ext}`. Máx 10 MB. MIME: `image/jpeg|png|webp` + `application/pdf`. URLs en UI = signed URLs (TTL 1 h).

### RPC `import_counter_from_pending(pending_id uuid) returns uuid`
SECURITY DEFINER, GRANT solo a `service_role`. Lógica:
1. Carga la fila; exige `matched_machine_id` no nulo (si no, error → sigue en cola).
2. Resuelve `client_id`/`contract_id` activos de esa máquina (vía la vista de parque actual).
3. Comprueba que no exista ya un `machine_counters` activo para `(machine_id, year, month)` (índice `machine_counters_one_active_per_month`) → si existe, error.
4. INSERT en `machine_counters` (`counter_bw`, `counter_color`, `year`, `month`, `day` del date_iso, `notes='Importé via email (OCR)'`, `recorded_by=null`).
5. UPDATE `pending_counter_imports`: `status='confirmed'`, `imported_counter_id`, `reviewed_by`, `reviewed_at`.
6. Devuelve el id del `machine_counters` nuevo.

> Nota de esquema (verificado 2026-06-12): `machine_counters.machine_id` es **text**, `client_id` es **bigint**, hay columna **`status`** (no `actif`). Sin cambios en `machine_counters`.

---

## 5. Lectura IA, match y comprobaciones (semáforo)

**Modelo:** `claude-sonnet-4-6` (validado en el spike de mayo, lee foto WhatsApp en perspectiva al 100%). API Anthropic, `tool_use` forzado, salida estructurada.

**Multi-marca:** el prompt pide leer el `serial`, los **totales B&N y color** y la fecha, sea Ricoh, Pantum o la tercera marca. Devuelve además `is_valid_counter_sheet` (false si la imagen no es una hoja de contador → 🔴 descarte) y `issues[]` (solo problemas reales).

**Comprobaciones server-side → fijan el semáforo:**
- 🔴 **red** si: `is_valid_counter_sheet=false`, o el serial no casa con ninguna `machines.numero_serie`, o no se pudo leer el serial.
- 🟡 **amber** si (máquina identificada pero algo chirría): sumas cruzadas no cuadran (solo Ricoh), lectura **menor** que la del mes anterior (contador no puede bajar), salto anómalo, confianza baja, año/mes fuera de rango, o ya existe lectura de ese mes.
- 🟢 **green** si: serial casa + todas las comprobaciones aplicables pasan. *(Aun así espera el clic del admin.)*

Las validaciones reaprovechan [V1..V11] del spec de mayo, con dos matices: las sumas cruzadas (V2) solo aplican si la marca las imprime; y nada se auto-importa (V-pass → 🟢, no → import directo).

---

## 6. Cola de revisión `/admin/contadores/pendientes`

Página nueva en el sidebar admin (con badge = nº de `pending_review`). Lista + detalle:
- **Lista:** filas ordenadas por `extracted_at DESC`, con semáforo, miniatura, serial y máquina casada. Filtro por semáforo/estado (por defecto `pending_review`).
- **Detalle:** imagen grande (signed URL), campos editables (serial, B&N, color, fecha), chips de las comprobaciones que fallaron, y acciones:
  - 🟢/🟡 → **Confirmer** (re-valida con los campos editados y llama la RPC).
  - 🔴 sin máquina → **Assigner** (elegir la máquina existente a mano) o **Rejeter** (motivo obligatorio; p.ej. spam/foto no válida).
- **Auditoría:** `reviewed_by/at`, `rejection_reason`, `notes` se rellenan en cada acción. Nada se borra (rechazar = estado, no DELETE).

---

## 7. Aviso de lote

Al terminar de procesar todos los adjuntos de un mismo correo (agrupados por `email_message_id`), se envía **un** aviso (no uno por foto) a los admins vía `send-email` (Resend), con el resumen: total procesados, cuántos 🟢 listos, cuántos 🟡/🔴 requieren atención, y enlace a la cola. En fase posterior, el mismo aviso saldrá también por WhatsApp.

---

## 8. Seguridad

- 🔐 `ANTHROPIC_API_KEY` solo en **Supabase Edge Function secrets** (nunca Vercel, código ni logs). Hoy está en `.env.local` (spike), cubierto por `.gitignore`.
- 🔐 `receive-counter-email` valida la **firma del webhook** del proveedor de inbound; descarta lo no firmado.
- 🔐 Bucket `counter-images` privado; solo `service_role`; UI con signed URLs TTL 1 h.
- 🔐 Validación MIME + tamaño + magic bytes antes de guardar.
- 🔐 INSERT en `machine_counters` solo vía RPC `service_role`.
- 🔐 **El buzón abierto no es un riesgo de facturación:** lo peor que hace un spam es aparecer en 🔴 y ser descartado; nada entra sin confirmación humana.

---

## 9. Fuera de alcance (esta fase)

- WhatsApp (entrada y avisos) → fase posterior, mismo motor.
- Las otras tres capacidades del agente (preguntas, recordatorios, vigilante de descuadres).
- Creación de máquinas nuevas desde la cola (los equipos deben existir; el alta masiva ya se cubre con el importador CSV ya mergeado, PR #22).
- Varias hojas distintas en una sola foto.
- Ajuste automático de `billing_day`.

---

## 10. Dependencias / acciones manuales previas

1. Elegir proveedor de inbound email y **configurar los MX de `test-sav.site`** (verificar que no rompe el buzón actual).
2. Mover `ANTHROPIC_API_KEY` a Supabase Edge Function secrets.
3. Variables de entorno: `COUNTER_INBOX_ADDRESS` (= `admin@test-sav.site` en test), credenciales/secreto de firma del proveedor de inbound.

---

## 11. Plan de implementación (se detalla con writing-plans)

Orden tentativo por bloques ejecutables por subagentes:
- **B1 — Cimientos de datos:** migración `pending_counter_imports` + bucket `counter-images` + RPC `import_counter_from_pending` (+ tests).
- **B2 — Lectura IA:** Edge Function `parse-counter-image` (prompt multi-marca, match por serial, validaciones, semáforo). Reusa el spike.
- **B3 — Entrada email:** Edge Function `receive-counter-email` + integración con el proveedor de inbound + validación de firma.
- **B4 — UI de revisión:** página `/admin/contadores/pendientes` (lista + detalle + acciones + badge sidebar).
- **B5 — Aviso de lote:** plantilla en `send-email` + disparo al cerrar el lote.
- **B6 — Integración E2E + gate:** prueba de punta a punta con un email real a `admin@test-sav.site` y limpieza.
