# OCR de Contadores — Documento de Diseño

> Fecha: 2026-05-26
> Estado: Pendiente de aprobación del usuario
> Proyecto: AMD Service SAV
> Sesión: 23

---

## 1. Resumen

Automatización de la captura de contadores mensuales para los equipos que **no están en Princity**. Los clientes envían una foto de la hoja modelo "Page Counter" (idéntica para todos los equipos Ricoh) por email o WhatsApp; un Vision LLM extrae los campos, validaciones server-side filtran lo dudoso, y los contadores válidos se insertan automáticamente en `machine_counters` igual que hace hoy `princity-counters` para los equipos Princity.

**Por qué ahora:** AMD recibe hojas Page Counter de un volumen estimado entre 20 y 100 equipos al mes fuera de Princity. Hoy se transcriben manualmente. El cliente no cambia de hábito; el admin deja de teclear.

**Restricciones fundamentales:**
- Modelo LLM: **Claude Sonnet 4.6** (validado en spike contra foto WhatsApp real — Haiku 4.5 falla en serial y año).
- Fase B (este spec) cubre **solo subida manual** desde `/admin/contadores`. Resend Inbound queda para Fase C.
- Fase A (alta de las máquinas inexistentes) se cubre con **importador CSV + creación just-in-time** desde la cola de revisión.

---

## 2. Contexto técnico

### Hoja modelo (mismo layout para todos los equipos)

```
[icono]
Please send FAX from this edge.
www.amd-service.com
─────────────────────────────────
            Page Counter
─────────────────────────────────
Serial No.:   E204R261306
Data of Today: 26 May 2026 14:35
┌────────────────────┬──────────┐
│ Copier:Color       │   5100   │
│ Copier:B & W       │   1645   │
│ Printer:Color      │  18967   │
│ Printer:B & W      │   1825   │
│ Color Total        │  24067   │
│ B & W Total        │   3470   │
└────────────────────┴──────────┘
                                  24/20
Please FAX to ... www.amd-service.com
```

Invariantes que se aprovechan:
- **Color Total = Copier:Color + Printer:Color** (validación cruzada gratis).
- **B & W Total = Copier:B&W + Printer:B&W** (validación cruzada gratis).
- Layout y idioma fijos → un solo prompt cubre todos los equipos.
- Serial alfanumérico tipo Ricoh (formato consistente).

### Spike (sesión 23, 2026-05-26)

Probado contra dos imágenes:

| Imagen | Modelo | Serial | Año | Contadores | Coste | Tiempo |
|---|---|---|---|---|---|---|
| PDF nítido | Haiku 4.5 | ✅ | ✅ | ✅ | $0.0043 | 2.9s |
| Foto WhatsApp en perspectiva | Haiku 4.5 | ❌ `E204FB261306` | ❌ 2020 | ❌ 1646 (real: 1645) | $0.0038 | 2.9s |
| Foto WhatsApp en perspectiva | Sonnet 4.6 | ✅ | ✅ | ✅ | $0.0114 | 5.9s |

Conclusión: **Sonnet 4.6 directo, sin pipeline híbrido**. Coste estimado a 100 fotos/mes: ~$1.15. Script: `web-amd/scripts/spike-ocr-counter.ts`.

### Estado actual de la BD (verificado vía MCP)

- 91 máquinas activas, **todas con `princity_device_id`**.
- Las máquinas «fuera de Princity» que motivan este proyecto **aún no existen en `machines`**.

---

## 3. Arquitectura general

Tres piezas nuevas + una página rediseñada:

| Pieza | Tipo | Responsabilidad |
|---|---|---|
| `counter-images` | Bucket Supabase Storage | Almacena las fotos originales |
| `pending_counter_imports` | Tabla Postgres | Cola de revisión + audit log de cada extracción |
| `parse-counter-image` | Edge Function (verify_jwt:true) | Sube imagen, invoca LLM, valida, decide acción |
| `/admin/contadores/pendientes` | Nueva página | UI de revisión y confirmación manual |
| `/admin/contadores` | Página existente | Se añade botón "Importer photo" |
| `/admin/machines` (importador CSV) | Página existente | Se añade botón "Importer CSV" para carga inicial masiva |

**Secrets nuevos en Supabase Edge Functions:**
- `ANTHROPIC_API_KEY` — clave de la API de Anthropic (tratada con la misma rigurosidad que `PRINCITY_API_KEY`).

---

## 4. Seguridad

Siete capas, mismo modelo que la integración Princity:

**Capa 1 — Aislamiento del secreto.** `ANTHROPIC_API_KEY` vive exclusivamente en Supabase Edge Function secrets. Nunca en Vercel, nunca en código, nunca en logs. `.env.local` (con la clave para el spike) ya está cubierto por `.gitignore` (`.env*`).

