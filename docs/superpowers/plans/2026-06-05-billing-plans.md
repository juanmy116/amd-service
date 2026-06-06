# Sistema de Facturación AMD (Opción B — Emisor de facturas) — Implementation Plan v3

> **v3 integra la 2ª revisión:** emisión vía RPC transaccional `emit_invoice` (N9/N1/N4), fórmula `.xlsx` literal para tiered (N2), `runtime='nodejs'` (N5), fix N+1 de contadores (N6), tipado del workbook (N7), validación de `to` vacío (N10), y la **FASE D — política de reemplazo de máquina** (facturar el puesto de servicio).
>
> **v3 + 3ª revisión (aprobada):** `listBillableClients` con el mismo filtro de periodo (H5), `emit_invoice` actualizada vía `CREATE OR REPLACE` en la migración 200 para `has_replacement` (H6), `replace_contract_machine` rellena `contract_id`/`client_id` en los relevés (H2), invariante "el reemplazo mantiene el plan del puesto" (H1). **+ Bug crítico propio detectado: `clients.id` es BIGINT, no uuid** → `invoices.client_id BIGINT`, casts `::bigint` en `emit_invoice`, y tipos `number` en TS.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un sistema de facturación que (1) define un catálogo de tipos de facturación por máquina, (2) calcula el consumo facturable reutilizando la lógica de contadores ya existente, y (3) **emite facturas inmutables** por cliente/mes con snapshot congelado, vista de solo lectura, anulación y export a hoja de cálculo `.xlsx` enviable por email a los admins.

**Architecture:** Catálogo `billing_plans` (3 tipos: `per_copy`, `hybrid`, `hybrid_tiered`). Cada línea `contract_machines` referencia un plan + overrides opcionales. Al **emitir**, se congela un snapshot inmutable en `invoices` (cabecera por cliente/mes) + `invoice_lines` (una fila por máquina con plan, tarifas, deltas e importes copiados). El preview en vivo y la emisión comparten una única función de cálculo (`lib/invoicing.ts`) para que coincidan copia a copia. El consumo se calcula con `calcDeltas` extraída a `lib/counters.ts` (misma fuente de verdad que la pantalla de Contadores).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS v4, Server Actions con `requireAdmin()` / `createAdminClient()`, ExcelJS (nuevo) para `.xlsx`, Edge Function `send-email` (Resend) extendida con adjuntos.

---

## Decisiones de diseño congeladas

| Decisión | Valor |
|---|---|
| Granularidad de factura | **Por cliente y mes** (agrupa todos los contratos del cliente) |
| Relevé de contador faltante | Bloqueo por defecto + **botón de confirmación manual** → emite con líneas marcadas `is_estimated` (forfait sí, consumo 0) |
| Inmutabilidad | Snapshot congelado en `invoice_lines` al emitir; el preview recalcula en vivo pero lo emitido NO |
| **Emisión (atómica)** | Una **RPC transaccional `emit_invoice(payload jsonb)`** SECURITY DEFINER (patrón `create_contract_with_lines`), invocada con `admin.rpc(...)`. Numera + inserta cabecera + líneas en una sola transacción. Evita cabecera huérfana (N1), huecos en la secuencia (N4) y el fallo de permisos al llamar `next_invoice_number()` desde el cliente `authenticated` (N9) |
| **Reemplazo de máquina** | Se factura el **puesto de servicio**, no la máquina física. Fase separable (FASE D). Encadenado por `contract_machines.replaces_contract_machine_id`. Consumo del puesto = Δsaliente+Δentrante, **un solo forfait**, tramos sobre el consolidado |
| Filtro de facturación | `date_debut <= fin_periodo AND (date_fin IS NULL OR date_fin >= inicio_periodo)` — cubre activas, reemplazadas y terminadas (NO solo `date_fin IS NULL`, que infrafacturaría la saliente) |
| Numeración | `FACT-YYYY-NNNN` vía tabla `invoice_counters` + `next_invoice_number()` (clon de `incident_counters` / `next_incident_number()`), llamada **solo dentro de `emit_invoice`** |
| Documento | Hoja `.xlsx` con fórmulas, **interna AMD** (no se envía al cliente). Descarga directa + email a admins |
| Destinatarios email | Variable de entorno `BILLING_NOTIFY_EMAILS` (lista separada por comas). `profiles` no tiene email |
| Moneda | FCFA = ISO 4217 `XOF`. Redondeo a entero por línea |
| Correcciones del revisor | (1) migración `public.` + `WITH CHECK` + `CHECK >= 0`; (2) coerción `Number()` por `numeric→string`; (3) reutilizar `calcDeltas`; (4) sin UNIQUE → resolver duplicados por `recorded_at` |

---

## Esquema real verificado (no asumir, ya comprobado)

- `clients (id BIGINT IDENTITY PK, nom_client text UNIQUE, email text NULL, ...)` — ⚠️ **id es BIGINT, NO uuid**. `contracts.client_id` y `machine_counters.client_id` son BIGINT. Por tanto `invoices.client_id` debe ser BIGINT y los casts en `emit_invoice` `::bigint`
- `profiles (id uuid PK, role user_role, full_name text, phone text)` — **sin email**
- `machines (numero_serie text PK, marque text, modele text, ...)`
- `contract_machines (id uuid PK, contract_id uuid, machine_id text→machines.numero_serie, date_debut, date_fin NULL, statut, billing_day_override, maintenance_frequency_override, notes)`
- `contracts (id uuid PK, numero_contrat text, client_id uuid, ...)`
- `machine_counters (id uuid PK, machine_id text, year int, month int, day int NULL, counter_bw int, counter_color int, status text, is_replacement_start bool, previous_machine_id text NULL, recorded_at timestamptz)` — **sin UNIQUE(machine_id,year,month)**
- `incident_counters (year int PK, last_number int)` + `next_incident_number()` → patrón a clonar
- Helper RLS existente: `public.is_admin()`
- `calcDeltas` actual: `src/app/admin/contadores/[serie]/page.tsx:30-50`
- `send-email` Edge Function: `supabase/functions/send-email/index.ts` (Resend, hoy SIN adjuntos)

---

## Mapa de archivos

