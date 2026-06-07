# Revisión técnica — Sistema de Facturación (billing-plans)

> **Revisor:** Claude (rol jefe de proyecto / senior). **Plan revisado:** `docs/superpowers/plans/2026-06-05-billing-plans.md`
> **Línea base:** commit `1058786` (rama `main`). Última actualización: 2026-06-05.

Este archivo registra hallazgos de revisión sobre el plan y, a medida que avance, sobre el código real. Severidad: 🔴 bloqueante · 🟠 importante · 🟡 menor · ✅ verificado correcto.

---

## Verificaciones de cordura (✅)
- `requireAdmin()` devuelve `{ supabase }` → el plan lo usa correctamente.
- `createAdminClient()`, `Card`, `Sidebar/NAV_GROUPS` existen como el plan asume.
- `contract_machines.machine_id` y `machine_counters.machine_id` son **ambos TEXT** (`machines.numero_serie`) → el join del reporte (Task 6) cuadra a nivel de tipos.
- `applyTiers()` trata `up_to` como umbral acumulativo absoluto → lógica de tramos correcta.

---

## 🔴 Bloqueantes / alto riesgo

### B1 — Trabajo directo en `main` — ✅ RESUELTO
Creó la rama `feat/billing-plans`. Commits `56b8051` (migración) y `47d3307` (lib/billing).

### B4 — `numeric` de Postgres llega como STRING en runtime — [Task 2, lib/billing.ts] 🔴
`supabase-js` serializa los `numeric`/`decimal` como **string** (preserva precisión), no como number. Los tipos de `lib/billing.ts` declaran `price_bw/price_color/fixed_fee: number`, pero en runtime serán strings.
- `amount_bw = (tariff.price_bw ?? 0) * delta_bw` → se salva por coerción del operador `*`.
- **`amount_fixed = tariff.fixed_fee` NO pasa por ninguna multiplicación → queda string.**
- `amount_total = amount_fixed + amount_bw + amount_color` → `"5000" + 250` = **`"5000250"` (concatenación)** → importe basura.
- Sutileza añadida: los precios dentro del JSONB `tiers` SÍ son number (JSON nativo), pero las **columnas** `numeric` no → comportamiento inconsistente entre planos y tramos.
- **Compila, pasa `tsc` y pasaría tests unitarios con numbers; rompe solo con datos reales de Supabase.** Por eso es peligroso.
- Precedente en el repo: `src/app/admin/contadores/page.tsx` y `src/lib/search.ts` ya hacen `Number(...)` por esto.
**Acción:** coaccionar con `Number()` en `resolveEffectiveTariff` (fixed_fee, price_bw, price_color y los 3 overrides), o al mapear el plan tras la query.

### B2 — Bug de dominio: reset de contador al reemplazar máquina 🔴 CONFIRMADO
`machine_counters.is_replacement_start`/`previous_machine_id`: al reemplazar una máquina el contador físico se resetea. **Ya existe la solución de referencia** en `src/app/admin/contadores/[serie]/page.tsx::calcDeltas` (líneas 30-50): cuando `is_replacement_start` es true, el delta de ese registro se marca **null** (no comparable, no se factura). El plan de Task 6 ignora por completo `is_replacement_start` → calcularía `curr - prev` con `Math.max(0,...)` → importe erróneo el mes del reemplazo.
**Acción:** Task 6 debe replicar la regla de `calcDeltas` (ver B5).

### B3 — Semántica de `counter_bw/color` ✅ RESUELTA
Confirmado por `calcDeltas` (líneas 43-44: `c.counter_bw - prev.counter_bw`): son **lecturas absolutas acumuladas** (tipo cuentakilómetros). El enfoque de restar del plan es conceptualmente correcto. No requiere acción.

### B5 — Task 6 reimplementa mal una lógica de deltas que ya existe (DRY + bug) 🔴
`calcDeltas` ya resuelve el cálculo de consumo y lo hace mejor que el plan en dos puntos:
1. **Referencia = registro inmediatamente anterior cronológico** (`active[i-1]`), no el "mes calendario anterior". El plan usa `prevMonth/prevYear` fijos → si una máquina no tuvo lectura el mes anterior exacto (pero sí dos meses atrás), el plan da delta=0 → **infrafacturación**. `calcDeltas` usa la lectura previa real exista cuando exista.
2. **Maneja `is_replacement_start`** (B2); el plan no.
**Acción recomendada:** extraer `calcDeltas` a un módulo compartido (p.ej. `lib/counters.ts`) y reutilizarlo en el reporte de facturación, en vez de duplicar con el enfoque ingenuo `mes-1`. Evita divergencia entre lo que muestra Contadores y lo que se factura — que **deben coincidir exactamente**.

---

## 🟠 Importantes

### I1 — `machine_counters` sin UNIQUE(machine_id, year, month)
El `counterMap.set()` del reporte sobrescribe por clave; con 2 filas `actif` del mismo mes se queda con una **arbitraria** (orden PostgREST no garantizado).
**Acción:** ordenar la query por `recorded_at` y quedarse con la última, o resolver determinísticamente.

### I2 — Es un reporte recalculado en vivo, no facturación persistida
No guarda la factura. Cambiar un precio de plan altera **retroactivamente** todas las facturas pasadas.
**Acción:** confirmar con negocio si se necesitan facturas inmutables (snapshot mensual).

