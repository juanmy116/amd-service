# Detección de duplicados en el buzón de contadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el buzón de contadores por email avise de los duplicados en vez de descartarlos en silencio. Dos niveles: (1) **foto byte-idéntica reenviada** → hoy se descarta sin rastro (`skipped` silencioso en `receive-counter-email`), debe dejar aviso visible; (2) **misma máquina + mismo mes con fotos distintas** → hoy solo se detecta contra lecturas YA confirmadas (`V_DUP_MONTH`), debe detectarse también cuando la otra lectura sigue **esperando en la cola** (`V_DUP_PENDING`). En ambos casos: **marcar 🟡 y dejar que el admin decida** (nunca bloquear ni auto-descartar de forma invisible).

**Contexto (por qué este plan):** El 2026-06-14 el usuario reenvió 3 veces la MISMA foto que ya estaba en la cola desde el día anterior. La protección anti-duplicados por hash de bytes (`receive-counter-email/index.ts:79-81`) las descartó en silencio (200 OK, `queued:0`, sin OCR ni fila nueva) → pareció que "no llegaban los correos". Era la dedup funcionando, pero sin ningún aviso. Ver memoria `project_agente_supervisor_contadores.md` (gotcha 2026-06-14).

**Architecture:** Se mantiene el principio del buzón: toda la lógica de decisión vive en SQL (`process_counter_extraction`), las Edge Functions son finas, la UI solo presenta. El UNIQUE `image_hash_sha256` se conserva (es la base de la idempotencia); el nivel 1 NO crea filas nuevas (sería un clon inútil) sino que **registra el reenvío en la fila original** y lo refleja en el aviso de lote. El nivel 2 añade un chequeo más dentro de la RPC existente.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno + Storage), Next.js 16 App Router, TypeScript, vitest (tests de integración estilo `tests/rls`), Resend (vía `send-email`).

**Plan de referencia (base ya implementada):** `docs/superpowers/plans/2026-06-12-buzon-contadores-email.md` · migración base `supabase/migrations/20260612104341_counter_imports.sql`.

**Rama:** `feat/contadores-deteccion-duplicados` (crear desde `main`).

---

## Convenciones verificadas del repo (no improvisar)

- **Tabla `pending_counter_imports`** (migración `20260612104341`): PK `id` uuid; `image_hash_sha256` text **UNIQUE NOT NULL**; `matched_machine_id` text FK→`machines.numero_serie`; `extracted_data` jsonb; `validation_errors` jsonb (array de códigos); `light` text CHECK `green|amber|red`; `status` text CHECK `pending_review|confirmed|rejected|failed_extraction`; `extracted_at` timestamptz.
- **RPC `process_counter_extraction(p_pending_id uuid, p_extracted jsonb)`** ya calcula match + validaciones + semáforo. Códigos actuales: `V_CONF`, `V_RANGE_BW`, `V_RANGE_COLOR`, `V_YEAR`, `V_MONTH`, `V_CROSS_BW`, `V_CROSS_COLOR`, `V_NONDECR_BW`, `V_NONDECR_COLOR`, `V_DUP_MONTH`, `V_NO_MATCH`. El semáforo: `red` si no es hoja o sin serial o sin match; `green` si sin errores; `amber` si hay algún error. `v_year`/`v_month` se derivan de `extracted_data.date_iso` o `now()`.
- **RPC SECURITY DEFINER:** patrón `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;` + `REVOKE ... FROM PUBLIC, anon, authenticated;` + `GRANT ... TO service_role;`.
- **Edge Function `receive-counter-email`:** Deno, `getAdminClient()` de `_shared/db.ts`, dedup por hash en `index.ts:79-81`, dispara OCR vía `parse-counter-image`, aviso de lote vía `send-email` (template `counter_batch_processed`) solo si `queued > 0`.
- **UI cola:** `src/app/admin/contadores/pendientes/page.tsx` (Server Component, lee con `createClient()` respetando RLS admin) + `PendingList.tsx` (cliente; hoy muestra `validation_errors` como chips con el código CRUDO, `PendingList.tsx:47`).
- **Tests:** `tests/rls/counter-import.test.ts` (ya existe), runner `npm run test:rls`, helpers `tests/rls/helpers.ts` (`adminClient()`, `cleanup()`). Requiere `supabase start` local.
- **Migraciones:** `supabase/migrations/<timestamp>_<nombre>.sql`, envuelto en `BEGIN; ... COMMIT;`, prefijo `public.`, comentario inicial con el porqué.
- **App en francés.** Los textos de UI van en francés.

---

## File Structure

**Crear:**
- `supabase/migrations/20260614170000_counter_duplicate_awareness.sql` — columnas `duplicate_count`/`last_duplicate_at`, RPC `register_counter_duplicate`, y `CREATE OR REPLACE` de `process_counter_extraction` con el chequeo `V_DUP_PENDING`.
- `src/app/admin/contadores/pendientes/validation-labels.ts` — diccionario código→texto francés.

