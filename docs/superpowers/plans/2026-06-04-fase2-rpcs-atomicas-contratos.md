# Fase 2 — RPCs Atómicas para Contratos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover la creación, edición y borrado de contratos a funciones Postgres `SECURITY DEFINER` atómicas, eliminando los riesgos de contratos huérfanos, mutación de historia y borrado destructivo.

**Architecture:** 3 RPCs en Postgres encapsulan toda la lógica transaccional. Las Server Actions validan formato con `requireAdmin()`, construyen un payload jsonb y lo invocan vía `createAdminClient()` (service_role). El `ContractForm` añade retiro con fecha explícita, bloqueo de cambio de máquina y manejo de error de borrado.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase JS (`rpc()`), PostgreSQL plpgsql, TypeScript, Supabase MCP (`apply_migration`)

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql` | Crear (3 RPCs + GRANTs) |
| `src/lib/contract-errors.ts` | Crear (mapeo de errores RPC → francés, compartido) |
| `src/app/admin/contracts/new/actions.ts` | Reescribir `createContractAction` |
| `src/app/admin/contracts/[id]/actions.ts` | Reescribir `updateContractAction` + `deleteContractAction` |
| `src/components/admin/ContractForm.tsx` | Retiro con fecha, máquina readonly, delete con error |
| `src/app/admin/contracts/[id]/page.tsx` | Verificar wiring deleteAction |
| `src/app/admin/contracts/new/page.tsx` | Verificación de build |

---

### Task 1: Rama Git

**Files:** N/A

- [ ] **Step 1: Crear rama desde main actualizado**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b fix/fase2-rpcs-atomicas-contratos
```

Expected: `git branch --show-current` muestra `fix/fase2-rpcs-atomicas-contratos`

---

### Task 2: Migración SQL — 3 RPCs

**Files:**
- Create: `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql`

- [ ] **Step 1: Confirmar nombres exactos de enums y columnas en producción**

Usar `mcp__supabase__execute_sql` (project_id `myyejbviunyvywfukysj`) con:
```sql
SELECT t.typname, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('contract_status','contract_machine_status','maintenance_frequency')
ORDER BY t.typname, e.enumsortorder;
```

Expected: confirma los nombres de tipo (`contract_status`, `contract_machine_status`, `maintenance_frequency`) y sus valores (incluido `terminé` con acento para `contract_machine_status`). Si algún nombre de tipo difiere, ajustar los casts del SQL del Step 2 en consecuencia antes de aplicar.

También confirmar el tipo de `contract_machines.machine_id` y `machine_counters.contract_id`:
```sql
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name IN ('contract_machines','machine_counters','maintenance_plans','incidents','contracts')
  AND column_name IN ('machine_id','contract_id','contract_machine_id','client_id','statut','billing_day','maintenance_frequency')
ORDER BY table_name, column_name;
```

- [ ] **Step 2: Crear el archivo de migración**

Crear `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql` con:

```sql
-- Fase 2: RPCs atómicas para contratos.
-- Patrón de seguridad idéntico a 20260517000000_fix_rpc_privilege_escalation.sql:
-- SECURITY DEFINER + guard service_role + REVOKE de roles no privilegiados.

-- ─────────────────────────────────────────────────────────────
-- RPC 1: create_contract_with_lines
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_contract_with_lines(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_lines       jsonb;
  v_line        jsonb;
  v_total       int;
  v_distinct    int;
  v_billing_day int;
  v_line_bill   int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_lines := payload->'lines';

  IF v_lines IS NULL OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'no_lines';
  END IF;

  SELECT count(*), count(DISTINCT elem->>'machine_id')
    INTO v_total, v_distinct
    FROM jsonb_array_elements(v_lines) elem;
  IF v_total <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_machine_in_payload';
  END IF;

  v_billing_day := NULLIF(payload->>'billing_day','')::int;
  IF v_billing_day IS NOT NULL AND (v_billing_day < 1 OR v_billing_day > 31) THEN
    RAISE EXCEPTION 'invalid_billing_day';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_line_bill := NULLIF(v_line->>'billing_day_override','')::int;
    IF v_line_bill IS NOT NULL AND (v_line_bill < 1 OR v_line_bill > 31) THEN
      RAISE EXCEPTION 'invalid_billing_day';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO contracts (numero_contrat, client_id, date_debut, date_renouvellement, statut, billing_day, maintenance_frequency)
    VALUES (
      payload->>'numero_contrat',
      (payload->>'client_id')::bigint,
      (payload->>'date_debut')::date,
      NULLIF(payload->>'date_renouvellement','')::date,
      (payload->>'statut')::contract_status,
      v_billing_day,
      NULLIF(payload->>'maintenance_frequency','')::maintenance_frequency
    )
    RETURNING id INTO v_contract_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'numero_contrat_exists';
  END;

  BEGIN
    INSERT INTO contract_machines (contract_id, machine_id, date_debut, statut, billing_day_override, maintenance_frequency_override, notes)
    SELECT
      v_contract_id,
      elem->>'machine_id',
      (elem->>'date_debut')::date,
      'actif'::contract_machine_status,
      NULLIF(elem->>'billing_day_override','')::int,
      NULLIF(elem->>'maintenance_frequency_override','')::maintenance_frequency,
      NULLIF(elem->>'notes','')
    FROM jsonb_array_elements(v_lines) elem;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  RETURN jsonb_build_object('ok', true, 'contract_id', v_contract_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC 2: update_contract_with_lines
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_contract_with_lines(p_contract_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines       jsonb;
  v_retire      jsonb;
  v_line        jsonb;
  v_ritem       jsonb;
  v_billing_day int;
  v_line_bill   int;
  v_total       int;
  v_distinct    int;
  v_existing    text;
  v_ldebut      date;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_lines  := COALESCE(payload->'lines',  '[]'::jsonb);
  v_retire := COALESCE(payload->'retire', '[]'::jsonb);

  v_billing_day := NULLIF(payload->>'billing_day','')::int;
  IF v_billing_day IS NOT NULL AND (v_billing_day < 1 OR v_billing_day > 31) THEN
    RAISE EXCEPTION 'invalid_billing_day';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_line_bill := NULLIF(v_line->>'billing_day_override','')::int;
    IF v_line_bill IS NOT NULL AND (v_line_bill < 1 OR v_line_bill > 31) THEN
      RAISE EXCEPTION 'invalid_billing_day';
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT elem->>'machine_id')
    INTO v_total, v_distinct
    FROM jsonb_array_elements(v_lines) elem;
  IF v_total <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_machine_in_payload';
  END IF;

  -- Inmutabilidad de machine_id en líneas existentes
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      SELECT machine_id INTO v_existing
        FROM contract_machines WHERE id = (v_line->>'id')::uuid;
      IF v_existing IS DISTINCT FROM (v_line->>'machine_id') THEN
        RAISE EXCEPTION 'machine_id_immutable';
      END IF;
    END IF;
  END LOOP;

  UPDATE contracts SET
    client_id            = (payload->>'client_id')::bigint,
    date_debut           = (payload->>'date_debut')::date,
    date_renouvellement  = NULLIF(payload->>'date_renouvellement','')::date,
    statut               = (payload->>'statut')::contract_status,
    billing_day          = v_billing_day,
    maintenance_frequency = NULLIF(payload->>'maintenance_frequency','')::maintenance_frequency
  WHERE id = p_contract_id;

  -- Insertar líneas nuevas (sin id)
  BEGIN
    INSERT INTO contract_machines (contract_id, machine_id, date_debut, statut, billing_day_override, maintenance_frequency_override, notes)
    SELECT
      p_contract_id,
      elem->>'machine_id',
      (elem->>'date_debut')::date,
      'actif'::contract_machine_status,
      NULLIF(elem->>'billing_day_override','')::int,
      NULLIF(elem->>'maintenance_frequency_override','')::maintenance_frequency,
      NULLIF(elem->>'notes','')
    FROM jsonb_array_elements(v_lines) elem
    WHERE NULLIF(elem->>'id','') IS NULL;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  -- Actualizar líneas existentes (SOLO campos mutables, nunca machine_id)
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      UPDATE contract_machines SET
        date_debut                     = (v_line->>'date_debut')::date,
        billing_day_override           = NULLIF(v_line->>'billing_day_override','')::int,
        maintenance_frequency_override = NULLIF(v_line->>'maintenance_frequency_override','')::maintenance_frequency,
        notes                          = NULLIF(v_line->>'notes','')
      WHERE id = (v_line->>'id')::uuid;
    END IF;
  END LOOP;

  -- Retirar líneas con date_fin explícita
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut INTO v_ldebut
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF (v_ritem->>'date_fin')::date < v_ldebut THEN
      RAISE EXCEPTION 'invalid_date_fin';
    END IF;
    UPDATE contract_machines SET
      date_fin = (v_ritem->>'date_fin')::date,
      statut   = 'terminé'::contract_machine_status
    WHERE id = (v_ritem->>'id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC 3: can_delete_contract (solo lectura)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION can_delete_contract(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incidents   int;
  v_counters    int;
  v_maintenance int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT count(*) INTO v_incidents
    FROM incidents
    WHERE contract_id = p_contract_id
       OR contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  SELECT count(*) INTO v_counters
    FROM machine_counters WHERE contract_id = p_contract_id;

  SELECT count(*) INTO v_maintenance
    FROM maintenance_plans WHERE contract_id = p_contract_id;

  RETURN jsonb_build_object(
    'can_delete',  (v_incidents = 0 AND v_counters = 0 AND v_maintenance = 0),
    'incidents',   v_incidents,
    'counters',    v_counters,
    'maintenance', v_maintenance
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: solo service_role
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION create_contract_with_lines(jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION can_delete_contract(uuid)               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_contract_with_lines(jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION can_delete_contract(uuid)               TO service_role;
```