**Capa 2 — Validación de tipos MIME y tamaño.** Antes de subir a Storage, server-side comprueba: `image/jpeg | image/png | image/webp` (no PDFs en MVP, no SVG, no GIF), tamaño ≤ 10 MB, y verificación de magic bytes (no fiarse de la extensión del nombre).

**Capa 3 — Bucket privado con RLS estricta.** `counter-images` no es público. Solo `service_role` (Edge Function) lee/escribe. Las URLs en UI son signed URLs con TTL de 1 hora.

**Capa 4 — Rate limiting por admin.** Upstash sliding window: 30 subidas/hora por admin, 100/día por admin. Identificador: `ocr-upload:{user_id}`.

**Capa 5 — Sanitización del payload del LLM.** El JSON que devuelve el modelo se valida contra el JSON Schema antes de tocar la BD. Cualquier campo fuera de tipo o fuera de rango (e.g. año < 2020 o > año actual + 1, contadores negativos, contadores > 10^8) → rechazo + `status='pending_review'`.

**Capa 6 — RPC con SECURITY DEFINER + guard service_role.** El INSERT en `machine_counters` se hace vía una RPC `import_counter_from_pending(pending_id uuid)`, REVOKEada a anon/authenticated, GRANT solo a `service_role`. Mismo patrón que `create_client_with_contract` post-PR #5.

**Capa 7 — Audit log inmutable.** La tabla `pending_counter_imports` registra siempre la imagen original, el modelo usado, el coste, los campos extraídos y la decisión final. Nunca se borra (status='rejected' es un estado, no un DELETE).

---

## 5. Impacto en base de datos

### Tabla nueva: `pending_counter_imports`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `image_path` | text NOT NULL | Path en bucket `counter-images`, e.g. `2026/05/{uuid}.jpg` |
| `image_size_bytes` | int NOT NULL | |
| `image_hash_sha256` | text NOT NULL | Para idempotencia + detección de duplicados |
| `source` | text NOT NULL | `manual` (Fase B) · `email` (Fase C) |
| `submitted_by` | uuid nullable FK `profiles(id)` ON DELETE SET NULL | Admin que subió (manual) |
| `submitted_at` | timestamptz NOT NULL default `now()` | |
| `email_from` | text nullable | Fase C — null en MVP |
| `email_subject` | text nullable | Fase C — null en MVP |
| `extraction_model` | text NOT NULL | e.g. `claude-sonnet-4-6` |
| `extraction_cost_usd` | numeric(10,6) NOT NULL default 0 | |
| `extracted_at` | timestamptz NOT NULL default `now()` | |
| `extracted_data` | jsonb NOT NULL | `{ serial, date_iso, copier_color, copier_bw, printer_color, printer_bw, color_total, bw_total, confidence, issues[] }` |
| `validation_errors` | jsonb NOT NULL default `'[]'` | Array de strings: razones por las que NO se auto-importó |
| `status` | text NOT NULL | `pending_review` · `auto_imported` · `confirmed` · `rejected` · `failed_extraction` |
| `imported_counter_id` | uuid nullable FK `machine_counters(id)` ON DELETE SET NULL | Poblado cuando status ∈ {auto_imported, confirmed} |
| `reviewed_by` | uuid nullable FK `profiles(id)` ON DELETE SET NULL | Admin que confirmó/rechazó |
| `reviewed_at` | timestamptz nullable | |
| `rejection_reason` | text nullable | Free text del admin |
| `notes` | text nullable | Notas del admin durante revisión |

Índices:
- `(status, submitted_at DESC)` para listar la cola
- `(image_hash_sha256)` UNIQUE para idempotencia
- `(imported_counter_id)` para reverse lookup

RLS:
- SELECT/UPDATE: solo `admin`
- INSERT: solo `service_role`

### Bucket nuevo: `counter-images`

- Visibilidad: privado
- Path pattern: `{year}/{month}/{uuid}.{ext}`
- Tamaño máximo: 10 MB por objeto
- MIME types permitidos: `image/jpeg`, `image/png`, `image/webp`

### RPC nueva: `import_counter_from_pending(pending_id uuid) returns uuid`

SECURITY DEFINER, REVOKEada a anon/authenticated, GRANT solo a service_role. Lógica:
1. Carga la fila `pending_counter_imports`.
2. Match `extracted_data.serial` contra `machines.numero_serie` → obtiene `machine_id`, `contract_id` activo, `client_id`.
3. Si no hay contrato activo → RAISE EXCEPTION (`status` queda en `pending_review`).
4. Comprueba que no exista ya un `machine_counters` activo para `(machine_id, year, month)` → si existe, RAISE EXCEPTION.
5. INSERT en `machine_counters` con `notes='Importé automatiquement (OCR)'`, `recorded_by=null`, `day` extraído del date_iso.
6. UPDATE `pending_counter_imports.status = 'auto_imported'` (o `'confirmed'` si viene de la cola de revisión), `imported_counter_id`.
7. Devuelve el UUID del `machine_counters` nuevo.

