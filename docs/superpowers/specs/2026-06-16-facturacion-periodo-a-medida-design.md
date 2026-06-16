# Plan técnico — Facturación por «periodo a medida» (entre lecturas reales)

> Estado: **VALIDADO · listo para implementar** (2026-06-16). Decisiones abiertas D1-D4 resueltas (ver §11).
> Origen: carga del primer cliente real (2AS). Ver memoria `project_carga_2as`.
> Afecta al núcleo de facturación (desplegado y validado por gate E2E el 2026-06-09). Implementar en rama aparte, con tests, sin facturas reales aún (0 contratos, 0 facturas) → reemplazo limpio, sin migración de datos.

---

## 1. Problema

AMD factura cada mes **el consumo entre dos recogidas de contador consecutivas**, usando las **fechas reales** de esas recogidas. Caso real de 2AS: la factura «de mayo» = copias entre la lectura del **29-abr-2026** y la del **03-jun-2026**. Las recogidas oscilan alrededor del día de facturación del cliente (a veces unos días antes, a veces después).

El motor actual (`src/lib/invoicing.ts`) factura por **ciclos de calendario fijos** derivados de `billing_day`:
`buildContractInvoiceDraft(contractId, anchorYear, anchorMonth)` → `computeBillingCycle()` → periodo `[día billing, día billing−1 del mes siguiente]`, y asigna a ese ciclo «la última lectura dentro» y «la última anterior».

Con lecturas irregulares esto descuadra: si en mayo natural no cae ninguna lectura (caen el 29-abr y el 3-jun), el ciclo «mayo» sale **estimado** y el consumo aparece en «junio». El importe global se conserva, pero el **reparto y las fechas impresas son incorrectos**. El usuario **exige las fechas reales** en la factura.

Verificado en código: la facturación SOLO admite ciclos automáticos; **no existe periodo manual** (`facturation/page.tsx` y `contract-actions.ts` solo reciben `contract + year + month`).

---

## 2. Decisión

Cambiar el modelo de **«ciclo de calendario»** a **«periodo entre lecturas reales»** (Forma B):

> El periodo de una factura = **[fecha de la lectura de apertura, fecha de la lectura de cierre]**.
> Consumo de cada máquina = lectura de cierre − lectura de apertura (fechas reales por máquina).
> El **mes** de la factura se etiqueta automáticamente (ver §4).

El `billing_day` del contrato deja de definir el periodo y pasa a ser:
1. **Recordatorio** de cuándo toca recoger (operativo, fuera de este plan).
2. **Ancla para etiquetar el mes** y para **agrupar** las lecturas en «tandas» (ver §4).

---

## 3. Modelo conceptual

- **Vencimiento**: el `billing_day` aplicado a un mes concreto (ej. día 1 → 1-may, 1-jun, …). Cada vencimiento **cierra el mes anterior y abre el siguiente**.
- **Tanda**: el conjunto de lecturas (una por máquina del contrato) tomadas alrededor de un mismo vencimiento. En la práctica AMD recoge todos los contadores del cliente en una visita (mismo día o ±pocos días).
- **Factura del mes X** = entre la tanda del vencimiento de **inicio de X** (apertura) y la tanda del vencimiento de **fin de X = inicio de X+1** (cierre).
  - Ej. 2AS (día 1), factura mayo: apertura = tanda ~1-may (lectura real 29-abr), cierre = tanda ~1-jun (lectura real 3-jun).

---

## 4. Reglas precisas

### 4.1 Emparejamiento de lecturas (por máquina)
Para cada máquina (línea `contract_machines` abierta), ordenar sus relevés `actif` por fecha real (`year-month-day`, con `recorded_at` como desempate). Cada relevé (salvo el primero / `is_replacement_start` / `start_counter`) se empareja con el **inmediatamente anterior**: ese par es una factura candidata para esa máquina.
- `delta = cierre − apertura` (reutiliza `counterDelta`).
- Sin apertura (primer relevé = base) → no facturable.
- `delta` negativo o nulo → línea **estimada** (misma política actual).