### Nuevos
| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260606000000_billing_plans.sql` | `billing_plans` + campos en `contract_machines` (REESCRIBIR el ya commiteado) |
| `supabase/migrations/20260606000100_invoices.sql` | `invoices`, `invoice_lines`, `invoice_counters`, `next_invoice_number()`, **RPC `emit_invoice`** |
| `supabase/migrations/20260606000200_machine_replacement.sql` | (FASE D) `replaces_contract_machine_id`, `invoices.has_replacement`, RPC `replace_contract_machine` |
| `src/components/admin/ReplaceMachineModal.tsx` + `contracts/[id]/replace-actions.ts` | (FASE D) flujo "Remplacer la machine" |
| `src/lib/billing.ts` | Types + `resolveEffectiveTariff` + `calculateMonthlyAmount` + `validateTiers` (REESCRIBIR el ya commiteado) |
| `src/lib/counters.ts` | `calcDeltas` extraída (con desempate `recorded_at`) + tipo `Counter` |
| `src/lib/invoicing.ts` | `buildClientInvoiceDraft()` — cálculo compartido preview ↔ emisión |
| `src/lib/invoice-xlsx.ts` | `buildInvoiceWorkbook()` — genera `.xlsx` con fórmulas desde un snapshot |
| `src/components/admin/BillingPlanForm.tsx` | Form dinámico de plan + validación de tramos |
| `src/app/admin/billing-plans/**` | CRUD del catálogo (list/new/edit + actions) |
| `src/app/admin/facturation/page.tsx` | Preview en vivo por cliente/mes + selector + alertas relevé |
| `src/components/admin/FacturationPreview.tsx` | UI del preview + botones emitir / emitir malgré tout |
| `src/app/admin/facturation/actions.ts` | `emitInvoiceAction` (snapshot) |
| `src/app/admin/factures/page.tsx` | Lista de facturas emitidas |
| `src/app/admin/factures/[id]/page.tsx` | Detalle solo-lectura + descarga `.xlsx` + enviar email + anular |
| `src/app/admin/factures/[id]/actions.ts` | `annulInvoiceAction`, `emailInvoiceAction` |
| `src/app/admin/factures/[id]/xlsx/route.ts` | Route Handler que devuelve el `.xlsx` para descarga |

### Modificados
| Archivo | Qué cambia |
|---|---|
| `src/app/admin/contadores/[serie]/page.tsx` | Importar `calcDeltas` desde `lib/counters` (quitar la local) |
| `src/components/admin/Sidebar.tsx` | Grupo "Facturation" (Plans, Rapport mensuel, Factures) |
| `src/components/admin/ContractForm.tsx` | Selector de plan + overrides por línea (campos filtrados por tipo) |
| `src/app/admin/contracts/new/{page,actions}.ts` | Cargar planes + guardar billing fields |
| `src/app/admin/contracts/[id]/{page,actions}.ts` | Cargar planes + actualizar billing fields |
| `supabase/functions/send-email/index.ts` | Aceptar `attachments` y pasarlos a Resend |
| `CLAUDE.md` | Corregir "Mailjet" → Resend en la nota de email |

---

## Dependencias y orden

```
Task 1 (migr. billing_plans) ─┐
Task 2 (migr. invoices) ───────┤
Task 3 (lib/billing) ──────────┼─► Task 5 (lib/invoicing) ─► Task 9 (preview) ─► Task 10 (emisión+vista) ─► Task 11 (xlsx+email)
Task 4 (lib/counters) ─────────┘                              ▲
Task 6 (BillingPlanForm) ─► Task 7 (CRUD) ─► Task 8 (ContractForm) ─────────────┘ (datos reales para preview)
```

- **Paralelizables (sin dependencia entre sí):** Tasks 1, 2, 3, 4 → usar `/workflows`.
- **⚠️ PAUSA MANUAL** tras Tasks 1-2: aplicar ambas migraciones en Supabase antes de Tasks 9+.
- Tasks 6→7→8 (catálogo + asignación) pueden ir en paralelo a 5; ambos confluyen en Task 9.
- Tasks 9→10→11 secuenciales.

---

## Task 1: Migración — catálogo `billing_plans` + campos en `contract_machines`

> Paralela con Tasks 2, 3, 4. **REESCRIBE** el archivo ya commiteado aplicando los fixes del revisor.

**Files:**
- Modify (rewrite): `supabase/migrations/20260606000000_billing_plans.sql`

- [ ] **Step 1: Reescribir la migración con `public.`, `is_admin()`, `WITH CHECK` y `CHECK >= 0`**

```sql
-- supabase/migrations/20260606000000_billing_plans.sql

-- Catálogo de tipos de facturación AMD
CREATE TABLE public.billing_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered')),
  fixed_fee    numeric(10,4),
  price_bw     numeric(10,6),
  price_color  numeric(10,6),
  tiers        jsonb,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_plans_name_unique UNIQUE (name),

  CONSTRAINT billing_plans_per_copy_check CHECK (
    type != 'per_copy' OR (
      fixed_fee IS NULL AND price_bw IS NOT NULL AND price_color IS NOT NULL AND tiers IS NULL
    )
  ),
  CONSTRAINT billing_plans_hybrid_check CHECK (
    type != 'hybrid' OR (
      fixed_fee IS NOT NULL AND price_bw IS NOT NULL AND price_color IS NOT NULL AND tiers IS NULL
    )
  ),
  CONSTRAINT billing_plans_tiered_check CHECK (
    type != 'hybrid_tiered' OR (
      fixed_fee IS NOT NULL AND tiers IS NOT NULL AND price_bw IS NULL AND price_color IS NULL
    )
  ),

  -- No-negatividad (fix revisor #1)
  CONSTRAINT billing_plans_prices_nonneg CHECK (
    (fixed_fee   IS NULL OR fixed_fee   >= 0) AND
    (price_bw    IS NULL OR price_bw    >= 0) AND
    (price_color IS NULL OR price_color >= 0)
  )
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

-- Policy admin con USING + WITH CHECK vía is_admin() (convención del repo, fix revisor #1)
CREATE POLICY "billing_plans_admin_all" ON public.billing_plans
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_billing_plans_active_name ON public.billing_plans (active, name);

-- Nuevos campos en contract_machines
ALTER TABLE public.contract_machines
  ADD COLUMN billing_plan_id      uuid REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  ADD COLUMN price_bw_override    numeric(10,6),
  ADD COLUMN price_color_override numeric(10,6),
  ADD COLUMN fixed_fee_override   numeric(10,4),
  ADD CONSTRAINT contract_machines_billing_override_nonneg CHECK (
    (price_bw_override    IS NULL OR price_bw_override    >= 0) AND
    (price_color_override IS NULL OR price_color_override >= 0) AND
    (fixed_fee_override   IS NULL OR fixed_fee_override   >= 0)
  );

CREATE INDEX idx_cm_billing_plan ON public.contract_machines (billing_plan_id)
  WHERE billing_plan_id IS NOT NULL;

COMMENT ON TABLE public.billing_plans IS 'Catálogo de tipos de facturación AMD. Define estructura y precios base.';
COMMENT ON COLUMN public.contract_machines.billing_plan_id      IS 'Plan de facturación de esta línea. NULL = sin facturación.';
COMMENT ON COLUMN public.contract_machines.price_bw_override    IS 'Override precio B&N. NULL = usar el del plan.';
COMMENT ON COLUMN public.contract_machines.price_color_override IS 'Override precio color. NULL = usar el del plan.';
COMMENT ON COLUMN public.contract_machines.fixed_fee_override   IS 'Override cuota fija. NULL = usar la del plan.';
```

- [ ] **Step 2: Verificar que `public.is_admin()` existe**

Run: `grep -rn "FUNCTION public.is_admin" supabase/migrations/`
Expected: al menos una definición (usada por las policies existentes).

- [ ] **Step 3: Commit (amend del commit existente de la migración)**

```bash
git add supabase/migrations/20260606000000_billing_plans.sql
git commit --amend --no-edit
```

---

## Task 2: Migración — `invoices`, `invoice_lines`, numeración

> Paralela con Tasks 1, 3, 4.

**Files:**
- Create: `supabase/migrations/20260606000100_invoices.sql`

- [ ] **Step 1: Crear la migración de facturas**

```sql
-- supabase/migrations/20260606000100_invoices.sql
-- Sistema de facturación inmutable (Opción B): cabecera por cliente/mes + snapshot por máquina.

-- Numeración FACT-YYYY-NNNN (clon de incident_counters / next_incident_number)
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year        int  PRIMARY KEY,
  last_number int  NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_num  int;
BEGIN
  INSERT INTO public.invoice_counters (year, last_number)
       VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
       SET last_number = public.invoice_counters.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN format('FACT-%s-%s', v_year, lpad(v_num::text, 4, '0'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM authenticated;

-- Cabecera de factura (una por cliente/mes)
CREATE TABLE public.invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_facture   text        NOT NULL UNIQUE,
  client_id        bigint      NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,  -- clients.id es BIGINT
  client_name      text        NOT NULL,                      -- snapshot
  period_year      int         NOT NULL,
  period_month     int         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status           text        NOT NULL DEFAULT 'emise' CHECK (status IN ('emise', 'annulee')),
  has_estimated    boolean     NOT NULL DEFAULT false,
  currency         text        NOT NULL DEFAULT 'XOF',
  total_amount     numeric(14,2) NOT NULL DEFAULT 0,
  issued_by        uuid        REFERENCES public.profiles(id),
  issued_at        timestamptz NOT NULL DEFAULT now(),
  annulled_by      uuid        REFERENCES public.profiles(id),
  annulled_at      timestamptz,
  annulation_reason text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Una sola factura "emise" por cliente y periodo (se puede reemitir tras anular)
CREATE UNIQUE INDEX invoices_client_period_emise_unique
  ON public.invoices (client_id, period_year, period_month)
  WHERE status = 'emise';

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_admin_all" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Líneas inmutables (snapshot por máquina)
CREATE TABLE public.invoice_lines (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  contract_id    uuid,                                  -- ref informativa
  numero_contrat text        NOT NULL,                  -- snapshot
  machine_id     text,                                  -- ref informativa (numero_serie)
  machine_label  text        NOT NULL,                  -- snapshot "marque modele (serie)"
  plan_name      text        NOT NULL,                  -- snapshot
  billing_type   text        NOT NULL,                  -- snapshot
  fixed_fee      numeric(10,4),                         -- snapshot tarifa efectiva
  price_bw       numeric(10,6),
  price_color    numeric(10,6),
  tiers          jsonb,
  delta_bw       int         NOT NULL DEFAULT 0,
  delta_color    int         NOT NULL DEFAULT 0,
  is_estimated   boolean     NOT NULL DEFAULT false,    -- true si faltaba relevé
  amount_fixed   numeric(14,2) NOT NULL DEFAULT 0,
  amount_bw      numeric(14,2) NOT NULL DEFAULT 0,
  amount_color   numeric(14,2) NOT NULL DEFAULT 0,
  amount_total   numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines (invoice_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_lines_admin_all" ON public.invoice_lines
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.invoices      IS 'Facturas emitidas por cliente/mes. Inmutables salvo anulación.';
COMMENT ON TABLE public.invoice_lines IS 'Snapshot inmutable por máquina: tarifa y consumo congelados al emitir.';

-- RPC transaccional de emisión (resuelve N1 atomicidad, N4 numeración sin huecos, N9 permisos).
-- Patrón create_contract_with_lines: SECURITY DEFINER + guard service_role + REVOKE de no privilegiados.
-- Recibe el draft YA calculado por el servidor (lib/invoicing) en p_payload:
--   { client_id, client_name, period_year, period_month, has_estimated, total_amount,
--     issued_by, confirm_estimated, lines: [ { ...campos de invoice_lines... } ] }
CREATE OR REPLACE FUNCTION public.emit_invoice(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   bigint := (p_payload->>'client_id')::bigint;   -- clients.id es BIGINT
  v_year        int  := (p_payload->>'period_year')::int;
  v_month       int  := (p_payload->>'period_month')::int;
  v_has_est     bool := COALESCE((p_payload->>'has_estimated')::bool, false);
  v_confirm     bool := COALESCE((p_payload->>'confirm_estimated')::bool, false);
  v_numero      text;
  v_invoice_id  uuid;
  v_line        jsonb;
BEGIN
  -- Guard: solo service_role (las Server Actions usan admin.rpc)
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_has_est AND NOT v_confirm THEN
    RAISE EXCEPTION 'estimated_not_confirmed';
  END IF;

  -- No duplicar factura emise para el mismo cliente/periodo
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = v_client_id AND period_year = v_year
      AND period_month = v_month AND status = 'emise'
  ) THEN
    RAISE EXCEPTION 'already_issued';
  END IF;

  v_numero := public.next_invoice_number();

  INSERT INTO public.invoices (
    numero_facture, client_id, client_name, period_year, period_month,
    status, has_estimated, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_year, v_month,
    'emise', v_has_est, (p_payload->>'total_amount')::numeric, (p_payload->>'issued_by')::uuid
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    INSERT INTO public.invoice_lines (
      invoice_id, contract_id, numero_contrat, machine_id, machine_label,
      plan_name, billing_type, fixed_fee, price_bw, price_color, tiers,
      delta_bw, delta_color, is_estimated,
      amount_fixed, amount_bw, amount_color, amount_total
    ) VALUES (
      v_invoice_id,
      NULLIF(v_line->>'contract_id','')::uuid,
      v_line->>'numero_contrat',
      v_line->>'machine_id',
      v_line->>'machine_label',
      v_line->>'plan_name',
      v_line->>'billing_type',
      NULLIF(v_line->>'fixed_fee','')::numeric,
      NULLIF(v_line->>'price_bw','')::numeric,
      NULLIF(v_line->>'price_color','')::numeric,
      CASE WHEN v_line->'tiers' = 'null'::jsonb THEN NULL ELSE v_line->'tiers' END,
      COALESCE((v_line->>'delta_bw')::int, 0),
      COALESCE((v_line->>'delta_color')::int, 0),
      COALESCE((v_line->>'is_estimated')::bool, false),
      COALESCE((v_line->>'amount_fixed')::numeric, 0),
      COALESCE((v_line->>'amount_bw')::numeric, 0),
      COALESCE((v_line->>'amount_color')::numeric, 0),
      COALESCE((v_line->>'amount_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM authenticated;
```

> **Nota de patrón:** confirmar `auth.role()` como guard mirando `create_contract_with_lines` en `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql`; si allí se usa otro guard (p. ej. `current_setting('request.jwt.claims')`), replicar el mismo.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260606000100_invoices.sql
git commit -m "feat: migración invoices + invoice_lines + numeración + RPC emit_invoice"
```

---

## Task 3: `src/lib/billing.ts` (con fix `numeric→string` y validación de tipo)

> Paralela con Tasks 1, 2, 4. **REESCRIBE** el archivo ya commiteado.

**Files:**
- Modify (rewrite): `src/lib/billing.ts`

- [ ] **Step 1: Reescribir con coerción `Number()` y validación de overrides por tipo**

```typescript
// src/lib/billing.ts

export type BillingType = 'per_copy' | 'hybrid' | 'hybrid_tiered'

export type BillingTier = {
  up_to: number | null
  price_bw: number
  price_color: number
}

export type BillingPlan = {
  id: string
  name: string
  type: BillingType
  fixed_fee: number | null
  price_bw: number | null
  price_color: number | null
  tiers: BillingTier[] | null
  active: boolean
}

export type ContractMachineWithBilling = {
  billing_plan_id: string | null
  billing_plans: BillingPlan | null
  price_bw_override: number | string | null
  price_color_override: number | string | null
  fixed_fee_override: number | string | null
}

export type EffectiveTariff = {
  type: BillingType
  fixed_fee: number
  price_bw: number | null
  price_color: number | null
  tiers: BillingTier[] | null
}

export type MonthlyAmounts = {
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
}

/** supabase-js devuelve columnas `numeric` como string → coerción segura (fix revisor #2) */
const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

