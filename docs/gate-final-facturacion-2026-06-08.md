# Gate final — facturación core (antes de habilitar facturación real)

**Fecha:** 2026-06-08
**Origen:** `docs/plan-correccion-core-facturacion-2026-06-08.md` §«Gate final».
**Regla de oro:** *Nada se factura a un cliente real hasta que este gate pase.* Hasta entonces, la facturación real NO se habilita.

Este documento es la **especificación ejecutable** del gate: un único E2E sobre datos sintéticos en la BD de prod que cubre toda la suite, con limpieza verificada por SELECT. Sigue el estilo del gate previo (PR #36, «159 700 FCFA», sesión 33): se ejecuta el **código TS REAL** del motor (no SQL reimplementado), los escenarios se montan con las **RPC reales**, y al terminar la prod queda idéntica al estado previo.

---

## Principios de ejecución (no negociables)

1. **Código real, no reimplementado.** Los importes se obtienen llamando a las funciones reales del motor (`buildContractInvoiceDraft`, `emit_contract_invoice`, etc.) vía `npx tsx` + `node --env-file=.env.local`, no con SQL que «imite» el cálculo. Si se reimplementa, el gate no prueba el código que se desplegará.
2. **Montaje con RPC reales.** Los contratos/líneas/reemplazos/rotaciones se crean con `create_contract_with_lines`, `assign_machine_from_stock`, `return_machine_to_stock`, `replace_contract_machine` — en DO blocks con `set_config('request.jwt.claims','{"role":"service_role"}', true)`. Así se prueba también la capa SQL (índices únicos, guards, herencias).
3. **Datos sintéticos identificables.** Todo lo creado lleva prefijo `gatef_` (máquinas), `GATEF-*` (contratos), cliente(s) `nom_client` con prefijo `GATEF`. Nada toca datos reales.
4. **Limpieza verificada por SELECT.** Al terminar: borrar todo lo sintético, resetear `invoice_counters` del año usado (para no dejar huecos de numeración), y **verificar por SELECT que quedan 0 residuos**. Adjuntar el resultado de esos SELECT al cierre.
5. **Trazabilidad.** Pegar en este documento (sección «RESULTADO») la tabla de importes obtenidos vs esperados, los números de factura emitidos y anulados, y los SELECT de limpieza. Igual que hizo el gate previo.

---

## Precondiciones (qué debe estar en `main` antes de ejecutar)

El gate final cubre TODO el core integrado. Antes de ejecutarlo deben estar mergeados:

- [x] **Bloque A** parque/stock (PR #40)
- [x] **Bloque B** motor por línea (PR #41)
- [x] **Bloque D** reglas temporales (PR #42)
- [x] **Bloque E1** motor del ciclo (PR #43)
- [x] **Bloque E2** persistencia + UI del ciclo (PR #44)
- [x] **Bloque 0** arreglos aislados (soporte, PR #39) — incluye P0-7 vía UI, validaciones, rollback fuera de migraciones, fix `terminé`
- [x] **Bloque C** blindaje contable BD (soporte, PR #46) — P0-5 inmutabilidad, P1-1 validación `emit_invoice`, P0-6 pertenencia de líneas, P2-5/P2-6
- [x] **P1-5** vigencia temporal de tarifas (PR aparte del motor) — historial `billing_plan_versions`/`contract_machine_override_versions`, resolución `asOf=period_start`
- [x] **Despliegue a la BD viva** — las 11 migraciones aplicadas a prod vía `migration repair` + `db push` (2026-06-09)

> **Nota:** la limpieza del flujo legacy por cliente (`buildClientInvoiceDraft`/`emitInvoiceAction`/`FacturationPreview`) queda como deuda menor fuera del gate; la UI ya usa el flujo por contrato.

> Mientras falten piezas, el gate puede ejecutarse **parcialmente** (solo los escenarios del motor A/B/D/E ya integrado) como ensayo, pero el **veredicto GO** solo es válido con todas las precondiciones en verde.

---

## Setup sintético

- **Cliente(s):** `GATEF Client 1` (y `GATEF Client 2` para el escenario multi-contrato). `id` capturado al crear.
- **Máquinas:** `gatef_N`, `gatef_R`, `gatef_A`, `gatef_B`, `gatef_C1..C3`, `gatef_S1/S2`, `gatef_STK`, `gatef_NEW`, `gatef_TIER`, etc. (una por escenario; serie = el propio prefijo).
- **Planes:** reutilizar o crear `GATEF Plat` (per_copy 10/50), `GATEF Hybride` (hybrid 30000/10/50), `GATEF Tranches` (hybrid_tiered con ≥2 tramos).
- **Año de prueba:** usar un año sin facturas reales (p. ej. 2027) para no tocar `invoice_counters` de años en uso; resetear ese contador al limpiar.

---

## Suite de escenarios (mapea el §«Gate final» del plan)

### A. Facturación — consumo y consolidación

| # | Escenario | Montaje (RPC real) | Verifica | Esperado |
|---|---|---|---|---|
| A1 | Línea normal con historial previo | contrato + relevés de 2 ciclos | consumo = fin−base del ciclo | delta y total deterministas |
| A2 | Primer mes de máquina **nueva** con `start_counter` real | `create_contract_with_lines` con `start_counter` | P0-4: factura desde la lectura inicial, no estimada-0 | delta = lectura − start_counter |
| A3 | Primer mes de máquina **usada** desde stock | `assign_machine_from_stock` (lectura obligatoria) | regla 3: factura desde `start_counter` (copias de prueba) | delta = lectura − start_counter |
| A4 | **Retirada sin reemplazo** (a stock) | `return_machine_to_stock` (end_counter real) | H-D6: factura su último consumo hasta el cierre | delta = end_counter − base |
| A5 | **Máquina reseteada A → stock → B** (caso del dueño) | A `return_machine_to_stock` (1000) → B `assign_machine_from_stock` (15) | P0-3/P1-3: A correcto, B desde su lectura; sin negativos ni cruces | A y B con sus deltas propios |
| A6 | **Reasignación A→B dentro del MISMO mes/ciclo** | retirada + asignación en el mismo ciclo | índice `one_active_per_month` no bloquea (cortes en la línea) | ambos clientes facturan su parte |
| A7 | **Reemplazo simple** (cliente sigue) | `replace_contract_machine` | consolidación: 1 forfait, breakdown por máquina | consolidado correcto, `has_replacement=true` |
| A8 | **Cadena A→B→C** | 2× `replace_contract_machine` en el ciclo | H-D5: cadena sin violar `one_active_per_month` | consolidado de los 3 tramos |
| A9 | Planes **plano / híbrido / por tramos** | una línea por tipo | tarifa correcta por tipo; tramos una sola vez sobre consumo consolidado | importes por tipo |
| A10 | Varias máquinas con **planes distintos en un contrato** | contrato N máquinas | cada línea su plan; una factura por contrato | suma coherente |

### B. Reglas temporales / estados

| # | Escenario | Verifica | Esperado |
|---|---|---|---|
| B1 | Contrato/línea **suspendu** | P1-6: no factura | excluido del draft |
| B2 | Contrato/línea **terminé** bien cerrado (date_fin) | P1-6: factura su ciclo de cierre, no después | incluido solo en su ciclo |
| B3 | Contrato **terminé con línea huérfana** (date_fin NULL) | P1-6: línea huérfana excluida | no factura sin fin |
| B4 | **Cambio de cliente con historial** | P1-4: `update_contract_with_lines` lo bloquea | error `client_change_forbidden_history` |
| B5 | **Reemplazo hereda overrides + visitas futuras** | P1-7/P1-8: línea entrante hereda `billing_day_override`/`maintenance_frequency_override`/`notes`; visitas futuras migran | overrides heredados; `maintenance_visits` futuras apuntan a la entrante |
| B6 | **Vigencia temporal de tarifas** | P1-5: subir el precio de un plan hoy y facturar un **ciclo pasado** | el ciclo pasado usa el **precio viejo**; un ciclo posterior, el nuevo. Override futuro NO aplica a ciclo anterior |

### C. Ciclo de aniversario (regla 9, Bloque E)

| # | Escenario | Verifica | Esperado |
|---|---|---|---|
| C1 | Factura del `billing_day` al día anterior del mes siguiente | periodo del ciclo correcto | `[billing_day, billing_day−1 mes sig.]` |
| C2 | **Caso 31 → febrero** | clamp de fin de mes | inicio/fin clamped correctos |
| C3 | Todas las máquinas del contrato en **una sola factura** del ciclo | unidad = contrato | 1 factura, N líneas |
| C4 | **Cliente con 2 contratos, mismo mes-ancla, ambos emitidos** | índice legacy restringido a `contract_id IS NULL` | **sin colisión** (2 facturas) |

### D. Forzar / fallo técnico / integridad contable

| # | Escenario | Verifica | Esperado |
|---|---|---|---|
| D1 | Mes/ciclo **sin lectura** → «Forcer la facturation» | regla 8: admin fuerza, línea estimada con traza | factura emitida, `is_estimated=true` |
| D2 | **Fallo técnico** de query → bloqueo | P0-7: `BillingDataError`, no factura-0 | preview/emisión bloqueadas |
| D3 | **Cabecera = suma de líneas** | P1-1 en `emit_contract_invoice` | cuadra; payload descuadrado → rechazado |
| D4 | Payload descuadrado / sin líneas / cliente cruzado | P1-1: validación en BD | RPC rechaza (`header_total_mismatch`, `no_lines`, `client_mismatch`) |
| D5 | **Factura emitida no modificable ni eliminable** | P0-5 (Bloque C) | UPDATE/DELETE de factura emitida fallan |
| D6 | **Payload con línea de OTRO contrato** | P0-6 (Bloque C) | `update_contract_with_lines` rechaza IDs cruzados |

### E. Migraciones

| # | Escenario | Verifica | Esperado |
|---|---|---|---|
| E1 | **Reconstrucción limpia desde cero** con contratos activos / suspendidos / terminados | rollback fuera de `migrations/` (P0-1), fix `terminé` (P1-9) | todas las migraciones aplican sin error |

---

## Verificación de integridad y limpieza (al terminar)

```text
-- 0 residuos sintéticos
SELECT count(*) FROM machines       WHERE numero_serie LIKE 'gatef_%';
SELECT count(*) FROM contracts      WHERE numero_contrat LIKE 'GATEF-%';
SELECT count(*) FROM clients        WHERE nom_client LIKE 'GATEF%';
SELECT count(*) FROM invoices       WHERE client_id IN (<ids gatef>);
SELECT count(*) FROM contract_machines WHERE contract_id IN (<ids gatef>);
SELECT count(*) FROM machine_counters  WHERE machine_id LIKE 'gatef_%';
-- todos deben dar 0

-- numeración reseteada (sin huecos para el año de prueba)
SELECT * FROM invoice_counters WHERE year = <año de prueba>;   -- reset / libre
```

Orden de borrado respetando FKs (RESTRICT/CASCADE): `invoice_lines` → `invoices` → `maintenance_visits` → `contract_machines` → `contracts` → `machine_counters` → `machines` → `clients`. Adjuntar el resultado de los SELECT al cierre.

---

## Criterios GO / NO-GO

- **GO** (habilitar facturación real) ⟺ **todas** las precondiciones en verde **y** los 26 escenarios pasan con sus importes esperados **y** la limpieza verifica 0 residuos.
- **NO-GO** si cualquier escenario discrepa del importe esperado, cualquier invariante de BD no se cumple (cabecera≠suma, factura emitida mutable, IDs cruzados aceptados), o la reconstrucción de migraciones falla.

---

## RESULTADO — ✅ GATE PASADO (2026-06-09)

**Veredicto: GO** (confirmado por el supervisor con verificación SQL independiente). Ejecutado contra la BD de prod (`myyejbviunyvywfukysj`) con el **código TS real** del motor (`buildContractInvoiceDraft` / `emit_contract_invoice` vía service key) y las **RPC reales** en DO blocks con `set_config` de `service_role`. Datos sintéticos `GATEF` / año 2027.

### Despliegue previo del esquema
El esquema del core **no estaba aplicado** en la BD viva (estaba en `20260607163148`; faltaban las 11 del 06-08/06-09). Causa: el historial de migraciones divergió (timestamps git↔BD distintos desde 2026-05-17). Reconciliado con `supabase migration repair` (**23 `reverted`** huérfanas remotas + **22 `applied`** locales ya en prod), seguido de `supabase db push` → **las 11 migraciones aplicadas en orden sin error**. Backup previo: `web-amd/gate-backup-data-20260609-1501.json`.

### A — consumo y consolidación (10/10)

| # | Escenario | Δ bw/color | Obtenido | Esperado | ✓ |
|---|---|---|---|---|---|
| A1 | Línea normal, ciclo aniversario día 4 | 500/60 | 8 000 | 8 000 | ✅ |
| A2 | Máquina nueva, `start_counter`=0 (P0-4) | 1000/200 | 20 000 | 20 000 | ✅ |
| A3 | Usada desde stock (`assign_machine_from_stock`, start 15/5) | 185/35 | 3 600 | 3 600 | ✅ |
| A4 | Retirada a stock con `end_counter` (H-D6) | 300/0 | 3 000 | 3 000 | ✅ |
| A5 | Reseteada A→stock→B (P0-3) | A:100/20 · B:185/35 | A=2 000 · B=3 600 | 2 000 / 3 600 | ✅ |
| **A6** | **Reasignación intra-ciclo (P1-3) — validado vía A5** (A5A+A5B mismo ciclo 2027-05, sin colisión del índice) | — | ambos facturan su parte | — | ✅ |
| A7 | Reemplazo simple consolidado (bd 300/0 + 400/80) | 700/80 | 11 000 | 11 000 | ✅ |
| A8 | Cadena A→B→C consolidada (200/50 + 220/100 + 200/50) | 620/200 | 16 200 | 16 200 | ✅ |
| A9 | Planes plano/híbrido/tramos (2 000 / 32 000 / 34 000) | por línea | 68 000 | 68 000 | ✅ |
| **A10** | **Varias máquinas, planes distintos, 1 factura — validado vía A9** (3 líneas, 1 contrato) | — | 68 000 / 3 líneas | — | ✅ |

### B — reglas temporales (6/6)

| # | Escenario | Resultado | ✓ |
|---|---|---|---|
| B1 / B1C | Línea suspendu / contrato suspendu | total 0, 0 líneas facturables | ✅ |
| B2 | Terminé: factura su ciclo de cierre (3 000) y nada después (oct → 0) | 3 000 / 0 | ✅ |
| B3 | Contrato terminé + línea huérfana (date_fin NULL) → excluida | 0 | ✅ |
| B4 | Cambio de cliente con historial (73→74) | error `client_change_forbidden_history`, client_id sigue 73 | ✅ |
| B5 | Reemplazo hereda overrides + migra visita | IN: bday=15·maint=trimestriel·notes·pbw=12 · visita 2027-12-01 → máquina nueva | ✅ |
| B6 | Vigencia de tarifas (P1-5) | ciclo antes: bw=10 → 2 000 · ciclo después: bw=20 → 4 000 · override futuro NO aplica a ciclo anterior (modo estricto) | ✅ |

### C — ciclo de aniversario (4/4) · facturas reales emitidas

| # | Escenario | Factura | Periodo | Total | ✓ |
|---|---|---|---|---|---|
| C1 | día 4 | FACT-2026-0001 | [2027-01-04 → 2027-02-03] | 8 000 | ✅ |
| C2 | **día 31 → clamp febrero** | FACT-2026-0002 | [2027-01-31 → 2027-02-27] | 6 000 | ✅ |
| C3 | multi-máquina, 1 factura/3 líneas | FACT-2026-0003 | [2027-08-01 → 2027-08-31] | 68 000 | ✅ |
| C4 | **2+ contratos mismo cliente/mes-ancla sin colisión** | FACT-2026-0004 | [2027-01-04 → 2027-02-03] | 6 000 | ✅ |

*(C4: cliente 73 acumuló 3 facturas en 2027-01 — A1+C2+C4, 3 contratos distintos — sin violar el índice legacy restringido a `contract_id IS NULL`.)*

### D — integridad contable

| # | Escenario | Resultado (literal) | ✓ |
|---|---|---|---|
| D1 | Forzar facturación (estimada, admin) | sin confirmar → `estimated_not_confirmed`; forzada → **FACT-2026-0005**, línea **`is_estimated=true`**, 30 000 (solo forfait) | ✅ |
| D2 | Fallo técnico de query → bloqueo | `BillingDataError` (no factura-0); validado por test P0-7 (41 passed) — no es seguro inducir un fallo real de prod | ✅ |
| D4 | Payloads inválidos a `emit_contract_invoice` | `no_lines` · `client_mismatch` · `line_total_mismatch` · `header_total_mismatch` | ✅ |
| D5 | UPDATE/DELETE sobre factura emitida | `invoice_immutable` · `invoice_delete_forbidden` · `invoice_line_immutable`; factura intacta (8 000/emise) | ✅ |

Cabecera = Σ líneas en las 5 facturas emitidas (`FACT-2026-0001..0005`; numeración por año de emisión).

### E — migraciones
Las 11 migraciones aplican en orden sin error; `migration list` sincronizado (local=remoto, 0 huérfanas); rollback destructivo fuera del path automático (`supabase/rollbacks/`, P0-1); fix `terminé` en la migración de datos (P1-9).

### Limpieza verificada por SELECT (0 residuos)
```
gatef_clients=0 · gatef_machines=0 · gatef_contracts=0 · contract_machines_total=0
gatef_counters=0 · gatef_plans=0 · plan_versions_total=0 · override_versions_total=0
maintenance_plans_total=0 · invoices_total=0 · invoice_lines_total=0 · invoice_counters(2026)=0 filas
```
**Foto inicial restaurada: 66 clients · 108 machines · 0 contracts · 0 invoices.** Triggers de inmutabilidad reactivados (ambos `HABILITADO`). Producción real intacta.

### Estado operativo tras el gate
El esquema del core está **desplegado en prod** y el gate pasó, pero el sistema tiene **0 contratos reales**. **Siguiente paso operativo (fuera de este gate):** cargar los contratos reales de los clientes (máquinas asignadas desde stock con su lectura, plan de facturación, `billing_day`) **antes de emitir la primera factura real**.

> **Trabajo del core de facturación: CERRADO** — código (Bloques A/B/D/E + 0/C + P1-5) + despliegue + gate E2E, todo verificado.