### 4.2 Agrupación en tandas (cabecera por contrato)
La factura es **por contrato** (todas las máquinas). Se agrupan las lecturas de cierre de las máquinas que correspondan al **mismo vencimiento**:
- Una lectura de cierre pertenece al vencimiento (día de facturación) **más cercano a su fecha**.
- La factura del contrato para un vencimiento incluye, de cada máquina, su par (apertura, cierre) de ese vencimiento.

### 4.3 Etiqueta del mes (`period_year` / `period_month`) — **automática**
> **Mes facturado = el mes ANTERIOR al mes del vencimiento de la lectura de cierre.**
> (vencimiento de cierre = `billing_day` más cercano a la fecha de cierre)

- 2AS (día 1): cierre **3-jun** → vencimiento más cercano **1-jun** → mes anterior = **mayo** ✅
- 2AS (día 1): cierre **29-abr** → vencimiento más cercano **1-may** → mes anterior = **abril** ✅ *(reconcilia que una recogida unos días ANTES del día 1 cierre igualmente el mes correcto — la fecha física sola no basta)*
- Empresa día 20: cierre **20-may** → vencimiento **20-may** → mes anterior = **abril** ✅ (Opción 1 elegida por el usuario)

### 4.4 Periodo mostrado en la cabecera (`period_start` / `period_end`, DATE reales)
- `period_end` = fecha de la **lectura de cierre** (de la tanda).
- `period_start` = fecha de la **lectura de apertura** (de la tanda anterior).
- Ej. 2AS mayo: `period_start = 2026-04-29`, `period_end = 2026-06-03`.
- **D1 RESUELTO (recogidas en varios días):** la cabecera usa el **rango envolvente** (apertura más temprana de todas las máquinas → cierre más tardío). El consumo de **cada línea** se calcula con **sus fechas reales** por máquina. La agrupación en tandas por «vencimiento más cercano» (§4.2) tolera que las recogidas de una misma tanda estén separadas varios días (los vencimientos distan ~1 mes). Conviene mostrar también, por línea, sus fechas apertura/cierre.

---

## 5. Cambios por componente

### 5.1 Motor — `src/lib/invoicing.ts` (núcleo del cambio)
- **Nueva** `buildContractInvoiceDraftBetweenReadings(contractId, closingVencimiento)` (o refactor de `buildContractInvoiceDraft`):
  - Carga líneas + relevés (como hoy).
  - Por línea: empareja cierre/apertura según §4.1, calcula `delta` y tarifa **vigente a `period_start`** (`resolveEffectiveTariffAsOf` — se mantiene).
  - Construye `period_start/period_end` (§4.4) y `period_year/period_month` (§4.3).
  - Mantiene `consolidateReplacements` (cadenas A→B→C).
- `computeBillingCycle` y la parte de `computeLineConsumptionCycle` ligada al calendario: **se retiran o se adaptan** (su aritmética de delta se conserva vía `counterDelta`).
- **Nueva** `listBillableContracts()`: contratos con **al menos una lectura de cierre nueva** (posterior a la última factura emitida de ese contrato) → «listos para facturar», con el mes/periodo propuesto.

### 5.2 UI — `facturation/page.tsx` + `ContractInvoicePreview.tsx`
- **Quitar** los selectores de mes/año.
- Listar contratos «listos para facturar» con su **periodo y mes propuestos** (fechas reales).
- Al seleccionar uno: mostrar el draft (la tabla actual ya muestra `period_start–period_end` vía `formatCycle`; solo cambia el origen de esas fechas).
- Botón **Émettre** / **Forcer** (estimadas) sin cambios de fondo.

### 5.3 Acción — `contract-actions.ts` (`emitContractInvoiceAction`)
- Cambiar la entrada: en vez de `(contract_id, year, month)`, identificar la **tanda/lectura de cierre** a facturar (p. ej. `contract_id + period_end` o un id de vencimiento). Recalcula el draft server-side y emite.

