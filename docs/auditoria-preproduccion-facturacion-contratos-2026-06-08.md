# Auditoría preproducción: facturación mensual y contratos

**Fecha:** 2026-06-08  
**Alcance:** núcleo de facturación mensual, contratos N-máquinas, contadores, reemplazos, integridad de datos, seguridad y mantenibilidad.  
**Modo de revisión:** estrictamente read-only. No se modificó código ni base de datos.  
**Verificación ejecutada:** `npm run typecheck` pasa correctamente.  
**Veredicto original:** **NO-GO para publicar hasta resolver los bloqueantes.**

---

## ✅ CIERRE DEL TRIAJE — 2026-06-11

> Triaje de verificación de los 24 hallazgos contra el código actual, tras la
> reconstrucción del motor de facturación (PRs #39–#49) y la auditoría de
> infraestructura/seguridad (PRs #58–#70). Cada veredicto tiene evidencia en
> migración/función/trigger/test.

**Resultado: los 16 bloqueantes (7 P0 + 9 P1) están RESUELTOS. El veredicto NO-GO queda LEVANTADO.**
Quedan solo cabos menores **no bloqueantes** (2 parciales + 3 pendientes de hardening), ninguno impide publicar ni facturar.

| Hallazgo | Veredicto | Evidencia clave |
|---|---|---|
| **P0-1** rollback destructivo en migraciones | ✅ RESUELTO | Movido a `supabase/rollbacks/` (fuera del path automático) |
| **P0-2** doble flujo "Remplacer" | ✅ RESUELTO | `replaceLine()` eliminado; solo queda la RPC atómica `replace_contract_machine` |
| **P0-3** contadores por máquina, no por línea | ✅ RESUELTO | `countersForLine()`/`computeLineConsumptionCycle` atribuyen por `contract_machine_id` + tests |
| **P0-4** primer mes pierde consumo | ✅ RESUELTO | Ancla en `start_counter`; `assign_machine_from_stock` exige lectura inicial + tests |
| **P0-5** facturas mutables (UPDATE/DELETE) | ✅ RESUELTO | Triggers `tg_invoices_immutable`/`tg_invoice_lines_immutable` (`20260609080000`), FK→RESTRICT; probado en gate |
| **P0-6** RPC modificaba líneas de otro contrato | ✅ RESUELTO | `20260609082000_contract_lines_ownership.sql` valida `contract_id` (`line_not_in_contract`) |
| **P0-7** errores → estimación cero | ✅ RESUELTO | `BillingDataError` corta preview/emisión + tests `invoicing.test.ts:406` |
| **P1-1** RPC no validaba coherencia contable | ✅ RESUELTO | `emit_contract_invoice` valida cuadres/cliente/no-negativos antes de insertar (`20260609081000`) |
| **P1-2** emisión sin snapshot consistente | ✅ RESUELTO | Recalcula draft fresco al emitir + revalida en BD (matiz: no re-deriva deltas bajo lock; robusto por inmutabilidad) |
| **P1-3** retirada cobra consumo posterior | ✅ RESUELTO | Usa `end_counter` real de cierre de línea, no el relevé mensual + test `:301` |
| **P1-4** cambiar cliente reasigna historial | ✅ RESUELTO | `client_change_forbidden_history` si hay facturas/contadores (`20260608140100`) |
| **P1-5** tarifas mutables retroactivamente | ✅ RESUELTO | Versionado de tarifas + `resolveEffectiveTariffAsOf` (`20260609120000`) + tests |
| **P1-6** contrato terminado/suspendido factura | ✅ RESUELTO | `isLineBillable` filtra estado/`date_fin` + tests *(ver nota operativa abajo)* |
| **P1-7** reemplazo pierde props operativas | ✅ RESUELTO | Hereda billing_day/maintenance_freq/notes (`20260608140000`) |
| **P1-8** mantenimiento ligado a máquina saliente | ✅ RESUELTO | El reemplazo migra visitas futuras a la línea entrante *(sin test automático)* |
| **P1-9** migración falla con contratos terminados | ✅ RESUELTO | El INSERT de migración asigna `date_fin` a los `terminé` |
| **P2-1** float + `Math.round` | ⚠️ PARCIAL (no bloqueante) | Sigue float, pero mitigado: FCFA entero, cada componente redondeado, cuadre validado en BD |
| **P2-2** validación de tramos JSON | ✅ RESUELTO | `validateTiers` valida tipos/finitud/enteros/precios |
| **P2-3** validación de periodos | ✅ RESUELTO | `contract-actions.ts` valida enteros/rangos + re-valida en RPC |
| **P2-4** borrado de contrato no atómico | 🔸 PENDIENTE (riesgo bajo) | `can_delete_contract` + `DELETE` siguen en 2 llamadas (TOCTOU) |
| **P2-5** invariantes de cadena de reemplazo | ⚠️ PARCIAL (no bloqueante) | Triggers anti-ciclo/bifurcación/cross-contract OK; falta FK en `replaces_contract_machine_id` (puntero colgante al borrar) |
| **P2-6** breakdown no persistido | ✅ RESUELTO | Columna `invoice_lines.breakdown` + `has_replacement` persistidos |
| **P2-7** `billing_day` no afectaba el cálculo | ✅ RESUELTO | `computeBillingCycle` (ciclo de aniversario) + tests |
| **P2-8** divergencia delta contadores/factura | ✅ RESUELTO | Primitiva única `counterDelta` (`counters.ts`) compartida + test |
| **Hardening (a)** barrera `server-only` | 🔸 PENDIENTE (menor) | `src/lib/supabase/admin.ts` no importa `server-only` (protección solo convencional) |
| **Hardening (b)** tests RLS por rol | 🔸 PENDIENTE | Ya planificado como Fase 2 de tests en `docs/pendientes.md` |

**Nota operativa (no de facturación) — P1-6:** marcar un contrato como `terminé` en la
RPC de actualización **no cierra automáticamente sus líneas** (no asigna `date_fin`); el
cierre depende del array `retire` explícito. La facturación queda protegida (`isLineBillable`
excluye la línea huérfana), pero el modelo parque/stock seguiría viendo esa máquina como
"alquilada". Conviene cerrar las líneas al terminar el contrato para mantener la coherencia
del parque. No bloquea publicar.

**Cabos no bloqueantes pendientes (para backlog, no para go-live):** P2-1 (aritmética
entera en dinero), P2-4 (RPC atómica de borrado), P2-5 (FK en `replaces_contract_machine_id`),
hardening (a) `server-only` y (b) tests RLS por rol.

---

## Instrucciones para Claude

Este documento contiene hallazgos de una auditoría preproducción. Antes de implementar:

1. Verificar cada hallazgo contra el código y el estado real de producción.
2. No editar migraciones ya aplicadas en producción; usar migraciones fix-forward.
3. Resolver primero los bloqueantes P0 y validar con escenarios E2E.
4. Mantener facturación y contratos transaccionales.
5. Añadir pruebas automatizadas para las invariantes descritas.
6. No asumir que una protección de UI protege la base de datos.

---

## Resumen ejecutivo

El sistema ha recibido revisiones previas y existe un gate E2E documentado que cubre facturación normal, retirada, reemplazo simple y cadena de reemplazos. Sin embargo, la auditoría actual ha encontrado riesgos no cubiertos por ese gate:

- El historial de migraciones no es reproducible y contiene un rollback destructivo ejecutable automáticamente.
- La facturación atribuye contadores por máquina física, sin separar correctamente contratos o clientes sucesivos.
- Existe un flujo alternativo de reemplazo que no usa la RPC atómica ni encadena las líneas.
- El primer mes de una línea normal puede perder permanentemente su consumo.
- Las facturas descritas como inmutables pueden modificarse o eliminarse.
- Las RPC permiten corrupción cruzada entre contratos y aceptan snapshots contablemente incoherentes.
- No hay suite automatizada de tests para proteger este núcleo.

---

# P0 - Bloqueantes de publicación

## P0-1. Rollback destructivo dentro del historial normal de migraciones

**Archivos:**

- `supabase/migrations/20260603120856_contracts_n_machines_rollback.sql:1`
- `supabase/migrations/20260603120856_contracts_n_machines_rollback.sql:26`
- `supabase/migrations/20260603120856_contracts_n_machines_rollback.sql:58`
- `supabase/migrations/20260603170237_fix_tech_machines_select_for_n_machines.sql:9`
- `supabase/migrations/20260603210000_fase1_indices.sql:14`

**Problema**

El archivo se describe como rollback manual, pero está guardado dentro de `supabase/migrations` con un timestamp normal. Un `supabase db reset`, una instalación limpia o un despliegue desde cero lo ejecutará automáticamente.

El rollback:

- elimina `contract_machine_id`;
- elimina funciones y políticas;
- elimina `contract_machines`;
- elimina `contract_machine_status`;
- reconoce que solo preserva la línea activa y pierde rotaciones.

Las migraciones posteriores vuelven a depender inmediatamente de esos objetos.

**Escenario de fallo**

1. Se reconstruye una base limpia.
2. Se aplica `20260603120559_contracts_n_machines.sql`.
3. Se aplica automáticamente el rollback `20260603120856`.
4. La siguiente migración intenta utilizar objetos eliminados.

**Impacto**

- Esquema no reproducible.
- Bloqueo de disaster recovery y nuevos entornos.
- Riesgo de pérdida destructiva de historial si se aplicase sobre datos.

**Criterio de aceptación**

- Una reconstrucción limpia de todas las migraciones termina correctamente.
- El rollback no forma parte del camino automático.
- El procedimiento de rollback queda separado, documentado y protegido.

---

## P0-2. Dos flujos incompatibles llamados "Remplacer"

**Archivos:**

- `src/components/admin/ContractForm.tsx:142`
- `src/components/admin/ContractForm.tsx:143`
- `src/components/admin/ContractForm.tsx:447`
- `src/app/admin/contracts/[id]/replace-actions.ts:9`
- `supabase/migrations/20260607000100_replacement_counters_on_line.sql:28`

**Problema**

En la pantalla de contrato existen dos caminos para reemplazar una máquina:

1. El botón dentro de `ContractForm` ejecuta `replaceLine()`, que llama a `removeLine()` y `addLine()`.
2. El bloque inferior usa `ReplaceMachineModal` y la RPC atómica `replace_contract_machine`.

El primer flujo:

- retira la línea saliente sin `end_counter`;
- crea una línea nueva sin `start_counter`;
- no asigna `replaces_contract_machine_id`;
- no consolida el puesto de servicio;
- no hereda necesariamente las propiedades operativas;
- no registra un corte verificable del consumo.

**Escenario de fallo**

Un administrador usa el botón "Remplacer" dentro del formulario, guarda el contrato y factura el mes.

**Impacto**

- Dos forfaits para un único puesto.
- Consumo perdido o estimado en cero.
- Reemplazo no visible como reemplazo en factura.
- Ruptura de la política de negocio definida.

**Criterio de aceptación**

- Solo existe un flujo de reemplazo.
- Todo reemplazo utiliza una operación atómica con contadores de salida/entrada y encadenado.
- Un test E2E confirma un único forfait y consumo consolidado.

---

## P0-3. Contadores atribuidos por máquina física, no por línea/contrato/cliente

**Archivos:**

- `src/lib/invoicing.ts:168`
- `src/lib/invoicing.ts:169`
- `src/lib/invoicing.ts:176`
- `src/lib/invoicing.ts:194`
- `supabase/migrations/20260603210000_fase1_indices.sql:9`

**Problema**

`buildClientInvoiceDraft` carga y agrupa todos los contadores únicamente por `machine_id`. No filtra ni separa por:

- `machine_counters.contract_id`;
- `machine_counters.client_id`;
- intervalo de vigencia de la línea;
- día del relevé.

Además, solo puede existir un contador activo por máquina y mes.

**Escenario de fallo**

1. La máquina pertenece al cliente A hasta el día 10.
2. Se retira y reasigna al cliente B el día 11.
3. Existe un único relevé mensual tomado bajo B.
4. La facturación de A y B consulta el mismo contador físico.

**Impacto**

- Consumo cobrado al cliente incorrecto.
- Consumo duplicado o perdido.
- Imposibilidad de auditar correctamente una reasignación dentro del mes.

**Criterio de aceptación**

- Cada consumo queda inequívocamente atribuido a una línea contractual.
- Los escenarios de retirada y reasignación dentro del mismo mes generan importes correctos para ambos clientes.
- Se define una política explícita para los puntos de corte.

---

## P0-4. El primer mes de una línea normal puede perder permanentemente consumo

**Archivos:**

- `src/lib/invoicing.ts:102`
- `src/lib/invoicing.ts:107`
- `src/lib/invoicing.ts:121`

**Problema**

Si una línea empieza dentro del mes y no nació de un reemplazo, no tiene `start_counter`. Aunque exista una lectura final mensual, `initBw/initColor` quedan en `null` y la línea se marca estimada con delta cero.

El siguiente mes utiliza la lectura final anterior como base, por lo que el consumo inicial no se recupera posteriormente.

**Escenario de fallo**

- Máquina nueva empieza el día 1 con contador inicial 0.
- Lectura final del mes: 1.000.
- Primer mes: delta cero estimado.
- Segundo mes: base 1.000.

**Impacto**

Las primeras 1.000 copias nunca se facturan.

**Criterio de aceptación**

- Toda línea facturable tiene un punto inicial explícito o una regla de negocio documentada.
- Test automático para primer mes de máquina nueva, máquina usada y línea sin lectura inicial.

---

## P0-5. Facturas supuestamente inmutables pueden actualizarse y borrarse

**Archivos:**

- `supabase/migrations/20260606000100_invoices.sql:58`
- `supabase/migrations/20260606000100_invoices.sql:59`
- `supabase/migrations/20260606000100_invoices.sql:64`
- `supabase/migrations/20260606000100_invoices.sql:66`
- `supabase/migrations/20260606000100_invoices.sql:89`
- `supabase/migrations/20260606000100_invoices.sql:90`
- `src/app/admin/factures/[id]/actions.ts:9`

**Problema**

Las políticas de `invoices` e `invoice_lines` son `FOR ALL` para administradores. La base permite actualizar o eliminar:

- número;
- cliente;
- periodo;
- importes;
- emisor;
- líneas;
- tarifas snapshot.

Además, `invoice_lines.invoice_id` usa `ON DELETE CASCADE`.

La acción de anulación correcta no evita operaciones directas mediante la API Supabase.

**Impacto**

- Histórico contable alterable.
- Facturas y líneas eliminables sin trazabilidad.
- La promesa de snapshot inmutable no se cumple.

**Criterio de aceptación**

- Facturas emitidas solo pueden pasar a anuladas mediante una operación auditada.
- Líneas emitidas no pueden actualizarse ni borrarse.
- Tests RLS negativos verifican `UPDATE` y `DELETE`.

---

## P0-6. `update_contract_with_lines` puede modificar líneas de otro contrato

**Archivos:**

- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:144`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:146`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:188`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:191`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:204`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:205`
- `src/app/admin/contracts/[id]/actions.ts:51`

**Problema**

La RPC recibe IDs de líneas desde JSON y realiza búsquedas y actualizaciones por `id`, pero no exige `contract_id = p_contract_id`.

Esto afecta:

- comprobación de inmutabilidad de máquina;
- edición de líneas existentes;
- retirada de líneas.

**Escenario de fallo**

Un payload manipulado, formulario antiguo o error de UI incluye el UUID de una línea de otro contrato.

**Impacto**

- Corrupción cruzada de contratos/clientes.
- Cambio silencioso de tarifas, fechas y notas.
- Terminación accidental de una línea ajena.

**Criterio de aceptación**

- Toda operación valida pertenencia al contrato.
- La RPC falla de forma explícita ante IDs cruzados.
- Test negativo de corrupción cruzada.

---

## P0-7. Errores de consulta se convierten silenciosamente en estimaciones cero

**Archivos:**

- `src/lib/invoicing.ts:143`
- `src/lib/invoicing.ts:151`
- `src/lib/invoicing.ts:169`

**Problema**

Las consultas de cliente, líneas y contadores ignoran el campo `error`.

Si la consulta de contadores falla, `allCounters` puede quedar vacío. El sistema interpreta el fallo técnico como ausencia real de lecturas, muestra líneas estimadas y permite emitirlas con consumo variable cero.

**Impacto**

- Infrabilling por fallo técnico.
- Una factura corrupta puede parecer una estimación legítima.

**Criterio de aceptación**

- Todo error de consulta bloquea preview y emisión.
- Ausencia de dato y error técnico son estados diferentes.
- Test que simula fallo de consulta.

---

# P1 - Riesgos altos

## P1-1. La RPC de emisión no valida la coherencia contable del snapshot

**Archivos:**

- `supabase/migrations/20260606000100_invoices.sql:138`
- `supabase/migrations/20260606000100_invoices.sql:146`
- `supabase/migrations/20260606000100_invoices.sql:168`
- `supabase/migrations/20260606000200_machine_replacement.sql:183`

**Problema**

`emit_invoice` confía completamente en el JSON recibido. No verifica:

- que exista al menos una línea;
- que `invoice.total_amount = SUM(invoice_lines.amount_total)`;
- que cada `amount_total` sea la suma de sus componentes;
- que deltas e importes sean no negativos;
- que el cliente exista y coincida con las líneas;
- que `issued_by` corresponda al actor autenticado.

**Impacto**

Una ruta presente o futura con acceso `service_role` puede crear facturas transaccionalmente completas pero contablemente corruptas.

---

## P1-2. Emisión sin snapshot consistente

**Archivos:**

- `src/lib/invoicing.ts:151`
- `src/lib/invoicing.ts:169`
- `src/app/admin/facturation/actions.ts:20`
- `src/app/admin/facturation/actions.ts:28`

**Problema**

Las líneas, planes y contadores se leen en consultas separadas. Después se envía el JSON a una RPC que lo persiste sin volver a validar los datos de origen.

**Escenario**

Durante el cálculo, otro administrador cambia una tarifa, anula un contador o reemplaza una máquina.

**Impacto**

Factura construida con estados incompatibles y difícil de reproducir.

---

## P1-3. Retirada sin reemplazo puede cobrar consumo posterior a la retirada

**Archivos:**

- `src/lib/invoicing.ts:83`
- `src/lib/invoicing.ts:89`

**Problema**

Una línea retirada sin `end_counter` utiliza el relevé mensual de la máquina sin comprobar su día ni el contrato asociado.

**Escenario**

La línea termina el día 10 y la máquina se reasigna. El relevé mensual del día 31 incluye consumo del nuevo cliente.

**Impacto**

El antiguo cliente paga consumo posterior al fin del servicio.

---

## P1-4. Cambiar el cliente reasigna retroactivamente el historial del contrato

**Archivos:**

- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:154`
- `src/lib/invoicing.ts:160`
- `src/lib/invoicing.ts:163`

**Problema**

`update_contract_with_lines` permite cambiar `contracts.client_id`. Las líneas históricas siguen enlazadas al mismo contrato y pasan a aparecer bajo el nuevo cliente.

**Impacto**

- Facturación pendiente de meses pasados al cliente incorrecto.
- Cambio retroactivo de acceso e historial.

---

## P1-5. Tarifas mutables retroactivamente

**Archivos:**

- `src/app/admin/billing-plans/[id]/actions.ts:42`
- `src/app/admin/contracts/[id]/actions.ts:69`
- `src/lib/invoicing.ts:158`
- `src/lib/invoicing.ts:185`

**Problema**

No existe versionado ni vigencia temporal de planes y overrides. Al facturar posteriormente un mes pasado se usan los precios actuales.

**Impacto**

El mismo consumo histórico puede generar importes distintos dependiendo del día de emisión.

---

## P1-6. Contrato terminado o suspendido puede continuar facturándose

**Archivos:**

- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:55`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:80`
- `supabase/migrations/20260606000300_billing_in_contract_rpcs.sql:154`
- `src/lib/invoicing.ts:151`
- `src/lib/invoicing.ts:309`

**Problema**

Crear o actualizar un contrato con estado `terminé` no cierra automáticamente sus líneas. La facturación tampoco filtra por estado del contrato o de la línea.

**Impacto**

- Estados contradictorios.
- Líneas abiertas bloqueando máquinas.
- Posible facturación de servicios suspendidos o terminados.

**Nota de negocio**

Debe decidirse explícitamente cómo se factura un contrato suspendido. Actualmente la configuración visible no tiene efecto sobre el cálculo.

---

## P1-7. Reemplazo pierde propiedades operativas del puesto

**Archivo:**

- `supabase/migrations/20260607000100_replacement_counters_on_line.sql:101`

**Problema**

La línea entrante hereda plan y overrides de precio, pero no:

- `billing_day_override`;
- `maintenance_frequency_override`;
- `notes`.

**Impacto**

- Cambio silencioso del día de captura.
- Cambio de frecuencia de mantenimiento.
- Pérdida de instrucciones operativas.

---

## P1-8. Reemplazo puede dejar mantenimiento ligado a la máquina saliente

**Archivos:**

- `supabase/migrations/20260607000100_replacement_counters_on_line.sql:91`
- `supabase/migrations/20260604140000_close_maintenance_visit_rpc.sql:90`
- `supabase/functions/maintenance-cron/index.ts:53`

**Problema**

El reemplazo cierra y crea líneas contractuales, pero no migra ni cancela visitas futuras ligadas a la línea saliente. Al cerrar una visita, la siguiente puede seguir programándose sobre la línea antigua.

**Impacto**

Avisos y mantenimientos sobre una máquina retirada.

---

## P1-9. Migración N-máquinas falla ante contratos terminados

**Archivos:**

- `supabase/migrations/20260603120559_contracts_n_machines.sql:23`
- `supabase/migrations/20260603120559_contracts_n_machines.sql:45`

**Problema**

La migración copia `statut='terminé'` a `contract_machines`, pero no establece `date_fin`. Esto viola:

`statut <> 'terminé' OR date_fin IS NOT NULL`

**Impacto**

Una instalación/reconstrucción con cualquier contrato terminado aborta la migración.

---

# P2 - Riesgos medios y deuda técnica

## P2-1. Cálculo monetario con coma flotante

**Archivos:**

- `src/lib/billing.ts:46`
- `src/lib/billing.ts:90`
- `src/lib/billing.ts:95`

**Problema**

Los valores PostgreSQL `numeric` se convierten a `number` binario y se redondean con `Math.round`.

Ejemplo conocido:

```text
Math.round(1.005 * 100) === 100
```

El resultado decimal exacto sería `101` al redondear `100.5`.

**Impacto**

Diferencias repetibles de redondeo con determinadas tarifas decimales.

---

## P2-2. Validación incompleta de tramos JSON

**Archivos:**

- `src/lib/billing.ts:134`
- `src/app/admin/billing-plans/new/actions.ts:25`
- `src/app/admin/billing-plans/[id]/actions.ts:25`
- `supabase/migrations/20260606000000_billing_plans.sql:27`

**Problema**

`validateTiers` no verifica completamente:

- existencia y tipo de campos;
- `Number.isFinite`;
- límites enteros;
- precios numéricos reales;
- estructura JSON desde base de datos.

La BD solo exige `tiers IS NOT NULL`.

**Impacto**

Tarifas que facturan cero, producen `NaN` o se comportan de forma inesperada.

---

## P2-3. Periodos de factura insuficientemente validados

**Archivos:**

- `src/app/admin/facturation/actions.ts:15`
- `supabase/migrations/20260606000100_invoices.sql:39`

**Problema**

`client_id`, `year` y `month` se convierten con `Number()` sin validar enteros, finitud ni rango completo. La BD valida el mes, pero no el año.

**Impacto**

Facturas con periodos absurdos o inválidos mediante solicitudes manipuladas.

---

## P2-4. Borrado de contrato no atómico

**Archivos:**

- `src/app/admin/contracts/[id]/actions.ts:99`
- `src/app/admin/contracts/[id]/actions.ts:115`

**Problema**

`can_delete_contract` y el `DELETE` son operaciones separadas.

**Escenario**

Una dependencia se crea después de la comprobación y antes del borrado.

**Impacto**

El borrado en cascada puede eliminar datos recién creados o fallar de forma inesperada.

---

## P2-5. Cadena de reemplazos sin invariantes estructurales en BD

**Archivos:**

- `supabase/migrations/20260606000200_machine_replacement.sql:7`
- `src/lib/invoicing.ts:239`

**Problema**

No existe protección de BD contra:

- ciclos;
- bifurcaciones;
- enlaces entre contratos diferentes;
- múltiples líneas reemplazando la misma línea;
- pérdida de linaje por `ON DELETE SET NULL`.

El código evita bucles infinitos, pero no garantiza facturación correcta ante datos corruptos.

---

## P2-6. Desglose de reemplazo no persistido en la factura

**Archivos:**

- `src/lib/invoicing.ts:250`
- `src/lib/invoicing.ts:276`
- `supabase/migrations/20260606000100_invoices.sql:64`
- `supabase/migrations/20260606000200_machine_replacement.sql:193`

**Problema**

El preview calcula `breakdown` por máquina, pero `invoice_lines` no almacena dicho desglose y `emit_invoice` lo descarta.

**Impacto**

La factura emitida pierde la trazabilidad que justificaba el consumo consolidado.

---

## P2-7. `billing_day` no modifica la lógica de facturación

**Archivos:**

- `src/lib/invoicing.ts:151`
- `src/lib/invoicing.ts:309`
- `supabase/functions/princity-counters/index.ts:55`

**Problema**

`billing_day` controla cuándo se captura automáticamente el contador, pero la factura siempre calcula meses calendario completos y no utiliza el día configurado.

**Acción necesaria**

Confirmar si `billing_day` solo significa día de captura o define el ciclo de facturación. Documentar y probar la decisión.

---

## P2-8. Divergencia futura entre cálculos de contadores y facturación

**Archivo existente de deuda técnica:**

- `docs/deuda-divergencia-calculo-consumo.md`

**Problema**

`calcDeltas` y `computeLineConsumption` mantienen aritmética similar en funciones separadas. Una modificación futura puede hacer que la pantalla de contadores y la factura dejen de coincidir.

---

# Seguridad: observaciones adicionales

## Confirmado correctamente

- Las acciones de facturación y contratos revisadas llaman a `requireAdmin()`.
- Las RPC críticas usan `SECURITY DEFINER`.
- Las RPC críticas fijan `search_path`.
- `emit_invoice` y `replace_contract_machine` revocan ejecución a usuarios normales.
- `SUPABASE_SECRET_KEY` no se encontró expuesta directamente en cliente.

## Hardening pendiente

- Añadir una barrera explícita `server-only` al módulo del cliente administrador.
- Verificar permisos `CREATE` sobre el esquema `public` para reducir riesgos con funciones `SECURITY DEFINER`.
- Añadir tests RLS por rol:
  - `anon`;
  - cliente;
  - técnico;
  - admin;
  - service role.

---

# Cobertura de pruebas requerida

Actualmente el proyecto no tiene runner de tests ni archivos de test. Solo existen `typecheck`, `build` y validaciones manuales documentadas.

## Suite mínima bloqueante

### Migraciones

- Reconstrucción limpia desde cero.
- Migración con contratos activos, suspendidos y terminados.
- Verificación de grants y RLS tras aplicar todas las migraciones.

### Facturación

- Línea normal con historial previo.
- Primer mes de máquina nueva.
- Primer mes de máquina usada.
- Retirada sin reemplazo.
- Retirada y reasignación a otro cliente dentro del mismo mes.
- Reemplazo simple.
- Cadena A -> B -> C.
- Contrato suspendido y terminado.
- Plan plano, híbrido y por tramos.
- Tarifas con decimales problemáticos.
- Consulta de contadores fallida.
- Emisión concurrente.
- Cabecera igual a suma de líneas.
- Factura emitida no modificable ni eliminable.

### Contratos

- Payload con línea perteneciente a otro contrato.
- Cambio de cliente con historial existente.
- Terminación de contrato con líneas abiertas.
- Reemplazo con overrides operativos y visitas futuras.
- Borrado concurrente con creación de dependencias.

---

# Orden recomendado de corrección

1. Retirar el rollback destructivo del camino automático y probar reconstrucción limpia.
2. Eliminar el flujo alternativo de reemplazo.
3. Rediseñar la atribución de contadores por línea contractual y definir cortes de reasignación.
4. Resolver el primer mes de las líneas normales.
5. Hacer facturas realmente inmutables en BD.
6. Blindar pertenencia de líneas en `update_contract_with_lines`.
7. Bloquear emisión ante errores técnicos y validar coherencia del snapshot en la RPC.
8. Definir vigencia temporal de tarifas y política de cambio de cliente.
9. Alinear estados de contrato/línea, reemplazos y mantenimiento.
10. Añadir suite automatizada antes de publicar.

---

# Gate de publicación propuesto

La aplicación puede considerarse candidata a publicación cuando:

- todas las migraciones se reconstruyen desde cero;
- los P0 están resueltos;
- la factura emitida es inmutable salvo anulación auditada;
- una máquina reasignada dentro del mes factura correctamente a cada cliente;
- existe un único flujo de reemplazo;
- cabecera y líneas siempre cuadran por validación de BD;
- los tests mínimos anteriores pasan;
- se ejecuta un E2E final sobre datos sintéticos y se verifica su limpieza.

---

# Notas de la revisión

- Se usaron tres revisores paralelos especializados en facturación, contratos y seguridad/pruebas.
- Se contrastaron manualmente los flujos críticos y cambios recientes.
- `npm run typecheck` pasó sin errores.
- No se ejecutaron migraciones, operaciones destructivas ni escrituras sobre la base de datos.
- No se modificó código de aplicación durante esta auditoría.
