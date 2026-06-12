# Buzón de Contadores por Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las fotos/PDF de contadores enviadas por email a `admin@test-sav.site` se lean con IA, se casen por número de serie con un equipo existente y queden en una cola de revisión con semáforo, de modo que un admin las confirme con un clic e ingresen en `machine_counters`.

**Architecture:** Toda la lógica de match + validaciones + semáforo vive en dos RPCs de Postgres SECURITY DEFINER (`process_counter_extraction` y `import_counter_from_pending`), centralizadas y testeadas por integración. Dos Edge Functions Deno finas: `parse-counter-image` (OCR vía Claude Sonnet) y `receive-counter-email` (webhook de email con contrato normalizado). Una página admin `/admin/contadores/pendientes` con Server Actions. Aviso de lote vía la Edge Function `send-email` ya existente.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno + Storage), Next.js 16 App Router, TypeScript, Claude Sonnet 4.6 (API Anthropic, tool_use), vitest (tests de integración estilo `tests/rls`), Resend (vía `send-email`).

**Spec de referencia:** `docs/superpowers/specs/2026-06-12-buzon-contadores-email-design.md`.

**Rama:** `feat/agente-contadores-email` (ya creada).

---

## Convenciones verificadas del repo (no improvisar)

- **Esquema (verificado 2026-06-12):** `machines` PK = `numero_serie` (text); enum `machines.type` = `color | noir_blanc`. `machine_counters.machine_id` text (→ FK lógica a `machines.numero_serie`), `client_id` bigint, `status` text default `'actif'`, índice único `machine_counters_one_active_per_month (machine_id, year, month) WHERE status='actif'`. Columnas relevantes de `machine_counters`: `counter_bw` int NOT NULL, `counter_color` int NOT NULL, `year` int, `month` int, `day` int nullable, `notes` text, `recorded_by` uuid nullable, `recorded_at` timestamptz NOT NULL.
- **RPC SECURITY DEFINER:** patrón `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;` + `REVOKE ... FROM PUBLIC, anon, authenticated;` + `GRANT ... TO service_role;` (ver `20260604120000_fase2_rpcs_contratos.sql`, `20260606000100_invoices.sql`).
- **RLS admin:** `USING (public.is_admin()) WITH CHECK (public.is_admin())` (ver `20260606000100_invoices.sql`).
- **Edge Function:** Deno v2, `import "jsr:@supabase/functions-js/edge-runtime.d.ts"`, cliente admin vía `_shared/db.ts` (`getAdminClient()`), secrets vía `Deno.env.get()`, auth Bearer vía `_shared/secret-key.ts` (`isValidSecretKey`, `timingSafeEqual`). Respuestas `new Response(JSON.stringify(...), { headers: {'Content-Type':'application/json'} })`.
- **Server Action:** `await requireAdmin()` + `createAdminClient()` → `admin.rpc(...)`. Ver `src/app/admin/contracts/new/actions.ts`.
- **Página admin:** Server Component con `createClient()` (anon, respeta RLS del admin logueado) para LECTURA; `createAdminClient()` solo en Server Actions. Ver `src/app/admin/clients/page.tsx`.
- **Invocar `send-email`:** `fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` }, body: { template, to, data, attachments? } })`. Ver `src/app/admin/factures/[id]/actions.ts`.
- **Tests de integración:** runner `npm run test:rls` (config `vitest.rls.config.ts`, `include: tests/rls/**/*.test.ts`), helpers en `tests/rls/helpers.ts` (`adminClient()`, `cleanup()`). Requiere `supabase start` local + env `SUPABASE_URL`/`SERVICE_ROLE_KEY`/`ANON_KEY`.
- **Migraciones:** un archivo `supabase/migrations/<timestamp>_<nombre>.sql`, envuelto en `BEGIN; ... COMMIT;`, prefijo `public.`, comentarios al inicio explicando el porqué.

---

## File Structure

**Crear:**
- `supabase/migrations/20260612090000_counter_imports.sql` — bucket `counter-images` + tabla `pending_counter_imports` + RPCs `process_counter_extraction` e `import_counter_from_pending`.
- `supabase/functions/parse-counter-image/index.ts` — Edge Function OCR.
- `supabase/functions/parse-counter-image/prompt.ts` — prompt + tool schema del LLM.
- `supabase/functions/receive-counter-email/index.ts` — Edge Function webhook de email.
- `supabase/functions/_shared/counter-types.ts` — tipos compartidos del extracted_data (Deno).
- `src/app/admin/contadores/pendientes/page.tsx` — lista de la cola.
- `src/app/admin/contadores/pendientes/PendingList.tsx` — componente cliente (lista + detalle).
- `src/app/admin/contadores/pendientes/actions.ts` — Server Actions (confirm/reject/assign).
- `tests/rls/counter-import.test.ts` — tests de integración de las dos RPCs.

**Modificar:**
- `supabase/functions/send-email/index.ts` — añadir template `counter_batch_processed`.
- `src/components/admin/Sidebar.tsx` — entrada "Compteurs en attente" en el grupo Pilotage.

---

## BLOQUE B1 — Cimientos de datos (bucket + tabla + RPCs)

### Task B1.1: Migración — bucket, tabla y RPCs

**Files:**
- Create: `supabase/migrations/20260612090000_counter_imports.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Buzón de Contadores por email (Fase 1 del agente supervisor).
-- Crea: bucket privado counter-images, tabla pending_counter_imports (cola + audit),
-- RPC process_counter_extraction (match por serial + validaciones + semáforo) y
-- RPC import_counter_from_pending (confirmación admin → INSERT en machine_counters).
-- Toda la lógica de decisión vive en SQL (un solo sitio, testeable por integración).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bucket de Storage para las imágenes originales (privado).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('counter-images', 'counter-images', false)
ON CONFLICT (id) DO NOTHING;

-- Solo service_role escribe/lee; los admins leen vía signed URLs generadas server-side.
CREATE POLICY "counter_images_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'counter-images') WITH CHECK (bucket_id = 'counter-images');

