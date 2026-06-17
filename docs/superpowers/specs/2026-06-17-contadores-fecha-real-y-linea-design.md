# Plan técnico v3 — Contadores anclados a FECHA REAL y a LÍNEA + facturación mensual en cadena

> Estado: **v3.1 · APROBADA como arquitectura por Codex (3ª auditoría) · lista para implementar** (2026-06-17)
> Codex v3: "aprobable como arquitectura; ya no hay bloqueo estructural" + 4 aclaraciones (ver §12, incorporadas).
> Objetivo: arreglar **de raíz y para siempre** la familia de fallos de la auditoría (P0-1, P0-2, P0-3 + P1)
> cuya causa común es modelar la lectura por «máquina + mes de calendario» en vez de «fecha real + línea».
> Ventana de oro: hoy **0 contadores, 0 facturas, 0 contratos** (verificado) → cambio de modelo SIN
> migración de datos y SIN riesgo. Sustituye al modelo de «ciclo de calendario» y de «periodo a medida v1»;
> integra y reemplaza el spec 2026-06-16-facturacion-periodo-a-medida-design.md (Forma B) y las versiones
> v1/v2 de este documento. Este documento es la ÚNICA fuente de verdad del diseño (coherencia exigida por Codex).

---

## 1. Diagnóstico raíz (verificado contra el código por Codex)

El motor de facturación factura por periodo entre lecturas, pero el almacenamiento de contadores sigue el
modelo viejo y eso provoca toda la familia de fallos:

| Hallazgo | Causa raíz | Evidencia |
|---|---|---|
| **P0-1** dos lecturas el mismo mes natural se rechazan | unicidad por mes, no por fecha | `20260603210000_fase1_indices.sql:9` (`UNIQUE (machine_id,year,month) WHERE actif`) |
| **P0-3** atribución cruzada entre líneas de la misma máquina | atribución por `contract_id`, no por línea | `src/lib/invoicing.ts:66-68` (`countersForLine`) |
| **P0-2** retirada de línea facturable sin contador final | `end_counter_*` opcional en retire | `20260610101000_*.sql:170-174` |
| P1 orden ignora `day` | `day` nullable, no es clave | `src/lib/counters.ts:46` |
| P1 RPCs de cierre comparan «último contador global» | sin línea/fecha/day | `20260608120000:98`, `20260611160000:74`, `20260608140000:65` |
| P1 Princity etiqueta por `now()` | usa fecha de ejecución | `princity-counters/index.ts:11-15,81-91` |
| P1 vistas de piezas usan `recorded_at` (no fecha real) | lectura tardía → contador mal elegido | `20260616121054_*.sql:11-13`, `20260616112305_*.sql:11-15` |
| P1 dashboards filtran por mes calendario | indicadores confusos | `src/app/admin/page.tsx:57-61`, `AgendaPanel.tsx:72-76` |
| P1 billing_day permite 29-31 sin semántica | etiquetado ambiguo a fin de mes | UI/actions/RPC/CHECK 1-31 |

**Caso real del usuario (P0-1):** billing_day=1; lectura 02-may (cierra abril) + 31-may (cierra mayo) = ambas
mes natural mayo → el índice rechaza la segunda → no se puede facturar mayo, o (si se anula) se duplica abril.

## 2. Solución: dos anclas + cadena mensual

**Ancla 1 — fecha real:** `day` obligatorio + columna `reading_date` (= make_date(year,month,day)); unicidad por
`(machine_id, reading_date) WHERE status='actif'` (una lectura activa por máquina y día).

**Ancla 2 — línea:** `machine_counters.contract_machine_id` = la línea/puesto **vigente en la FECHA de la lectura**.

**Cadena mensual:** se factura un mes cada vez, en secuencia; el mes lo decide la secuencia (no la fecha del
contador); las copias se acumulan desde la última lectura realmente facturada.

## 3. Reglas de negocio (decididas con el usuario; fuente de verdad)

- **N1.** Factura de un mes = consumo entre dos lecturas consecutivas, con fechas reales; cada lectura cierra un
  mes y abre el siguiente (fronteras contiguas: sin solapar ni perder copias).