### 5.4 RPC — `emit_contract_invoice` (BD)
- **Sin cambios estructurales:** ya acepta `period_start/period_end` arbitrarios, valida coherencia contable y `period_end ≥ period_start`, y deduplica por `(contract_id, period_start)` — que sigue siendo único por tanda. Solo cambia el **contenido** del payload (lo calcula el motor nuevo).
- Revisar que el anti-duplicado por `period_start` siga siendo correcto (lo es: cada tanda tiene una apertura distinta).

### 5.5 Tipos — `ContractDraft` / `DraftLine`
- Mantener forma; `period_start/period_end` pasan a ser fechas de lectura reales. Posible añadir, por línea, las fechas de apertura/cierre propias (para D1).

---

## 6. Casos especiales
- **Base (primera lectura):** sin apertura → no factura. Igual que hoy con `start_counter` ausente.
- **Máquina nueva en el contrato:** su `start_counter` actúa de apertura de su primera factura.
- **Mes saltado (no se recogió):** la siguiente lectura empareja con la última real → cuenta el consumo acumulado; el mes etiquetado es el del cierre. **Avisar** en la UI (periodo > ~1 mes).
- **Relevé anulado** (`status<>'actif'`): se ignora (ya).
- **Reemplazo de máquina (A→B):** preservar `consolidateReplacements` (un solo forfait, tramos sobre consumo consolidado).
- **Lecturas desordenadas / delta negativo:** línea estimada (política actual).

## 7. Qué NO cambia
- Cálculo de importes y planes de tarifa (`billing.ts`, `calculateMonthlyAmount`, tramos, `AMD Dégressif`).
- Inmutabilidad de facturas emitidas y numeración `FACT-YYYY-NNNN`.
- Snapshot de líneas (`invoice_lines`), RLS admin-only, vigencia temporal de tarifas.
- Esquema de `invoices` (ya tiene `period_start/end` DATE + `period_year/month`).

## 8. Migración de datos
**Ninguna.** 0 contratos y 0 facturas reales hoy → se reemplaza el modelo limpio. (El modelo de ciclo solo vivía en código + tests.)

## 9. Tests (vitest + integración)
- Emparejamiento de lecturas consecutivas (por máquina).
- Regla del mes (§4.3): casos día 1 (29-abr→abril, 3-jun→mayo) y día 20 (20-may→abril).
- Periodo de cabecera con varias máquinas (§4.4 / D1).
- Base, máquina nueva, mes saltado, reemplazo, delta negativo/estimado.
- Coherencia contable de `emit_contract_invoice` (se mantiene).
- Anti-duplicado por `(contract_id, period_start)`.
- Gate E2E sobre datos sintéticos (como el gate de 2026-06-09).

## 10. Fases de entrega (PRs)
1. **Motor + tests** (`invoicing.ts`: emparejamiento, regla del mes, periodo; `listBillableContracts`). Sin tocar UI.
2. **UI + acción** (selector «listos para facturar», emisión por tanda).
3. **Gate E2E** + ajustes finales + docs (`architecture.md`).

## 11. Decisiones abiertas — TODAS RESUELTAS (2026-06-16)
- **D1 (multi-máquina):** ✅ Las recogidas **pueden abarcar varios días**. → cabecera = rango envolvente; consumo por línea con fechas reales propias (ver §4.4).
- **D2 (etiqueta del mes):** ✅ Confirmada la regla §4.3 (mes anterior al vencimiento más cercano al cierre), incluido 29-abr→abril.
- **D3 (operativa):** ✅ Emisión **manual por el admin** al ver «listo para facturar» (como hoy).
- **D4 (mes saltado):** ✅ Se factura el periodo **doble** en la siguiente recogida, con aviso de periodo largo.

## 12. Riesgos y mitigación
- **Tocar el corazón de facturación (probado).** → rama aparte, tests portados + nuevos, gate E2E, revisión `/code-review`, sin facturas reales aún.
- **Regla del mes/tandas mal entendida** → validar §11 antes de programar (este documento).
- **Compatibilidad con reemplazos/estimadas** → tests específicos heredados.