**Modificar:**
- `supabase/functions/receive-counter-email/index.ts` — el descarte silencioso por hash → registrar reenvío + contar `duplicates` para el aviso.
- `src/app/admin/contadores/pendientes/page.tsx` — traer `duplicate_count`/`last_duplicate_at` al row.
- `src/app/admin/contadores/pendientes/PendingList.tsx` — labels legibles + resaltar duplicados + "photo renvoyée X fois".
- `tests/rls/counter-import.test.ts` — casos `V_DUP_PENDING` y `register_counter_duplicate`.

---

## BLOQUE D1 — Datos: campos de reenvío + RPC + chequeo cola

### Task D1.1: Migración

**Files:** Create `supabase/migrations/20260614170000_counter_duplicate_awareness.sql`

- [ ] **Step 1: Columnas de seguimiento de reenvíos** (nivel 1)

```sql
ALTER TABLE public.pending_counter_imports
  ADD COLUMN duplicate_count  int         NOT NULL DEFAULT 0,
  ADD COLUMN last_duplicate_at timestamptz;
COMMENT ON COLUMN public.pending_counter_imports.duplicate_count IS
  'Nº de veces que el MISMO fichero (hash) se reenvió tras la primera recepción. >0 = reenvíos detectados.';
```

- [ ] **Step 2: RPC `register_counter_duplicate`** — incremento atómico, devuelve el estado de la fila original para el aviso

```sql
CREATE OR REPLACE FUNCTION public.register_counter_duplicate(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_row public.pending_counter_imports;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.pending_counter_imports
  SET duplicate_count = duplicate_count + 1, last_duplicate_at = now()
  WHERE image_hash_sha256 = p_hash
  RETURNING * INTO v_row;
  IF v_row IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', v_row.id, 'status', v_row.status, 'light', v_row.light,
    'matched_machine_id', v_row.matched_machine_id,
    'first_seen', v_row.created_at, 'duplicate_count', v_row.duplicate_count);
END; $$;
REVOKE EXECUTE ON FUNCTION public.register_counter_duplicate(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_counter_duplicate(text) TO service_role;
```

- [ ] **Step 3: `CREATE OR REPLACE process_counter_extraction` con el chequeo `V_DUP_PENDING`** (nivel 2)

Copiar la función actual de `20260612104341` íntegra y, dentro del bloque `IF v_machine IS NOT NULL THEN`, **después** del `V_DUP_MONTH` (que mira `machine_counters`), añadir el chequeo contra la propia cola:

```sql
    -- Otra lectura de la MISMA máquina y MISMO mes que sigue esperando en la cola
    -- (aún sin confirmar → V_DUP_MONTH no la ve porque mira machine_counters).
    IF EXISTS (
      SELECT 1 FROM public.pending_counter_imports p
      WHERE p.matched_machine_id = v_machine
        AND p.status = 'pending_review'
        AND p.id <> p_pending_id
        AND EXTRACT(YEAR  FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_year
        AND EXTRACT(MONTH FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_month
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_PENDING');
    END IF;
```

El resto de la función (semáforo, UPDATE, GRANTs) queda igual: con `V_DUP_PENDING` en `v_errors`, el semáforo cae a `amber` automáticamente (línea "ELSE v_light := 'amber'"). **No se bloquea la confirmación**: si el admin confirma una, la segunda chocará con el guard ya existente `counter_exists_for_month` en `import_counter_from_pending`.

- [ ] **Step 4:** Envolver todo en `BEGIN; ... COMMIT;` con comentario inicial explicando el porqué.

### Task D1.2: Verificar la migración en local
- [ ] `supabase db reset` (o aplicar la migración) y comprobar que `process_counter_extraction` e `register_counter_duplicate` existen y que las columnas nuevas están.

---

## BLOQUE D2 — Edge Function: reenvío con aviso (nivel 1)

### Task D2.1: Reemplazar el descarte silencioso

**Files:** Modify `supabase/functions/receive-counter-email/index.ts`

- [ ] **Step 1:** Añadir contador `let duplicates = 0` junto a `queued`/`skipped`.
- [ ] **Step 2:** En el bloque de idempotencia (hoy `index.ts:79-81`), sustituir el descarte mudo:

```ts
// Idempotencia: si el hash ya existe, NO reprocesar, pero dejar rastro visible
// (antes se descartaba en silencio → parecía que "no llegaban los correos").
const dup = await db.rpc('register_counter_duplicate', { p_hash: hash })
if (dup.data) { duplicates++; continue }
```

(Si `dup.data` es null el hash no existía realmente → seguir el flujo normal de inserción.)

- [ ] **Step 3:** Incluir `duplicates` en la respuesta JSON final: `{ ok: true, queued, skipped, duplicates }`.
- [ ] **Step 4:** Aviso. Decidir el comportamiento mínimo: si `queued === 0 && duplicates > 0`, mandar igualmente un aviso corto vía `send-email` (template `raw` o reutilizando `counter_batch_processed`) del tipo *"Photo déjà reçue, non reprocessée"* a `COUNTER_NOTIFY_EMAILS`. Mantener el aviso de lote existente cuando `queued > 0` e incluir, si procede, la mención de duplicados. (Implementación fina, sin romper el `.catch` existente.)