/**
 * Tarifa efectiva aplicando override → plan base. Devuelve null si no hay plan.
 * Los overrides solo aplican si el tipo de plan los contempla (fix #3 de la reflexión).
 */
export function resolveEffectiveTariff(
  line: ContractMachineWithBilling
): EffectiveTariff | null {
  const plan = line.billing_plans
  if (!plan) return null

  const planFixed = num(plan.fixed_fee)
  const planBw    = num(plan.price_bw)
  const planColor = num(plan.price_color)
  const ovFixed   = num(line.fixed_fee_override)
  const ovBw      = num(line.price_bw_override)
  const ovColor   = num(line.price_color_override)

  const hasFixed = plan.type === 'hybrid' || plan.type === 'hybrid_tiered'
  const hasFlat  = plan.type === 'per_copy' || plan.type === 'hybrid'

  return {
    type:        plan.type,
    fixed_fee:   hasFixed ? (ovFixed ?? planFixed ?? 0) : 0,
    price_bw:    hasFlat  ? (ovBw    ?? planBw)          : null,
    price_color: hasFlat  ? (ovColor ?? planColor)       : null,
    tiers:       plan.type === 'hybrid_tiered' ? (plan.tiers ?? null) : null,
  }
}

/** Calcula el importe mensual. Redondea cada componente a entero (FCFA sin decimales). */
export function calculateMonthlyAmount(
  tariff: EffectiveTariff,
  delta_bw: number,
  delta_color: number,
): MonthlyAmounts {
  const amount_fixed = Math.round(tariff.fixed_fee)

  let amount_bw = 0
  let amount_color = 0

  if (tariff.type === 'per_copy' || tariff.type === 'hybrid') {
    amount_bw    = Math.round((tariff.price_bw    ?? 0) * delta_bw)
    amount_color = Math.round((tariff.price_color ?? 0) * delta_color)
  }

  if (tariff.type === 'hybrid_tiered' && tariff.tiers) {
    amount_bw    = Math.round(applyTiers(tariff.tiers, delta_bw,    'bw'))
    amount_color = Math.round(applyTiers(tariff.tiers, delta_color, 'color'))
  }

  return {
    amount_fixed,
    amount_bw,
    amount_color,
    amount_total: amount_fixed + amount_bw + amount_color,
  }
}

function applyTiers(
  tiers: BillingTier[],
  copies: number,
  channel: 'bw' | 'color',
): number {
  let remaining = copies
  let total = 0
  let from = 0

  for (const tier of tiers) {
    if (remaining <= 0) break
    const capacity = tier.up_to !== null ? tier.up_to - from : Infinity
    const inTier   = Math.min(remaining, capacity)
    const price    = channel === 'bw' ? tier.price_bw : tier.price_color
    total     += inTier * price
    remaining -= inTier
    if (tier.up_to !== null) from = tier.up_to
  }

  return total
}

/**
 * Valida un array de tramos: ≥2 tramos, último ilimitado (up_to null),
 * up_to estrictamente crecientes, precios no negativos (fix #4 de la reflexión).
 * Devuelve null si OK, o un mensaje de error.
 */
export function validateTiers(tiers: BillingTier[]): string | null {
  if (!Array.isArray(tiers) || tiers.length < 2) return 'Au moins 2 tranches requises.'
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const isLast = i === tiers.length - 1
    if (t.price_bw < 0 || t.price_color < 0) return 'Les prix ne peuvent pas être négatifs.'
    if (isLast) {
      if (t.up_to !== null) return 'La dernière tranche doit être illimitée.'
    } else {
      if (t.up_to === null) return 'Seule la dernière tranche peut être illimitée.'
      if (t.up_to <= prev) return 'Les seuils des tranches doivent être strictement croissants.'
      prev = t.up_to
    }
  }
  return null
}

export function formatPrice(amount: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount)) + ' FCFA'
  )
}

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  per_copy:      'Coût par copie',
  hybrid:        'Forfait + copie',
  hybrid_tiered: 'Forfait + copie dégressive',
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit 2>&1 | grep billing` → vacío.

- [ ] **Step 3: Commit (amend del commit existente)**

```bash
git add src/lib/billing.ts
git commit --amend --no-edit
```

---

## Task 4: `src/lib/counters.ts` — extraer `calcDeltas`

> Paralela con Tasks 1, 2, 3. Reutiliza la lógica que ya cuadra en pantalla (fix revisor #3) y añade desempate por `recorded_at` (fix #4).

**Files:**
- Create: `src/lib/counters.ts`
- Modify: `src/app/admin/contadores/[serie]/page.tsx`

- [ ] **Step 1: Leer la implementación actual**

Lee `src/app/admin/contadores/[serie]/page.tsx` líneas 14-50 para confirmar el tipo `Counter` y la función `calcDeltas` exactos.

- [ ] **Step 2: Crear `src/lib/counters.ts`**

```typescript
// src/lib/counters.ts

export interface Counter {
  id:                   string
  year:                 number
  month:                number
  day:                  number | null
  counter_bw:           number
  counter_color:        number
  status:               string
  is_replacement_start: boolean
  previous_machine_id:  string | null
  annulation_reason:    string | null
  annule_at:            string | null
  notes:                string | null
  recorded_at:          string
}

export interface CounterDelta {
  delta_bw: number | null
  delta_color: number | null
}

/**
 * Calcula el delta de cada relevé respecto al relevé activo inmediatamente anterior.
 * - Solo relevés con status 'actif'.
 * - Orden: year, month y `recorded_at` como desempate determinista (fix #4: no hay UNIQUE).
 * - El primer relevé y los `is_replacement_start` tienen delta null (no facturable).
 */
export function calcDeltas(counters: Counter[]): Map<string, CounterDelta> {
  const active = [...counters]
    .filter(c => c.status === 'actif')
    .sort((a, b) =>
      a.year !== b.year   ? a.year - b.year :
      a.month !== b.month ? a.month - b.month :
      a.recorded_at.localeCompare(b.recorded_at)
    )

  const deltaMap = new Map<string, CounterDelta>()
  active.forEach((c, i) => {
    if (i === 0 || c.is_replacement_start) {
      deltaMap.set(c.id, { delta_bw: null, delta_color: null })
    } else {
      const prev = active[i - 1]
      deltaMap.set(c.id, {
        delta_bw:    c.counter_bw    - prev.counter_bw,
        delta_color: c.counter_color - prev.counter_color,
      })
    }
  })
  return deltaMap
}
```

- [ ] **Step 3: Refactorizar `contadores/[serie]/page.tsx`**

  - Eliminar la `interface Counter` local (líneas 14-28) y la función `calcDeltas` local (líneas 30-50).
  - Añadir el import: `import { calcDeltas, type Counter } from '@/lib/counters'`
  - El resto del archivo (que llama a `calcDeltas(counters)`) queda igual.

- [ ] **Step 4: Verificar la pantalla de contadores sigue idéntica**

Run: `npm run dev` → abrir `/admin/contadores/<una-serie-con-relevés>`.
Expected: los deltas mostrados son **iguales** que antes (el desempate por `recorded_at` solo cambia el orden cuando hay empate exacto year+month, que antes era indefinido).

- [ ] **Step 5: Commit**

```bash
git add src/lib/counters.ts "src/app/admin/contadores/[serie]/page.tsx"
git commit -m "refactor: extraer calcDeltas a lib/counters con desempate recorded_at"
```

---

## ⚠️ PAUSA MANUAL — Aplicar ambas migraciones en Supabase

Aplicar en orden con `mcp__supabase__apply_migration` (o SQL Editor):
1. `20260606000000_billing_plans.sql`
2. `20260606000100_invoices.sql`

Verificar:
```sql
SELECT COUNT(*) FROM public.billing_plans;   -- 0, sin error
SELECT COUNT(*) FROM public.invoices;         -- 0, sin error
SELECT public.next_invoice_number();          -- 'FACT-2026-0001'
DELETE FROM public.invoice_counters;          -- resetear tras la prueba para no saltar el 0001 real
```

---

## Task 5: `src/lib/invoicing.ts` — cálculo compartido preview ↔ emisión

> Depende de Tasks 3, 4 (y de las migraciones aplicadas). Esta función es la **única fuente de verdad** del importe; la usan tanto el preview como la emisión, garantizando que coincidan.

**Files:**
- Create: `src/lib/invoicing.ts`

- [ ] **Step 1: Crear el builder de borrador por cliente/mes**

```typescript
// src/lib/invoicing.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { calcDeltas, type Counter } from '@/lib/counters'
import {
  resolveEffectiveTariff,
  calculateMonthlyAmount,
  type ContractMachineWithBilling,
} from '@/lib/billing'

export type DraftLine = {
  contract_id: string
  numero_contrat: string
  machine_id: string
  machine_label: string
  plan_name: string
  billing_type: string
  fixed_fee: number | null
  price_bw: number | null
  price_color: number | null
  tiers: unknown
  delta_bw: number
  delta_color: number
  is_estimated: boolean
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
}

