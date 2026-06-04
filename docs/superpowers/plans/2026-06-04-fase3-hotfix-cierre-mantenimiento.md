# Hotfix Fase 3 — Cierre de Mantenimiento Atómico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reemplazar la secuencia de operaciones sueltas de `closeMaintenance` por una RPC `SECURITY DEFINER` transaccional, idempotente y con RLS correcta.

**Architecture:** El cierre actual hace 3 operaciones PostgREST separadas (update visita + insert piezas + insert siguiente visita) con el cliente del técnico, sin comprobar errores. Tres defectos: (1) no atómico, (2) sin protección contra doble cierre concurrente, (3) **el insert de la siguiente visita está bloqueado por RLS** — no existe política INSERT para técnicos en `maintenance_visits`, así que falla en silencio (latente: producción tiene 0 visitas). Se mueve todo a una RPC plpgsql invocada vía `createAdminClient()`, consistente con el patrón de Fase 2.

**Tech Stack:** PostgreSQL plpgsql, Next.js Server Actions, Supabase JS, Supabase MCP.

---

## Contexto del bug (mini-spec)

`src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts` tras la Fase 3:
- `UPDATE ... SET status='fait' WHERE id=visitId` — **sin** guard `status<>'fait'` → doble submit concurrente cierra dos veces y crea dos visitas siguientes.
- `insert(maintenance_parts)` e `insert(maintenance_visits siguiente)` — **sin** comprobar `.error`, con el cliente del técnico.
- RLS de `maintenance_visits` (migración `20260511145143`): técnicos tienen SELECT + UPDATE, **no INSERT** → la siguiente visita nunca se inserta para un técnico.

Decisión (acordada con el usuario): **Opción A — RPC SECURITY DEFINER transaccional**.

---

### Task 1: Rama Git

**Files:** N/A

- [ ] **Step 1**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b fix/fase3-hotfix-cierre-mantenimiento
```
Expected: `git branch --show-current` → `fix/fase3-hotfix-cierre-mantenimiento`

---

### Task 2: RPC close_maintenance_visit

**Files:**
- Create: `supabase/migrations/20260604140000_close_maintenance_visit_rpc.sql`

**Schema confirmado:** `maintenance_visits.status` es `text` con CHECK `('planifié','fait','en_retard')` (no enum, sin cast). `contracts.client_id` y `clients.id` son `bigint`. `contract_machines.machine_id` es `text` (= `machines.numero_serie`).

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Hotfix Fase 3: cierre de mantenimiento atómico, idempotente y con RLS correcta.
-- Reemplaza la secuencia de operaciones sueltas de closeMaintenance por una transacción única.
-- Patrón de seguridad: SECURITY DEFINER + guard service_role (igual que Fase 2).

CREATE OR REPLACE FUNCTION close_maintenance_visit(
  p_visit_id      uuid,
  p_serie         text,
  p_done_by       uuid,
  p_notes         text,
  p_part_ids      int[],
  p_autres_pieces text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id   text;
  v_plan_id      uuid;
  v_cm_id        uuid;
  v_scheduled    date;
  v_freq_over    text;
  v_plan_freq    text;
  v_eff_freq     text;
  v_days         int;
  v_next         date;
  v_rows         int;
  v_part         int;
  v_marque       text;
  v_modele       text;
  v_numero_serie text;
  v_client       text;
  v_parts_count  int := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Cargar visita + línea + plan + datos de máquina/cliente.
  SELECT
    cm.machine_id, mv.plan_id, mv.contract_machine_id, mv.scheduled_date,
    cm.maintenance_frequency_override, mp.frequency,
    m.marque, m.modele, m.numero_serie, cl.nom_client
  INTO
    v_machine_id, v_plan_id, v_cm_id, v_scheduled,
    v_freq_over, v_plan_freq,
    v_marque, v_modele, v_numero_serie, v_client
  FROM maintenance_visits mv
  JOIN contract_machines cm ON cm.id = mv.contract_machine_id
  JOIN maintenance_plans  mp ON mp.id = mv.plan_id
  JOIN machines  m  ON m.numero_serie = cm.machine_id
  JOIN contracts c  ON c.id = cm.contract_id
  LEFT JOIN clients cl ON cl.id = c.client_id
  WHERE mv.id = p_visit_id;

  IF v_machine_id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  -- La visita debe pertenecer a la máquina escaneada.
  IF v_machine_id <> p_serie THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  -- Cierre idempotente: solo si no estaba ya cerrada (protege contra doble submit).
  UPDATE maintenance_visits
    SET status = 'fait', done_at = now(), done_by = p_done_by,
        qr_verified = true, notes = p_notes
    WHERE id = p_visit_id AND status <> 'fait';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'already_closed';
  END IF;

  -- Piezas marcadas.
  IF p_part_ids IS NOT NULL THEN
    FOREACH v_part IN ARRAY p_part_ids LOOP
      INSERT INTO maintenance_parts (visit_id, part_id, quantity)
        VALUES (p_visit_id, v_part, 1);
      v_parts_count := v_parts_count + 1;
    END LOOP;
  END IF;
  IF p_autres_pieces IS NOT NULL AND length(trim(p_autres_pieces)) > 0 THEN
    INSERT INTO maintenance_parts (visit_id, description, quantity)
      VALUES (p_visit_id, p_autres_pieces, 1);
    v_parts_count := v_parts_count + 1;
  END IF;

  -- Siguiente visita: frecuencia override de línea, si no la del plan.
  v_eff_freq := COALESCE(v_freq_over, v_plan_freq);
  v_days := CASE WHEN v_eff_freq = 'mensuel' THEN 30 ELSE 90 END;
  v_next := v_scheduled + v_days;

  INSERT INTO maintenance_visits (plan_id, contract_machine_id, scheduled_date, status)
    VALUES (v_plan_id, v_cm_id, v_next, 'planifié');

  RETURN jsonb_build_object(
    'ok',           true,
    'next_date',    v_next,
    'marque',       v_marque,
    'modele',       v_modele,
    'numero_serie', v_numero_serie,
    'client',       v_client,
    'parts_count',  v_parts_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) TO service_role;
```