- **N2.** Puede haber dos lecturas reales en el mismo mes natural (días distintos). Una sola por máquina y **día**
  (otra del mismo día = corrección → anula la anterior).
- **N3.** Una sola factura por contrato y **mes facturado** (`period_year, period_month`).
- **N4.** Nunca cobrar de más ni de menos, lleguen las lecturas cuando lleguen.
- **N5.** Facturas inmutables; facturas y planes admin-only (RLS). Anulación = acción consciente de admin (no flujo normal).
- **N6.** Consumo atribuido a la **línea/puesto** correcto, aunque la máquina rote por varias líneas/contratos.
- **N7 — nombre del mes (regla dual, solo para ANCLAR el primer mes):**
  - billing_day **1-28** (día fijo): mes facturado = **mes anterior** al vencimiento más cercano al cierre.
  - billing_day **29/30/31** (fin de mes): mes facturado = **el mismo mes** del vencimiento (día exacto clampeado
    al último día real del mes). Ej.: día 1 recoge ~1-jun → mayo; día 20 recoge 20-may → abril; fin de mes recoge
    31-may → mayo. (Verificado con los 3 casos del usuario.)
- **N8 — cadena mensual:** se factura mes a mes en secuencia. Mes CON contador → fijo + copias. Mes SIN contador →
  **solo fijo** (o 0 si plan solo-copias; decisión del admin). Las copias de un mes sin contador NO se pierden:
  se cobran en la siguiente factura con contador.
- **N9 — robustez a desfase:** el mes de una factura = el **siguiente al último facturado**, NO la fecha del
  contador. Facturado abril, contador que llega el 2-jun o el 20-jun → se factura **mayo**.
- **N10 — mes estimado no se corrige:** si un mes se facturó solo-fijo y luego llega su contador, las copias van a
  la siguiente factura real; la factura emitida NO se toca.

## 4. ALGORITMO de la cadena mensual (núcleo — corrige los bloqueantes de Codex)

**Estado persistido por LÍNEA** (en `invoice_lines`, para que la cadena sea explícita y auditable):
`contract_machine_id`, `opening_counter_id`, `closing_counter_id`, `opening_reading_date`, `closing_reading_date`,
`opening_counter_bw/color`, `closing_counter_bw/color`. El «punto de partida» del siguiente periodo de una línea =
el `closing_counter_*`/`closing_counter_id` de su **última factura con copias (real)**. Antes de la 1ª factura =
`start_counter` de la línea (o la 1ª lectura base).

**Para emitir el siguiente mes de un contrato:**
1. `last_month` = mayor `(period_year, period_month)` de sus facturas `emise`. **Mes a facturar = `last_month + 1`.**
   Si no hay facturas (primer mes): anclar `M0` por la fecha de la 1ª lectura **con consumo** (apertura+cierre) vía
   la regla dual N7. (Solo lectura base, sin consumo → aún no se factura, salvo solo-fijo explícito; ver 4.4.)
2. **Precedencia:** la fecha de la lectura **solo ancla el primer mes**. Después manda la **secuencia** (`+1`). La
   fecha del contador NO decide el mes; solo define el periodo mostrado y el orden de consumo.
3. **Cierre del mes = la lectura real NO facturada MÁS ANTIGUA posterior al `closing_counter` consumido** (NO la más
   reciente — corrección del bloqueante de Codex v2). Así, si llegan mayo (02-jun) y junio (30-jun) juntos, mayo usa
   la del 02-jun y junio la del 30-jun, en orden.
   - Si existe esa lectura → factura con copias = `cierre − punto_de_partida`; avanzan `last_month` y el punto de partida.
   - Si no existe y el mes ya pasó (≤ mes actual) → factura **solo-fijo** (estimada); el punto de partida NO avanza.