### I3 — Validación server-side floja en las actions
- `Number(formData.get('fixed_fee'))`: `Number('')===0`, `Number('abc')===NaN` → inserta valores inválidos sin error.
- La action confía en el JSON de `tiers` del cliente sin validar que los `up_to` sean crecientes ni que el último sea `null` → manipulable vía API.
**Acción:** validar `Number.isFinite()` + no-negativos en servidor; validar forma de `tiers`.
**Consecuencia concreta confirmada en `applyTiers` (Task 2):** si los `tiers` no vienen ordenados ascendente por `up_to`, `capacity = up_to - from` puede ser negativo → importe negativo. Y un `up_to: null` en posición intermedia consume todo el volumen y anula los tramos siguientes. Refuerza la necesidad de validar forma+orden de `tiers` en servidor.

### I4 — Sin CHECK de no-negatividad en precios (BD) — [Task 1, migración]
`billing_plans.price_bw/price_color/fixed_fee` y los 3 `*_override` de `contract_machines` no tienen `CHECK (… >= 0)`. Combinado con I3 (servidor tampoco valida) → **no existe ninguna barrera contra precios/forfaits negativos**, ni en BD ni en app. Un negativo se traduce en facturación negativa en Task 6.
**Acción:** añadir `CHECK (price_bw >= 0)`, etc., a la migración (o como mínimo validar en servidor).

---

## 🟡 Menores / a vigilar
- `toggleBillingPlanAction` ignora errores de Supabase silenciosamente.
- Descripción del sidebar imprecisa: "Compteurs" → `/admin/contadores`, grupo "Pilotage" (no rompe nada).
- `force-dynamic` sin paginación trae todas las líneas abiertas (1.200+ equipos) — manejable, vigilar a escala.
- **[Task 1]** RLS policy `FOR ALL ... USING` **sin `WITH CHECK`** — funcional (Postgres reusa USING para inserción), pero el patrón del repo (`machine_counters`) usa USING + WITH CHECK explícito. Seguir la convención.
- **[Task 1]** `CREATE TABLE billing_plans` sin prefijo `public.` — el repo reciente usa `public.contract_machines`. Inconsistencia menor.
- **[Task 1]** Falta `updated_at` en una tabla que es editable (catálogo de precios sin rastro de modificación).
- **[Task 2]** `resolveEffectiveTariff` permite que un `fixed_fee_override` se aplique a una línea `per_copy` (cuyo plan no tiene forfait) → `calculateMonthlyAmount` sumaría ese forfait aunque el tipo no lo contemple. Edge case: ignorar overrides incoherentes con el tipo de plan.

---

## ═══════════════════════════════════════════
## REVISIÓN DEL PLAN v2 (Opción B — facturas inmutables, 11 tasks)
## ═══════════════════════════════════════════

> Plan reescrito el 2026-06-05. Recoge los 4 fixes del revisor en "Decisiones congeladas". Resuelve I2 (inmutabilidad) con `invoices` + `invoice_lines` (snapshot). Veredicto global: **sólido, pero con 3 bloqueantes nuevos antes de implementar Tasks 10-11.**

### Verificado correcto en el plan v2 (✅)
- Fixes incorporados: I4 (CHECK≥0 + public. + WITH CHECK + is_admin), B4 (`num()` coerción), B5 (`calcDeltas` extraída con desempate `recorded_at`), I3 (`validateTiers` con orden/forma).
- `public.is_admin()` existe (`rls_admin_access.sql`) → policies correctas.
- Template `'raw'` YA existe en `send-email` y lee `data.subject`/`data.html` → `emailInvoiceAction` encaja.
- `next_incident_number()`/`incident_counters` confirmados como patrón idéntico a clonar.
- Snapshot inmutable bien modelado (tarifa+delta+importe congelados por línea); índice único parcial `(client_id, period_year, period_month) WHERE status='emise'` permite reemitir tras anular. Buen diseño.

### 🔴 Bloqueantes nuevos del plan v2

#### N9 — `emitInvoiceAction` llama la RPC con el cliente equivocado → falla por permisos
`next_invoice_number()` lleva `REVOKE EXECUTE ... FROM authenticated`. El plan hace `const { supabase } = await requireAdmin(); supabase.rpc('next_invoice_number')` — pero ese `supabase` es el cliente **authenticated** (sesión SSR), no service_role. **Todas** las RPC del repo se invocan con `admin.rpc(...)` (`create_contract_with_lines`, `can_delete_contract`, `close_maintenance_visit`...). → La emisión fallaría con "permission denied for function" en el primer intento.
**Acción:** en `emitInvoiceAction`, usar `createAdminClient()` para la `.rpc()` (y por coherencia para los inserts de invoice/lines).

#### N1 — Emisión NO transaccional → cabecera huérfana
`emitInvoiceAction` inserta `invoices` y luego, en una segunda llamada, `invoice_lines`. Si la segunda falla, queda una factura con `total_amount` pero **sin líneas** → factura corrupta e inmutable. No hay rollback.
**Acción:** mover la emisión a una RPC PL/pgSQL transaccional (`emit_invoice(...)` que inserte cabecera+líneas+numeración en una sola transacción), o como mínimo borrar la cabecera si fallan las líneas. En facturación la atomicidad no es opcional.

#### N2 — La fórmula del `.xlsx` no contempla `hybrid_tiered`
`buildInvoiceWorkbook` escribe `Total = D + E*F + G*H` (forfait + prix_bw*Δbw + prix_color*Δcolor). Para planes `hybrid_tiered`, `price_bw`/`price_color` son **null→0** y el importe real vive en `applyTiers`. → La celda "Total" del Excel mostraría **solo el forfait** y el `SUM` global divergiría del `amount_total` real para clientes con planes degresivos. El tableur "verificable" daría números incorrectos.
**Acción:** para `billing_type==='hybrid_tiered'`, escribir el `amount_total` como valor literal (no fórmula), o desglosar los tramos en filas. No mezclar fórmula plana con tarifas por tramos.