CREATE POLICY "counter_images_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'counter-images' AND public.is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Cola de revisión + audit log.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.pending_counter_imports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_path          text        NOT NULL,
  image_size_bytes    int         NOT NULL,
  image_hash_sha256   text        NOT NULL UNIQUE,
  source              text        NOT NULL DEFAULT 'email' CHECK (source IN ('email','whatsapp','manual')),
  email_from          text,
  email_subject       text,
  email_message_id    text,
  extraction_model    text        NOT NULL DEFAULT '',
  extraction_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  extracted_at        timestamptz NOT NULL DEFAULT now(),
  extracted_data      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  matched_machine_id  text        REFERENCES public.machines(numero_serie) ON DELETE SET NULL,
  validation_errors   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  light               text        NOT NULL DEFAULT 'red' CHECK (light IN ('green','amber','red')),
  status              text        NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','confirmed','rejected','failed_extraction')),
  imported_counter_id uuid        REFERENCES public.machine_counters(id) ON DELETE SET NULL,
  reviewed_by         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  rejection_reason    text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pci_status_extracted ON public.pending_counter_imports (status, extracted_at DESC);
CREATE INDEX idx_pci_matched_machine  ON public.pending_counter_imports (matched_machine_id);
CREATE INDEX idx_pci_message_id       ON public.pending_counter_imports (email_message_id);

ALTER TABLE public.pending_counter_imports ENABLE ROW LEVEL SECURITY;

-- Admin: lectura + actualización (revisión). INSERT solo service_role (Edge Function).
CREATE POLICY "pci_admin_select" ON public.pending_counter_imports
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "pci_admin_update" ON public.pending_counter_imports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.pending_counter_imports IS
  'Cola de revisión + audit log de los contadores recibidos por email. Nada entra a machine_counters sin confirmación de un admin.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: match por serial + validaciones + semáforo.
