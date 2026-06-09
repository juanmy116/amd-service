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
- [ ] **Bloque 0** arreglos aislados (soporte, PR #39) — incluye P0-7 vía UI, validaciones, rollback fuera de migraciones, fix `terminé`
- [ ] **Bloque C** blindaje contable BD (soporte) — P0-5 inmutabilidad, P1-1 validación `emit_invoice`, P0-6 pertenencia de líneas, P2-5/P2-6
- [ ] **P1-5** vigencia temporal de tarifas (PR aparte del motor, tras #39)
- [ ] **Limpieza legacy** facturación por cliente (`buildClientInvoiceDraft`/`emitInvoiceAction`/`FacturationPreview`) y, si se decide, convergencia `emit_invoice`/`emit_contract_invoice`

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

## RESULTADO (rellenar al ejecutar)

> Pendiente de ejecución. Requiere todas las precondiciones en `main`. Pegar aquí: tabla importes obtenidos vs esperados, números de factura emitidos/anulados, y los SELECT de limpieza (= 0 residuos, contador reseteado). Veredicto final GO/NO-GO con fecha y sesión.