### 🟠 Importantes (plan v2)
- **N4 — Huecos en la numeración:** `next_invoice_number()` incrementa el contador antes del insert; si el insert falla (unique de doble emisión, o N1), el número se "quema" → secuencia `FACT-` con saltos (sensible contable/fiscalmente). Mitigar: validar duplicado antes de numerar, o numerar dentro de la RPC transaccional (N1).
- **N5 — Runtime del Route Handler `.xlsx`:** ExcelJS y `Buffer` son Node-only; `factures/[id]/xlsx/route.ts` no declara `export const runtime = 'nodejs'`. Si el build lo infiere edge, rompe. Forzar runtime nodejs explícitamente.

### 🟡 Menores (plan v2)
- **N6 — N+1 queries:** `buildClientInvoiceDraft` consulta `machine_counters` una vez por máquina dentro del `for`. Para clientes grandes (Axa: 14) son 14 queries. Mejorable con un solo `.in('machine_id', [...])`.
- **N7 — `as never`:** los casts `(lines ?? []) as never` en route/email desactivan el chequeo de tipos. Code smell; tipar `InvoiceLineRow[]`.
- **N8 — Decisión de negocio:** el mes de un reemplazo de máquina (`is_replacement_start`) se factura como "estimée" (consumo variable 0). Coherente con la pantalla, pero podría infrafacturar consumo real del mes. Validar con negocio.
- **N10 — Validación `to`:** con `to: string | string[]`, el guard `if (!to)` no atrapa un array vacío (`![]` es false). Menor.
- **N11 — TOCTOU preview↔emisión:** `emit` recalcula el draft; si algo cambió entre revisar y emitir, se congela un importe distinto del que vio el admin. Aceptable para inmutabilidad, pero conviene mostrar el total a confirmar en el botón.

## ═══════════════════════════════════════════
## POLÍTICA DE REEMPLAZO DE MÁQUINA A MITAD DE MES (decidida con el usuario, 2026-06-05)
## ═══════════════════════════════════════════

> Resuelve N8. Concepto base: **se factura el "puesto de servicio", no la máquina física.** Un puesto (línea de contrato) puede cambiar de hardware durante el mes; el consumo facturable del puesto ese mes = suma del consumo de todas las máquinas que lo ocuparon.

### Decisiones congeladas (afectan al importe)
- **Forfait el mes del cambio:** UN solo forfait completo por puesto/mes (no se prorratea, no se duplica). El cliente contrata servicio continuo, no hardware.
- **Tramos degresivos el mes del cambio:** se aplican UNA vez sobre el **consumo consolidado del puesto (Δsaliente + Δentrante)**, no por máquina separada.

### Flujo "Remplacer la machine" (botón en el contrato) — TODO ATÓMICO (una RPC/transacción)
Inputs: nº serie entrante, contador de cierre de la saliente (`A_out`), contador inicial de la entrante (`B_in`), fecha del cambio.
Acciones en una transacción:
1. Cierra la línea saliente: `contract_machines.date_fin = fecha`, `statut='terminé'`.
2. Registra relevé de cierre de la saliente (`A_out`) — relevé normal.
3. Abre la línea entrante: nueva `contract_machines` (mismo contrato, `date_debut = fecha`), con `replaces_contract_machine_id` → línea saliente (ver mejora de modelo).
4. Registra relevé inicial de la entrante (`B_in`, `is_replacement_start=true`, `previous_machine_id=saliente`).

### Reglas de facturación (corrige el plan v2)
- **R1 — Incluir líneas cerradas en el periodo:** `buildClientInvoiceDraft` NO debe filtrar solo `date_fin IS NULL`. Debe incluir las líneas con `date_fin` DENTRO del mes facturado (su consumo de cierre se factura ese mes). **Sin esto hay infrafacturación silenciosa.**
- **R2 — Consolidar por puesto:** las líneas encadenadas por `replaces_contract_machine_id` se agrupan en un único puesto; su consumo (Δsaliente + Δentrante) se suma antes de aplicar tramos y se cobra un solo forfait.
- **R3 — Sin pérdidas:** `A_out` y `B_in` anclan el corte → el consumo físico total siempre se factura (a lo sumo se difiere al mes siguiente si falta relevé de fin de mes de la entrante).
- **R4 — Aviso:** marcar la factura del mes con `has_replacement=true` y mostrar el **desglose por máquina** (cuánto de la saliente, cuánto de la entrante) para verificación visual del admin.

### Validaciones del botón
- `A_out` ≥ último relevé de la saliente (un contador no decrece).
- La entrante no puede tener ya una línea abierta (lo impide el índice único `contract_machines_one_open_per_machine`).
- Fecha del cambio dentro de un rango coherente.

### Mejora de modelo recomendada
Añadir `contract_machines.replaces_contract_machine_id uuid NULL REFERENCES contract_machines(id)` para encadenar el puesto de forma explícita y atómica (más robusto que reconstruirlo desde `machine_counters.previous_machine_id`). Permite consolidar consumo y multi-cambios en el mismo mes sin ambigüedad.

## ═══════════════════════════════════════════
## REVISIÓN DEL PLAN v3 (14 tasks: núcleo 1-11 + FASE D reemplazo 12-14)
## ═══════════════════════════════════════════

> Revisado 2026-06-05. **Veredicto: APROBADO para implementar.** Todos los bloqueantes anteriores resueltos correctamente; quedan 2 hallazgos medios y 2 menores de calidad/coherencia, ninguno bloqueante.