### Task D2.2: Desplegar
- [ ] Tras revisión, desplegar `receive-counter-email` (vía MCP `deploy_edge_function` o CLI `--no-verify-jwt`, empaquetando `_shared/*`, como en el plan base). Es la única función que cambia.

---

## BLOQUE D3 — UI: avisos legibles (nivel 1 + 2)

### Task D3.1: Diccionario de validaciones

**Files:** Create `src/app/admin/contadores/pendientes/validation-labels.ts`

- [ ] Mapear cada código a texto francés claro. Mínimo:

```ts
export const VALIDATION_LABELS: Record<string, string> = {
  V_NO_MATCH:      'Aucune machine correspondante',
  V_DUP_MONTH:     'Relevé déjà existant pour ce mois',
  V_DUP_PENDING:   'Doublon : un autre relevé de cette machine (même mois) est déjà en attente',
  V_CONF:          'Lecture peu fiable (confiance faible)',
  V_RANGE_BW:      'Compteur N&B hors plage',
  V_RANGE_COLOR:   'Compteur couleur hors plage',
  V_YEAR:          'Année inhabituelle',
  V_MONTH:         'Mois invalide',
  V_CROSS_BW:      'Somme N&B (copie+impression) incohérente',
  V_CROSS_COLOR:   'Somme couleur (copie+impression) incohérente',
  V_NONDECR_BW:    'Compteur N&B inférieur au relevé précédent',
  V_NONDECR_COLOR: 'Compteur couleur inférieur au relevé précédent',
}
```

### Task D3.2: Mostrar labels + reenvíos

**Files:** Modify `page.tsx` (añadir `duplicate_count, last_duplicate_at` al `select` y al tipo `Row`) y `PendingList.tsx`

- [ ] **Step 1:** En `PendingList.tsx:45-49`, renderizar `VALIDATION_LABELS[e] ?? e` en lugar del código crudo; resaltar en amarillo destacado los códigos `V_DUP_MONTH`/`V_DUP_PENDING`.
- [ ] **Step 2:** Si `row.duplicate_count > 0`, mostrar una línea informativa: *"Photo renvoyée {duplicate_count} fois (dernière : {last_duplicate_at})"*.
- [ ] **Step 3:** Verificar `npm run typecheck` (el `Row` cambia en dos archivos).

---

## BLOQUE D4 — Tests de integración

**Files:** Modify `tests/rls/counter-import.test.ts`

- [ ] **Test 1 (V_DUP_PENDING):** crear máquina + contrato activo; insertar pending A (status `pending_review`, matched + date_iso de junio); llamar `process_counter_extraction` para pending B (misma máquina, mismo mes) → esperar `light='amber'` y `V_DUP_PENDING` en `validation_errors`. Limpiar.
- [ ] **Test 2 (register_counter_duplicate):** insertar una pending; llamar `register_counter_duplicate(hash)` dos veces → `duplicate_count = 2`, `last_duplicate_at` no nulo, devuelve el `status`/`light` de la original; con hash inexistente → devuelve `null`. Limpiar.
- [ ] `npm run test:rls` en verde.

---

## Verificación final (antes de PR)

- [ ] `npm run typecheck` + `npm test` + `npm run build` en verde (CI los exige).
- [ ] Gate manual E2E (con permiso del usuario, datos de prueba, limpieza posterior 0 residuos):
  1. Enviar una foto de máquina existente → 🟢/🟡 normal en la cola.
  2. **Reenviar el mismo fichero** → NO crea fila nueva, pero la original muestra "Photo renvoyée 1 fois" + llega/registra el aviso (nivel 1 ✅).
  3. Enviar **otra foto distinta** de la misma máquina y mes → entra 🟡 con "Doublon … déjà en attente" (`V_DUP_PENDING`, nivel 2 ✅).
  4. Confirmar una; intentar confirmar la otra → bloqueada por `counter_exists_for_month` (guard existente ✅).
- [ ] Limpiar datos sintéticos + imágenes del bucket (vía supabase-js `.storage.remove`, NO SQL — `storage.protect_delete` lo bloquea).
- [ ] Actualizar `docs/architecture.md` §"Buzón de Contadores por Email" con la detección de duplicados.
- [ ] Actualizar memoria `project_agente_supervisor_contadores.md` (cerrar el "pendiente" del gotcha de duplicados).

---

## Notas de diseño / decisiones tomadas

- **Por qué el nivel 1 no crea fila nueva:** el `image_hash_sha256` es UNIQUE (idempotencia). Reenviar el fichero idéntico no aporta lectura nueva; lo útil es saber que llegó otra vez. Por eso se registra en la fila original (`duplicate_count`) en vez de clonar.
- **Por qué `V_DUP_PENDING` marca 🟡 y no bloquea:** decisión del usuario (2026-06-14) — "marcar 🟡 y que yo decida". El bloqueo real solo ocurre al confirmar la segunda (guard `counter_exists_for_month` ya existente), evitando el descuadre de factura sin quitarle control al admin.
- **Alcance cerrado con el usuario:** las DOS mejoras (nivel 1 + nivel 2), acción = marcar 🟡 + dejar decidir.