- [ ] **Step 3: Aplicar la migración vía Supabase MCP**

Usar `mcp__supabase__apply_migration` con:
- `project_id`: `myyejbviunyvywfukysj`
- `name`: `fase2_rpcs_contratos`
- `query`: el contenido completo del archivo

- [ ] **Step 4: Verificar que las 3 funciones existen**

Usar `mcp__supabase__execute_sql`:
```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('create_contract_with_lines','update_contract_with_lines','can_delete_contract')
ORDER BY proname;
```
Expected: 3 filas.

- [ ] **Step 5: Smoke test de can_delete_contract con un contrato real**

```sql
SELECT can_delete_contract(id) FROM contracts LIMIT 1;
```
Expected: devuelve un jsonb con `can_delete`, `incidents`, `counters`, `maintenance`. (Se ejecuta como service_role en el SQL editor, así que el guard pasa.)

- [ ] **Step 6: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add supabase/migrations/20260604120000_fase2_rpcs_contratos.sql
git commit -m "feat(db): RPCs atómicas create/update/can_delete contract con guard service_role"
```

---

### Task 3: Helper de mapeo de errores

**Files:**
- Create: `src/lib/contract-errors.ts`

- [ ] **Step 1: Crear el helper compartido**

Las Server Actions con `'use server'` solo pueden exportar funciones async, por eso el mapeo va en un módulo aparte.

```ts
// Mapeo de los códigos de error que lanzan las RPCs de contratos a mensajes en francés.
// Las RPCs lanzan RAISE EXCEPTION '<code>'; supabase-js lo expone en error.message.

const RPC_ERROR_MESSAGES: Record<string, string> = {
  numero_contrat_exists:        'Ce numéro de contrat existe déjà.',
  machine_already_assigned:     'Une ou plusieurs machines sont déjà assignées à un autre contrat actif.',
  duplicate_machine_in_payload: 'Une machine apparaît en double dans le contrat.',
  invalid_billing_day:          'Le jour de facturation doit être entre 1 et 31.',
  no_lines:                     'Veuillez ajouter au moins une machine au contrat.',
  machine_id_immutable:         "Impossible de changer la machine d'une ligne existante. Retirez la machine et ajoutez-en une nouvelle.",
  invalid_date_fin:             'La date de fin doit être postérieure ou égale à la date de début.',
  permission_denied:            'Permission refusée.',
}

export function mapRpcError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  for (const code of Object.keys(RPC_ERROR_MESSAGES)) {
    if (message.includes(code)) return RPC_ERROR_MESSAGES[code]
  }
  return fallback
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add src/lib/contract-errors.ts
git commit -m "feat(contracts): helper de mapeo de errores RPC a francés"
```

---

### Task 4: Reescribir createContractAction

**Files:**
- Modify: `src/app/admin/contracts/new/actions.ts`

- [ ] **Step 1: Reemplazar el archivo completo**

```ts
'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { mapRpcError } from '@/lib/contract-errors'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