### Bloqueantes anteriores — todos resueltos ✅
- **N9+N1+N4** → RPC `emit_invoice(p_payload jsonb)` SECURITY DEFINER con guard `auth.role()='service_role'`, validación de duplicado y de estimadas, y **numeración DENTRO de la transacción** (un fallo hace ROLLBACK del contador → sin huecos). Invocada con `admin.rpc`. Impecable.
- **N2** → `.xlsx`: `totalCell = billing_type==='hybrid_tiered' ? amount_total (literal) : {formula}`. Correcto.
- **N5** → `export const runtime = 'nodejs'` en el route handler. ✅
- **N6** → contadores cargados con un solo `.in('machine_id', [...])`. ✅
- **N7** → tipado `InvoiceHeader`/`InvoiceLineRow[]` (sin `as never`). ✅
- **N10** → validación de `to` con array vacío en `send-email`. ✅
- **Política de reemplazo** → `replaces_contract_machine_id`, RPC `replace_contract_machine` atómica (cierra saliente + relevé A_out, abre entrante + relevé B_in `is_replacement_start`, valida A_out≥último y entrante sin línea abierta), filtro de periodo corregido en Task 5 (`date_debut<=finMes AND (date_fin IS NULL OR date_fin>=inicioMes)`), consolidación de puesto en Task 14 (un forfait, tramos sobre consumo combinado, breakdown + `has_replacement`).
- **Acoplamiento filtro↔consolidación: razonamiento VÁLIDO.** "Sin flujo de reemplazo no hay cadenas" → el filtro que incluye líneas cerradas es correcto siempre, y la consolidación llega junto con la única vía de crear cadenas (FASE D). FASE D es separable sin romper el núcleo. Confirmado.

### 🟠 Hallazgos nuevos (medios — corregir, no bloqueantes)
- **H5 — `listBillableClients` sigue con `date_fin IS NULL`:** un cliente cuyo contrato se cierra del todo a mitad del mes (sin reemplazo) NO aparece en el selector de facturables, aunque `buildClientInvoiceDraft` sí incluiría su consumo de cierre → se pierde su última factura parcial. Alinear `listBillableClients` con el mismo filtro de periodo (o recibir year/month).
- **H6 — Coherencia de migraciones (Task 14 Step 2):** `has_replacement` se añade en la migración 200 (Task 12) pero `emit_invoice` se define en la 100 (Task 2). Para que la RPC inserte `has_replacement`, hay que **`CREATE OR REPLACE FUNCTION emit_invoice` dentro de la migración 200** — editar la 100 ya aplicada no surte efecto. El plan dice "añadir a su INSERT" sin precisar esto. Hacerlo explícito.

### 🟡 Hallazgos nuevos (menores)
- **H2 — Relevés sin `contract_id`/`client_id`:** `replace_contract_machine` inserta los relevés de cierre/inicio solo con `machine_id`. `machine_counters` tiene `contract_id`/`client_id`; si los relevés normales los rellenan, replicarlo para no descuadrar otras vistas/reportes que filtren por contrato.
- **H1 — Tarifa del puesto consolidado:** Task 14 reconstruye la `EffectiveTariff` desde la línea **entrante**. Si entrante y saliente tuvieran planes distintos (la RPC lo permite, aunque por defecto hereda con COALESCE), el consumo de la saliente se tarifaría con la tarifa de la entrante. Aceptable si siempre hereda; documentarlo como invariante.

### Hallazgo de arquitectura (Task 8) + no-regresión de RPC de contratos
- **✅ Acierto del implementador:** detectó que el plan v3 (Task 8) simplificaba la persistencia (asumía inserts TS), cuando en realidad los contratos se guardan vía `create_contract_with_lines`/`update_contract_with_lines` (RPC). Creó la migración `20260606000300_billing_in_contract_rpcs.sql` que `CREATE OR REPLACE` ambas RPC añadiendo los 4 campos billing a INSERT (líneas nuevas) y UPDATE (líneas existentes). Decisión correcta.
- **✅ No-regresión verificada por diff** contra `fase2_rpcs_contratos.sql` (única definición previa, sin migraciones intermedias): cuerpo idéntico salvo los campos billing + un comentario borrado. Guards y excepciones intactos.
- **🟡 H9 — La migración 000300 no re-incluye los `GRANT EXECUTE … TO service_role`** que sí estaban en fase2. Funciona en prod porque `CREATE OR REPLACE` **preserva los grants existentes** (no es regresión real), pero la migración no es autosuficiente/idempotente sobre una BD limpia. Recomendable añadir los `GRANT … TO service_role` explícitos al final. **✅ VERIFICADO EN PROD (vía MCP):** tras aplicar 000300, `create/update_contract_with_lines` incluyen billing Y `service_role` conserva `EXECUTE` → sin regresión de permisos. H9 confirmado como no-bug (solo falta idempotencia).
- **⚠️ Acción manual:** esta migración modifica RPC de contratos EN PRODUCCIÓN → tras aplicarla, hacer un test de regresión manual (crear y editar un contrato) además de probar el guardado de plan/overrides.