- [ ] **Step 2: Aplicar vía MCP**

`mcp__supabase__apply_migration` con project_id `myyejbviunyvywfukysj`, name `close_maintenance_visit_rpc`, query = el SQL completo.

- [ ] **Step 3: Verificar la función existe**

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'close_maintenance_visit';
```
Expected: 1 fila con args `p_visit_id uuid, p_serie text, p_done_by uuid, p_notes text, p_part_ids integer[], p_autres_pieces text`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add supabase/migrations/20260604140000_close_maintenance_visit_rpc.sql
git commit -m "feat(db): RPC close_maintenance_visit atómica e idempotente"
```

---

### Task 3: Reescribir closeMaintenance action

**Files:**
- Modify: `src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts`

- [ ] **Step 1: Reemplazar el archivo COMPLETO con:**

```ts
'use server'

import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const PART_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

async function notifyMatrix(message: string): Promise<void> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL
  const token      = process.env.MATRIX_ACCESS_TOKEN
  const roomId     = process.env.MATRIX_MAINTENANCE_ROOM_ID
  if (!homeserver || !token || !roomId) return
  const txnId = Date.now()
  await fetch(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: message }),
    },
  ).catch(err => console.error('[Matrix]', err))
}

const RPC_ERRORS: Record<string, string> = {
  visit_not_found:   'Visite introuvable.',
  already_closed:    'Cette visite est déjà clôturée.',
  permission_denied: 'Permission refusée.',
}

export async function closeMaintenance(
  visitId: string,
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, profile } = await requireTechnician()

  const notes        = ((formData.get('notes') as string) ?? '').trim() || null
  const partIds      = PART_IDS.filter(id => formData.get(`part_${id}`) === 'on')
  const autresPieces = ((formData.get('autres_pieces') as string) ?? '').trim() || null

  // RPC atómica vía service_role (la action ya validó el rol con requireTechnician).
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('close_maintenance_visit', {
    p_visit_id:      visitId,
    p_serie:         serie,
    p_done_by:       user.id,
    p_notes:         notes,
    p_part_ids:      partIds,
    p_autres_pieces: autresPieces,
  })

  if (error) {
    for (const code of Object.keys(RPC_ERRORS)) {
      if (error.message.includes(code)) return { error: RPC_ERRORS[code] }
    }
    console.error('[closeMaintenance.rpc]', error)
    return { error: 'Erreur lors de la clôture de la visite.' }
  }

  // Notificación Matrix: best-effort, fuera de la transacción ya commiteada.
  const r = data as {
    next_date: string; marque: string | null; modele: string | null
    numero_serie: string | null; client: string | null; parts_count: number
  }
  const nextFmt = new Date(r.next_date + 'T00:00:00').toLocaleDateString('fr-FR')
  await notifyMatrix([
    '✅ MAINTENANCE EFFECTUÉE',
    `Client     : ${r.client ?? '—'}`,
    `Machine    : ${r.marque ?? ''} ${r.modele ?? ''} (${r.numero_serie ?? serie})`,
    `Technicien : ${profile.full_name ?? user.email}`,
    `Prochaine  : ${nextFmt}`,
    r.parts_count > 0 ? `Pièces     : ${r.parts_count} remplacée(s)` : '',
  ].filter(Boolean).join('\n'))

  redirect(`/tech/scan/${encodeURIComponent(serie)}`)
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -20 && echo "EXIT: $?"
```
Expected: 0 errores, EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts"
git commit -m "fix(maintenance): cierre QR vía RPC atómica con idempotencia y RLS correcta"
```

---

### Task 4: PR y merge

**Files:** N/A

- [ ] **Step 1: Build + push + PR**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
npx tsc --noEmit 2>&1 | tail -3
git push origin fix/fase3-hotfix-cierre-mantenimiento
gh pr create \
  --title "fix: hotfix Fase 3 — cierre de mantenimiento atómico e idempotente" \
  --body "$(cat <<'EOF'
## Qué hace
Corrige tres defectos del cierre de mantenimiento por QR (detectados en revisión post-Fase 3):

1. **No atómico**: cerrar visita + insertar piezas + programar siguiente eran 3 operaciones sueltas sin comprobación de error.
2. **Sin protección contra duplicados**: doble submit concurrente cerraba dos veces y creaba dos visitas siguientes.
3. **RLS rota (latente)**: los técnicos no tienen política INSERT en maintenance_visits, así que la siguiente visita nunca se programaba — fallaba en silencio (no había explotado porque producción tiene 0 visitas).

## Solución
Nueva RPC `close_maintenance_visit(...)` SECURITY DEFINER (patrón Fase 2):
- Todo en una transacción plpgsql.
- Cierre idempotente: `UPDATE ... WHERE status <> 'fait'` + ROW_COUNT → aborta si ya estaba cerrada (mata el duplicado).
- Corre como definer → resuelve el INSERT bloqueado por RLS.
- Devuelve los datos para la notificación Matrix (que queda best-effort fuera de la transacción).

La action invoca la RPC vía createAdminClient() tras requireTechnician(), con mapeo de errores tipados.

## Ámbito
RPC ya aplicada a producción (vía MCP). No hay Edge Functions que deployar.
EOF
)"
```

- [ ] **Step 2: Merge**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr merge --merge --delete-branch
git checkout main && git pull
git log -1 --oneline
```

---

## Checklist de aceptación

- [ ] La función `close_maintenance_visit` existe en producción
- [ ] Cerrar una visita escaneando su QR → cierra y programa la siguiente, ambas en una transacción
- [ ] Cerrar dos veces (o doble submit) → la segunda devuelve "déjà clôturée", sin segunda visita duplicada
- [ ] Cerrar la visita de máquina A con QR de B → "Visite introuvable"
- [ ] La siguiente visita se programa con la frecuencia correcta (override de línea ?? plan)
- [ ] Si la RPC falla, la action NO redirige y muestra el error (sin éxito silencioso)
- [ ] Build TypeScript limpio