4. **Sin meses infinitos:** se ofrece solo `last_month + 1`, y solo si ≤ mes actual o tiene lectura.
5. **Dos contadores de golpe:** se facturan en orden de fecha (más antigua primero), cada uno a su mes secuencial.
6. **Mes estimado + contador tardío (N10):** el contador tardío queda disponible; la próxima factura real arranca
   del punto de partida (último real facturado) → las copias del mes estimado se acumulan ahí, sin perderse ni
   duplicarse. Efecto colateral documentado: en ese caso el nombre del mes puede ir un mes por detrás del consumo.

### 4.4 Mes solo-fijo (sin contador)
- `buildContractInvoiceDraft` debe emitir un mes sin lectura de cierre: solo forfait (0 copias), `is_estimated=true`;
  total 0 si plan solo-copias (emisible). El punto de partida NO avanza.
- `period_start/period_end` de una factura solo-fijo = rango del mes facturado (no hay lecturas reales). Documentado.
- Solo meses ≤ mes actual; nunca futuros.

## 5. Persistencia e identidad de lecturas (corrige Codex v2 §2/§3)

- `invoice_lines` gana: `contract_machine_id`, `opening_counter_id`, `closing_counter_id`, `opening_reading_date`,
  `closing_reading_date`, `opening_counter_bw/color`, `closing_counter_bw/color`.
- Una lectura `closing_counter_id` **no puede reutilizarse** como cierre de otra factura del mismo puesto
  (validado en la RPC, §7).
- **Reemplazo A→B (consolidado):** la factura del mes del reemplazo une los tramos A y B en una línea comercial
  (un forfait, copias sumadas), pero el **breakdown** persiste por tramo con identidad: `{contract_machine_id,
  opening_counter_id, closing_counter_id, opening/closing_counter_bw/color, delta}` para A y para B. Así la
  trazabilidad contable es completa (no solo etiqueta+delta).

## 6. Cambios por componente

### Modelo (FASE 1)
- `machine_counters`: `day` NOT NULL (backfill defensivo `COALESCE(day,1)`); `reading_date` (generada/persistida);
  `contract_machine_id uuid REFERENCES contract_machines(id) ON DELETE RESTRICT`; DROP índice viejo; nuevo
  `UNIQUE (machine_id, reading_date) WHERE status='actif'`; índice de apoyo `(contract_machine_id)`.
- `invoice_lines`: columnas de identidad de lecturas/contadores (§5) + `closing_counter_*`.

### Escrituras (FASE 2)
- Manual / OCR (`import_counter_from_pending`) / Princity: rellenar `day`, `reading_date`, y `contract_machine_id`
  resuelto por **la fecha de la lectura** con nuevo helper `getLineForMachineAtDate(machine, reading_date)`
  (`date_debut ≤ date ≤ COALESCE(date_fin,∞)`); NO usar `getOpenLineForMachine` (es «línea de hoy»).
- Princity: derivar `year/month/day` de `BillingCounter.date` (no de `now()`); idempotencia por fecha real.
- Same-day: una lectura por máquina y día; otra del mismo día = corrección (anula la anterior), no segunda lectura.

### Facturación (FASE 3) — implementa el algoritmo §4
- `computeInvoiceMonth`: regla dual N7 (rama fin de mes ≥29), usada **solo para anclar el primer mes**.
- Motor de cadena: mes = `last_month+1`; cierre = lectura no facturada más antigua; punto de partida = último
  contador real facturado (de `invoice_lines`). `listReadyToBill` ofrece `last_month+1` (con o sin contador), nunca
  meses futuros ni infinitos.
- `countersForLine`/draft: atribuir por `contract_machine_id` (fallback por fecha para heredados NULL).
- Orden canónico `(reading_date, recorded_at, id)` en `counters.ts` y donde se elija «último/anterior».
- Páginas de contadores: orden y deltas por fecha real / N lecturas.

### Cierres (FASE 4)
- `return_machine_to_stock`/`terminate_contract`/`replace_contract_machine`: «último contador» de la MISMA línea
  (`contract_machine_id`) con `reading_date ≤ date_fin`, orden `(reading_date, recorded_at)`; si la línea no tiene
  lectura real pero sí `start_counter` → usar `start_counter`. Retirada de línea facturable exige `end_counter` (P0-2).