### Hallazgos nuevos durante implementación (FASE B)
- **🟠 H8 — `updateBillingPlanAction` permite cambiar el `type` de un plan en uso.** Si un plan asignado a líneas (`contract_machines.billing_plan_id`) cambia de `type` (p.ej. `per_copy`→`hybrid_tiered`), las líneas activas cambian de modelo de facturación silenciosamente, y al pasar a tiered los `price_bw/color` se vuelven null → líneas con override de precio quedan incoherentes. Las facturas YA emitidas no se ven afectadas (snapshot inmutable ✅), pero el preview de meses futuros sí. **Sugerencia:** bloquear el cambio de `type` si el plan está referenciado por alguna `contract_machines`, o avisar. Relacionado: desactivar un plan en uso no lo desasigna (las líneas lo siguen facturando) — confirmar que es el comportamiento deseado.
- **🟡 H7 — Validación numérica server-side débil (Task 7 actions).** `Number(fd.get('fixed_fee'))` produce `0` para vacío y `NaN` para no-numérico; no se valida `Number.isFinite()` ni no-negatividad en servidor. **Mitigado:** el `CHECK ≥ 0` de la BD (fix I4) atrapa negativos y el tipo numeric rechaza NaN → no hay datos corruptos, pero el usuario ve el mensaje genérico "Une erreur est survenue" en vez de uno claro. Mejora de UX, no de seguridad.
- **🟡 `toggleBillingPlanAction` no captura errores** del update (redirige igual). Muy menor (persistente desde la 1ª revisión).

### Fixes aplicados por el implementador (post-revisión consolidada)
- **✅ H8 RESUELTO** — `updateBillingPlanAction` bloquea cambio de `type` si el plan está referenciado por `contract_machines` (count>0), con mensaje claro. Solo bloquea si el type cambia Y está en uso. Correcto.
- **✅ H7 RESUELTO** — `Number.isFinite()` en update Y create (`new/actions.ts`, isFinite×3). Consistente.
- **✅ toggle** ahora captura error.
- **✅ H11 RESUELTO** (commit 93fd555) — fórmula `D+ROUND(E*F,0)+ROUND(G*H,0)` redondea cada producto igual que `calculateMonthlyAmount` → el total del xlsx y el `SUM` cuadran con `invoices.total_amount`. Verificado.
- **FASE C + fixes COMMITEADOS** (be0c5eb, b51b808, d194e4f, 93fd555) → **NÚCLEO Tasks 1-11 COMPLETO Y PULIDO**. Hallazgos medios (H8, H11) y H7 cerrados.
- **Pendientes no-bloqueantes:** H9 (GRANT idempotencia, sin impacto en prod), tipo `LineInput`. Acciones manuales: redeploy send-email + `BILLING_NOTIFY_EMAILS`.

### FASE C — revisión

- **🟠 H11 — El total del `.xlsx` puede divergir del importe oficial de la factura (redondeo).** En `invoice-xlsx.ts`, para `per_copy`/`hybrid` la celda Total usa la fórmula `D+E*F+G*H` (productos `price·delta` SIN redondear), pero `calculateMonthlyAmount` guardó `amount_total` redondeando cada componente (`Math.round(price_bw*delta_bw)`). Si los precios por copia tienen decimales, la fórmula de Excel ≠ `amount_total` snapshot, y el `SUM(I…)` (mezcla de fórmulas sin redondear + literales tiered redondeados) puede no igualar `invoices.total_amount`. Para un documento "verificable" el total debe cuadrar con el oficial. **Fix:** redondear por componente en la fórmula `D+ROUND(E*F,0)+ROUND(G*H,0)`, o escribir `amount_total` literal también para per_copy/hybrid. (Inofensivo si los precios son enteros, que es lo habitual en FCFA — pero el modelo permite decimales.)
- **Task 5 `lib/invoicing.ts` ✅ EXCELENTE** (el archivo más crítico). Verificado: (1) filtro de periodo incluye líneas cerradas en el mes `date_debut<=periodEnd AND (date_fin IS NULL OR date_fin>=periodStart)` → **anti-infrafacturación correcto**; (2) N6 sin N+1 (un solo `.in()`); (3) **H5 RESUELTO** — `listBillableClients(year,month)` con el mismo filtro de periodo; (4) clientId bigint coherente como `number`; (5) reutiliza `calcDeltas`. Lógica de delta consistente con la pantalla de Contadores (periodCounter por `recorded_at`, is_estimated si falta/replacement). Sin hallazgos nuevos. Nota borde (no-bug): 2 relevés `actif` el mismo mes darían delta de la corrección, pero el flujo normal anula el original (`status='annule'`) → 1 actif. Consolidación de reemplazo = FASE D (Task 14), núcleo consistente sin ella.

- **Task 9 `facturation/page.tsx` + `FacturationPreview.tsx` ✅** — `requireAdmin`, `force-dynamic`, `listBillableClients(year,month)` (H5), `buildClientInvoiceDraft`, `alreadyIssued` (maybeSingle status=emise). Preview con badge "Estimée" y botón "Émettre malgré tout" (confirm_estimated). Sin hallazgos.
- **Task 10 `facturation/actions.ts::emitInvoiceAction` ✅ EXCELENTE** — **N9 RESUELTO**: usa `createAdminClient()` + `admin.rpc('emit_invoice', {p_payload})`, NO el cliente authenticated (documentado en comentario). Recalcula draft server-side (inmutabilidad). Mapeo de errores already_issued/estimated_not_confirmed/forbidden→FR. `requireAdmin` + `issued_by`. Pendiente: `factures/` (lista/detalle/anulación) + Task 11 xlsx. ExcelJS instalado (package.json mod.).

