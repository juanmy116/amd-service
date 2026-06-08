# Plan de corrección — Core de facturación y contratos

**Fecha:** 2026-06-08
**Origen:** auditoría preproducción (`docs/auditoria-preproduccion-facturacion-contratos-2026-06-08.md`) + reglas de negocio aclaradas por el dueño del proyecto en sesión de supervisión.
**Estado del veredicto de auditoría:** verificado hallazgo por hallazgo contra el código. 19 VÁLIDOS, 3 PARCIALES, 0 falsos positivos, 1 ya resuelto (P2-8, divergencia `counterDelta`, PR #37).
**Alcance:** "todo bien hecho" (decisión del dueño) — resolver P0 + P1 + P2 relevantes, de forma estructural, no con parches.

> ⚠️ **ESTO ES EL CORE DEL NEGOCIO (DINERO).** Léete entero "Reglas de integridad" antes de tocar nada. Ninguna parte se da por buena hasta pasar su gate. **No se factura a un cliente real hasta el GATE FINAL.**

---

## Reglas de negocio confirmadas (fuente de verdad)

Estas reglas las fijó el dueño de AMD. Mandan sobre cualquier suposición previa del código.

1. **Parque de máquinas.** AMD tiene un parque (ej. 100 máquinas: ~60 alquiladas + ~40 en stock en el local). Una máquina está **alquilada** (en un cliente) o **en stock** (en el local).
2. **El stock es la frontera entre clientes.** Una máquina **nunca** pasa directa de un cliente a otro. Siempre: Cliente A → **stock** → Cliente B. Entre medias se verifica/repara en el local.
3. **El contador NO se asume a 0 al reasignar.** Una máquina puede salir del stock con copias de prueba del taller (ej. 15). Al **asignarla a un cliente, la app DEBE pedir la lectura real del contador** y usarla como punto de partida (`start_counter`). Sin esa lectura, no se puede asignar.
4. **Identidad de máquina = número de serie.** Una sola fila `machines` por `numero_serie`, para siempre. La misma máquina física rota por varios clientes a lo largo del tiempo.
5. **Solo dos motivos de retirada de una máquina de un contrato:**
   - (a) **El cliente da de baja (resilie) la máquina** → la máquina vuelve al **stock**.
   - (b) **La máquina hay que repararla en el taller de AMD** → se **sustituye por otra máquina** (el cliente sigue trabajando con la nueva). La averiada va al taller → stock.
6. **Reparación en casa del cliente** = la máquina sigue, no hay retirada ni cambio. No afecta a facturación.
7. **Contrato con N máquinas; cada máquina su propio plan.** Un mismo contrato puede tener máquinas con planes de facturación distintos. La **unidad de facturación es la máquina/línea**, no el contrato.
8. **Mes sin lectura de contador → botón "Forzar facturación".** Si llega el día de facturar y falta legítimamente el contador de algún equipo, un **admin** puede **forzar la factura a propósito y a mano** (esa línea se factura solo forfait / estimada). Distinto de un fallo técnico (ver Bloque 0 / P0-7).
9. **Ciclo de facturación = ciclo de aniversario por CONTRATO (CONFIRMADO).** La factura NO es mes natural: va del `billing_day` del contrato al día anterior del mismo día del mes siguiente (ej. día 4 → del 4 de enero al 3 de febrero). El día es **único por contrato**: todas las máquinas del contrato comparten el mismo ciclo y van en **una sola factura**. Si el `billing_day` no existe en un mes (ej. 31 en febrero) → **último día del mes**. Rige el Bloque E.

---

## Reglas de integridad (innegociables — es dinero)

1. **El motor de cálculo (`src/lib/invoicing.ts`, `src/lib/counters.ts`) lo toca UNA sola mano.** Prohibido dos agentes editándolo a la vez.
2. **Dependencias en orden.** Bloque A (modelo de parque/stock) antes que Bloque B (cálculo por línea). No se puede al revés.
3. **Cada Bloque = un PR cerrado, desplegable, que no rompe lo anterior**, con sus tests verdes (`npm test` + `typecheck` + `build`) y revisado antes de mergear.
4. **Migraciones SQL: un único responsable de los timestamps.** Si dos agentes crean migraciones en paralelo, se acuerdan los timestamps por adelantado para no solapar ni romper el orden. Nunca editar migraciones ya aplicadas en prod — siempre fix-forward.
5. **Ownership de archivos por agente** (ver "División del trabajo"). Cero solapamiento en los mismos archivos.
6. **GATE FINAL único antes de facturar a un cliente real.** Un E2E sobre datos sintéticos que cubra todos los escenarios de la suite (ver "Gate final"), con limpieza verificada. Hasta que ese gate pase, la facturación real NO se habilita.
7. **Toda invariante nueva queda cubierta por un test** (vitest ya está montado, PR #37). Sin test, la corrección no se da por hecha.

---

## Mapa de bloques y dependencias

```
Bloque 0  (arreglos aislados)         ─┐  paralelizable
Bloque C  (blindaje contable BD)      ─┤  con A/B (otra mano)
                                       │
Bloque A  (modelo parque/stock)  ──► Bloque B (motor por línea) ──► Bloque D (reglas temporales) ──► Bloque E (ciclo billing_day)
   (una sola mano, en secuencia)
```

- **En paralelo (otra mano):** Bloque 0 y Bloque C — no tocan el motor de cálculo.
- **En secuencia (una mano):** A → B → D → E.
- **Gate final** tras integrar todo.

---

# BLOQUE 0 — Arreglos aislados (rápidos, bajo riesgo)

**Owner sugerido:** Claude #2 (paralelo). **Toca:** UI, validaciones de entrada, mover un archivo, una migración fix-forward. **No toca** `invoicing.ts` salvo P0-7 (coordinar).

### 0.1 — Sacar el rollback destructivo del camino de migraciones (P0-1) + fix migración `terminé` (P1-9)
- **Qué:** mover `supabase/migrations/20260603120856_contracts_n_machines_rollback.sql` fuera de `migrations/` (p. ej. a `supabase/rollbacks/`). Verificar que una reconstrucción limpia (`supabase db reset` o equivalente) llega hasta el final sin él.
- **P1-9:** la migración `20260603120559_contracts_n_machines.sql` (INSERT de datos) copia `statut='terminé'` sin `date_fin`, violando el CHECK. Fix-forward: que el INSERT ponga `date_fin` cuando `statut='terminé'` (o ajustar el dato). Verificar reconstrucción con un contrato terminado en los datos.
- **Aceptación:** reconstrucción limpia de todas las migraciones termina OK, incluso con contratos terminados. El rollback queda documentado y fuera del camino automático.

### 0.2 — Quitar el flujo de reemplazo defectuoso del ContractForm (P0-2)
- **Qué:** eliminar el botón/función `replaceLine()` de `src/components/admin/ContractForm.tsx` (líneas ~143-146 y ~445-453) que hace `removeLine()+addLine()`. Dejar **solo** el flujo atómico `ReplaceMachineModal` → `replace_contract_machine`.
- **Cuidado:** este flujo se va a reorganizar en el Bloque A/B (stock vs reemplazo). Aquí solo se trata de **cerrar el agujero** (que nadie pueda generar un reemplazo roto). Coordinar con el owner del Bloque A para no chocar.
- **Aceptación:** no existe ningún camino en la UI que cree un "reemplazo" sin `end_counter`/`start_counter`/encadenado. Test/escenario que lo confirme.

### 0.3 — Distinguir fallo técnico de ausencia de dato (P0-7)
- **Qué:** en `src/lib/invoicing.ts`, las queries (cliente, líneas, contadores) deben **comprobar el `error`** de Supabase. Un fallo técnico de lectura **bloquea** preview y emisión con un error claro — NO se convierte en líneas estimadas con consumo 0.
- **Relación con regla 8:** "falta el contador de verdad" → eso lo maneja el botón "Forzar facturación" (Bloque B). "La query falló técnicamente" → se bloquea y se avisa. Son dos estados distintos.
- **Coordinación:** esto toca `invoicing.ts` → acordar con el owner del motor (Claude #1) quién lo hace. Puede ser parte del Bloque B en vez de Bloque 0 si se prefiere mantener `invoicing.ts` en una sola mano.
- **Aceptación:** test que simula `error` de la query de contadores y verifica que preview/emisión se bloquean.

### 0.4 — Validaciones de entrada (P2-2, P2-3)
- **P2-3:** `client_id/year/month` en `facturation/actions.ts` con `Number.isInteger` + rango (año razonable, mes 1-12). Añadir CHECK de rango de año en BD (`invoices.period_year`).
- **P2-2:** `validateTiers` (`billing.ts`) — añadir `Number.isFinite` y validación de tipos de los campos internos de cada tramo (`up_to`, `price_bw`, `price_color`). Considerar validar estructura del JSONB en BD.
- **Aceptación:** tests de entradas inválidas (año absurdo, tier con campo no numérico) que se rechazan limpiamente.

---

# BLOQUE A — Modelo de parque y stock (BASE)

**Owner:** Claude #1 (motor). **Depende de:** nada (es la base). **Bloquea a:** B, D, E.

### Objetivo
Que el sistema sepa que una máquina está **alquilada** o **en stock**, y modelar limpiamente los eventos del ciclo de vida, registrando los contadores en los puntos de corte.

### Cambios
1. **Estado de máquina en el parque.** Hoy `machines` solo tiene `active` (bool) y `localisation` (texto). Añadir el concepto **alquilada / en stock** (puede derivarse de "tiene línea abierta" o materializarse como estado explícito — decidir, pero debe ser consultable de forma fiable).
2. **Evento "devolver a stock"** (motivo de retirada (a) resiliación):
   - Cierra la línea del cliente: `date_fin` + `end_counter_bw/color` (lectura real al retirar).
   - La máquina queda **en stock**, sin línea de cliente abierta. **No factura a nadie** mientras está en stock.
3. **Evento "asignar desde stock"**:
   - La app **obliga a introducir la lectura real del contador** (regla 3) → `start_counter_bw/color` de la nueva línea. Puede no ser 0.
   - Abre una línea nueva para el cliente nuevo, con su `billing_plan_id`. **No** se encadena con la del cliente anterior (es un alquiler independiente, NO un reemplazo).
4. **Reseteo del contador.** El salto de contador entre el fin de un cliente (ej. 1000) y el inicio del siguiente (ej. 0 o 15) ocurre **en el stock**, fuera de toda línea de cliente. Modelar de forma que el motor de cálculo (Bloque B) **nunca** cruce el historial de dos clientes (ver Bloque B).
5. **Distinguir los dos flujos** (regla 5):
   - **Reemplazo** (motivo (b), cliente sigue): `replace_contract_machine` — encadena, consolida puesto. La máquina entrante sale del stock; la saliente va a taller→stock.
   - **Rotación de parque** (motivo (a), cliente nuevo): devolver-a-stock + asignar-desde-stock. **NO** encadena.

### Criterios de aceptación
- Se puede consultar de forma fiable qué máquinas están en stock y cuáles alquiladas.
- Devolver a stock cierra la línea con su `end_counter`. Asignar desde stock exige lectura y abre línea con `start_counter`.
- El periodo en stock no genera ninguna línea facturable.
- Tests: ciclo completo Cliente A → stock → Cliente B con lecturas reales en cada corte.

---

# BLOQUE B — Motor de facturación por línea/alquiler (CORAZÓN)

**Owner:** Claude #1 (motor). **Depende de:** Bloque A. **Es el núcleo del dinero.**

### Objetivo
"Una hoja por alquiler": cada línea de `contract_machines` se factura mirando **solo sus propios relevés** (su cliente/contrato/línea), nunca todo el historial del número de serie. Resolver primer mes, reseteo y reasignación intra-mes.

### Cambios
1. **Atribución del consumo por línea/contrato/cliente (P0-3).** `computeLineConsumption` y la carga de contadores deben filtrar los relevés por la línea/contrato/cliente correspondiente y por el intervalo de vigencia de la línea — no agrupar solo por `machine_id`. (`machine_counters` ya tiene `contract_id`/`client_id`; usarlos.)
2. **Punto inicial explícito y obligatorio (P0-4 + regla 3).** Toda línea factura desde un `start_counter` real. Línea nueva sin punto inicial → no se factura "0 perdido": se exige la lectura (Bloque A la captura). Definir regla para datos heredados.
3. **Manejo del reseteo (caso real del dueño).** Como cada línea mira solo sus relevés y arranca en su `start_counter`, el salto 1000→0 del stock **deja de cruzarse**. Verificar que el cliente entrante factura `lectura − start_counter` (ej. copias por encima de las 15 de prueba) y el saliente su consumo hasta el cierre.
4. **Reasignación intra-mes (P1-3 + índice único).** Hoy `UNIQUE (machine_id, year, month) WHERE status='actif'` impide registrar dos relevés de la misma máquina en el mismo mes (bloquea el caso A→stock→B dentro del mes). Rediseñar para que el relevé quede ligado a la **línea/contrato**, no solo a `machine_id+mes`, de modo que ambos clientes puedan tener su lectura en el mismo mes sin colisión.
5. **Botón "Forzar facturación" (regla 8).** UI de admin: cuando vence el día de facturar y falta el contador de algún equipo, el admin fuerza a propósito; esa línea se factura forfait/estimada. Intencional, manual, solo admin. Distinto del bloqueo por fallo técnico (P0-7).

### Criterios de aceptación
- El escenario del dueño (máquina reseteada A→stock→B) factura **A correcto** y **B desde su lectura real**, sin negativos ni estimaciones erróneas.
- Reasignación dentro del mismo mes: ambos clientes facturan su parte correctamente.
- Primer mes de máquina nueva: factura desde el `start_counter` real (no se pierde consumo).
- Botón forzar: funciona solo para admin, a mano, y deja traza.
- Tests de TODOS estos escenarios (ver Gate final).

---

# BLOQUE C — Blindaje contable en base de datos

**Owner:** Claude #2 (paralelo a A/B). **Toca:** migraciones SQL/RPC, no el motor TS. Coordinar timestamps de migración.

### Cambios
1. **Facturas inmutables en BD (P0-5).** Trigger/regla que impida `UPDATE`/`DELETE` de `invoices`/`invoice_lines` en estado `emise`. Solo se permite pasar a `annulee` por la operación auditada. Revisar el `ON DELETE CASCADE` de `invoice_lines`.
2. **`emit_invoice` valida coherencia contable (P1-1).** Antes de insertar: ≥1 línea; `total_amount = SUM(amount_total)`; `amount_total = suma de componentes`; deltas/importes no negativos; cliente existe y coincide; (valorar) `issued_by` = actor.
3. **Pertenencia de líneas al contrato (P0-6).** En `update_contract_with_lines`, toda operación por `id` de línea debe exigir `contract_id = p_contract_id`. Fallar explícito ante IDs cruzados.
4. **Invariantes de la cadena de reemplazos (P2-5).** Constraints en BD: no autorreferencia (ciclos), no dos líneas reemplazando la misma, enlace dentro del mismo contrato. Revisar `ON DELETE SET NULL` del linaje.
5. **Persistir el desglose del reemplazo en la factura (P2-6).** `invoice_lines` debe guardar el `breakdown` por máquina; `emit_invoice` no debe descartarlo. Trazabilidad del consumo consolidado.

### Criterios de aceptación
- Tests RLS negativos: `UPDATE`/`DELETE` de factura emitida fallan.
- `emit_invoice` rechaza un payload descuadrado / sin líneas / con IDs cruzados.
- La factura emitida conserva el desglose por máquina.

---

# BLOQUE D — Reglas temporales y de negocio

**Owner:** Claude #1 (tras Bloque B). **Depende de:** B.

1. **Vigencia temporal de tarifas (P1-5).** Versionar planes/overrides con fecha de vigencia, para que facturar un mes pasado use los precios **de ese mes**, no los actuales. (Las facturas ya emitidas son snapshot; esto protege los meses pasados aún no facturados.)
2. **Cambio de cliente controlado (P1-4).** Cambiar `contracts.client_id` no debe reasignar retroactivamente historial/facturación pasada. Definir política (bloquear si hay facturas, o versionar la titularidad).
3. **Estados de contrato/línea coherentes (P1-6).** Un contrato `terminé`/`suspendu` debe cerrar sus líneas o excluirse de la facturación. Alinear `statut` con `date_fin` (hoy el filtro real es `date_fin`).
4. **Reemplazo hereda overrides operativos (P1-7).** La línea entrante debe heredar `billing_day_override`, `maintenance_frequency_override`, `notes` (hoy solo hereda los de precio).
5. **Mantenimiento sigue a la máquina nueva (P1-8).** Al reemplazar/rotar, migrar o cancelar visitas de mantenimiento futuras ligadas a la línea saliente, para no programar mantenimientos sobre una máquina retirada.

### Criterios de aceptación
- Facturar un mes pasado da el importe de aquel mes.
- Cambiar cliente no altera facturas/historial pasados.
- Contrato terminado deja de facturarse. Reemplazo conserva día de captura, frecuencia y notas. Las visitas futuras pasan a la máquina correcta.

---

# BLOQUE E — Ciclo de facturación por aniversario (billing_day) — EL MÁS GRANDE

**Owner:** Claude #1, AISLADO, al final. **Depende de:** B (y D). **CONFIRMADO con el dueño (regla 9).**

### Objetivo
Cambiar el periodo de facturación de **mes natural (1→fin de mes)** a **ciclo de aniversario por contrato**: del `billing_day` del contrato al día anterior del mismo día del mes siguiente.

### Reglas confirmadas
- **Día único por contrato.** Todas las máquinas del contrato comparten `billing_day` y ciclo → **una sola factura por contrato/ciclo**, con todas sus máquinas dentro.
- **Periodo:** ej. `billing_day=4` → ciclo `[4 ene → 3 feb]`, siguiente `[4 feb → 3 mar]`…
- **Caso fin de mes:** si el `billing_day` no existe en el mes (31 en febrero) → **último día del mes**.

### Cambios
1. **Cálculo de periodo por contrato.** `periodStart`/`periodEnd` se derivan del `billing_day` del contrato (con la regla de fin de mes), no de 1→fin de mes. Afecta a `buildClientInvoiceDraft`, `listBillableClients` y a cómo se identifica/almacena el periodo en `invoices` (hoy `period_year`/`period_month` — un ciclo de aniversario no es un mes natural; revisar a fecha-inicio/fecha-fin del ciclo).
2. **Lecturas en los billing_day.** Consumo del ciclo = lectura(billing_day fin) − lectura(billing_day inicio). Encaja con la captura de Princity en el `billing_day`. Si falta la lectura de corte → botón "Forzar facturación" (Bloque B).
3. **`billing_day_override` por máquina.** Como el ciclo es por contrato, el override por máquina **NO** rige el ciclo. Decidir: eliminarlo o mantenerlo solo como día de captura (no de ciclo). Documentar para evitar contradicción.

### Criterios de aceptación
- Una factura de contrato cubre exactamente `[billing_day, billing_day−1 del mes siguiente]`.
- Caso fin de mes (día 31 en febrero) correcto.
- Todas las máquinas del contrato en una sola factura con ese periodo.
- Tests del ciclo de aniversario, incluido el caso 31→febrero.

---

# Transversal — Coma flotante en dinero (P2-1)

- Anti-patrón real pero hoy no disparable (deltas enteros + tarifas FCFA enteras). **Acción:** si en algún momento se permiten tarifas con decimales, migrar el cálculo a entero/decimal exacto. Documentar la asunción "tarifas enteras" para que no se rompa en silencio. Baja prioridad.

---

# Gate final (antes de habilitar facturación real)

Un único E2E sobre datos sintéticos en prod (estilo el gate de 159700 FCFA ya hecho), con limpieza verificada por SELECT al terminar. Debe cubrir, como mínimo:

**Facturación:**
- Línea normal con historial previo.
- Primer mes de máquina nueva (con `start_counter` real) y de máquina usada.
- Retirada sin reemplazo (a stock).
- **Máquina reseteada A → stock → B** (caso del dueño): A correcto, B desde su lectura real.
- Reasignación A→B **dentro del mismo mes**.
- Reemplazo (cliente sigue) simple y cadena A→B→C.
- Contrato suspendido y terminado (no factura).
- Planes plano, híbrido y por tramos; varias máquinas con planes distintos en un contrato.
- Mes sin lectura → botón "Forzar facturación".
- Fallo técnico de query → bloqueo (no factura 0).
- Cabecera = suma de líneas (validado en BD).
- Factura emitida no modificable ni eliminable.
- **Ciclo de aniversario por contrato:** factura del `billing_day` al día anterior del mes siguiente; caso día 31 en febrero (→ último día del mes); todas las máquinas del contrato en una sola factura.

**Contratos/parque:**
- Payload con línea de otro contrato → rechazado.
- Cambio de cliente con historial → no reasigna pasado.
- Reemplazo con overrides y visitas futuras → migradas.

**Migraciones:** reconstrucción limpia desde cero (con contratos activos/suspendidos/terminados) termina OK.

---

# División del trabajo entre dos agentes (resumen)

| Bloque | Owner | Paralelo/Secuencia | Toca |
|---|---|---|---|
| 0 (arreglos aislados) | Claude #2 | Paralelo | UI, validaciones, 1 archivo movido, 1 migración |
| C (blindaje BD) | Claude #2 | Paralelo | migraciones SQL / RPC |
| A (parque/stock) | Claude #1 | Secuencia (1º) | modelo datos + motor |
| B (motor por línea) | Claude #1 | Secuencia (2º, tras A) | `invoicing.ts`, `counters.ts`, migraciones |
| D (reglas temporales) | Claude #1 | Secuencia (3º, tras B) | motor + SQL |
| E (ciclo billing_day) | Claude #1 | Secuencia (último) | motor + SQL — CONFIRMADO: ciclo aniversario por contrato |

**Coordinación obligatoria:** timestamps de migración acordados por adelantado; `invoicing.ts`/`counters.ts` solo los toca Claude #1; cada bloque es un PR con tests verdes y revisión; **nada se factura en real hasta el GATE FINAL**.