--    Recibe el JSON crudo del LLM, decide light/validation_errors y persiste.
--    extracted_data esperado:
--      { serial, date_iso, counter_bw, counter_color,
--        copier_bw?, printer_bw?, copier_color?, printer_color?,
--        confidence, is_valid_counter_sheet, issues[] }
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_counter_extraction(p_pending_id uuid, p_extracted jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_serial      text := NULLIF(trim(p_extracted->>'serial'), '');
  v_is_sheet    bool := COALESCE((p_extracted->>'is_valid_counter_sheet')::bool, false);
  v_conf        numeric := COALESCE((p_extracted->>'confidence')::numeric, 0);
  v_bw          int := NULLIF(p_extracted->>'counter_bw','')::int;
  v_color       int := NULLIF(p_extracted->>'counter_color','')::int;
  v_copier_bw   int := NULLIF(p_extracted->>'copier_bw','')::int;
  v_printer_bw  int := NULLIF(p_extracted->>'printer_bw','')::int;
  v_copier_col  int := NULLIF(p_extracted->>'copier_color','')::int;
  v_printer_col int := NULLIF(p_extracted->>'printer_color','')::int;
  v_date        timestamptz := NULLIF(p_extracted->>'date_iso','')::timestamptz;
  v_year        int := EXTRACT(YEAR  FROM COALESCE(v_date, now()))::int;
  v_month       int := EXTRACT(MONTH FROM COALESCE(v_date, now()))::int;
  v_cur_year    int := EXTRACT(YEAR FROM now())::int;
  v_machine     text;
  v_errors      text[] := ARRAY[]::text[];
  v_light       text;
  v_prev_bw     int;
  v_prev_color  int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Match por serial contra equipo existente y activo.
  SELECT numero_serie INTO v_machine
  FROM public.machines WHERE numero_serie = v_serial AND active = true;

  -- Validaciones de forma (amber).
  IF v_conf < 0.80 THEN v_errors := v_errors || 'V_CONF'; END IF;
  IF v_bw IS NULL OR v_bw < 0 OR v_bw > 100000000 THEN v_errors := v_errors || 'V_RANGE_BW'; END IF;
  IF v_color IS NULL OR v_color < 0 OR v_color > 100000000 THEN v_errors := v_errors || 'V_RANGE_COLOR'; END IF;
  IF v_year NOT IN (v_cur_year, v_cur_year - 1) THEN v_errors := v_errors || 'V_YEAR'; END IF;
  IF v_month < 1 OR v_month > 12 THEN v_errors := v_errors || 'V_MONTH'; END IF;
  -- Sumas cruzadas SOLO si la hoja trae los sub-campos (Ricoh). Pantum/otras no los traen.
  IF v_copier_bw IS NOT NULL AND v_printer_bw IS NOT NULL AND v_bw IS NOT NULL
     AND (v_copier_bw + v_printer_bw) <> v_bw THEN v_errors := v_errors || 'V_CROSS_BW'; END IF;
  IF v_copier_col IS NOT NULL AND v_printer_col IS NOT NULL AND v_color IS NOT NULL
     AND (v_copier_col + v_printer_col) <> v_color THEN v_errors := v_errors || 'V_CROSS_COLOR'; END IF;

  -- Validaciones que dependen de datos (solo si hay máquina).
  IF v_machine IS NOT NULL THEN
    SELECT counter_bw, counter_color INTO v_prev_bw, v_prev_color
    FROM public.machine_counters
    WHERE machine_id = v_machine AND status = 'actif'
    ORDER BY year DESC, month DESC, recorded_at DESC
    LIMIT 1;

    IF v_prev_bw IS NOT NULL AND v_bw IS NOT NULL AND v_bw < v_prev_bw THEN
      v_errors := v_errors || 'V_NONDECR_BW';
    END IF;
    IF v_prev_color IS NOT NULL AND v_color IS NOT NULL AND v_color < v_prev_color THEN
      v_errors := v_errors || 'V_NONDECR_COLOR';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.machine_counters
      WHERE machine_id = v_machine AND year = v_year AND month = v_month AND status = 'actif'
    ) THEN
      v_errors := v_errors || 'V_DUP_MONTH';
    END IF;
  END IF;

  -- Semáforo.
  IF NOT v_is_sheet OR v_serial IS NULL THEN
    v_light := 'red';
  ELSIF v_machine IS NULL THEN
    v_light := 'red';
    v_errors := v_errors || 'V_NO_MATCH';
  ELSIF array_length(v_errors, 1) IS NULL THEN
    v_light := 'green';
  ELSE
    v_light := 'amber';
  END IF;

  UPDATE public.pending_counter_imports
  SET extracted_data    = p_extracted,
      matched_machine_id = v_machine,
      validation_errors = to_jsonb(v_errors),
      light             = v_light,
      status            = 'pending_review',
      extracted_at      = now()
  WHERE id = p_pending_id;

  RETURN jsonb_build_object('light', v_light, 'matched_machine_id', v_machine, 'errors', to_jsonb(v_errors));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_counter_extraction(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_counter_extraction(uuid, jsonb) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: confirmación del admin → INSERT en machine_counters.
--    p_overrides permite que el admin corrija campos antes de confirmar.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_counter_from_pending(
  p_pending_id uuid, p_reviewed_by uuid, p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row     public.pending_counter_imports;
  v_machine text;
  v_bw      int;
  v_color   int;
  v_date    timestamptz;
  v_year    int;
  v_month   int;
  v_day     int;
  v_client  bigint;
  v_contract uuid;
  v_counter_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.pending_counter_imports WHERE id = p_pending_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'pending_not_found'; END IF;
  IF v_row.status <> 'pending_review' THEN RAISE EXCEPTION 'already_processed'; END IF;

  -- El override de máquina gana al match automático (caso 🔴 asignado a mano).
  v_machine := COALESCE(NULLIF(p_overrides->>'machine_id',''), v_row.matched_machine_id);
  IF v_machine IS NULL THEN RAISE EXCEPTION 'no_machine'; END IF;

  v_bw    := COALESCE(NULLIF(p_overrides->>'counter_bw','')::int,    (v_row.extracted_data->>'counter_bw')::int);
  v_color := COALESCE(NULLIF(p_overrides->>'counter_color','')::int, (v_row.extracted_data->>'counter_color')::int);
  v_date  := COALESCE(NULLIF(p_overrides->>'date_iso','')::timestamptz, NULLIF(v_row.extracted_data->>'date_iso','')::timestamptz, now());
  v_year  := EXTRACT(YEAR  FROM v_date)::int;
  v_month := EXTRACT(MONTH FROM v_date)::int;
  v_day   := EXTRACT(DAY   FROM v_date)::int;

  IF v_bw IS NULL OR v_color IS NULL THEN RAISE EXCEPTION 'missing_counters'; END IF;

  -- No duplicar el relevé del mes (respeta machine_counters_one_active_per_month).
  IF EXISTS (
    SELECT 1 FROM public.machine_counters
    WHERE machine_id = v_machine AND year = v_year AND month = v_month AND status = 'actif'
  ) THEN
    RAISE EXCEPTION 'counter_exists_for_month';
  END IF;

  -- Cliente/contrato actual del parque (línea abierta).
  SELECT c.client_id, cm.contract_id INTO v_client, v_contract
  FROM public.contract_machines cm
  JOIN public.contracts c ON c.id = cm.contract_id
  WHERE cm.machine_id = v_machine AND cm.date_fin IS NULL AND cm.statut = 'actif'
  LIMIT 1;

  INSERT INTO public.machine_counters
    (machine_id, contract_id, client_id, year, month, day, counter_bw, counter_color,
     status, notes, recorded_by, recorded_at)
  VALUES
    (v_machine, v_contract, v_client, v_year, v_month, v_day, v_bw, v_color,
     'actif', 'Importé via email (OCR)', NULL, now())
  RETURNING id INTO v_counter_id;

  UPDATE public.pending_counter_imports
  SET status = 'confirmed', imported_counter_id = v_counter_id,
      reviewed_by = p_reviewed_by, reviewed_at = now()
  WHERE id = p_pending_id;

  RETURN v_counter_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_counter_from_pending(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.import_counter_from_pending(uuid, uuid, jsonb) TO service_role;

COMMIT;
```

- [ ] **Step 2: Aplicar la migración a prod vía MCP Supabase**

Aplicar con la herramienta `mcp__supabase__apply_migration` (name: `counter_imports`, query: el contenido entre `BEGIN;`/`COMMIT;`). Confirmar `{"success":true}`.

> ⚠️ Como en PR #87: la migración se aplica vía MCP, que genera su propio timestamp en `supabase_migrations.schema_migrations`. Tras aplicar, en Step 3 renombrar el archivo local para que coincida con la versión registrada (consultar con `mcp__supabase__list_migrations`).

- [ ] **Step 3: Alinear el nombre del archivo con la versión registrada**

Consultar `mcp__supabase__list_migrations`, tomar la `version` del registro `counter_imports`, y `git mv` el archivo a `supabase/migrations/<version>_counter_imports.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(counters): migración buzón de contadores (bucket + cola + RPCs)"
```

### Task B1.2: Tests de integración de las RPCs

**Files:**
- Create: `tests/rls/counter-import.test.ts`

- [ ] **Step 1: Escribir el test de integración (debe fallar: RPCs aún no en la BD local)**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, SERVICE_KEY } from './helpers'

const admin = adminClient()
const SN = 'TEST-PCI-SN1'

async function seedPending(hash: string): Promise<string> {
  const { data, error } = await admin.from('pending_counter_imports').insert({
    image_path: '2026/06/test.jpg', image_size_bytes: 1000, image_hash_sha256: hash,
  }).select('id').single()
  if (error) throw new Error(`seed pending: ${error.message}`)
  return data!.id as string
}

beforeAll(async () => {
  if (!SERVICE_KEY) throw new Error('Falta SERVICE_ROLE_KEY. Ejecuta con `supabase start`.')
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TESTHASH-%')
  await admin.from('machine_counters').delete().eq('machine_id', SN)
  await admin.from('machines').delete().eq('numero_serie', SN)
  const { error } = await admin.from('machines').insert({ numero_serie: SN, marque: 'Ricoh', modele: 'T', type: 'color' })
  if (error) throw new Error(`seed machine: ${error.message}`)
}, 60_000)

afterAll(async () => {
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TESTHASH-%')
  await admin.from('machine_counters').delete().eq('machine_id', SN)
  await admin.from('machines').delete().eq('numero_serie', SN)
})

describe('process_counter_extraction — semáforo', () => {
  it('🟢 green cuando casa el serial y todo cuadra', async () => {
    const id = await seedPending('TESTHASH-green')
    const { data, error } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 1000, counter_color: 500,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(error).toBeNull()
    expect(data.light).toBe('green')
    expect(data.matched_machine_id).toBe(SN)
  })

  it('🔴 red cuando el serial no existe', async () => {
    const id = await seedPending('TESTHASH-nomatch')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: 'NO-EXISTE-XYZ', date_iso: '2026-06-10T10:00:00', counter_bw: 1, counter_color: 1,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(data.light).toBe('red')
    expect(data.matched_machine_id).toBeNull()
  })

  it('🔴 red cuando no es una hoja de contador', async () => {
    const id = await seedPending('TESTHASH-notsheet')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 1, counter_color: 1,
        confidence: 0.95, is_valid_counter_sheet: false, issues: [] },
    })
    expect(data.light).toBe('red')
  })

  it('🟡 amber cuando las sumas cruzadas no cuadran (Ricoh)', async () => {
    const id = await seedPending('TESTHASH-cross')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 999, counter_color: 500,
        copier_bw: 600, printer_bw: 300, confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(data.light).toBe('amber')
    expect(data.errors).toContain('V_CROSS_BW')
  })
})

describe('import_counter_from_pending — confirmación', () => {
  it('inserta en machine_counters y marca confirmed', async () => {
    const id = await seedPending('TESTHASH-import')
    await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 2000, counter_color: 800,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    const { data: counterId, error } = await admin.rpc('import_counter_from_pending', {
      p_pending_id: id, p_reviewed_by: null, p_overrides: {},
    })
    expect(error).toBeNull()
    expect(counterId).toBeTruthy()
    const { data: mc } = await admin.from('machine_counters').select('counter_bw, counter_color').eq('id', counterId).single()
    expect(mc?.counter_bw).toBe(2000)
    const { data: pci } = await admin.from('pending_counter_imports').select('status').eq('id', id).single()
    expect(pci?.status).toBe('confirmed')
  })
})
```

- [ ] **Step 2: Arrancar Supabase local y correr el test (debe pasar tras aplicar la migración localmente)**

```bash
supabase start
supabase db reset   # aplica todas las migraciones a la BD local
SUPABASE_URL=http://127.0.0.1:54321 \
  SERVICE_ROLE_KEY="$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)" \
  ANON_KEY="$(supabase status -o env | grep ANON_KEY | cut -d= -f2)" \
  npm run test:rls -- counter-import
```
Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/counter-import.test.ts
git commit -m "test(counters): integración de process/import RPCs"
```

---

## BLOQUE B2 — Lectura IA (Edge Function `parse-counter-image`)

### Task B2.1: Tipos compartidos del extracted_data

**Files:**
- Create: `supabase/functions/_shared/counter-types.ts`

- [ ] **Step 1: Escribir los tipos (Deno)**

```typescript
// Estructura que el LLM devuelve (tool_use) y que consume process_counter_extraction.
export interface CounterExtraction {
  is_valid_counter_sheet: boolean
  serial: string
  date_iso: string            // ISO 8601, p.ej. 2026-06-10T14:35:00
  counter_bw: number          // total B&N
  counter_color: number       // total color (0 si la máquina es noir_blanc)
  copier_bw?: number          // sub-campos Ricoh (para validación cruzada); ausentes en otras marcas
  printer_bw?: number
  copier_color?: number
  printer_color?: number
  confidence: number          // 0..1
  issues: string[]            // SOLO problemas reales detectados por el modelo
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/counter-types.ts
git commit -m "feat(counters): tipos compartidos del extracted_data"
```

### Task B2.2: Prompt + tool schema

**Files:**
- Create: `supabase/functions/parse-counter-image/prompt.ts`

- [ ] **Step 1: Escribir el prompt y el schema (multi-marca)**

```typescript
export const COUNTER_TOOL = {
  name: 'submit_counter_reading',
  description: 'Submit the structured counter reading extracted from the page.',
  input_schema: {
    type: 'object',
    required: ['is_valid_counter_sheet', 'serial', 'date_iso', 'counter_bw', 'counter_color', 'confidence', 'issues'],
    properties: {
      is_valid_counter_sheet: { type: 'boolean', description: 'true ONLY if the image is a printer/copier page-counter sheet (Ricoh, Pantum or similar). false for any other document, blank page, or unrelated image.' },
      serial: { type: 'string', description: 'The machine serial number printed on the sheet. Empty string if not legible.' },
      date_iso: { type: 'string', description: 'Reading date in ISO 8601, e.g. 2026-06-10T14:35:00. Use the date printed on the sheet.' },
      counter_bw: { type: 'integer', description: 'Total black & white counter (the grand B&W total). 0 if none.' },
      counter_color: { type: 'integer', description: 'Total color counter (the grand color total). 0 for monochrome machines.' },
      copier_bw: { type: 'integer', description: 'Ricoh only: Copier B&W sub-counter. Omit if not present.' },
      printer_bw: { type: 'integer', description: 'Ricoh only: Printer B&W sub-counter. Omit if not present.' },
      copier_color: { type: 'integer', description: 'Ricoh only: Copier Color sub-counter. Omit if not present.' },
      printer_color: { type: 'integer', description: 'Ricoh only: Printer Color sub-counter. Omit if not present.' },
      confidence: { type: 'number', description: '0..1 overall confidence in the extracted values.' },
      issues: { type: 'array', items: { type: 'string' }, description: 'ONLY actual problems (blur, glare, ambiguous digit). Empty array if clean. Do NOT log checks that passed.' },
    },
  },
} as const

export const COUNTER_SYSTEM = [
  'You read printer/copier page-counter sheets (Ricoh, Pantum and similar brands) and extract the counters.',
  'Always return the GRAND totals in counter_bw and counter_color.',
  'For Ricoh sheets that show Copier/Printer sub-totals, also return the sub-fields so the server can cross-check.',
  'For Pantum or brands without sub-totals, return only counter_bw/counter_color and omit the sub-fields.',
  'issues must contain ONLY real problems. If a value is clearly legible, do not mention it.',
  'If the image is not a counter sheet, set is_valid_counter_sheet=false and return zeros.',
].join(' ')
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/parse-counter-image/prompt.ts
git commit -m "feat(counters): prompt + tool schema multi-marca"
```

### Task B2.3: Edge Function `parse-counter-image`

**Files:**
- Create: `supabase/functions/parse-counter-image/index.ts`

- [ ] **Step 1: Escribir la Edge Function**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAdminClient } from '../_shared/db.ts'
import { isValidSecretKey, getAllSecretKeys } from '../_shared/secret-key.ts'
import { COUNTER_TOOL, COUNTER_SYSTEM } from './prompt.ts'
import type { CounterExtraction } from '../_shared/counter-types.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-sonnet-4-6'

// Mapea content-type a media_type aceptado por la API de Anthropic.
function mediaType(ct: string): string | null {
  if (ct === 'image/jpeg' || ct === 'image/png' || ct === 'image/webp' || ct === 'image/gif') return ct
  if (ct === 'application/pdf') return 'application/pdf'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
  if (getAllSecretKeys().length === 0 || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'config_missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!isValidSecretKey(token)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let body: { pending_id: string; image_path: string; content_type: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const db = getAdminClient()

  // 1) Descargar la imagen del bucket privado.
  const { data: file, error: dlErr } = await db.storage.from('counter-images').download(body.image_path)
  if (dlErr || !file) {
    await db.from('pending_counter_imports').update({ status: 'failed_extraction' }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'download_failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  const mt = mediaType(body.content_type) ?? 'image/jpeg'
  const sourceBlock = mt === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mt, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } }

  // 2) Llamar a Claude (tool_use forzado).
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1024, system: COUNTER_SYSTEM,
      tools: [COUNTER_TOOL], tool_choice: { type: 'tool', name: 'submit_counter_reading' },
      messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: 'Extract the counter reading.' }] }],
    }),
  })
  const out = await res.json()
  if (!res.ok) {
    console.error('[parse-counter-image] anthropic error', out)
    await db.from('pending_counter_imports').update({ status: 'failed_extraction', extraction_model: MODEL }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'llm_error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const toolUse = (out.content ?? []).find((c: { type: string }) => c.type === 'tool_use')
  if (!toolUse) {
    await db.from('pending_counter_imports').update({ status: 'failed_extraction', extraction_model: MODEL }).eq('id', body.pending_id)
    return new Response(JSON.stringify({ error: 'no_tool_use' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
  const extracted = toolUse.input as CounterExtraction

  // 3) Coste aproximado (Sonnet: $3/M in, $15/M out).
  const usage = out.usage ?? { input_tokens: 0, output_tokens: 0 }
  const cost = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000

  await db.from('pending_counter_imports')
    .update({ extraction_model: MODEL, extraction_cost_usd: cost })
    .eq('id', body.pending_id)

  // 4) Decidir semáforo + match + persistir (toda la lógica en SQL).
  const { data: result, error: rpcErr } = await db.rpc('process_counter_extraction', {
    p_pending_id: body.pending_id, p_extracted: extracted,
  })
  if (rpcErr) {
    console.error('[parse-counter-image] process rpc', rpcErr)
    return new Response(JSON.stringify({ error: 'process_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 2: Verificar tipado Deno (sin desplegar aún)**

Si hay `deno` instalado: `deno check supabase/functions/parse-counter-image/index.ts`. Si no, se valida al desplegar en B6. Expected: sin errores de tipos.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/parse-counter-image/index.ts
git commit -m "feat(counters): Edge Function parse-counter-image (OCR Claude)"
```

---

## BLOQUE B3 — Entrada email (Edge Function `receive-counter-email`)

> **Contrato normalizado:** esta función NO habla con un proveedor concreto. Espera un POST con un JSON normalizado. Un adaptador externo (Cloudflare Email Worker o el inbound parsing del proveedor elegido) traduce el email real a este contrato. Así la función es testeable con un payload simulado y el proveedor queda desacoplado.
>
> **Acción de configuración (fuera de este plan, documentada en el spec §10):** elegir proveedor inbound, apuntar los MX de `test-sav.site`, y configurar el adaptador para que haga POST a `/functions/v1/receive-counter-email` con el header `X-Counter-Webhook-Secret`.

### Task B3.1: Edge Function `receive-counter-email`

**Files:**
- Create: `supabase/functions/receive-counter-email/index.ts`

- [ ] **Step 1: Escribir la Edge Function**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAdminClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/secret-key.ts'

const WEBHOOK_SECRET = Deno.env.get('COUNTER_WEBHOOK_SECRET') ?? ''
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/parse-counter-image`
const SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_BYTES = 10 * 1024 * 1024

// Contrato normalizado que envía el adaptador del proveedor.
interface InboundEmail {
  from: string
  subject?: string
  message_id?: string
  attachments: { filename: string; content_base64: string; content_type: string }[]
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }
  // Validación de firma: secreto compartido en header (timing-safe).
  const sig = req.headers.get('X-Counter-Webhook-Secret') ?? ''
  if (!WEBHOOK_SECRET || sig.length !== WEBHOOK_SECRET.length || !timingSafeEqual(sig, WEBHOOK_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let email: InboundEmail
  try { email = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const db = getAdminClient()
  const now = new Date()
  const yr = now.getUTCFullYear()
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  let queued = 0, skipped = 0

  for (const att of email.attachments ?? []) {
    if (!ALLOWED.has(att.content_type)) { skipped++; continue }
    const bytes = Uint8Array.from(atob(att.content_base64), c => c.charCodeAt(0))
    if (bytes.length === 0 || bytes.length > MAX_BYTES) { skipped++; continue }

    const hash = await sha256Hex(bytes)
    const ext = att.content_type === 'application/pdf' ? 'pdf' : att.content_type.split('/')[1]
    const path = `${yr}/${mo}/${hash}.${ext}`

    // Idempotencia: si el hash ya existe, saltar.
    const { data: existing } = await db.from('pending_counter_imports').select('id').eq('image_hash_sha256', hash).maybeSingle()
    if (existing) { skipped++; continue }

    const up = await db.storage.from('counter-images').upload(path, bytes, { contentType: att.content_type, upsert: false })
    if (up.error) { console.error('[receive-counter-email] upload', up.error); skipped++; continue }

    const { data: pending, error: insErr } = await db.from('pending_counter_imports').insert({
      image_path: path, image_size_bytes: bytes.length, image_hash_sha256: hash,
      source: 'email', email_from: email.from, email_subject: email.subject ?? null,
      email_message_id: email.message_id ?? null,
    }).select('id').single()
    if (insErr) { console.error('[receive-counter-email] insert', insErr); skipped++; continue }

    // Disparar el OCR (fire-and-forget; no bloquea la respuesta al proveedor).
    fetch(SELF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}` },
      body: JSON.stringify({ pending_id: pending!.id, image_path: path, content_type: att.content_type }),
    }).catch(e => console.error('[receive-counter-email] trigger parse', e))
    queued++
  }

  return new Response(JSON.stringify({ ok: true, queued, skipped }), { headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 2: Verificar tipado Deno (si `deno` disponible) o aplazar a B6**

Run: `deno check supabase/functions/receive-counter-email/index.ts`. Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/receive-counter-email/index.ts
git commit -m "feat(counters): Edge Function receive-counter-email (webhook normalizado)"
```

---

## BLOQUE B4 — UI de revisión `/admin/contadores/pendientes`

### Task B4.1: Server Actions (confirmar/rechazar/asignar)

**Files:**
- Create: `src/app/admin/contadores/pendientes/actions.ts`

- [ ] **Step 1: Escribir las Server Actions**

```typescript
'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | { ok: true } | null

export async function confirmPendingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireAdmin()
  const id = fd.get('id') as string
  const overrides: Record<string, string> = {}
  for (const k of ['machine_id', 'counter_bw', 'counter_color', 'date_iso']) {
    const v = (fd.get(k) as string | null)?.trim()
    if (v) overrides[k] = v
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc('import_counter_from_pending', {
    p_pending_id: id, p_reviewed_by: user.id, p_overrides: overrides,
  })
  if (error) {
    console.error('[confirmPending]', error)
    const map: Record<string, string> = {
      no_machine: 'Aucune machine associée. Choisissez-en une.',
      counter_exists_for_month: 'Un relevé existe déjà pour ce mois.',
      already_processed: 'Déjà traité.',
      missing_counters: 'Compteurs manquants.',
    }
    return { error: map[error.message] ?? 'Erreur lors de la confirmation.' }
  }
  revalidatePath('/admin/contadores/pendientes')
  return { ok: true }
}

export async function rejectPendingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireAdmin()
  const id = fd.get('id') as string
  const reason = ((fd.get('reason') as string) ?? '').trim()
  if (!reason) return { error: 'Motif obligatoire.' }
  const admin = createAdminClient()
  const { error } = await admin.from('pending_counter_imports')
    .update({ status: 'rejected', rejection_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending_review')
  if (error) { console.error('[rejectPending]', error); return { error: 'Erreur lors du rejet.' } }
  revalidatePath('/admin/contadores/pendientes')
  return { ok: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/contadores/pendientes/actions.ts
git commit -m "feat(counters): server actions de la cola de revisión"
```

### Task B4.2: Página de la cola + signed URLs

**Files:**
- Create: `src/app/admin/contadores/pendientes/page.tsx`

- [ ] **Step 1: Escribir la página (Server Component)**

```typescript
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import PendingList from './PendingList'

export const dynamic = 'force-dynamic'

type Pending = {
  id: string; image_path: string; light: 'green' | 'amber' | 'red'; status: string
  matched_machine_id: string | null; email_from: string | null; extracted_at: string
  extracted_data: Record<string, unknown>; validation_errors: string[]
}

export default async function PendingCountersPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pending_counter_imports')
    .select('id, image_path, light, status, matched_machine_id, email_from, extracted_at, extracted_data, validation_errors')
    .eq('status', 'pending_review')
    .order('extracted_at', { ascending: false })
    .limit(200)
  if (error) { console.error('[pending-counters]', error); throw new Error('DATA_FETCH_ERROR') }

  // Signed URLs (TTL 1h) para mostrar las imágenes del bucket privado.
  const rows = (data ?? []) as Pending[]
  const withUrls = await Promise.all(rows.map(async (r) => {
    const { data: signed } = await admin.storage.from('counter-images').createSignedUrl(r.image_path, 3600)
    return { ...r, image_url: signed?.signedUrl ?? null }
  }))

  // Lista de máquinas activas para el selector de asignación manual (🔴).
  const { data: machines } = await admin.from('machines').select('numero_serie, marque, modele').eq('active', true).order('numero_serie')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Compteurs en attente</h1>
        <p className="text-sm text-ink-muted mt-0.5">Relevés reçus par email, à valider avant import.</p>
      </div>
      <Card className="p-0">
        {withUrls.length === 0
          ? <p className="px-6 py-8 text-sm text-center text-ink-muted">Aucun compteur en attente.</p>
          : <PendingList rows={withUrls} machines={machines ?? []} />}
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/contadores/pendientes/page.tsx
git commit -m "feat(counters): página de la cola de revisión"
```

### Task B4.3: Componente cliente (lista + detalle + acciones)

**Files:**
- Create: `src/app/admin/contadores/pendientes/PendingList.tsx`

- [ ] **Step 1: Escribir el componente cliente**

```typescript
'use client'
import { useActionState, useState } from 'react'
import { confirmPendingAction, rejectPendingAction } from './actions'

type Row = {
  id: string; image_url: string | null; light: 'green' | 'amber' | 'red'
  matched_machine_id: string | null; email_from: string | null
  extracted_data: Record<string, unknown>; validation_errors: string[]
}
type Machine = { numero_serie: string; marque: string; modele: string }

const DOT: Record<Row['light'], string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }
const inputCls = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink'

export default function PendingList({ rows, machines }: { rows: Row[]; machines: Machine[] }) {
  const [selected, setSelected] = useState<Row | null>(rows[0] ?? null)
  return (
    <div className="grid grid-cols-[280px_1fr] divide-x divide-line min-h-[400px]">
      <ul className="divide-y divide-line overflow-y-auto">
        {rows.map(r => (
          <li key={r.id}>
            <button onClick={() => setSelected(r)}
              className={`w-full text-left px-4 py-3 hover:bg-neutral-soft ${selected?.id === r.id ? 'bg-neutral-soft' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[r.light]}`} />
                <span className="text-sm font-medium text-ink truncate">{r.matched_machine_id ?? '(non identifiée)'}</span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5 truncate">{r.email_from ?? ''}</p>
            </button>
          </li>
        ))}
      </ul>
      {selected && <Detail key={selected.id} row={selected} machines={machines} />}
    </div>
  )
}

function Detail({ row, machines }: { row: Row; machines: Machine[] }) {
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmPendingAction, null)
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectPendingAction, null)
  const d = row.extracted_data
  return (
    <div className="p-5 space-y-4">
      {row.image_url && <img src={row.image_url} alt="relevé" className="max-h-64 rounded-lg border border-line object-contain" />}
      {row.validation_errors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.validation_errors.map(e => <span key={e} className="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">{e}</span>)}
        </div>
      )}
      <form action={confirmAction} className="space-y-3">
        <input type="hidden" name="id" value={row.id} />
        {!row.matched_machine_id && (
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Machine (à assigner)</label>
            <select name="machine_id" required className={inputCls}>
              <option value="">— Choisir —</option>
              {machines.map(m => <option key={m.numero_serie} value={m.numero_serie}>{m.numero_serie} · {m.marque} {m.modele}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-ink-muted mb-1">N&B</label>
            <input name="counter_bw" type="number" defaultValue={String(d.counter_bw ?? '')} className={inputCls} /></div>
          <div><label className="block text-xs text-ink-muted mb-1">Couleur</label>
            <input name="counter_color" type="number" defaultValue={String(d.counter_color ?? '')} className={inputCls} /></div>
          <div><label className="block text-xs text-ink-muted mb-1">Date</label>
            <input name="date_iso" type="text" defaultValue={String(d.date_iso ?? '')} className={inputCls} /></div>
        </div>
        {confirmState && 'error' in confirmState && <p className="text-xs text-accent">{confirmState.error}</p>}
        <button type="submit" disabled={confirmPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {confirmPending ? 'Import…' : 'Confirmer et importer'}
        </button>
      </form>
      <form action={rejectAction} className="space-y-2 border-t border-line pt-3">
        <input type="hidden" name="id" value={row.id} />
        <input name="reason" placeholder="Motif du rejet" className={inputCls} />
        {rejectState && 'error' in rejectState && <p className="text-xs text-accent">{rejectState.error}</p>}
        <button type="submit" disabled={rejectPending} className="text-xs text-ink-muted hover:text-accent">
          {rejectPending ? '…' : 'Rejeter'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build/tsc**

Run: `npm run typecheck`. Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/contadores/pendientes/PendingList.tsx
git commit -m "feat(counters): componente cliente de revisión (lista + detalle)"
```

### Task B4.4: Entrada en el sidebar

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Añadir la entrada en el grupo Pilotage (debajo de Compteurs)**

Localizar la línea `{ href: '/admin/contadores', label: 'Compteurs', icon: BarChart2 },` y añadir justo debajo:

```typescript
      { href: '/admin/contadores/pendientes', label: 'Compteurs en attente', icon: Inbox },
```

(Reutiliza el icono `Inbox` ya importado para Leads.)

- [ ] **Step 2: Verificar build**

Run: `npm run typecheck`. Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat(counters): entrada sidebar 'Compteurs en attente'"
```

---

## BLOQUE B5 — Aviso de lote

### Task B5.1: Plantilla de email en `send-email`

**Files:**
- Modify: `supabase/functions/send-email/index.ts`

- [ ] **Step 1: Añadir el template `counter_batch_processed`**

En el tipo `TemplateName` añadir `'counter_batch_processed'`. En la función `renderTemplate` (donde se resuelven los templates por nombre) añadir el caso:

```typescript
  if (template === 'counter_batch_processed') {
    const total = data.total ?? '0'
    const greens = data.greens ?? '0'
    const attention = data.attention ?? '0'
    return {
      subject: `[AMD SAV] ${total} compteur(s) traité(s) par email`,
      html: `<p><strong>${total}</strong> compteur(s) reçus par email ont été traités.</p>
             <ul><li>🟢 ${greens} prêt(s) à confirmer</li><li>🟡🔴 ${attention} à vérifier</li></ul>
             <p><a href="${data.url ?? ''}">Voir la file d'attente →</a></p>`,
    }
  }
```

- [ ] **Step 2: Desplegar la función actualizada (en B6 junto con el resto) — por ahora solo commit**

```bash
git add supabase/functions/send-email/index.ts
git commit -m "feat(counters): template email counter_batch_processed"
```

### Task B5.2: Cierre de lote y disparo del aviso

**Files:**
- Modify: `supabase/functions/receive-counter-email/index.ts`

- [ ] **Step 1: Tras el bucle de adjuntos, esperar el procesado del lote y enviar el aviso**

Reemplazar el `return` final por: esperar a que las filas del `message_id` dejen de estar en extracción y enviar el resumen. Como el `parse` es fire-and-forget, el aviso se basa en lo encolado (`queued`) y se envía con un breve margen. Implementación: tras el bucle, si `queued > 0`, llamar a `send-email`:

```typescript
  if (queued > 0) {
    const notify = (Deno.env.get('COUNTER_NOTIFY_EMAILS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
    if (notify.length > 0) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}` },
        body: JSON.stringify({
          template: 'counter_batch_processed', to: notify,
          data: { total: String(queued), greens: '—', attention: '—', url: `${appUrl}/admin/contadores/pendientes` },
        }),
      }).catch(e => console.error('[receive-counter-email] notify', e))
    }
  }

  return new Response(JSON.stringify({ ok: true, queued, skipped }), { headers: { 'Content-Type': 'application/json' } })
```

> Nota: el desglose 🟢/🟡🔴 exacto requeriría esperar al OCR asíncrono; en fase 1 el aviso informa del total encolado y enlaza a la cola, donde los semáforos ya están calculados. Mejora futura: agrupar por `message_id` y enviar el resumen cuando todas las filas salgan de extracción.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/receive-counter-email/index.ts
git commit -m "feat(counters): aviso de lote tras procesar el email"
```

---

## BLOQUE B6 — Integración E2E + gate

### Task B6.1: Secrets y despliegue de las Edge Functions

**Files:** (sin cambios de código — operaciones de despliegue)

- [ ] **Step 1: Cargar el secret de la IA en Supabase (NO en Vercel)**

```bash
supabase secrets set ANTHROPIC_API_KEY="<valor de .env.local>" --project-ref myyejbviunyvywfukysj
supabase secrets set COUNTER_WEBHOOK_SECRET="<generar un secreto largo aleatorio>" --project-ref myyejbviunyvywfukysj
supabase secrets set COUNTER_NOTIFY_EMAILS="<email admin de pruebas>" --project-ref myyejbviunyvywfukysj
```

- [ ] **Step 2: Desplegar las tres Edge Functions**

```bash
supabase functions deploy parse-counter-image --project-ref myyejbviunyvywfukysj
supabase functions deploy receive-counter-email --project-ref myyejbviunyvywfukysj
supabase functions deploy send-email --project-ref myyejbviunyvywfukysj
```
Expected: las tres `ACTIVE`. Verificar con `mcp__supabase__list_edge_functions`.

### Task B6.2: Gate E2E con un email simulado

**Files:** (sin cambios de código — verificación)

- [ ] **Step 1: Preparar una máquina de prueba y simular un email entrante**

Crear una máquina sintética en prod (vía MCP SQL): `INSERT INTO machines (numero_serie, marque, modele, type, active) VALUES ('GATE-CTR-SN1','Ricoh','Test','color',true);`

Tomar una imagen real de hoja de contador, codificarla en base64, y hacer POST a la función (sustituyendo el serial leído por el de la máquina o usando una foto cuyo serial case):

```bash
curl -X POST "https://myyejbviunyvywfukysj.supabase.co/functions/v1/receive-counter-email" \
  -H "Content-Type: application/json" \
  -H "X-Counter-Webhook-Secret: <COUNTER_WEBHOOK_SECRET>" \
  -d '{"from":"test@cliente.com","subject":"compteur","message_id":"gate-1","attachments":[{"filename":"c.jpg","content_type":"image/jpeg","content_base64":"<BASE64>"}]}'
```
Expected: `{"ok":true,"queued":1,"skipped":0}`.

- [ ] **Step 2: Verificar la fila en la cola (vía MCP SQL)**

```sql
SELECT light, status, matched_machine_id, extracted_data->>'serial' AS serial,
       extracted_data->>'counter_bw' AS bw, validation_errors
FROM pending_counter_imports WHERE email_message_id = 'gate-1';
```
Expected: una fila con `light` coherente (🟢 si el serial casa y cuadra), `extracted_data` con los contadores leídos.

- [ ] **Step 3: Confirmar desde SQL la importación (simula el clic del admin)**

```sql
SELECT import_counter_from_pending(
  (SELECT id FROM pending_counter_imports WHERE email_message_id='gate-1'),
  NULL, '{}'::jsonb);
-- Verificar:
SELECT counter_bw, counter_color, notes FROM machine_counters WHERE machine_id='GATE-CTR-SN1';
```
Expected: una fila en `machine_counters` con los contadores y `notes='Importé via email (OCR)'`.

> La RPC requiere `service_role`; ejecutar el bloque dentro de `DO $$ ... PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true); ... $$` o vía la Edge Function, según el patrón usado en gates previos.

- [ ] **Step 4: Limpieza total de los datos de prueba**

```sql
DELETE FROM machine_counters WHERE machine_id='GATE-CTR-SN1';
DELETE FROM pending_counter_imports WHERE email_message_id='gate-1';
DELETE FROM machines WHERE numero_serie='GATE-CTR-SN1';
-- Borrar también el objeto del bucket counter-images (vía Storage API o dashboard).
```
Verificar 0 residuos.

### Task B6.3: Documentación

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Añadir una sección "Buzón de contadores por email"**

Documentar: el flujo (email → cartero → `receive-counter-email` → `parse-counter-image` → `process_counter_extraction` → cola → `import_counter_from_pending` → `machine_counters`), la tabla `pending_counter_imports`, el bucket `counter-images`, las dos RPCs, los semáforos, y las variables de entorno (`COUNTER_INBOX_ADDRESS`, `COUNTER_WEBHOOK_SECRET`, `COUNTER_NOTIFY_EMAILS`, `ANTHROPIC_API_KEY`).

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): buzón de contadores por email (Fase 1)"
```

### Task B6.4: PR

- [ ] **Step 1: Abrir el PR**

```bash
git push -u origin feat/agente-contadores-email
gh pr create --title "feat(counters): buzón de contadores por email (Fase 1 del agente supervisor)" --body "<resumen del spec + gate E2E pasado>"
```

- [ ] **Step 2: `/code-review` del PR y aplicar fixes antes de mergear.**

---

## Self-Review (cobertura del spec)

- §1 Resumen / cola de revisión SIEMPRE → B1 (semáforo en SQL), B4 (UI). ✅
- §2 Recorrido de una foto → B3 (entrada) + B2 (OCR) + B1 (decisión) + B4 (revisión) + B5 (aviso). ✅
- §3 El cartero (contrato normalizado + firma) → B3. ✅
- §4 Tabla `pending_counter_imports` + bucket + RPCs + esquema verificado → B1. ✅
- §5 Lectura IA multi-marca + match + validaciones/semáforo → B2 (prompt) + B1 (RPC). ✅
- §6 Cola `/admin/contadores/pendientes` (lista+detalle+acciones) → B4. ✅
- §7 Aviso de lote → B5. ✅
- §8 Seguridad (secret en Supabase, bucket privado, firma webhook, INSERT solo service_role) → B1/B3/B6. ✅
- §10 Dependencias (proveedor inbound + MX + secrets) → B3 (nota) + B6.1. ✅
- **Acción manual pendiente (fuera del código):** elegir proveedor inbound + apuntar MX de `test-sav.site` + configurar el adaptador con `X-Counter-Webhook-Secret`. Documentada, no bloquea B1-B2-B4-B5.