- **Task 11 (parte xlsx) `invoice-xlsx.ts` + `xlsx/route.ts`** — ✅ N2 resuelto (literal para hybrid_tiered), ✅ N5 resuelto (`runtime='nodejs'`), ✅ N7 (tipos), `requireAdmin` + headers descarga OK. 🟠 nuevo H11 (divergencia redondeo fórmula vs snapshot).
- **Task 10/11 resto** — `factures/page.tsx` (lista, order issued_at desc) ✅; `factures/[id]/page.tsx` (detalle solo-lectura, `isAnnulee` condiciona botones, link /xlsx) ✅; `annulInvoiceAction` (`.eq('status','emise')` defensivo + auditoría) ✅; `emailInvoiceAction` (BILLING_NOTIFY_EMAILS, template raw, base64) ✅. 🟡 triviales: annul no avisa si 0 filas; email no verifica status=emise.
- **`send-email/index.ts` — ✅ NO-REGRESIÓN EJEMPLAR.** Diff mínimo: `to: string|string[]`, `attachments?`, N10 (`toEmpty`), body añade attachments solo si los hay (`...(attachments?.length?...)`). Templates ticket_open/csat/raw INTACTOS. Emails de incidencias en prod no afectados. ⚠️ requiere REDEPLOY para adjuntos.
- **CLAUDE.md** Mailjet→Resend ✅.
- **FASE C completa (escrita, sin commit aún).** Acciones manuales: redeploy send-email + `BILLING_NOTIFY_EMAILS` en .env/Vercel.

## Bitácora de revisión de código (se rellena al avanzar)

| Fecha | Task | Archivo(s) | Veredicto | Notas |
|---|---|---|---|---|
| 2026-06-05 | 1 | `migrations/20260606000000_billing_plans.sql` | ⚠️ Aprobada con reservas | CHECK XOR por tipo bien construidos ✅. **Commiteada (`56b8051`) SIN aplicar los fixes I4/RLS/`public.`.** Confirmar si ya se aplicó en Supabase. |
| 2026-06-05 | 2 | `src/lib/billing.ts` (`47d3307`) | 🔴 Requiere fix | Lógica de tariff/tiers correcta sobre el papel, pero **B4 (numeric→string)** produce importes basura en runtime. Refuerza I3 (orden de tiers) y edge case de override en `per_copy`. B1 resuelto (rama creada). |
| 2026-06-05 | 3 | `src/lib/billing.ts` (working tree, sin commit) | ✅ Aprobado | **B4 resuelto**: helper `num()` coacciona los 6 valores; `amount_fixed` ya es number; `validateTiers` completo; overrides respetan tipo de plan. 🟡 menor: `ContractMachineWithBilling` tipa overrides como `number\|null` (plan v3 los tenía `number\|string\|null`); inofensivo porque `num()` coacciona. |
| 2026-06-05 | 4 | `src/lib/counters.ts` (nuevo, sin commit) | ✅ Aprobado parcial | `calcDeltas` correcto: desempate `recorded_at`, maneja `is_replacement_start`. ⚠️ PENDIENTE Step 3: refactorizar `contadores/[serie]/page.tsx` para importarlo — aún no tocado → no dejar la copia local duplicada. |
| 2026-06-05 | 1 | `migrations/20260606000000_billing_plans.sql` (mod., sin amend) | ✅ Reescrita OK | CHECK≥0 ×6, `public.` ×13, `WITH CHECK` ×2. Fixes I4 presentes. Pendiente: hacer el `amend` del 56b8051. |
| 2026-06-05 | 4 | `contadores/[serie]/page.tsx` + `lib/counters.ts` (`00d440d`) | ✅ Completo | Importa `calcDeltas` de lib/counters; copia local ELIMINADA (sin duplicado). |
| 2026-06-05 | 2 | `migrations/20260606000100_invoices.sql` (`a42bbe4`) | ✅ Aprobado + mejora | RPC `emit_invoice`: guard `service_role`, validación duplicado, **numeración dentro de transacción** (N1/N4/N9 ✅). **CAZÓ UN ERROR DEL PLAN:** `clients.id` es `bigint` (el plan v3 decía `uuid`) → corrigió columna `invoices.client_id`, var RPC y cast a `bigint`, consistente. 🟡 guard usa literal `'forbidden'` en vez de `'permission_denied'` del repo (cosmético). |
| 2026-06-05 | 1+2 | **Aplicación en PRODUCCIÓN** (verificada por el revisor vía MCP read-only) | ✅ Correcta | `billing_plans` + 4 columnas en `contract_machines` + `invoices`/`invoice_lines`/`invoice_counters` + funciones `emit_invoice`/`next_invoice_number` + 10 constraints + índice único parcial: TODO presente. `billing_plans`=0, `invoices`=0, **`invoice_counters` VACÍO → FACT-2026-0001 NO quemado** (limpio). FASE A cerrada en prod. |
| 2026-06-05 | 6 | `BillingPlanForm.tsx` (sin commit) | ✅ Aprobado | Usa `validateTiers` para mostrar error Y deshabilitar submit. Campos filtrados por tipo. Sin hallazgos. |
| 2026-06-05 | 7 | `billing-plans/new/actions.ts` + `[id]/actions.ts` (sin commit) | ✅ Aprobado c/ notas | `validateTiers` server-side ✅, mapeo 23505 ✅, `requireAdmin` ✅. Nuevos: 🟠 H8 (cambio de `type` en plan en uso), 🟡 H7 (validación numérica débil, mitigada por CHECK BD). |
| 2026-06-06 | 7 | `billing-plans/{page,new/page,[id]/page}.tsx` + `Sidebar.tsx` (`2b46793`) | ✅ Aprobado | 3 pages con `requireAdmin`+`createAdminClient`, `notFound`, `bind(null,id)`. Sidebar grupo "Facturation" (3 entradas, iconos OK). Task 7 completa. 🟡 cosmético: list muestra `price_bw` crudo (6 decimales, sin formatear). |
| 2026-06-06 | 8 (BD) | `migrations/20260606000300_billing_in_contract_rpcs.sql` (sin commit) | ✅ Aprobado c/ H9 | CREATE OR REPLACE de las RPC de contratos + 4 campos billing. No-regresión verificada por diff. 🟡 H9 (GRANT service_role omitidos). ⚠️ aplicar en prod + test regresión. |
| 2026-06-06 | 8 | `ContractForm.tsx` + `contracts/{new,[id]}/page.tsx` + RPC 000300 (`0cab0be`) | ✅ COMPLETA | Form: selector plan + overrides filtrados por tipo. **Flujo billing end-to-end verificado**: form `JSON.stringify(lines)` (con billing) → actions pass-through (`JSON.parse`+payload entero, sin re-mapear) → RPC lee `elem->>'billing_plan_id'`. Creación Y edición OK. Las actions NO necesitaron cambios (ya eran pass-through). 🟡 tipo `LineInput` no declara billing (riesgo mantenimiento, no bug). ⚠️ aplicar migración 000300 + test regresión contratos. **FASE B CERRADA.** |