### Sin cambios en tablas existentes

`machine_counters` ya tiene todos los campos necesarios (`day`, `notes`, `recorded_by` nullable). No se añaden columnas.

---

## 6. Flujo end-to-end (subida manual, MVP)

```
Admin en /admin/contadores → click "Importer photo"
  → modal: drag&drop o file picker (1 imagen)
  → server action sube a counter-images (validación MIME + tamaño + magic bytes)
  → invoca Edge Function parse-counter-image con { image_path }
  → Edge Function:
      → descarga imagen del bucket
      → calcula sha256 → si ya existe en pending_counter_imports → devuelve el existente (idempotencia)
      → llama Claude Sonnet 4.6 con prompt + tool_use estructurado
      → INSERT pending_counter_imports con extracted_data + status='pending_review' temporal
      → corre validaciones server-side:
          [V1] confidence ≥ 0.85
          [V2] totales cruzados cuadran exactos (copier+printer = total para ambos canales)
          [V3] año ∈ [año_actual - 1, año_actual]
          [V4] mes ∈ [1, 12]
          [V5] día ∈ [1, 31] coherente con mes
          [V6] todos los contadores ≥ 0 y ≤ 10^8
          [V7] serial existe en machines (active=true)
          [V8] machine tiene contrato activo
          [V9] no existe ya machine_counters(machine_id, year, month, status='actif')
          [V10] counter_bw ≥ último counter_bw de esa máquina (no decreciente)
          [V11] counter_color ≥ último counter_color de esa máquina (no decreciente)
      → si TODAS pasan:
          → llama RPC import_counter_from_pending → INSERT machine_counters
          → UPDATE status='auto_imported', imported_counter_id
          → return { action: 'auto_imported', counter_id }
      → si alguna falla:
          → UPDATE validation_errors con los códigos [V1..V11] que fallaron
          → return { action: 'pending_review', pending_id, errors[] }
  → UI muestra toast con resultado:
      → auto_imported: "✅ Compteur importé pour [serial] — [bw] N&B / [color] couleur"
      → pending_review: "⚠️ Revision requise: [N] problème(s). [Voir dans la file →]"
```

---

## 7. Cola de revisión `/admin/contadores/pendientes`

Nueva página accesible desde el sidebar admin (icono + badge con count). Layout: lista a la izquierda, panel de detalle a la derecha.

**Lista (izquierda):**
- Cards ordenadas por `submitted_at DESC`
- Cada card: thumbnail imagen + serial extraído + chips de errores
- Filtros: estado (`pending_review` por defecto), origen (manual/email)

**Panel de detalle (derecha):**
- Imagen grande (signed URL, TTL 1h)
- Formulario editable con los 8 campos extraídos
- Indicador visual de qué validaciones fallaron (chips rojas)
- Si serial no existe: bloque expandible "Créer la machine"
  - Formulario inline: marca, modelo, type (color/bw), client_id (select), contract_id (select dinámico según cliente)
  - Botón "Créer machine + contrat + importer"
- Si serial existe y resto OK: botón "Confirmer et importer" (re-valida con campos editados y llama la RPC)
- Botón "Rejeter" (con razón obligatoria)

**Auditoría:**
- `reviewed_by`, `reviewed_at`, `rejection_reason`, `notes` se rellenan en cualquier acción.

---

## 8. Importador CSV de máquinas (Fase A — carga inicial)

Botón "Importer CSV" en `/admin/machines`. Modal:
- File picker `.csv` (max 1 MB)
- Preview de las primeras 5 filas + detección de columnas
- Columnas requeridas: `numero_serie`, `marque`, `modele`, `type` (color/bw/multifunction)
- Columnas opcionales: `nom_client` (match por nombre exacto contra `clients.nom_client`), `notes`
- Validaciones por fila: serie única en BD, type ∈ enum, marca/modelo no vacíos
- Resumen pre-import: "X filas válidas, Y duplicadas, Z con errores"
- Botón "Importer X machines" → INSERT en batch + `princity_device_id=NULL` + `princity_pending=false`
- Resultado: tabla con éxito/error por fila

**Distintivo crítico:** estas máquinas tienen `princity_device_id=NULL` Y `princity_pending=false`. Las 91 máquinas Princity actuales tienen `princity_device_id NOT NULL`. El cron `princity-counters` ya filtra por `princity_device_id IS NOT NULL`, así que no las tocará — perfecto.