### Emisión endurecida (FASE 4) — corrige Codex v2 §5
`emit_contract_invoice` valida (no confía en el payload): cada `contract_machine_id` pertenece al contrato; cada
`opening/closing_counter_id` pertenece a esa línea/máquina; el `closing_counter_id` no está ya facturado (no
reutilización); el mes facturado = `last_month+1` del contrato (secuencia correcta); coherencia contable (ya existe)
+ dedup por `(contract_id, period_year, period_month)` (ya existe).

### Guards (FASE 4) — corrige Codex v2 §6
`can_delete_contract` y los guards de cambio de cliente miran también `contract_machine_id` (no solo
`machine_counters.contract_id`), ya que la atribución real pasa a la línea.

### billing_day (FASE 5)
Se mantiene 1-31 (hay clientes fin de mes). La semántica la da N7 (no se restringe a 1-28). Sin cambio de CHECK.

### Vistas y dashboards (FASE 3/6) — corrige Codex v2 §4(§8)/§1
- Vistas de piezas/anomalías (`v_machine_part_consumption`, `v_part_yield_baseline`) y todo «último contador» usan
  `reading_date`, NO `recorded_at` (que queda solo como auditoría de registro).
- Dashboards `admin/page.tsx` y `AgendaPanel.tsx`: contar por `reading_date` o por «línea con lectura este mes».

## 7. Qué NO cambia
- Inmutabilidad de facturas, RLS admin-only, planes de tarifa, redondeo FCFA.
- El concepto de «estimada/forzar» (se reutiliza para el mes solo-fijo).
- El dedup por `(contract_id, period_year, period_month)` (sigue válido).

## 8. Orden de PRs
1. PR-A: FASE 1 (modelo: `reading_date`, `contract_machine_id`, índices, columnas de identidad en `invoice_lines`).
2. PR-B: FASE 2 (escrituras: `getLineForMachineAtDate`, same-day, Princity por fecha) + tests.
3. PR-C: FASE 3 (algoritmo de cadena §4 + atribución por línea + orden + vistas/dashboards por `reading_date`) + tests motor.
4. PR-D: FASE 4 (cierres por línea, emisión endurecida, guards) + FASE 5 + tests.
5. PR-E: gate E2E completo (§9) + consolidar docs (`architecture.md`).
NO facturar a 2AS hasta cerrar PR-A..E con CI verde.

## 9. Casos de prueba del gate
1. 02-may + 31-may (billing_day=1) conviven; abril y mayo correctos; sin doble cobro. (P0-1)
2. Corrección same-day: 2ª lectura del mismo día → anula la anterior (no segunda lectura). (N2)
3. Máquina A en línea L1 (cerrada) y L2 (abierta) del mismo contrato → L1 no ve lecturas de L2. (P0-3)
4. Retirar línea con plan sin end_counter → error; con `return_machine_to_stock` → ok + factura último tramo. (P0-2)
5. **Cadena/dos de golpe:** abril facturado; llegan mayo (02-jun) y junio (30-jun) juntos → mayo usa 02-jun, junio
   usa 30-jun (la más antigua primero), en orden. (§4.3/4.5)
6. **Desfase (N9):** facturado abril; contador llega el 20-jun → se factura **mayo** (secuencia), no junio.
7. **Mes solo-fijo + contador posterior (N8/N10):** mayo sin contador = solo fijo; junio con contador = fijo +
   copias desde abril (mayo+junio); 2 fijos, copias una vez, sin tocar la factura de mayo.
8. **Fin de mes (N7):** día 31, recogidas 30-abr/31-may → factura «mayo»; 28-feb → «febrero»; 30-jun → «junio»;
   feb no bisiesto, feb bisiesto, cruce de año. Día 20 → «abril»; día 1 → «mayo».
9. **Lectura tardía tras rotación:** lectura con fecha pasada → `contract_machine_id` = la línea vigente en esa
   fecha (no la de hoy). (Ancla 2 / §6 FASE 2)