type LineInput = {
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

export async function createContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

  const numero_contrat = ((formData.get('numero_contrat') as string) ?? '').trim()
  const client_id = Number(formData.get('client_id'))
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()
  const date_renouvellement = ((formData.get('date_renouvellement') as string) ?? '').trim() || null
  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  const billing_day_raw = ((formData.get('billing_day') as string) ?? '').trim()
  const billing_day = billing_day_raw ? Number(billing_day_raw) : null
  const maintenance_frequency = parseEnum(formData.get('maintenance_frequency'), MAINTENANCE_FREQUENCIES) ?? null

  if (!numero_contrat) return { error: 'Le numéro de contrat est obligatoire.' }
  if (!client_id) return { error: 'Veuillez sélectionner un client.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }
  if (!statut) return { error: 'Statut invalide.' }
  if (billing_day !== null && (billing_day < 1 || billing_day > 31)) {
    return { error: 'Le jour de facturation doit être entre 1 et 31.' }
  }

  const linesRaw = (formData.get('lines') as string) ?? '[]'
  let lines: LineInput[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Liste de machines invalide.' }
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'Veuillez ajouter au moins une machine au contrat.' }
  }
  for (const ln of lines) {
    if (!ln.machine_id || !ln.date_debut) {
      return { error: 'Chaque machine doit avoir un numéro de série et une date de début.' }
    }
    if (ln.billing_day_override !== null && (ln.billing_day_override < 1 || ln.billing_day_override > 31)) {
      return { error: `Jour de facturation invalide pour la machine ${ln.machine_id}.` }
    }
  }

  const payload = {
    numero_contrat,
    client_id,
    date_debut,
    date_renouvellement,
    statut,
    billing_day,
    maintenance_frequency,
    lines,
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('create_contract_with_lines', { payload })

  if (error) {
    console.error('[createContract.rpc]', error)
    return { error: mapRpcError(error.message, 'Une erreur est survenue lors de la création du contrat.') }
  }

  redirect('/admin/contracts')
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep -E "new/actions" | head -10
```
Expected: sin errores en ese archivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/contracts/new/actions.ts
git commit -m "refactor(contracts): createContractAction invoca RPC atómica"
```

---

### Task 5: Reescribir updateContractAction + deleteContractAction

**Files:**
- Modify: `src/app/admin/contracts/[id]/actions.ts`

- [ ] **Step 1: Reemplazar el archivo completo**

```ts
'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { mapRpcError } from '@/lib/contract-errors'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

type LineInput = {
  id?: string
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

type RetireInput = {
  id: string
  date_fin: string
}

export async function updateContractAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

  const client_id = Number(formData.get('client_id'))
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()
  if (!client_id) return { error: 'Veuillez sélectionner un client.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }

  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  if (!statut) return { error: 'Statut invalide.' }

  const billing_day_raw = ((formData.get('billing_day') as string) ?? '').trim()
  const billing_day = billing_day_raw ? Number(billing_day_raw) : null
  const maintenance_frequency = parseEnum(formData.get('maintenance_frequency'), MAINTENANCE_FREQUENCIES) ?? null
  if (billing_day !== null && (billing_day < 1 || billing_day > 31)) {
    return { error: 'Le jour de facturation doit être entre 1 et 31.' }
  }

  let lines: LineInput[]
  let retire: RetireInput[]
  try {
    lines = JSON.parse((formData.get('lines') as string) ?? '[]')
    retire = JSON.parse((formData.get('retire') as string) ?? '[]')
  } catch {
    return { error: 'Liste de machines invalide.' }
  }

  const payload = {
    client_id,
    date_debut,
    date_renouvellement: ((formData.get('date_renouvellement') as string) ?? '').trim() || null,
    statut,
    billing_day,
    maintenance_frequency,
    lines,
    retire,
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('update_contract_with_lines', { p_contract_id: id, payload })

  if (error) {
    console.error('[updateContract.rpc]', error)
    return { error: mapRpcError(error.message, 'Une erreur est survenue lors de la mise à jour du contrat.') }
  }

  redirect('/admin/contracts')
}

export async function deleteContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()
  const id = formData.get('id') as string

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('can_delete_contract', { p_contract_id: id })

  if (error) {
    console.error('[deleteContract.check]', error)
    return { error: 'Une erreur est survenue lors de la vérification du contrat.' }
  }

  const check = data as { can_delete: boolean; incidents: number; counters: number; maintenance: number }
  if (!check.can_delete) {
    const parts: string[] = []
    if (check.incidents > 0)   parts.push(`${check.incidents} incident(s)`)
    if (check.counters > 0)    parts.push(`${check.counters} relevé(s) de compteur`)
    if (check.maintenance > 0) parts.push(`${check.maintenance} plan(s) de maintenance`)
    return { error: `Impossible de supprimer ce contrat : ${parts.join(', ')} associé(s). Retirez-les d'abord.` }
  }

  const { error: delError } = await admin.from('contracts').delete().eq('id', id)
  if (delError) {
    console.error('[deleteContract.delete]', delError)
    return { error: 'Une erreur est survenue lors de la suppression.' }
  }

  redirect('/admin/contracts')
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep -E "\[id\]/actions" | head -10
```
Expected: sin errores en ese archivo (puede haber errores en `ContractForm.tsx`/`page.tsx` por la firma de `deleteAction` — se corrigen en Task 6 y 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/contracts/[id]/actions.ts"
git commit -m "refactor(contracts): update/delete via RPC atómica + bloqueo borrado con dependencias"
```

---

### Task 6: ContractForm — retiro con fecha, máquina readonly, delete con error

**Files:**
- Modify: `src/components/admin/ContractForm.tsx`

- [ ] **Step 1: Actualizar imports, tipos de props y estado**

Reemplazar el bloque de imports (líneas 1-8) y los tipos + apertura del componente. El cambio clave: `deleteAction` pasa de `(formData) => Promise<void>` a `(prev, formData) => Promise<FormState>`, y se añade estado para líneas retiradas.

Reemplazar desde `import` hasta la línea `const [lines, setLines] = useState...` con:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle, Plus, X, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type ContractData = {
  numero_contrat?: string
  client_id?: number
  date_debut?: string
  date_renouvellement?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
  billing_day?: number | null
  maintenance_frequency?: 'mensuel' | 'trimestriel' | null
}

type LineInput = {
  id?: string                                               // present for existing lines
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

type RetiredLine = {
  id: string
  machine_id: string
  date_debut: string
  date_fin: string
}

type ClientOption = { id: number; nom_client: string }
type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  initialLines?: LineInput[]
  clients: ClientOption[]
  availableMachines: MachineOption[]
  title: string
  isEdit?: boolean
  contractId?: string
  deleteAction?: (prev: FormState, data: FormData) => Promise<FormState>
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const inputSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

function emptyLine(): LineInput {
  return {
    machine_id: '',
    date_debut: new Date().toISOString().slice(0, 10),
    billing_day_override: null,
    maintenance_frequency_override: null,
    notes: null,
  }
}

export default function ContractForm({
  action, defaultValues, initialLines, clients, availableMachines, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const noopDelete = async (_prev: FormState, _fd: FormData): Promise<FormState> => null
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction ?? noopDelete,
    null
  )
  const [confirming, setConfirming] = useState(false)
  const [lines, setLines] = useState<LineInput[]>(initialLines ?? [emptyLine()])
  const [retired, setRetired] = useState<RetiredLine[]>([])
```

- [ ] **Step 2: Actualizar las funciones de manipulación de líneas**

Reemplazar las funciones `addLine`, `removeLine`, `updateLine` (líneas 73-83 del original) con:

```tsx
  const today = new Date().toISOString().slice(0, 10)

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  // Retirar una línea. Si es existente (tiene id) se mueve a "retired" con date_fin
  // por defecto = hoy (editable). Si es nueva (sin id) se elimina sin más.
  function removeLine(idx: number) {
    setLines((prev) => {
      const line = prev[idx]
      if (line.id) {
        setRetired((r) => [...r, {
          id: line.id!,
          machine_id: line.machine_id,
          date_debut: line.date_debut,
          date_fin: today,
        }])
      }
      return prev.filter((_, i) => i !== idx)
    })
  }

  // "Remplacer": retira la línea existente (con fecha) y añade una nueva vacía.
  function replaceLine(idx: number) {
    removeLine(idx)
    addLine()
  }

  function updateLine<K extends keyof LineInput>(idx: number, key: K, value: LineInput[K]) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l))
  }

  function updateRetiredDate(id: string, date_fin: string) {
    setRetired((prev) => prev.map((r) => r.id === id ? { ...r, date_fin } : r))
  }

  function undoRetire(id: string) {
    setRetired((prev) => {
      const item = prev.find((r) => r.id === id)
      if (item) {
        setLines((l) => [...l, {
          id: item.id,
          machine_id: item.machine_id,
          date_debut: item.date_debut,
          billing_day_override: null,
          maintenance_frequency_override: null,
          notes: null,
        }])
      }
      return prev.filter((r) => r.id !== id)
    })
  }