export type ClientDraft = {
  client_id: number          // clients.id es BIGINT → number en JS
  client_name: string
  period_year: number
  period_month: number
  lines: DraftLine[]
  total_amount: number
  has_estimated: boolean
}

/**
 * Construye el borrador de factura de un cliente para (year, month).
 * Para cada línea de contrato abierta (date_fin NULL) con plan asignado:
 * busca el relevé del periodo y su delta vía calcDeltas; si no hay relevé → línea estimada (consumo 0).
 */
export async function buildClientInvoiceDraft(
  clientId: number,
  year: number,
  month: number,
): Promise<ClientDraft | null> {
  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients').select('id, nom_client').eq('id', clientId).single()
  if (!client) return null

  // Filtro de periodo (cubre activas, reemplazadas y terminadas dentro del mes):
  // date_debut <= fin_periodo AND (date_fin IS NULL OR date_fin >= inicio_periodo)
  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const periodEnd   = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data: lines } = await admin
    .from('contract_machines')
    .select(`
      id, machine_id, billing_plan_id, date_debut, date_fin,
      price_bw_override, price_color_override, fixed_fee_override,
      billing_plans ( id, name, type, fixed_fee, price_bw, price_color, tiers ),
      machines ( numero_serie, marque, modele ),
      contracts!inner ( id, numero_contrat, client_id )
    `)
    .not('billing_plan_id', 'is', null)
    .eq('contracts.client_id', clientId)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)

  // N6 — cargar TODOS los relevés de las máquinas implicadas en UNA query (evita N+1)
  const machineIds = [...new Set((lines ?? []).map(l => l.machine_id).filter((id): id is string => !!id))]
  const { data: allCounters } = machineIds.length
    ? await admin
        .from('machine_counters')
        .select('id, machine_id, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
        .in('machine_id', machineIds)
    : { data: [] as (Counter & { machine_id: string })[] }

  const countersByMachine = new Map<string, Counter[]>()
  for (const c of (allCounters ?? []) as (Counter & { machine_id: string })[]) {
    const arr = countersByMachine.get(c.machine_id) ?? []
    arr.push(c)
    countersByMachine.set(c.machine_id, arr)
  }

  const draftLines: DraftLine[] = []

  for (const line of lines ?? []) {
    const tariff = resolveEffectiveTariff(line as unknown as ContractMachineWithBilling)
    if (!tariff) continue

    const contract = line.contracts as unknown as { id: string; numero_contrat: string } | null
    const machine  = line.machines  as unknown as { numero_serie: string; marque: string; modele: string } | null
    const plan     = line.billing_plans as unknown as { name: string } | null
    if (!contract || !line.machine_id) continue

    // Delta del periodo: relevés de esa máquina → calcDeltas → el relevé de (year,month)
    const counters = countersByMachine.get(line.machine_id) ?? []
    const deltaMap = calcDeltas(counters)
    const periodCounter = counters
      .filter((c: Counter) => c.status === 'actif' && c.year === year && c.month === month)
      .sort((a: Counter, b: Counter) => b.recorded_at.localeCompare(a.recorded_at))[0] as Counter | undefined

    const d = periodCounter ? deltaMap.get(periodCounter.id) : undefined
    const is_estimated = !periodCounter || d?.delta_bw == null
    const delta_bw    = is_estimated ? 0 : (d!.delta_bw    ?? 0)
    const delta_color = is_estimated ? 0 : (d!.delta_color ?? 0)

    const amounts = calculateMonthlyAmount(tariff, delta_bw, delta_color)

    draftLines.push({
      contract_id:    contract.id,
      numero_contrat: contract.numero_contrat,
      machine_id:     line.machine_id,
      machine_label:  machine ? `${machine.marque} ${machine.modele} (${machine.numero_serie})` : line.machine_id,
      plan_name:      plan?.name ?? '—',
      billing_type:   tariff.type,
      fixed_fee:      tariff.fixed_fee,
      price_bw:       tariff.price_bw,
      price_color:    tariff.price_color,
      tiers:          tariff.tiers,
      delta_bw, delta_color, is_estimated,
      ...amounts,
    })
  }

  draftLines.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) || a.machine_label.localeCompare(b.machine_label))

  return {
    client_id:    client.id,
    client_name:  client.nom_client,
    period_year:  year,
    period_month: month,
    lines:        draftLines,
    total_amount: draftLines.reduce((s, l) => s + l.amount_total, 0),
    has_estimated: draftLines.some(l => l.is_estimated),
  }
}

/**
 * Clientes con al menos una línea con plan activa O cerrada dentro del periodo (candidatos a facturar).
 * H5: usa el MISMO filtro de periodo que buildClientInvoiceDraft, si no se pierden clientes cuyo
 * contrato terminó a mitad del mes facturado (su última factura parcial).
 */
export async function listBillableClients(year: number, month: number): Promise<{ id: number; nom_client: string }[]> {
  const admin = createAdminClient()
  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const periodEnd   = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data } = await admin
    .from('contract_machines')
    .select('contracts!inner ( clients!inner ( id, nom_client ) )')
    .not('billing_plan_id', 'is', null)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)

  const map = new Map<number, string>()
  for (const row of data ?? []) {
    const c = (row.contracts as unknown as { clients: { id: number; nom_client: string } }).clients
    if (c) map.set(c.id, c.nom_client)
  }
  return [...map.entries()].map(([id, nom_client]) => ({ id, nom_client }))
    .sort((a, b) => a.nom_client.localeCompare(b.nom_client))
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit 2>&1 | grep invoicing` → vacío.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invoicing.ts
git commit -m "feat: lib/invoicing — buildClientInvoiceDraft compartido preview/emisión"
```

---

## Task 6: Componente `BillingPlanForm` (con validación de tramos)

> Depende de Task 3 (tipos + `validateTiers`).

**Files:**
- Create: `src/components/admin/BillingPlanForm.tsx`

- [ ] **Step 1: Crear el formulario dinámico**

```tsx
// src/components/admin/BillingPlanForm.tsx
'use client'

import { useActionState, useState } from 'react'
import {
  BILLING_TYPE_LABEL, validateTiers,
  type BillingPlan, type BillingTier, type BillingType,
} from '@/lib/billing'

type FormState = { error: string } | null

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  defaultValues?: Partial<BillingPlan>
  submitLabel?: string
}

const inputClass =
  'w-full rounded-input border border-line bg-card px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/40'

export default function BillingPlanForm({ action, defaultValues, submitLabel = 'Enregistrer' }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [type, setType] = useState<BillingType>(defaultValues?.type ?? 'per_copy')
  const [tiers, setTiers] = useState<BillingTier[]>(
    defaultValues?.tiers ?? [
      { up_to: 10000, price_bw: 0, price_color: 0 },
      { up_to: null,  price_bw: 0, price_color: 0 },
    ]
  )

  const tiersError = type === 'hybrid_tiered' ? validateTiers(tiers) : null

  function addTier() {
    setTiers(prev => {
      const last = prev[prev.length - 1]
      const newCap = (prev[prev.length - 2]?.up_to ?? 0) + 5000
      return [...prev.slice(0, -1),
        { up_to: newCap, price_bw: last.price_bw, price_color: last.price_color },
        { up_to: null,   price_bw: last.price_bw, price_color: last.price_color }]
    })
  }
  function removeTier(i: number) { if (tiers.length > 2) setTiers(prev => prev.filter((_, idx) => idx !== i)) }
  function updateTier(i: number, field: keyof BillingTier, raw: string) {
    setTiers(prev => prev.map((t, idx) => idx !== i ? t : {
      ...t, [field]: field === 'up_to' ? (raw === '' ? null : Number(raw)) : Number(raw),
    }))
  }

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Nom du plan <span className="text-accent">*</span></label>
        <input name="name" type="text" required defaultValue={defaultValues?.name} placeholder="Plan Standard B&N" className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Type <span className="text-accent">*</span></label>
        <select name="type" value={type} onChange={e => setType(e.target.value as BillingType)} className={inputClass}>
          {(Object.entries(BILLING_TYPE_LABEL) as [BillingType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {(type === 'hybrid' || type === 'hybrid_tiered') && (
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1.5">Forfait mensuel (FCFA) <span className="text-accent">*</span></label>
          <input name="fixed_fee" type="number" min="0" step="1" required defaultValue={defaultValues?.fixed_fee ?? ''} className={inputClass} />
        </div>
      )}

      {(type === 'per_copy' || type === 'hybrid') && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Prix copie B&N (FCFA) <span className="text-accent">*</span></label>
            <input name="price_bw" type="number" min="0" step="0.000001" required defaultValue={defaultValues?.price_bw ?? ''} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Prix copie couleur (FCFA) <span className="text-accent">*</span></label>
            <input name="price_color" type="number" min="0" step="0.000001" required defaultValue={defaultValues?.price_color ?? ''} className={inputClass} />
          </div>
        </div>
      )}

      {type === 'hybrid_tiered' && (
        <div>
          <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-ink-soft">Tranches de volume</label>
            <button type="button" onClick={addTier} className="text-xs font-medium text-accent hover:underline">+ Ajouter une tranche</button>
          </div>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Jusqu'à (copies)</p>}
                  {tier.up_to === null
                    ? <input disabled value="Illimité" className={`${inputClass} opacity-50`} />
                    : <input type="number" min="1" value={tier.up_to ?? ''} onChange={e => updateTier(i, 'up_to', e.target.value)} className={inputClass} />}
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Prix B&N (FCFA)</p>}
                  <input type="number" min="0" step="0.000001" value={tier.price_bw} onChange={e => updateTier(i, 'price_bw', e.target.value)} className={inputClass} />
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Prix couleur (FCFA)</p>}
                  <input type="number" min="0" step="0.000001" value={tier.price_color} onChange={e => updateTier(i, 'price_color', e.target.value)} className={inputClass} />
                </div>
                <button type="button" onClick={() => removeTier(i)} disabled={tiers.length <= 2}
                  className="text-ink-muted hover:text-accent disabled:opacity-30 pb-2.5" aria-label="Supprimer">✕</button>
              </div>
            ))}
          </div>
          {tiersError && <p className="text-xs text-accent mt-2">{tiersError}</p>}
          <p className="text-xs text-ink-muted mt-2">La dernière tranche est toujours illimitée. Minimum 2 tranches.</p>
        </div>
      )}

      <button type="submit" disabled={pending || !!tiersError}
        className="w-full rounded-input bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60 transition-colors">
        {pending ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Verificar compilación + Commit**

```bash
npx tsc --noEmit 2>&1 | grep BillingPlanForm   # vacío
git add src/components/admin/BillingPlanForm.tsx
git commit -m "feat: BillingPlanForm dinámico con validación de tramos"
```

---

## Task 7: CRUD `/admin/billing-plans` + sidebar

> Depende de Task 6. Las server actions deben llamar `validateTiers` server-side antes de insertar/actualizar.

**Files:**
- Create: `src/app/admin/billing-plans/new/actions.ts`, `[id]/actions.ts`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: `new/actions.ts` → `createBillingPlanAction`**

```typescript
// src/app/admin/billing-plans/new/actions.ts
'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { validateTiers, type BillingType, type BillingTier } from '@/lib/billing'