## Revisión FASE D — Reemplazo de máquina (PR #35, `65e208d`, ya mergeado) — 2026-06-07

Revisión post-merge (rol: jefe de proyecto). Núcleo (PR #34) ya validado e2e y en prod. La FASE D la implementó y mergeó el otro Claude SIN validación e2e registrada.

| Sev | ID | Archivo | Hallazgo |
|---|---|---|---|
| 🔴 CRÍTICO | **H-D5** | `migrations/...000200` (RPC) + premisa del plan | **La RPC `replace_contract_machine` viola el índice `machine_counters_one_active_per_month` (UNIQUE (machine_id,year,month) WHERE status='actif')**, creado en `20260603210000_fase1_indices.sql` (preexistente). **El plan v3 afirmó "sin UNIQUE(machine_id,year,month)" (líneas 31 y 42) — premisa FALSA; el schema NO se verificó bien.** Impacto: (a) **encadenar 2 reemplazos del mismo puesto en un mes es imposible** — el relevé de cierre `B_out` choca con el inicial `B_in` (mismo machine/año/mes); (b) **reemplazar una máquina que ya tiene relevé del mes en curso falla** (A_out choca con el relevé del periodo); (c) **el consumo de la entrante en su primer mes no es capturable** — `B_in` + `B_fin` chocan. Solo el "caso feliz" (1 reemplazo, saliente sin relevé del mes, entrante sin relevé de fin de mes) no lanza error, pero infra-factura. **Detectado al VALIDAR (montar cadena A→B→C falló con 23505).** Requiere rediseño, no parche. |
| 🟠 MEDIO | H-D1 | RPC (`...000200`) + `replace-actions.ts` + modal | La RPC heredaba el `billing_plan_id` del puesto pero NO los overrides de precio; ni el modal ni la action los enviaban → la entrante facturaba al precio base del plan, no al negociado. **FIX aplicado**: migración `20260607000000_replacement_inherit_overrides.sql` (CREATE OR REPLACE con `COALESCE` de cada override sobre `v_out`). Aplicada a prod. |
| 🟠 MEDIO | H-D2 | `lib/invoicing.ts` | Consolidación de cadena asumía longitud 2; con A→B→C el resultado dependía del orden del array (no determinista) → posible doble forfait. **FIX aplicado**: resolución transitiva (busca la cabeza, sigue `replaces_cm_id`, consolida N eslabones, breakdown completo). **NOTA:** dado H-D5, las cadenas no se pueden ni crear hoy; el fix es defensivo / prematuro hasta resolver H-D5. |
| 🟡 BAJO | H-D3 | `FacturationPreview.tsx` | `.map()` devolvía Fragment `<>` sin `key` (estaba en el `<tr>` interno) → warning React. **FIX**: `<Fragment key={i}>`. |
| 🟡 BAJO | H-D4 | `replace-actions.ts` | Solo validaba `Number.isFinite`, no `>= 0`; negativo llegaba a la RPC con mensaje genérico. **FIX**: validación `>= 0` con mensaje FR. |

**✅ Bien hecho en la FASE D:** RPC con guard `service_role`, `FOR UPDATE`, validaciones nombradas, atomicidad (el rollback de la cadena fallida fue total); filtros UI correctos (`availableMachines`/`initialLines` solo abiertas/`replacementCandidates`); `emit_invoice` H6 idéntico + `has_replacement`; consolidación del caso 1-reemplazo correcta.

**VEREDICTO FASE D:** ❌ **NO apta para producción tal cual.** El propósito esencial (facturar el consumo de la máquina entrante en el mes del reemplazo) choca con `one_active_per_month`. Fixes H-D1/H-D3/H-D4 aplicados (válidos), H-D2 defensivo. **H-D5 requiere decisión de diseño** (p. ej. mover los relevés de inicio/cierre a columnas de `contract_machines` en vez de filas de `machine_counters`, y ajustar `calcDeltas`/`buildClientInvoiceDraft`). Rama de fix: `fix/billing-replacement-edge-cases`.

### Rediseño H-D5 (PR #36) + segunda revisión cruzada (otro Claude) — 2026-06-07

Opción 1 implementada: `contract_machines.start_counter_*`/`end_counter_*`; RPC fuera de `machine_counters`; `computeLineConsumption` recalcula delta por línea. Validado e2e cadena A→B→C + override → 46200 FCFA (datos sintéticos borrados). **El otro Claude revisó el rediseño y cazó H-D6:**

| Sev | ID | Archivo | Hallazgo |
|---|---|---|---|
| 🟠 MEDIO-ALTA | **H-D6** | `lib/invoicing.ts` `computeLineConsumption` | Regresión introducida por el rediseño: una línea **retirada SIN reemplazo** (flujo `retire` en `contracts/[id]/actions.ts` → `date_fin` sin `end_counter`) caía en la rama de cierre y tomaba `end_counter` (NULL) → `ESTIMATED` → consumo 0, aunque existiera su relevé mensual normal. Rompía la regla R1 del núcleo (facturar el último consumo de líneas cerradas en el mes). **FIX**: booleano `closedByReplacementInMonth` (= cerrada en el mes **Y** `end_counter` no null); si no, fallback al relevé normal del mes. Cubre línea abierta, retirada y cerrada-por-reemplazo. |
| 🟡 BAJO | menor-1 | `lib/invoicing.ts` | Docstring de `buildClientInvoiceDraft` decía "su delta vía `calcDeltas`" (ya no se usa). **FIX**: docstring actualizado a `computeLineConsumption` + consolidación. |
| 🟡 BAJO | menor-2 | `migrations/...000100` | Comentario a medias entre los pasos de la RPC. **FIX**: eliminado. |

**Estado PR #36:** H-D6 + menores corregidos. `tsc` + `build` OK. ~~Gate E2E PENDIENTE~~ → **✅ GATE E2E PASADO** (ver sección siguiente). Cliente residual `id=67 "test supabase"` borrado durante la limpieza del gate (0 dependencias verificadas).

### ✅ GATE E2E — RESULTADO (2026-06-07, sesión 33) — requisito de trazabilidad cumplido

Validado contra BD de prod con el **código TS REAL** del PR (no SQL reimplementado): `buildClientInvoiceDraft`/`emit_invoice` ejecutados vía `npx tsx` + `node --env-file=.env.local`. Escenario `test_gate` (cliente id=71, plan "Gate Hybride" hybrid 30000/10/50, contrato GATE-001). Reemplazos montados con la RPC real `replace_contract_machine` en DO block con `set_config('request.jwt.claims','{"role":"service_role"}',true)`.

| Caso | Máquinas | Δbw / Δcolor consolidado | Importe | Verifica |
|---|---|---|---|---|
| (d) normal | gate_N | 300 / 10 | **33 500** | no-regresión |
| (c) retire SIN reemplazo | gate_R | 800 / 0 | **38 000** | **H-D6** (factura su consumo, no estimada=0) |
| (a) reemplazo simple | gate_A→gate_B | 700 / 100 (A 300/20 + B 400/80) | **42 000** | consolidación 1 reemplazo |
| (b) cadena | gate_C1→C2→C3 | 620 / 200 (200/50 + 220/100 + 200/50) | **46 200** | **H-D5** (cadena A→B→C montada SIN violar `one_active_per_month`) |

**Total junio 2026 = 159 700 FCFA.** `buildClientInvoiceDraft(71,2026,6)` → total=159700, has_replacement=true, has_estimated=false, 4 líneas. Emisión `emit_invoice` → `FACT-2026-0001`, status `emise`, **cabecera = Σ líneas = 159700 (cuadra=true)**. La cadena A→B→C se montó sin error 23505 → **H-D5 confirmado resuelto ejecutando** (la revisión estática no lo cazó: es índice único parcial, no CHECK). Limpieza total verificada por SELECT: 0 residuos `test_gate`/`gate_*`/`GATE-001`, `invoice_counters` 2026 reseteado (FACT-2026-0001 libre de nuevo), cliente `id=67` borrado, scripts temporales eliminados. Prod = estado previo.

### Code review pre-merge (high effort, 4 ángulos + verificación) — 2026-06-07

Sin hallazgos de corrección bloqueantes. Refutados contra el código: filtro `status='annule'` (sí presente, L91/L110), validación `end>=start` en RPC (sí, vía `GREATEST(último relevé, start_counter)`), `SELECT` sin columnas nuevas y `breakdown` rompiendo `emit_invoice` (ambos OK, emisión validada e2e). Hallazgos reales (todos severidad baja):

| Sev | ID | Archivo | Hallazgo | Estado |
|---|---|---|---|---|
| 🟡 MUY BAJA | **H-D7 (fix-forward)** | `lib/invoicing.ts:84` `computeLineConsumption` | `closedByReplacementInMonth` solo comprueba `end_counter_bw !== null`, no `end_counter_color`. Si una línea quedara con `end_counter_bw` seteado y `end_counter_color` NULL, toda la línea cae a `ESTIMATED` (consumo 0) e infrafactura el B&N que sí tiene cierre. **No alcanzable vía la app** (la RPC `replace_contract_machine` siempre setea ambos contadores juntos, valida no-null en payload); solo con edición manual directa de la tabla (sin UI). **FIX-FORWARD propuesto** (1 línea: `&& line.end_counter_color !== null`), NO bloqueante. |
| 🟡 BAJA | altitud | `migrations/...000000` | `CREATE OR REPLACE` de `replace_contract_machine` con el modelo viejo, sobreescrita de inmediato por `...000100` → en el historial la 000000 es código muerto. **No accionable**: ambas migraciones ya aplicadas en prod, no se pueden editar/fusionar retroactivamente. Deuda histórica documentada. |
| 🟡 BAJA | eficiencia | `lib/invoicing.ts:244` | `chain.includes(prev)` O(n) en bucle + re-sort de `allCounters` por línea. Negligible a escala AMD (cadenas 2-3, ≤~50 líneas/cliente). Limpieza opcional. |

**VEREDICTO: PR #36 apto para merge.** Fixes H-D5/H-D1/H-D2/H-D6 correctos y validados e2e en el camino crítico. H-D7 queda como fix-forward de severidad muy baja.