```

- [ ] **Step 3: Actualizar el bloque de delete en el header**

Reemplazar el bloque del botón Delete (el `{deleteAction && contractId && (...)}` de las líneas 104-138 del original) con la versión que usa `deleteFormAction`:

```tsx
        {/* Delete */}
        {deleteAction && contractId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteFormAction} className="contents">
                <input type="hidden" name="id" value={contractId} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60"
                >
                  {deletePending ? '…' : 'Oui, supprimer'}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
```

- [ ] **Step 4: Mostrar el error de borrado debajo del título**

Justo después del `<div>` del header (antes de `<form action={formAction}>`, alrededor de la línea 140 original), añadir:

```tsx
      {deleteState?.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {deleteState.error}
        </div>
      )}
```

- [ ] **Step 5: Añadir el campo hidden `retire` junto al de `lines`**

Localizar `<input type="hidden" name="lines" value={JSON.stringify(lines)} />` (línea 144 original) y añadir justo debajo:

```tsx
        <input type="hidden" name="retire" value={JSON.stringify(retired)} />
```

- [ ] **Step 6: Hacer el selector de máquina readonly en líneas existentes**

Localizar el bloque del `<select>` de máquina dentro del `.map((line, idx) => ...)` (líneas 326-342 original). Reemplazar el `<div>` que contiene el label "Numéro de série" y su select con:

```tsx
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Numéro de série <span className="text-accent">*</span>
                      </label>
                      {line.id ? (
                        // Línea existente: máquina inmutable (solo lectura) + botón remplacer
                        <div className="flex items-center gap-2">
                          <div className="flex-1 px-3 py-2 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                            {line.machine_id}
                          </div>
                          <button
                            type="button"
                            onClick={() => replaceLine(idx)}
                            title="Remplacer la machine (clôture cette ligne et en ouvre une nouvelle)"
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-line text-xs text-ink-soft hover:bg-neutral-soft transition-colors shrink-0"
                          >
                            <RefreshCw size={13} />
                            Remplacer
                          </button>
                        </div>
                      ) : (
                        <select
                          value={line.machine_id}
                          onChange={(e) => updateLine(idx, 'machine_id', e.target.value)}
                          className={selectSmClass}
                          required
                        >
                          <option value="" disabled>Sélectionner...</option>
                          {selectableMachines.map((m) => (
                            <option key={m.numero_serie} value={m.numero_serie}>
                              {m.marque} {m.modele} — {m.numero_serie}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
```

- [ ] **Step 7: Añadir la sección de máquinas retiradas (antes del cierre de la Card de máquinas)**

Localizar el cierre de la sección de líneas — el bloque `{lines.length === 0 && availableMachines.length > 0 && (...)}` (líneas 412-420 original). Justo DESPUÉS de ese bloque y ANTES del `</Card>` que cierra la sección de máquinas, añadir:

```tsx
          {retired.length > 0 && (
            <div className="mt-5 pt-5 border-t border-line-subtle space-y-3">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Machines retirées
              </h3>
              {retired.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-line bg-neutral-soft">
                  <span className="flex-1 text-sm font-mono text-ink-soft line-through">{r.machine_id}</span>
                  <div>
                    <label className="block text-[10px] font-medium text-ink-muted mb-1">Date de fin</label>
                    <input
                      type="date"
                      value={r.date_fin}
                      min={r.date_debut}
                      onChange={(e) => updateRetiredDate(r.id, e.target.value)}
                      className={inputSmClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => undoRetire(r.id)}
                    className="text-xs text-ink-soft hover:text-ink transition-colors shrink-0 self-end pb-2"
                  >
                    Annuler
                  </button>
                </div>
              ))}
            </div>
          )}
```

- [ ] **Step 8: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep -E "ContractForm" | head -15
```
Expected: sin errores en `ContractForm.tsx`.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/ContractForm.tsx
git commit -m "feat(contracts): retiro con fecha explícita, máquina readonly + remplacer, delete con error"
```

---

### Task 7: Wiring de páginas + build completo

**Files:**
- Modify: `src/app/admin/contracts/[id]/page.tsx` (si hace falta)
- Verify: `src/app/admin/contracts/new/page.tsx`

- [ ] **Step 1: Verificar el build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

El cambio de firma de `deleteContractAction` (ahora `(prev, formData) => Promise<FormState>`) debe ser compatible con la prop `deleteAction` de `ContractForm`. La página `[id]/page.tsx` solo pasa la referencia (`deleteAction={deleteContractAction}`), no la invoca — debería compilar sin cambios. Si `tsc` reporta un error de tipo en `[id]/page.tsx`, es por incompatibilidad de firma; en ese caso confirmar que la firma exportada coincide exactamente con la prop.

Expected: 0 errores. Si hay errores, corregirlos según el mensaje (lo más probable: ninguno, porque el wiring es solo paso de referencia).

- [ ] **Step 2: Verificar lint si está configurado**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx next lint 2>&1 | head -20
```
Expected: sin errores nuevos introducidos por estos archivos. (Si `next lint` no está configurado, omitir.)

- [ ] **Step 3: Commit (solo si hubo cambios en páginas)**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add src/app/admin/contracts/[id]/page.tsx src/app/admin/contracts/new/page.tsx 2>/dev/null
git commit -m "fix(contracts): ajustar wiring deleteAction a nueva firma" || echo "Sin cambios en páginas"
```

---

### Task 8: PR

**Files:** N/A

- [ ] **Step 1: Push y abrir PR**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git push origin fix/fase2-rpcs-atomicas-contratos
gh pr create \
  --title "feat: Fase 2 — RPCs atómicas para contratos" \
  --body "$(cat <<'EOF'
## Qué hace
Mueve la creación, edición y borrado de contratos a 3 funciones Postgres SECURITY DEFINER atómicas, eliminando los riesgos identificados en la auditoría (sección 4 + hallazgo crítico #2).

### RPCs (Bloque A)
- `create_contract_with_lines(payload jsonb)` — cabecera + N líneas en una transacción. Errores tipados: `numero_contrat_exists`, `machine_already_assigned`, `duplicate_machine_in_payload`, `invalid_billing_day`, `no_lines`. Adiós a los contratos huérfanos.
- `update_contract_with_lines(p_contract_id, payload)` — diff de líneas atómico. Bloquea cambio de `machine_id` (`machine_id_immutable`). Retiro con `date_fin` explícita (valida `>= date_debut`).
- `can_delete_contract(p_contract_id)` — cuenta incidencias/contadores/mantenimientos antes de permitir el borrado.

Todas con guard `service_role` + REVOKE de roles no privilegiados (patrón de `fix_rpc_privilege_escalation`).

### App (Bloques B/C)
- `createContractAction` / `updateContractAction`: validan formato y delegan en las RPCs vía `createAdminClient()`.
- `deleteContractAction`: bloquea el borrado si hay dependencias, con mensaje que las lista.
- `ContractForm`: selector de fecha de fin al retirar, máquina de líneas existentes en solo lectura + botón "Remplacer", sección de máquinas retiradas, error de borrado visible.

### Decisiones de diseño aplicadas
1. Cambio de máquina en línea existente → bloqueado (UI readonly + RPC)
2. Retiro → fecha de fin explícita del formulario
3. Borrado → bloqueado si hay incidencias/contadores/mantenimientos

## No incluye
- Mantenimiento granular por máquina (Fase 3)
- Cleanup de columnas legacy (Fase 4)
EOF
)"
```

Expected: URL del PR.

---

## Checklist de aceptación

- [ ] Crear contrato con 2 máquinas → cabecera + 2 líneas atómicas
- [ ] Crear con máquina ya asignada → error claro, sin contrato huérfano
- [ ] Crear con máquina duplicada en el form → error `duplicate_machine_in_payload`
- [ ] Crear con numero_contrat existente → error claro, sin líneas huérfanas
- [ ] Editar: máquina de línea existente en solo lectura (no editable)
- [ ] Editar: "Remplacer" cierra la línea y abre una nueva
- [ ] Retirar máquina con fecha pasada → línea cerrada con esa fecha
- [ ] Retirar con fecha anterior a date_debut → error `invalid_date_fin`
- [ ] Borrar contrato sin dependencias → borrado OK
- [ ] Borrar contrato con incidencias/contadores/mantenimientos → bloqueado con mensaje
- [ ] Build TypeScript limpio