type FormState = { error: string } | null
const VALID: BillingType[] = ['per_copy', 'hybrid', 'hybrid_tiered']

export async function createBillingPlanAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin()
  const name = (fd.get('name') as string).trim()
  const type = fd.get('type') as BillingType
  if (!name) return { error: 'Le nom est obligatoire.' }
  if (!VALID.includes(type)) return { error: 'Type invalide.' }

  const fixed_fee   = type !== 'per_copy'      ? Number(fd.get('fixed_fee'))   : null
  const price_bw    = type !== 'hybrid_tiered' ? Number(fd.get('price_bw'))    : null
  const price_color = type !== 'hybrid_tiered' ? Number(fd.get('price_color')) : null

  let tiers: BillingTier[] | null = null
  if (type === 'hybrid_tiered') {
    try { tiers = JSON.parse(fd.get('tiers') as string) } catch { return { error: 'Format des tranches invalide.' } }
    const err = validateTiers(tiers!); if (err) return { error: err }
  }

  const { error } = await supabase.from('billing_plans').insert({ name, type, fixed_fee, price_bw, price_color, tiers })
  if (error) {
    if (error.code === '23505') return { error: 'Un plan avec ce nom existe déjà.' }
    console.error('[createBillingPlan]', error); return { error: 'Une erreur est survenue.' }
  }
  redirect('/admin/billing-plans')
}
```

- [ ] **Step 2: `[id]/actions.ts` → `updateBillingPlanAction(id, _p, fd)` + `toggleBillingPlanAction(fd)`**

```typescript
// src/app/admin/billing-plans/[id]/actions.ts
'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { validateTiers, type BillingType, type BillingTier } from '@/lib/billing'

type FormState = { error: string } | null
const VALID: BillingType[] = ['per_copy', 'hybrid', 'hybrid_tiered']

export async function updateBillingPlanAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin()
  const name = (fd.get('name') as string).trim()
  const type = fd.get('type') as BillingType
  if (!name) return { error: 'Le nom est obligatoire.' }
  if (!VALID.includes(type)) return { error: 'Type invalide.' }

  const fixed_fee   = type !== 'per_copy'      ? Number(fd.get('fixed_fee'))   : null
  const price_bw    = type !== 'hybrid_tiered' ? Number(fd.get('price_bw'))    : null
  const price_color = type !== 'hybrid_tiered' ? Number(fd.get('price_color')) : null

  let tiers: BillingTier[] | null = null
  if (type === 'hybrid_tiered') {
    try { tiers = JSON.parse(fd.get('tiers') as string) } catch { return { error: 'Format des tranches invalide.' } }
    const err = validateTiers(tiers!); if (err) return { error: err }
  }

  const { error } = await supabase.from('billing_plans')
    .update({ name, type, fixed_fee, price_bw, price_color, tiers }).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'Un plan avec ce nom existe déjà.' }
    console.error('[updateBillingPlan]', error); return { error: 'Une erreur est survenue.' }
  }
  redirect('/admin/billing-plans')
}

export async function toggleBillingPlanAction(fd: FormData): Promise<void> {
  const id = fd.get('id') as string
  const active = fd.get('active') === 'true'
  const { supabase } = await requireAdmin()
  await supabase.from('billing_plans').update({ active: !active }).eq('id', id)
  redirect('/admin/billing-plans')
}
```

- [ ] **Step 3: Páginas (list, new, edit)** — Server Components con `requireAdmin()` + `createAdminClient()`, usando `BillingPlanForm`.

```tsx
// src/app/admin/billing-plans/page.tsx
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { BILLING_TYPE_LABEL, type BillingPlan } from '@/lib/billing'
import { toggleBillingPlanAction } from './[id]/actions'
import { Card } from '@/components/ui/Card'

export default async function BillingPlansPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: plans } = await admin.from('billing_plans').select('*').order('name')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Plans de facturation</h1>
          <p className="text-sm text-ink-muted mt-0.5">Catalogue des types de facturation AMD</p>
        </div>
        <Link href="/admin/billing-plans/new" className="rounded-input bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">+ Nouveau plan</Link>
      </div>
      <Card className="divide-y divide-line">
        {(!plans || plans.length === 0) && (
          <p className="px-6 py-8 text-sm text-center text-ink-muted">Aucun plan créé. <Link href="/admin/billing-plans/new" className="text-accent hover:underline">Créer le premier →</Link></p>
        )}
        {(plans ?? []).map((plan: BillingPlan) => (
          <div key={plan.id} className="flex items-center justify-between px-6 py-4 gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{plan.name}</p>
              <p className="text-xs text-ink-muted mt-0.5">{BILLING_TYPE_LABEL[plan.type]}</p>
              <p className="text-xs text-ink-soft mt-1">
                {plan.type === 'per_copy'      && `B&N: ${plan.price_bw} · Couleur: ${plan.price_color} FCFA/copie`}
                {plan.type === 'hybrid'        && `Forfait: ${plan.fixed_fee} FCFA · B&N: ${plan.price_bw} · Couleur: ${plan.price_color}`}
                {plan.type === 'hybrid_tiered' && `Forfait: ${plan.fixed_fee} FCFA · ${plan.tiers?.length ?? 0} tranches`}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!plan.active && <span className="text-xs font-medium text-ink-muted bg-neutral-soft rounded-full px-2 py-0.5">Inactif</span>}
              <Link href={`/admin/billing-plans/${plan.id}`} className="text-sm text-ink-muted hover:text-ink">Modifier</Link>
              <form action={toggleBillingPlanAction}>
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="active" value={String(plan.active)} />
                <button type="submit" className="text-xs text-ink-muted hover:text-accent">{plan.active ? 'Désactiver' : 'Activer'}</button>
              </form>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
```

```tsx
// src/app/admin/billing-plans/new/page.tsx
import { requireAdmin } from '@/lib/auth'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import BillingPlanForm from '@/components/admin/BillingPlanForm'
import { createBillingPlanAction } from './actions'

export default async function NewBillingPlanPage() {
  await requireAdmin()
  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/billing-plans" className="text-sm text-ink-muted hover:text-ink">← Retour</Link>
        <h1 className="text-xl font-bold text-ink">Nouveau plan</h1>
      </div>
      <Card className="p-6"><BillingPlanForm action={createBillingPlanAction} submitLabel="Créer le plan" /></Card>
    </div>
  )
}
```

```tsx
// src/app/admin/billing-plans/[id]/page.tsx
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import BillingPlanForm from '@/components/admin/BillingPlanForm'
import { updateBillingPlanAction } from './actions'
import type { BillingPlan } from '@/lib/billing'

export default async function EditBillingPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()
  const { data: plan } = await admin.from('billing_plans').select('*').eq('id', id).single()
  if (!plan) notFound()
  const boundAction = updateBillingPlanAction.bind(null, id)
  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/billing-plans" className="text-sm text-ink-muted hover:text-ink">← Retour</Link>
        <h1 className="text-xl font-bold text-ink">Modifier le plan</h1>
      </div>
      <Card className="p-6"><BillingPlanForm action={boundAction} defaultValues={plan as BillingPlan} submitLabel="Enregistrer" /></Card>
    </div>
  )
}
```

- [ ] **Step 4: Sidebar** — en `src/components/admin/Sidebar.tsx`:
  - Importar iconos: `import { Receipt, FileSpreadsheet, FileText } from 'lucide-react'`
  - Añadir grupo tras el que contiene "Compteurs":
```typescript
{
  label: 'Facturation',
  items: [
    { href: '/admin/billing-plans', label: 'Plans tarifaires', icon: Receipt },
    { href: '/admin/facturation',   label: 'Rapport mensuel',  icon: FileSpreadsheet },
    { href: '/admin/factures',      label: 'Factures émises',  icon: FileText },
  ],
}
```

- [ ] **Step 5: Verificar en browser** (`/admin/billing-plans`: crear per_copy, hybrid_tiered con tramos válidos e inválidos, editar, toggle). **Commit:**

```bash
git add src/app/admin/billing-plans/ src/components/admin/Sidebar.tsx
git commit -m "feat: CRUD /admin/billing-plans + grupo Facturation en sidebar"
```

---

## Task 8: Asignación de plan por máquina en formulario de contratos

> Depende de Task 7. **Antes de empezar, leer:** `src/components/admin/ContractForm.tsx`, `src/app/admin/contracts/new/actions.ts`, `src/app/admin/contracts/[id]/actions.ts` — para conocer cómo se representan y persisten las líneas de máquina.

**Files:**
- Modify: `ContractForm.tsx`, `contracts/new/page.tsx`, `contracts/new/actions.ts`, `contracts/[id]/page.tsx`, `contracts/[id]/actions.ts`

- [ ] **Step 1: Páginas de contrato** — cargar planes activos y pasarlos al form:
```typescript
const { data: billingPlans } = await admin
  .from('billing_plans').select('id, name, type').eq('active', true).order('name')