---

## 9. Modelo y prompt del LLM

**Modelo:** `claude-sonnet-4-6`
**API:** `https://api.anthropic.com/v1/messages`
**Auth:** header `x-api-key`
**Versión:** `anthropic-version: 2023-06-01`
**Max tokens output:** 1024
**Timeout:** 30 segundos

**Tool schema (forzado vía `tool_choice: { type: 'tool', name: '...' }`):**

```json
{
  "name": "submit_counter_reading",
  "input_schema": {
    "type": "object",
    "required": ["serial", "date_iso", "copier_color", "copier_bw", "printer_color", "printer_bw", "color_total", "bw_total", "confidence", "issues", "is_valid_counter_sheet"],
    "properties": {
      "is_valid_counter_sheet": { "type": "boolean", "description": "true only if the image is an AMD Service 'Page Counter' sheet; false for any other document, blank page, or unrelated image." },
      "serial": { "type": "string" },
      "date_iso": { "type": "string", "description": "ISO 8601 datetime, e.g. 2026-05-26T14:35:00" },
      "copier_color": { "type": "integer" },
      "copier_bw": { "type": "integer" },
      "printer_color": { "type": "integer" },
      "printer_bw": { "type": "integer" },
      "color_total": { "type": "integer" },
      "bw_total": { "type": "integer" },
      "confidence": { "type": "number" },
      "issues": { "type": "array", "items": { "type": "string" }, "description": "ONLY actual problems detected. Empty array if everything is clean. Do not log validation steps that passed." }
    }
  }
}
```

**Bug del spike a corregir en prompt final:** instrucción explícita «Issues list contains ONLY actual problems. If color_total equals copier_color + printer_color, do NOT mention it. If everything is OK, return an empty array.» En el spike el modelo ponía las validaciones OK como issues, lo cual confunde.

---

## 10. Costes y métricas

| Concepto | Valor |
|---|---|
| Modelo | Sonnet 4.6 ($3/M input · $15/M output) |
| Tokens promedio por imagen | ~2.3K in + 0.3K out |
| Coste por imagen | ~$0.011 |
| Volumen esperado | 20-100 imágenes/mes |
| Coste mensual estimado | **$0.22 – $1.14** |
| Coste anual estimado | $2.64 – $13.68 |
| Storage Supabase (10 MB/mes asumiendo 100 fotos × 100 KB) | trivial |

---

## 11. Fase C (fuera de alcance MVP) — Resend Inbound

Esquema para referencia futura:
- Configurar inbound parsing en Resend para `contadores@amd-service.com` apuntando a webhook `/api/inbox/counter`.
- Webhook valida firma Resend, extrae adjuntos imagen, sube a `counter-images`, invoca la **misma** Edge Function `parse-counter-image` con `source='email'`, `email_from`, `email_subject`.
- Sin cambios en la tabla ni en la RPC ni en la UI de revisión.

---

## 12. Fuera de alcance Fase B

- **PDFs** como input (solo imágenes JPEG/PNG/WebP en MVP)
- **Múltiples hojas en una sola foto**
- **WhatsApp Business API** (consumiría webhook Meta + plantillas aprobadas; Fase D si se necesita)
- **Lectura de informes de otras marcas** que no usen el layout "Page Counter" de Ricoh
- **Ajustes automáticos** de billing_day (eso lo hace `princity-counters` para máquinas Princity, pero estas no lo tienen)
- **Mejora del importador CSV** más allá de campos básicos (no se soportan clientes nuevos vía CSV; el cliente debe existir antes)

---

## 13. Decisiones resueltas (sesión 23)

1. **Notificación email:** cada vez que un item entra a `pending_review`, email inmediato a **`info@amd-service.com`** con link al item. Asunto: `[AMD SAV] Compteur en attente de révision — {serial}`. Se envía vía Edge Function `send-email` (template nueva `counter_pending_review_fr`).
2. **Histórico de cola:** vista filtrable por `status` en `/admin/contadores/pendientes`. Por defecto muestra `pending_review`. Toggle permite ver `auto_imported`, `confirmed`, `rejected`, `failed_extraction`. Sin auto-purga (audit log permanente).
3. **Tolerancia año [V3]:** año actual y año anterior. Algoritmo: `extracted_year ∈ {current_year, current_year - 1}`.
4. **Orden de PRs:**
   - **PR-A (primero):** importador CSV en `/admin/machines` para dar de alta las máquinas fuera de Princity. Sin esto, el OCR no tiene contra qué hacer match y toda foto cae en cola.
   - **PR-B (después):** todo el flujo OCR + cola + página de revisión + email de notificación.
