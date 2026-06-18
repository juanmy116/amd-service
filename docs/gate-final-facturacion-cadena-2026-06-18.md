# Gate final — Facturación por CADENA y FECHA REAL (PR-E)

> Fecha: 2026-06-18 · Rama: `feat/contadores-rediseno-fecha-real`
> Spec: `docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md` (§9, 14 casos)
> Resultado: **GO** — los 14 casos del gate están cubiertos por tests verdes contra Postgres real.

## Qué valida este gate

El rediseño movió la facturación de «mes de calendario / etiqueta» a **cadena por fecha real + línea**.
El gate demuestra que la familia de fallos de la auditoría (P0-1, P0-2, P0-3, P1) está cerrada y que el
flujo completo funciona end-to-end.

Dos niveles de cobertura, complementarios:

1. **Unitario** (`src/lib/invoicing.test.ts`, `src/lib/billing.test.ts`): el núcleo de cálculo con datos
   en memoria (mock del admin client). Cubre la lógica pura: cadena, N7, orden, aislamiento por línea,
   reemplazos, same-day.
2. **E2E de flujo** (`tests/rls/gate-facturation-e2e.test.ts`, NUEVO en PR-E): la cadena COMPLETA contra
   la BD real — siembra contrato/líneas/plan/lecturas → `buildContractInvoiceDraft` (queries reales) →
   `emit_contract_invoice` (RPC real) → factura inmutable persistida. Replica el payload exacto de la
   Server Action de producción (`contract-actions.ts`). Prueba que las piezas ENCAJAN, no solo cada una.
3. **Adversarial de RPC** (`tests/rls/emit-hardening.test.ts`, `close-by-line.test.ts`,
   `guards-by-line.test.ts`, `cancel-billed-counter.test.ts`): payloads/escenarios manipulados que
   verifican que cada barrera rechaza lo inválido.

## Mapeo de los 14 casos del §9 → cobertura

| # | Caso (§9) | Cobertura | Dónde |
|---|---|---|---|
| 1 | Dos lecturas el mismo mes natural (billing_day=1): 02-may + 31-may conviven; abril y mayo sin doble cobro (P0-1) | **E2E** + unit | `gate-facturation-e2e.test.ts` §9.1 (abril 200/20 + mayo 300/30, sin solapar) · índice `(machine_id, reading_date)` |
| 2 | Corrección same-day: 2ª lectura del mismo día anula la anterior (N2) | unit + RPC | `invoicing.test.ts` (same-day en reemplazo) · guard A3 `cancel-billed-counter.test.ts` |
| 3 | Línea L1 cerrada y L2 abierta del mismo contrato: L1 no ve lecturas de L2 (P0-3) | unit + RPC | `invoicing.test.ts` (`countersForLine`) · `close-by-line.test.ts` (otra línea no contamina) |
| 4 | Retirar línea sin end_counter → error; con `return_machine_to_stock` → ok + factura último tramo (P0-2) | RPC | `close-by-line.test.ts` (return/terminate/replace por línea + fecha) |
| 5 | Cadena/dos de golpe: mayo usa 02-jun, junio usa 30-jun (más antigua primero) | **E2E** + unit | `gate-facturation-e2e.test.ts` §9.5 (cierres 02-jun/30-jun en orden) · `invoicing.test.ts` |
| 6 | Desfase N9: facturado abril; contador llega 20-jun → se factura mayo (secuencia) | unit | `invoicing.test.ts` (desfase N9 / cadena) |
| 7 | Mes solo-fijo + contador posterior (N8/N10): mayo solo-forfait; junio forfait + copias abril→junio | **E2E** + unit | `gate-facturation-e2e.test.ts` §9.7 (copias B&N suman 700 = 1700−1000, 3 forfaits, mayo intacta) |
| 8 | Fin de mes N7 (31-may→mayo; 28-feb→feb; bisiesto; cruce año; día 20→abril; día 1→mayo) | unit | `invoicing.test.ts` (`computeInvoiceMonth`, 6 casos N7 + casos 1-28) |
| 9 | Lectura tardía tras rotación: fecha pasada → línea vigente en esa fecha | unit + RPC | `invoicing.test.ts` (legacy por vigencia) · `close-by-line.test.ts` |
| 10 | No reutilización: emitir factura cuyo closing_counter_id ya fue cierre de otra → rechazado | RPC | `emit-hardening.test.ts` (V3c, top-level y breakdown) |
| 11 | Reemplazo A→B con lecturas el mismo mes: un forfait, copias sumadas, breakdown por tramo con IDs | **E2E** + unit | `gate-facturation-e2e.test.ts` §9.11 (A 300/30 + B 200/20 = 500/50, breakdown con IDs de A y B) |
| 12 | Vistas de piezas con lectura importada tarde: por `reading_date`, no `recorded_at` | unit + RPC | `invoicing.test.ts` · `part-yield-baseline.test.ts` |
| 13 | Orden: tres lecturas el mismo mes (días 2,15,28) → deltas correctos entre consecutivas | unit | `invoicing.test.ts` (orden canónico por `reading_date`) |
| 14 | Anulación/reemisión: permitida solo tras anular; dedup por mes intacto | **E2E** + RPC | `gate-facturation-e2e.test.ts` §9.14 (reemitir bloqueado mientras `emise`; ok tras `annulee`) |

Inmutabilidad de facturas (P0-5): verificada en `gate-facturation-e2e.test.ts` §9.1 (UPDATE/DELETE de una
factura `emise` rechazados por el trigger) y en `billing-isolation.test.ts`.

## Cómo correr el gate

```bash
supabase start            # Postgres local (OrbStack)
supabase db reset         # BD efímera con todas las migraciones
npm run test:rls          # 159 tests (incl. gate-facturation-e2e)
```

> Los tests que EMITEN facturas (gate, emit-hardening, cancel-billed-counter, facturation-periodo-medida)
> dejan facturas INMUTABLES que `cleanup()` no barre. En CI la BD es efímera (un `db reset` por run); en
> LOCAL hay que `supabase db reset` entre ejecuciones. El gate aborta con un mensaje accionable si detecta
> un contrato bloqueado por una factura previa.

## Infraestructura nueva (PR-E)

- `vitest.rls.config.ts`: alias `@/` (para importar el motor real `@/lib/invoicing`) + alias
  `server-only` → `tests/rls/_stubs/server-only.ts` (neutraliza el guard server-only de
  `@/lib/supabase/admin`, que de otro modo lanzaría al importar el motor fuera de un Server Component).
- El gate inyecta `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` (= las locales) para que
  `createAdminClient()` apunte a la BD local.

## Veredicto

**GO.** 113 unit + 159 RLS (incl. 5 E2E del gate) + typecheck + build verde. La facturación por cadena y
fecha real está lista para mergear a `main` y para facturar a 2AS por «periodo a medida».