// <ContractForm ... billingPlans={billingPlans ?? []} />
```

- [ ] **Step 2: `ContractForm` props** — añadir `billingPlans: { id: string; name: string; type: BillingType }[]` (importar `BillingType` de `@/lib/billing`).

- [ ] **Step 3: Por cada línea de máquina** añadir, tras los overrides existentes, un `<select name={\`line_${i}_billing_plan_id\`}>` con opción "Sans plan" + planes, y los inputs override `line_${i}_fixed_fee_override`, `line_${i}_price_bw_override`, `line_${i}_price_color_override`. **Filtrar campos por tipo del plan seleccionado** (estado por línea): si el plan elegido es `per_copy` ocultar el override de forfait; si es `hybrid_tiered` ocultar overrides B&N/color (no aplican a tramos). Placeholder "Du plan".

- [ ] **Step 4: Actions (new + edit)** — al procesar cada línea, leer y persistir en `contract_machines`:
```typescript
const billing_plan_id      = (fd.get(`line_${i}_billing_plan_id`) as string) || null
const fixed_fee_override   = fd.get(`line_${i}_fixed_fee_override`)   ? Number(fd.get(`line_${i}_fixed_fee_override`))   : null
const price_bw_override    = fd.get(`line_${i}_price_bw_override`)    ? Number(fd.get(`line_${i}_price_bw_override`))    : null
const price_color_override = fd.get(`line_${i}_price_color_override`) ? Number(fd.get(`line_${i}_price_color_override`)) : null
// incluir billing_plan_id, fixed_fee_override, price_bw_override, price_color_override en el insert/update de contract_machines
```

- [ ] **Step 5: Verificar en browser** (asignar plan + override, guardar, reabrir → prellenado; sin plan → null). **Commit:**

```bash
git add src/components/admin/ContractForm.tsx "src/app/admin/contracts/"
git commit -m "feat: asignación de billing_plan + overrides por máquina en contratos"
```

---

## Task 9: `/admin/facturation` — preview en vivo por cliente/mes

> Depende de Task 5 (`buildClientInvoiceDraft`) + Task 8 (datos reales).

**Files:**
- Create: `src/app/admin/facturation/page.tsx`, `src/components/admin/FacturationPreview.tsx`

- [ ] **Step 1: Server Component**

```tsx
// src/app/admin/facturation/page.tsx
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientInvoiceDraft, listBillableClients } from '@/lib/invoicing'
import FacturationPreview from '@/components/admin/FacturationPreview'

export const dynamic = 'force-dynamic'

export default async function FacturationPage({
  searchParams,
}: { searchParams: Promise<{ client?: string; year?: string; month?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const now = new Date()
  const year  = sp.year  ? Number(sp.year)  : now.getFullYear()
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1

  const clients = await listBillableClients(year, month)
  const clientId = sp.client ? Number(sp.client) : (clients[0]?.id ?? null)
  const draft = clientId != null ? await buildClientInvoiceDraft(clientId, year, month) : null

  let alreadyIssued: string | null = null
  if (clientId) {
    const admin = createAdminClient()
    const { data } = await admin.from('invoices')
      .select('numero_facture')
      .eq('client_id', clientId).eq('period_year', year).eq('period_month', month).eq('status', 'emise')
      .maybeSingle()
    alreadyIssued = data?.numero_facture ?? null
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Rapport de facturation</h1>
        <p className="text-sm text-ink-muted mt-0.5">Aperçu calculé à partir des relevés. Émettez pour figer la facture.</p>
      </div>
      <FacturationPreview clients={clients} selectedClient={clientId} year={year} month={month} draft={draft} alreadyIssued={alreadyIssued} />
    </div>
  )
}
```

- [ ] **Step 2: Client Component `FacturationPreview`**

```tsx
// src/components/admin/FacturationPreview.tsx
'use client'
import { formatPrice } from '@/lib/billing'
import { emitInvoiceAction } from '@/app/admin/facturation/actions'
import type { ClientDraft } from '@/lib/invoicing'

type Props = {
  clients: { id: number; nom_client: string }[]
  selectedClient: number | null
  year: number; month: number
  draft: ClientDraft | null
  alreadyIssued: string | null
}

export default function FacturationPreview({ clients, selectedClient, year, month, draft, alreadyIssued }: Props) {
  function nav(next: Partial<{ client: number; year: number; month: number }>) {
    const p = new URLSearchParams({
      client: String(next.client ?? selectedClient ?? ''),
      year:  String(next.year  ?? year),
      month: String(next.month ?? month),
    })
    window.location.href = `/admin/facturation?${p.toString()}`
  }
  const monthLabel = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedClient ?? ''} onChange={e => nav({ client: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom_client}</option>)}
        </select>
        <select value={month} onChange={e => nav({ month: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>{new Date(2000, m - 1).toLocaleDateString('fr-FR', { month: 'long' })}</option>)}
        </select>
        <select value={year} onChange={e => nav({ year: Number(e.target.value) })}
          className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink">
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {alreadyIssued && (
        <div className="px-4 py-3 rounded-lg bg-info-soft border border-info/20 text-sm text-info flex items-center justify-between">
          <span>Facture déjà émise pour {monthLabel} : <strong>{alreadyIssued}</strong></span>
          <a href="/admin/factures" className="underline">Voir les factures →</a>
        </div>
      )}

      {!draft || draft.lines.length === 0 ? (
        <div className="text-center py-12 text-sm text-ink-muted">Aucune ligne facturable pour {monthLabel}.</div>
      ) : (
        <>
          <div className="border border-line rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-soft">
              <span className="font-semibold text-sm text-ink">{draft.client_name} — {monthLabel}</span>
              <span className="font-bold text-sm text-ink">{formatPrice(draft.total_amount)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-xs text-ink-muted">
                  <th className="text-left px-5 py-2">Machine</th><th className="text-left px-4 py-2">Contrat</th>
                  <th className="text-left px-4 py-2">Plan</th><th className="text-right px-4 py-2">ΔB&N</th>
                  <th className="text-right px-4 py-2">ΔCoul.</th><th className="text-right px-5 py-2">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-line-subtle">
                  {draft.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-neutral-soft/50">
                      <td className="px-5 py-3 font-mono text-xs">{l.machine_label}{l.is_estimated && <span className="ml-2 text-[10px] font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Estimée</span>}</td>
                      <td className="px-4 py-3 text-xs text-ink-soft">{l.numero_contrat}</td>
                      <td className="px-4 py-3 text-xs text-ink-soft">{l.plan_name}</td>
                      <td className="px-4 py-3 text-right">{l.delta_bw.toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 text-right">{l.delta_color.toLocaleString('fr-FR')}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatPrice(l.amount_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!alreadyIssued && (
            <form action={emitInvoiceAction} className="flex items-center justify-end gap-3">
              <input type="hidden" name="client_id" value={draft.client_id} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              {draft.has_estimated ? (
                <>
                  <p className="text-sm text-warning mr-auto">⚠️ Des machines n'ont pas de relevé pour {monthLabel}.</p>
                  <button name="confirm_estimated" value="true" type="submit"
                    className="rounded-input bg-warning px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    Émettre malgré tout (lignes estimées)
                  </button>
                </>
              ) : (
                <button type="submit" className="rounded-input bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
                  Émettre la facture
                </button>
              )}
            </form>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar** preview con un cliente que tenga planes asignados; badge Estimée en máquinas sin relevé. **Commit:**

```bash
git add src/app/admin/facturation/page.tsx src/components/admin/FacturationPreview.tsx
git commit -m "feat: /admin/facturation preview en vivo por cliente/mes"
```

---

## Task 10: Emisión (snapshot) + vista de facturas emitidas + anulación

> Depende de Task 9. Reutiliza `buildClientInvoiceDraft` para congelar exactamente lo que muestra el preview.

**Files:**
- Create: `src/app/admin/facturation/actions.ts`, `src/app/admin/factures/page.tsx`, `[id]/page.tsx`, `[id]/actions.ts`

- [ ] **Step 1: `facturation/actions.ts` → `emitInvoiceAction`**

```typescript
// src/app/admin/facturation/actions.ts
'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientInvoiceDraft } from '@/lib/invoicing'
import { redirect } from 'next/navigation'

const EMIT_ERROR_LABEL: Record<string, string> = {
  already_issued:          'Une facture existe déjà pour ce client et ce mois.',
  estimated_not_confirmed: 'Relevés manquants non confirmés.',
  forbidden:               'Action non autorisée.',
}

export async function emitInvoiceAction(fd: FormData): Promise<void> {
  const { user } = await requireAdmin()
  const client_id = Number(fd.get('client_id'))   // clients.id es BIGINT → number
  const year  = Number(fd.get('year'))
  const month = Number(fd.get('month'))
  const confirmEstimated = fd.get('confirm_estimated') === 'true'

  const draft = await buildClientInvoiceDraft(client_id, year, month)
  if (!draft || draft.lines.length === 0) throw new Error('Aucune ligne à facturer.')
  if (draft.has_estimated && !confirmEstimated) throw new Error('Relevés manquants non confirmés.')

  // Emisión atómica vía RPC (numeración + cabecera + líneas en una transacción).
  // Las RPC se invocan SIEMPRE con admin.rpc (service_role); next_invoice_number/emit_invoice
  // revocan EXECUTE de authenticated (N9).
  const admin = createAdminClient()
  const { data: invoiceId, error } = await admin.rpc('emit_invoice', {
    p_payload: {
      client_id,
      client_name: draft.client_name,
      period_year: year,
      period_month: month,
      has_estimated: draft.has_estimated,
      confirm_estimated: confirmEstimated,
      total_amount: draft.total_amount,
      issued_by: user.id,
      lines: draft.lines,
    },
  })

  if (error || !invoiceId) {
    console.error('[emit]', error)
    const msg = error?.message ?? ''
    const key = Object.keys(EMIT_ERROR_LABEL).find(k => msg.includes(k))
    throw new Error(key ? EMIT_ERROR_LABEL[key] : 'Émission impossible.')
  }

  redirect(`/admin/factures/${invoiceId}`)
}
```

- [ ] **Step 2: `factures/page.tsx`** — lista de `invoices` order by `issued_at desc`: numero, cliente, periodo, total (`formatPrice`), badge "Annulée" si aplica, link al detalle.

- [ ] **Step 3: `factures/[id]/page.tsx`** — detalle solo-lectura: cabecera (numero, cliente, periodo, total, emitida por/cuándo, estado) + tabla de `invoice_lines`. Botones: descarga `<a href={\`/admin/factures/${id}/xlsx\`}>` "Télécharger le tableur", form → `emailInvoiceAction` "Envoyer par email", form con textarea `reason` → `annulInvoiceAction` "Annuler" (solo si `status==='emise'`).

- [ ] **Step 4: `factures/[id]/actions.ts` → `annulInvoiceAction`**

```typescript
// src/app/admin/factures/[id]/actions.ts (parcial: anulación; emailInvoiceAction se añade en Task 11)
'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function annulInvoiceAction(id: string, fd: FormData): Promise<void> {
  const { user, supabase } = await requireAdmin()
  const reason = (fd.get('reason') as string)?.trim() || null
  const { error } = await supabase.from('invoices')
    .update({ status: 'annulee', annulled_by: user.id, annulled_at: new Date().toISOString(), annulation_reason: reason })
    .eq('id', id).eq('status', 'emise')
  if (error) { console.error('[annul]', error); throw new Error('Annulation impossible.') }
  redirect(`/admin/factures/${id}`)
}
```

- [ ] **Step 5: Verificar** flujo completo: emitir (con y sin estimadas), ver detalle, doble emisión bloqueada, anular + reemitir. **Commit:**

```bash
git add src/app/admin/facturation/actions.ts src/app/admin/factures/
git commit -m "feat: emisión de facturas (snapshot inmutable) + vista + anulación"
```

---

## Task 11: Export `.xlsx` con fórmulas (descarga + email a admins)

> Depende de Task 10. Añade ExcelJS y extiende la Edge Function `send-email` para adjuntos.

**Files:**
- Create: `src/lib/invoice-xlsx.ts`, `src/app/admin/factures/[id]/xlsx/route.ts`
- Modify: `src/app/admin/factures/[id]/actions.ts` (añadir `emailInvoiceAction`), `supabase/functions/send-email/index.ts`, `CLAUDE.md`

- [ ] **Step 1: Instalar ExcelJS**

Run: `npm install exceljs`

- [ ] **Step 2: `src/lib/invoice-xlsx.ts`**

```typescript
// src/lib/invoice-xlsx.ts
import ExcelJS from 'exceljs'

export type InvoiceHeader = {
  numero_facture: string; client_name: string; period_year: number; period_month: number
  currency: string; total_amount: number; has_estimated: boolean
}
export type InvoiceLineRow = {
  numero_contrat: string; machine_label: string; plan_name: string; billing_type: string
  fixed_fee: number | null; price_bw: number | null; price_color: number | null
  delta_bw: number; delta_color: number; amount_fixed: number; amount_bw: number
  amount_color: number; amount_total: number; is_estimated: boolean
}

export async function buildInvoiceWorkbook(h: InvoiceHeader, lines: InvoiceLineRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AMD Service'
  const ws = wb.addWorksheet(h.numero_facture)

  ws.addRow([`Facture ${h.numero_facture}`])
  ws.addRow([`Client : ${h.client_name}`])
  ws.addRow([`Période : ${String(h.period_month).padStart(2, '0')}/${h.period_year}`])
  ws.addRow([])
  const headerRow = ws.addRow(['Contrat', 'Machine', 'Plan', 'Forfait', 'Prix B&N', 'ΔB&N', 'Prix Coul.', 'ΔCoul.', 'Total', 'Estimée'])
  headerRow.font = { bold: true }

  const firstDataRow = headerRow.number + 1
  lines.forEach((l, i) => {
    const r = firstDataRow + i
    // N2: la fórmula D+E*F+G*H solo es válida para precio plano. En hybrid_tiered los precios
    // son null y el importe vive en los tramos → escribir amount_total como valor literal.
    const totalCell = l.billing_type === 'hybrid_tiered'
      ? l.amount_total
      : { formula: `D${r}+E${r}*F${r}+G${r}*H${r}` }
    ws.addRow([
      l.numero_contrat, l.machine_label, l.plan_name,
      l.amount_fixed, l.price_bw ?? 0, l.delta_bw, l.price_color ?? 0, l.delta_color,
      totalCell,
      l.is_estimated ? 'OUI' : '',
    ])
  })

  const lastDataRow = firstDataRow + lines.length - 1
  const totalRow = ws.addRow(['', '', '', '', '', '', '', 'TOTAL', { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }])
  totalRow.font = { bold: true }

  ws.columns.forEach(c => { c.width = 16 })
  ws.getColumn(2).width = 32

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
```

- [ ] **Step 3: Route Handler de descarga**

```typescript
// src/app/admin/factures/[id]/xlsx/route.ts
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

export const runtime = 'nodejs'   // N5: ExcelJS y Buffer son Node-only

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()
  const { data: inv } = await admin.from('invoices').select('*').eq('id', id).single()
  if (!inv) return new Response('Not found', { status: 404 })
  const { data: lines } = await admin.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, (lines ?? []) as InvoiceLineRow[])  // N7
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${inv.numero_facture}.xlsx"`,
    },
  })
}
```

- [ ] **Step 4: Extender `send-email` con adjuntos** — en `supabase/functions/send-email/index.ts`:
  - `EmailPayload`: añadir `to: string | string[]` y `attachments?: { filename: string; content: string }[]`.
  - Destructuring: `const { template, to, data = {}, attachments } = payload`.
  - **N10 — validar `to` incluido array vacío** (la comprobación actual `if (!template || !to)` no detecta `[]`):
    ```typescript
    const toEmpty = !to || (Array.isArray(to) && to.length === 0)
    if (!template || toEmpty) {
      return new Response(JSON.stringify({ error: 'template et to sont requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
    ```
  - Body a Resend: `JSON.stringify({ from: FROM, to, subject, html, ...(attachments?.length ? { attachments } : {}) })`.

- [ ] **Step 5: `emailInvoiceAction`** en `factures/[id]/actions.ts`

```typescript
// añadir a src/app/admin/factures/[id]/actions.ts
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

export async function emailInvoiceAction(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const recipients = (process.env.BILLING_NOTIFY_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (recipients.length === 0) throw new Error('BILLING_NOTIFY_EMAILS non configurée.')

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (!inv) throw new Error('Facture introuvable.')
  const { data: lines } = await supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, (lines ?? []) as InvoiceLineRow[])  // N7
  const base64 = buf.toString('base64')

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
    body: JSON.stringify({
      template: 'raw', to: recipients,
      data: { subject: `Facture ${inv.numero_facture} — ${inv.client_name}`,
              html: `<p>Ci-joint la facture <strong>${inv.numero_facture}</strong> (${inv.client_name}).</p>` },
      attachments: [{ filename: `${inv.numero_facture}.xlsx`, content: base64 }],
    }),
  })
  if (!res.ok) { console.error('[emailInvoice]', await res.text()); throw new Error('Envoi email impossible.') }
}
```

- [ ] **Step 6: Redeploy** de la Edge Function `send-email` (vía `mcp__supabase__deploy_edge_function` o CLI). Definir `BILLING_NOTIFY_EMAILS` en `.env.local` y Vercel (acción manual).

- [ ] **Step 7: Corregir `CLAUDE.md`** — cambiar "Mailjet ahora" por "Resend ahora" en la sección de decisiones de diseño de email.

- [ ] **Step 8: Verificar** descarga (.xlsx con fórmulas que recalculan) + envío email con adjunto a un destinatario de prueba. **Commit:**

```bash
git add package.json package-lock.json src/lib/invoice-xlsx.ts "src/app/admin/factures/" supabase/functions/send-email/index.ts CLAUDE.md
git commit -m "feat: export xlsx con fórmulas (descarga + email a admins) + adjuntos en send-email"
```

---

# FASE D — Política de reemplazo de máquina (separable)

> **Por qué separada:** el núcleo (Tasks 1-11) ya factura correctamente máquinas activas y terminadas (gracias al filtro de periodo de Task 5). Esta fase añade el caso "una máquina sustituye a otra a mitad de mes" facturándolo como **un único puesto de servicio**. Es la pieza de mayor riesgo (RPC con varias escrituras atómicas). Puede validarse el núcleo antes de abordarla. **No hay líneas encadenadas hasta que existe el flujo de reemplazo**, así que el núcleo es consistente sin esta fase.

## Task 12: Migración — encadenado de puestos + RPC `replace_contract_machine`

**Files:**
- Create: `supabase/migrations/20260606000200_machine_replacement.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- supabase/migrations/20260606000200_machine_replacement.sql

-- Encadenado del puesto de servicio: la línea entrante apunta a la saliente.
ALTER TABLE public.contract_machines
  ADD COLUMN replaces_contract_machine_id uuid NULL
    REFERENCES public.contract_machines(id) ON DELETE SET NULL;

CREATE INDEX idx_cm_replaces ON public.contract_machines (replaces_contract_machine_id)
  WHERE replaces_contract_machine_id IS NOT NULL;

-- Marca de factura con reemplazo en el periodo
ALTER TABLE public.invoices
  ADD COLUMN has_replacement boolean NOT NULL DEFAULT false;

-- RPC transaccional de reemplazo. Cierra la línea saliente (con relevé de cierre A_out)
-- y abre la entrante (con relevé inicial B_in, is_replacement_start). Patrón create_contract_with_lines.
-- p_payload: { out_cm_id, in_machine_id, date, out_counter_bw, out_counter_color,
--              in_counter_bw, in_counter_color, billing_plan_id?, overrides? }
CREATE OR REPLACE FUNCTION public.replace_contract_machine(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out_id   uuid := (p_payload->>'out_cm_id')::uuid;
  v_date     date := (p_payload->>'date')::date;
  v_out       public.contract_machines%ROWTYPE;
  v_in_id     uuid;
  v_last_bw   int;
  v_last_col  int;
  v_client_id bigint;   -- H2: machine_counters.client_id (BIGINT)
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_out FROM public.contract_machines WHERE id = v_out_id FOR UPDATE;
  IF NOT FOUND OR v_out.date_fin IS NOT NULL THEN RAISE EXCEPTION 'out_line_invalid'; END IF;
  IF v_date < v_out.date_debut THEN RAISE EXCEPTION 'date_before_debut'; END IF;

  -- H2: contract_id/client_id para los relevés (como el flujo normal de contadores)
  SELECT client_id INTO v_client_id FROM public.contracts WHERE id = v_out.contract_id;

  -- La máquina entrante no puede tener otra línea abierta
  IF EXISTS (
    SELECT 1 FROM public.contract_machines
    WHERE machine_id = p_payload->>'in_machine_id' AND date_fin IS NULL
  ) THEN RAISE EXCEPTION 'in_machine_busy'; END IF;

  -- Validar A_out >= último relevé activo de la saliente
  SELECT counter_bw, counter_color INTO v_last_bw, v_last_col
  FROM public.machine_counters
  WHERE machine_id = v_out.machine_id AND status = 'actif'
  ORDER BY year DESC, month DESC, recorded_at DESC LIMIT 1;
  IF v_last_bw IS NOT NULL AND (
       (p_payload->>'out_counter_bw')::int  < v_last_bw OR
       (p_payload->>'out_counter_color')::int < v_last_col
     ) THEN RAISE EXCEPTION 'closing_counter_too_low'; END IF;

  -- 1) Relevé de cierre de la saliente
  INSERT INTO public.machine_counters (machine_id, contract_id, client_id, year, month, day, counter_bw, counter_color, status)
  VALUES (v_out.machine_id, v_out.contract_id, v_client_id,
          EXTRACT(YEAR FROM v_date)::int, EXTRACT(MONTH FROM v_date)::int,
          EXTRACT(DAY FROM v_date)::int, (p_payload->>'out_counter_bw')::int,
          (p_payload->>'out_counter_color')::int, 'actif');

  -- 2) Cerrar la línea saliente
  UPDATE public.contract_machines
     SET date_fin = v_date, statut = 'terminé'
   WHERE id = v_out_id;

  -- 3) Abrir la línea entrante encadenada
  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override
  ) VALUES (
    v_out.contract_id, p_payload->>'in_machine_id', v_date, 'actif', v_out_id,
    COALESCE(NULLIF(p_payload->>'billing_plan_id','')::uuid, v_out.billing_plan_id),
    NULLIF(p_payload->>'price_bw_override','')::numeric,
    NULLIF(p_payload->>'price_color_override','')::numeric,
    NULLIF(p_payload->>'fixed_fee_override','')::numeric
  ) RETURNING id INTO v_in_id;

  -- 4) Relevé inicial de la entrante (reseteo de contador)
  INSERT INTO public.machine_counters (
    machine_id, contract_id, client_id, year, month, day, counter_bw, counter_color, status,
    is_replacement_start, previous_machine_id
  ) VALUES (
    p_payload->>'in_machine_id', v_out.contract_id, v_client_id,
    EXTRACT(YEAR FROM v_date)::int, EXTRACT(MONTH FROM v_date)::int,
    EXTRACT(DAY FROM v_date)::int, (p_payload->>'in_counter_bw')::int,
    (p_payload->>'in_counter_color')::int, 'actif', true, v_out.machine_id
  );

  RETURN v_in_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM authenticated;