10. **No reutilización:** intentar emitir una factura cuyo `closing_counter_id` ya fue cierre de otra → rechazado. (§7)
11. **Reemplazo A→B con lecturas en el mismo mes:** un forfait, copias sumadas, breakdown por tramo con IDs. (§5)
12. **Vistas de piezas con lectura importada tarde:** eligen el contador por `reading_date`, no por `recorded_at`. (§6)
13. Orden: tres lecturas el mismo mes (días 2,15,28) → deltas correctos entre consecutivas.
14. Anulación/reemisión de un mes (estimado o real) → permitida solo tras anular; dedup por mes intacto.

## 10. Riesgos y decisiones cerradas
- **Decididas:** una lectura/día (corrección la 2ª); mes estimado no se corrige (copias al siguiente); fin de mes
  con regla dual; precedencia secuencia > fecha (fecha solo ancla); línea por fecha real.
- **Riesgo:** tocar el corazón de facturación (dinero) → cada PR con tests + gate E2E + re-verificación adversarial.
- **Efecto colateral documentado:** mes estimado cuyo contador llega justo antes del siguiente puede etiquetar el
  nombre un mes por detrás del consumo (no se pierde dinero). Caso borde.

## 11. Historial de verificación
- v1 → Codex: diagnóstico OK, faltaba algoritmo, línea por fecha, same-day, recorded_at, estimado/inmutabilidad.
- v2 → Codex: corrige lo anterior pero (bloqueantes) «lectura más reciente» errónea → debe ser «más antigua no
  facturada»; faltaba identidad persistida de lecturas; reemplazos por tramo; coherencia del documento; emisión
  endurecida; guards por línea.
- **v3:** cierra los 6 puntos de Codex v2 y consolida el documento (única fuente de verdad).
- **v3 → Codex (3ª):** APROBADO como arquitectura ("ya no hay bloqueo estructural") + 4 aclaraciones (§12).
- **v3.1 (este documento):** incorpora las 4 aclaraciones. **Lista para implementar.**

---

## 12. Aclaraciones v3.1 (cierre de la 3ª auditoría de Codex)

Codex aprobó la v3 como arquitectura y pidió 4 precisiones para que la implementación no sea ambigua en
lógica de dinero. Quedan incorporadas como parte vinculante del plan:

- **A1 — El algoritmo §4 se aplica POR LÍNEA, no «el mes» en singular.** Una factura de contrato agrupa
  TODAS sus líneas facturables activas en ese mes; cada línea se resuelve de forma independiente: unas
  tendrán contador (fijo+copias), otras solo-fijo (sin lectura ese mes), otras pueden haber entrado o
  salido a mitad. El «mes facturado» (secuencia) es del CONTRATO; el emparejamiento apertura/cierre y el
  punto de partida son POR LÍNEA. La cabecera consolida; cada línea lleva su propio estado (§5).
- **A2 — No reutilización de `closing_counter_id` aplica solo contra facturas `emise`, no `annulee`.** La
  validación de la RPC (§6) comprueba que el `closing_counter_id` no esté usado por otra factura **`emise`**
  del puesto. Así, tras anular una factura (`emise→annulee`), su lectura queda libre y la reemisión del
  mismo mes es posible (coherente con el dedup parcial `WHERE status='emise'`).
- **A3 — Corrección same-day de una lectura YA facturada exige anular/reemitir.** Una 2ª lectura del mismo
  día reemplaza a la anterior (N2) SOLO si la anterior no ha cerrado una factura `emise`. Si ya cerró una
  factura emitida, la corrección requiere primero **anular** esa factura (acción consciente de admin) y
  reemitir; el sistema debe bloquear la sustitución silenciosa de una lectura ya facturada.
- **A4 — «Mes actual» se evalúa en zona horaria de NEGOCIO: `Africa/Dakar`.** La decisión «mes ≤ mes
  actual» (para ofrecer un mes solo-fijo, §4.4) se calcula en hora de Dakar (UTC+0, sin horario de verano),
  NO en UTC del servidor ni hora local del navegador, para no equivocar el mes en los cambios de mes.