-- H6: emit_invoice se actualiza AQUÍ (migración 200) con CREATE OR REPLACE para que lea/inserte
-- has_replacement. Editar la migración 100 no surte efecto si ya está aplicada. Cuerpo idéntico
-- al de la 100 salvo: nueva DECLARE v_has_repl, y la columna has_replacement en el INSERT de invoices.
CREATE OR REPLACE FUNCTION public.emit_invoice(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   bigint := (p_payload->>'client_id')::bigint;
  v_year        int  := (p_payload->>'period_year')::int;
  v_month       int  := (p_payload->>'period_month')::int;
  v_has_est     bool := COALESCE((p_payload->>'has_estimated')::bool, false);
  v_has_repl    bool := COALESCE((p_payload->>'has_replacement')::bool, false);
  v_confirm     bool := COALESCE((p_payload->>'confirm_estimated')::bool, false);
  v_numero      text;
  v_invoice_id  uuid;
  v_line        jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_has_est AND NOT v_confirm THEN RAISE EXCEPTION 'estimated_not_confirmed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = v_client_id AND period_year = v_year
      AND period_month = v_month AND status = 'emise'
  ) THEN RAISE EXCEPTION 'already_issued'; END IF;

  v_numero := public.next_invoice_number();

  INSERT INTO public.invoices (
    numero_facture, client_id, client_name, period_year, period_month,
    status, has_estimated, has_replacement, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_year, v_month,
    'emise', v_has_est, v_has_repl, (p_payload->>'total_amount')::numeric, (p_payload->>'issued_by')::uuid
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    INSERT INTO public.invoice_lines (
      invoice_id, contract_id, numero_contrat, machine_id, machine_label,
      plan_name, billing_type, fixed_fee, price_bw, price_color, tiers,
      delta_bw, delta_color, is_estimated,
      amount_fixed, amount_bw, amount_color, amount_total
    ) VALUES (
      v_invoice_id,
      NULLIF(v_line->>'contract_id','')::uuid,
      v_line->>'numero_contrat', v_line->>'machine_id', v_line->>'machine_label',
      v_line->>'plan_name', v_line->>'billing_type',
      NULLIF(v_line->>'fixed_fee','')::numeric,
      NULLIF(v_line->>'price_bw','')::numeric,
      NULLIF(v_line->>'price_color','')::numeric,
      CASE WHEN v_line->'tiers' = 'null'::jsonb THEN NULL ELSE v_line->'tiers' END,
      COALESCE((v_line->>'delta_bw')::int, 0),
      COALESCE((v_line->>'delta_color')::int, 0),
      COALESCE((v_line->>'is_estimated')::bool, false),
      COALESCE((v_line->>'amount_fixed')::numeric, 0),
      COALESCE((v_line->>'amount_bw')::numeric, 0),
      COALESCE((v_line->>'amount_color')::numeric, 0),
      COALESCE((v_line->>'amount_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
```

> Antes de implementar, leer `machine_counters` (columnas exactas y CHECKs) y `create_contract_with_lines` para replicar el guard y el estilo. Verificar que `statut` admite `'terminé'` (sí: `contract_machine_status`).
> **H1 (invariante del puesto):** `replace_contract_machine` hereda por defecto el plan de la saliente (`COALESCE(... , v_out.billing_plan_id)`). Se asume como invariante que **el reemplazo mantiene el plan del puesto**; el consumo consolidado se tarifa con esa única tarifa. Si se quiere endurecer, validar en la RPC que un `billing_plan_id` entrante explícito coincide con el de la saliente, o aceptarlo conscientemente.

- [ ] **Step 2: Aplicar la migración + Commit**

```bash
git add supabase/migrations/20260606000200_machine_replacement.sql
git commit -m "feat: encadenado de puestos + RPC replace_contract_machine + has_replacement"
```

## Task 13: Flujo UI "Remplacer la machine"

**Files:**
- Create: `src/components/admin/ReplaceMachineModal.tsx`, `src/app/admin/contracts/[id]/replace-actions.ts`
- Modify: `src/app/admin/contracts/[id]/page.tsx` (botón por línea abierta)

- [ ] **Step 1: Server Action** `replaceMachineAction` que llama `admin.rpc('replace_contract_machine', { p_payload })` con `out_cm_id`, `in_machine_id`, `date`, los 4 contadores y plan/overrides opcionales. Mapear errores (`out_line_invalid`, `in_machine_busy`, `closing_counter_too_low`, `date_before_debut`) a mensajes en francés.
- [ ] **Step 2: Modal** con: selector de máquina entrante (libre, sin línea abierta), fecha del reemplazo, contadores de cierre de la saliente (B&N/color) y contadores iniciales de la entrante (B&N/color), y plan/overrides opcionales (por defecto hereda los de la saliente).
- [ ] **Step 3: Botón "Remplacer la machine"** en cada línea abierta del detalle de contrato que abre el modal.
- [ ] **Step 4: Verificar** un reemplazo completo (la saliente queda `terminé` con date_fin; la entrante abierta encadenada; ambos relevés creados). **Commit.**

## Task 14: Consolidación de facturación por puesto

> Modifica `buildClientInvoiceDraft` (Task 5) para agrupar las líneas encadenadas de un mismo periodo en un único puesto.

**Files:**
- Modify: `src/lib/invoicing.ts`, `src/components/admin/FacturationPreview.tsx`, `src/app/admin/facturation/actions.ts`

- [ ] **Step 1: `lib/invoicing.ts`** —
  - Añadir `replaces_contract_machine_id` y `id` al `select` de `contract_machines`.
  - Añadir a `DraftLine`: `cm_id: string`, `replaces_cm_id: string | null`, `breakdown?: { machine_label: string; delta_bw: number; delta_color: number }[]`.
  - Tras construir `draftLines`, **post-procesar**: para cada línea entrante cuyo `replaces_cm_id` apunte a otra línea presente en el mismo draft, fusionar en el puesto: sumar `delta_bw`/`delta_color`, reconstruir la `EffectiveTariff` desde los campos snapshot de la línea entrante (`billing_type`, `fixed_fee`, `price_bw`, `price_color`, `tiers`) y **recalcular** los importes con `calculateMonthlyAmount` sobre el delta consolidado (un solo forfait, tramos una vez), rellenar `breakdown` con el detalle de saliente y entrante, y **descartar** la línea saliente como fila propia. Añadir `has_replacement: boolean` al `ClientDraft` (true si hubo alguna fusión).
- [ ] **Step 2: `ClientDraft`** — añadir `has_replacement: boolean`. En `emitInvoiceAction`, incluir `has_replacement: draft.has_replacement` en `p_payload`. La RPC `emit_invoice` ya lee e inserta `has_replacement` (actualizada vía `CREATE OR REPLACE` en la migración 200 — H6); no hay que tocar SQL aquí.
- [ ] **Step 3: `FacturationPreview`** — si una línea tiene `breakdown`, mostrar un sub-detalle expandible con el consumo de la saliente y de la entrante (verificación del admin) y un badge "Remplacement".
- [ ] **Step 4: Verificar** que un cliente con un reemplazo en el mes factura **un solo forfait** y el consumo consolidado, y que el desglose cuadra. **Commit.**

---

## Acciones manuales pendientes (fuera del código)

1. Aplicar las 2 migraciones del núcleo en Supabase (pausa tras Tasks 1-2).
2. `npm install exceljs` (Task 11 Step 1).
3. Redeploy de la Edge Function `send-email`.
4. Definir `BILLING_NOTIFY_EMAILS` en `.env.local` y en Vercel (Production).
5. (FASE D) aplicar la migración `20260606000200_machine_replacement.sql` (Task 12 Step 2).
6. (Arrastre de sesiones previas) definir `COMMERCIAL_EMAIL` en Vercel.

## Resumen de paralelización con `/workflows`

```
FASE A — PARALELA (/workflows): Task 1, Task 2, Task 3, Task 4
   ⚠️ PAUSA MANUAL: aplicar ambas migraciones
FASE B — Catálogo (secuencial): Task 6 → Task 7 → Task 8
FASE C — Facturación (secuencial): Task 5 → Task 9 → Task 10 → Task 11
   (Task 5 puede empezar en cuanto estén 3 y 4 + migraciones aplicadas)
FASE D — Reemplazo de máquina (separable, secuencial): Task 12 → Task 13 → Task 14
   (Validar el núcleo C antes de abordarla si se quiere reducir riesgo)
```
