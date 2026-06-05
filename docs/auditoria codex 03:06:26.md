# Auditoria tecnica del refactor contratos N maquinas y contadores

Fecha: 2026-06-03  
Proyecto: AMD Service SAV  
Foco: robustez de base de datos, contratos, incidencias, contadores y efectos del refactor `contract_machines`.

## 1. Resumen ejecutivo

El refactor va en la direccion correcta: pasa el dominio desde `1 contrato = 1 maquina` a `1 contrato = N maquinas`, introduciendo `contract_machines` como linea historica contrato-maquina. La base de datos ya tiene guardrails importantes:

- `contract_machines_one_open_per_machine`: una maquina solo puede tener una linea abierta.
- `date_fin >= date_debut`.
- `statut='termine'` exige `date_fin`.
- `incidents` tiene XOR entre `contract_machine_id` y `machine_id`.
- RLS nueva para clientes sobre `contract_machine_id`.

Pero el sistema no esta todavia completamente migrado a nivel de aplicacion. Hay lecturas y flujos que siguen usando `contracts.machine_id`, `incidents.contract_id` o `incidents.machine_id`. En datos nuevos creados despues del refactor, las incidencias internas se guardan con `contract_machine_id` y `machine_id=NULL`, por lo que esas pantallas quedan incompletas o directamente incorrectas.

Riesgos mas importantes:

1. **Contadores sin unicidad real en BD.** La app verifica duplicados antes de insertar, pero no existe indice unico parcial para `(machine_id, year, month) WHERE status='actif'`. Dos escrituras concurrentes pueden crear dos relevés activos.
2. **Creacion/actualizacion de contratos no atomica.** Se insertan/actualizan contrato y lineas en varias operaciones PostgREST sin transaccion. Un fallo intermedio puede dejar contrato sin lineas o cabecera actualizada con lineas antiguas.
3. **CSAT roto para incidencias nuevas.** `sendCsatForIncident` busca `incident.contract_id`; las incidencias nuevas no lo rellenan.
4. **Listados de incidencias muestran datos incompletos.** Admin y portal siguen mostrando `machine_id`, que es `NULL` para incidencias internas nuevas.
5. **Contadores y mantenimiento conservan lecturas legacy.** Algunas pantallas siguen uniendo `machines -> contracts` o `maintenance_plans -> contracts -> machines`, incompatible con N maquinas por contrato.
6. **Formulario publico de contacto no persiste ni envia.** Valida y devuelve exito, pero no guarda lead ni manda email.

El core de negocio deberia endurecerse en BD antes de crecer con datos reales: contratos, lineas de contrato, contadores y rutas de facturacion necesitan invariantes transaccionales en Postgres, no solo validaciones en UI.

## 2. Modelo antes y despues

### Antes

En `supabase/migrations/20260508200752_initial_sav_schema.sql`:

- Lineas 53-63: `contracts` tenia `machine_id NOT NULL`, por tanto cada contrato apuntaba a una maquina.
- Lineas 79-96: `incidents` tenia `contract_id NOT NULL` y `machine_id NOT NULL`.

Ese modelo obligaba a representar un contrato fisico con muchas maquinas como muchos contratos logicos, lo que era mala base para facturacion, mantenimiento y soporte.

### Despues

En `supabase/migrations/20260603120559_contracts_n_machines.sql`:

- Lineas 12-25: se crea `contract_machines`.
- Lineas 29-31: indice unico parcial por maquina abierta.
- Lineas 50-55: `incidents.contract_machine_id` nuevo y `incidents.machine_id` pasa a nullable.
- Lineas 95-97: XOR entre `contract_machine_id` y `machine_id`.

Regla resultante:

- Incidencia interna: `contract_machine_id NOT NULL`, `machine_id NULL`.
- Incidencia publica via QR: `contract_machine_id NULL`, `machine_id NOT NULL`.

Esta decision es limpia a nivel de identidad, pero exige migrar todas las lecturas a `contract_machines`.

## 3. Analisis linea por linea del refactor SQL

### `20260603120559_contracts_n_machines.sql`

- L1-L4: documenta coexistencia con columnas legacy. Correcto como estrategia de rollout, pero exige inventario estricto de dependencias antes del cleanup.
- L6: transaccion global. Bien.
- L8-L9: enum nuevo `contract_machine_status`. Correcto, aunque duplica valores de `contract_status`; es aceptable porque el estado de contrato y de linea son conceptos distintos.
- L12-L15: `contract_machines` tiene FK fuerte a contrato y maquina. `ON DELETE CASCADE` para contrato y `ON DELETE RESTRICT` para maquina son adecuados: borrar contrato borra lineas, pero no se borra una maquina con historia.
- L16-L18: `date_debut`, `date_fin`, `statut`. Bien.
- L19: `billing_day_override`. Bien para contadores por maquina, pero no esta usado por `princity-counters`.
- L20: `maintenance_frequency_override`. Bien en modelo, pero hoy mantenimiento no lo consume.
- L23: check temporal. Bien.
- L24: `termine` exige fecha fin. Bien.
- L29-L31: indice unico parcial. Es uno de los puntos mas fuertes del refactor: evita dos contratos abiertos para una maquina.
- L33-L34: indices por contrato y maquina. Bien.
- L36: RLS activada. Bien.
- L38-L40: `contracts.maintenance_frequency`. Conceptualmente correcto como default de contrato.
- L45-L48: migracion desde contratos legacy. Correcta para datos existentes 1:1.
- L51-L55: `contract_machine_id` y `machine_id DROP NOT NULL`. Necesario para XOR.
- L58-L63: migra incidencias internas por `contract_id + machine_id`. Correcto para datos existentes, pero depende de que no hubiera inconsistencia previa.
- L67-L69: pone `machine_id=NULL` en incidencias internas. Correcto segun diseno, pero es el origen de varios bugs de lectura posteriores.
- L78-L85: aborta si quedan incidencias internas sin linea. Bien.
- L87-L92: valida conteo contratos con maquina vs lineas creadas. Bien para migracion inicial, aunque no prueba estado ni unicidad semantica de cliente.
- L96-L97: XOR. Muy buen guardrail.
- L100-L106: `auth_client_contract_machine_ids`. Correcto, deriva de contratos del cliente.
- L108-L115: `auth_tech_contract_machine_ids`. Deriva de incidencias asignadas. Correcto para soporte, pero solo da visibilidad al tecnico si ya tiene una incidencia asignada.
- L118-L126: `auth_client_machine_ids` migra a lineas activas. Correcto.
- L129-L135: `auth_tech_assigned_machine_ids`. Correcto para RLS de maquinas.
- L137-L144: permisos de funciones. Se revoca y luego se concede a `authenticated`. Esto parece contradictorio solo visualmente; el estado final permite uso desde politicas RLS. Aun asi, conviene confirmar con Supabase advisors si expone RPC invocable directamente por usuarios. Si no se quiere invocacion directa, usar `GRANT` minimo que las politicas necesiten.
- L147-L154: politicas de `contract_machines`. Correctas para SELECT cliente/tecnico y ALL admin.
- L159-L165: RLS de incidencias cliente pasa a `contract_machine_id`. Correcto para incidencias internas nuevas.
- L167-L168: se asume que tech policies no cambian. Parcialmente cierto para `incidents`, pero no para todas las funciones auxiliares legacy.

### `20260603170237_fix_tech_machines_select_for_n_machines.sql`

- L1-L4: identifica bien el bug: `auth_tech_incident_machine_ids()` lee `incidents.machine_id`, ahora `NULL`.
- L8-L11: recrea `tech_machines_select` usando `auth_tech_assigned_machine_ids()`. Correcto a nivel RLS.
- Riesgo restante: la pagina `/tech/machines` sigue leyendo `incidents.machine_id` desde la app, aunque RLS ya permita ver maquinas.

### `20260603172246_drop_not_null_contracts_machine_id.sql`

- L7: `contracts.machine_id` pasa a nullable. Necesario porque `createContractAction` ya no lo rellena.
- Riesgo: mientras existan lecturas legacy de `contracts.machine_id`, los contratos nuevos apareceran sin maquina.

### `20260603120856_contracts_n_machines_rollback.sql`

- L4: reconoce perdida de cardinalidad en rollback si hay varias lineas.
- L14-L18: restaura solo linea activa por contrato. En contratos con varias maquinas activas, un solo `contracts.machine_id` no puede representar la realidad.
- L21-L24: restaura `incidents.contract_id` y `machine_id` desde linea. Correcto para rollback parcial.
- L58-L59: elimina tabla y enum. Bien como emergencia, no como rollback sin perdida.

## 4. Analisis de contratos en aplicacion

### Crear contrato: `src/app/admin/contracts/new/actions.ts`

- L23-L30: parseo de cabecera. Correcto.
- L32-L38: validacion de campos y `billing_day`. Bien.
- L40-L47: `lines` llega serializado como JSON desde un hidden input. Funciona, pero es mas fragil que campos form normales y depende de no manipular el payload.
- L48-L59: exige al menos una maquina y valida campos basicos. Falta validar duplicados dentro del array en servidor.
- L61-L74: inserta cabecera `contracts`.
- L82-L93: inserta lineas.
- L95-L112: si fallan lineas, intenta rollback manual borrando contrato.

Riesgo:

- No hay transaccion real entre cabecera y lineas. Si falla el borrado de rollback, queda contrato huerfano.
- El mensaje L103-L105 reconoce este estado posible: "contrat cree sans machines".
- Recomendacion: mover creacion a una RPC `create_contract_with_lines(...) SECURITY DEFINER`, con validaciones e insercion atomica en una unica transaccion Postgres.

### Editar contrato: `src/app/admin/contracts/[id]/actions.ts`

- L33-L40: actualiza cabecera antes de tocar lineas.
- L47-L63: parsea lineas JSON.
- L65-L72: carga solo lineas abiertas existentes. Bien para no reabrir historicas.
- L75-L92: inserta lineas nuevas.
- L94-L117: upsert de lineas existentes.
- L119-L132: "retire" de lineas eliminadas, cerrandolas con fecha de hoy.

Riesgos:

- No hay transaccion: cabecera, inserts, upserts y retiros pueden quedar parcialmente aplicados.
- L73: `desiredIds` ignora lineas nuevas sin id. Correcto.
- L78-L86: no valida que `date_debut` de una nueva linea sea coherente con fecha contrato o con historial previo.
- L95-L107: `upsert` permite cambiar `machine_id` de una linea existente. Eso puede mutar historia. Mejor: no permitir cambiar `machine_id` de una linea existente; para rotacion, cerrar linea y abrir otra.
- L124-L127: retiro masivo usa fecha de hoy, no una fecha de fin elegida por admin. Para contratos y contadores, la fecha de fin real importa.
- L137-L141: borrar contrato hace `DELETE` directo. Como `contract_machines` es cascade, se borra historia de lineas. Puede ser aceptable para errores de carga, pero peligroso si hay contadores/incidencias.

Recomendacion:

- Crear RPC `update_contract_with_lines(...)` atomica.
- Bloquear cambios de `machine_id` en lineas existentes.
- Distinguir "retirar maquina" con fecha de fin explicita de "eliminar contrato".
- Antes de borrar contrato, impedir si hay incidencias, contadores o mantenimiento.

### Formulario de contrato: `src/components/admin/ContractForm.tsx`

- L71: inicializa una linea vacia si no hay `initialLines`.
- L85-L86: evita duplicados en UI.
- L143-L144: serializa lineas en hidden input. Necesita validacion equivalente en servidor.
- L286-L289: mensaje de "todas asignadas" solo si `availableMachines.length===0 && lines.length===0`; en creacion siempre hay una linea vacia, por lo que puede no mostrarse cuando no hay maquinas.
- L326-L342: selector de maquina. Correcto para UI, pero el servidor debe seguir siendo autoridad.
- L364-L375: override de billing day. Bien, pero no usado por Princity.
- L381-L392: override de frecuencia. Bien, pero mantenimiento no lo usa.

## 5. Analisis de incidencias

### Crear incidencia admin: `src/app/admin/incidents/new/actions.ts`

- L16-L19: exige `contract_machine_id`.
- L22-L26: valida que la linea exista.
- L38-L50: inserta incidencia con `contract_machine_id`, `machine_id: null`, sin `contract_id`.

Correcto para el modelo nuevo. El problema no esta aqui, sino en lecturas legacy posteriores.

### Crear incidencia portal: `src/app/portal/incidents/new/actions.ts`

- L18-L21: exige `contract_machine_id`.
- L29-L33: RLS valida que la linea sea del cliente.
- L37-L47: inserta `contract_machine_id`, `machine_id: null`, `source: null`.

Correcto.

### Listado admin: `src/app/admin/incidents/page.tsx`

- L43-L45: selecciona `machine_id`, `contract_id`, `contracts(...)`.
- L53-L57: filtro cliente usa `contract_id`.
- L67-L78: mapea `machine_id` y cliente desde `contracts`.

Bug:

- Incidencias nuevas no tienen `machine_id` ni `contract_id`. Resultado: maquina y cliente en blanco; filtro por cliente no las encuentra.

Recomendacion:

- Seleccionar `contract_machine_id, contract_machines(machine_id, machines(...), contracts(client_id, clients(...)))`.
- Mantener fallback para publicas/legacy con `machine_id`.
- Agregar indice en `incidents(contract_machine_id)`.

### Detalle admin: `src/app/admin/incidents/[id]/page.tsx`

- L39-L46: solo resuelve contexto por `incident.contract_id`.
- L51-L55: si no hay contrato, usa `incident.machine_id`.

Bug:

- Incidencias internas nuevas tienen `contract_machine_id` y `machine_id=NULL`, por lo que el contexto queda vacio.

### CSAT: `src/lib/csat.ts`

- L18-L24: busca `contract_id` y retorna si no existe.

Bug critico:

- Incidencias nuevas no tienen `contract_id`; no se envia CSAT ni se cierra automaticamente tras envio.

Recomendacion:

- Resolver cliente por `contract_machine_id -> contract_machines -> contracts.client_id`.
- Dejar fallback legacy por `contract_id`.

### Portal incidencias

`src/app/portal/incidents/page.tsx`:

- L57-L64: carga lineas activas correctamente.
- L68-L76: consulta nuevas por `contract_machine_id` y legacy por `machine_id`.
- L122: muestra `inc.machine_id`, que sera `NULL` para nuevas.

Funcionalmente lista, pero visualmente incompleta.

`src/app/portal/incidents/[id]/page.tsx`:

- L60-L69: resuelve detalle por `contract_machine_id`. Correcto.
- L70-L78: fallback por `machine_id`. Correcto.

Esta pantalla esta mucho mejor adaptada al modelo nuevo.

## 6. Analisis de contadores

### Esquema: `20260510154130_create_machine_counters.sql`

- L2-L20: tabla `machine_counters`.
- L4-L6: guarda maquina, contrato y cliente historicos. Correcto.
- L7-L10: checks basicos. Correcto.
- L11: `status` permite `actif` o `annule`. Bien para inmutabilidad logica.
- L29-L31: indices simples.

Falta critica:

- No existe `UNIQUE (machine_id, year, month) WHERE status='actif'`.
- La documentacion dice idempotencia por `(machine_id, year, month, status='actif')`, pero la BD no lo garantiza.

### Guardado manual: `src/app/admin/contadores/[serie]/actions.ts`

- L29-L39: verifica si existe relevé activo.
- L41-L53: captura contrato/cliente actual via `getOpenLineForMachine`. Correcto para modelo nuevo.
- L55-L68: inserta contador historico.

Riesgo:

- La verificacion L29-L39 no es segura contra concurrencia. Si dos requests pasan la verificacion antes de insertar, ambos insertan.
- Tambien puede competir con `princity-counters`.

Recomendacion BD:

```sql
CREATE UNIQUE INDEX machine_counters_one_active_per_month
  ON public.machine_counters (machine_id, year, month)
  WHERE status = 'actif';
```

Y manejar `23505` en manual y Princity.

### Pantalla detalle contador: `src/app/admin/contadores/[serie]/page.tsx`

- L86-L91: obtiene contrato activo con `.from('contracts').eq('machine_id', numero_serie)`.

Bug:

- Para contratos nuevos, `contracts.machine_id` es `NULL`. La tarjeta de contrato/cliente quedara vacia.

Recomendacion:

- Usar `getOpenLineForMachine()` y luego `contracts`.

### Pantalla agrupada: `src/app/admin/contadores/page.tsx`

- L58-L62: carga maquinas con `contracts(statut, client_id, clients(...))`.
- L92-L106: busca contrato activo desde ese join legacy.

Bug:

- Las maquinas de contratos nuevos no se agrupan bajo cliente porque `contracts.machine_id` ya no representa la relacion.

Recomendacion:

- Construir el listado desde `contract_machines` abiertas y activas, con join a `contracts.clients` y `machines`.
- Incluir maquinas activas sin contrato en grupo "Sin cliente" mediante query separada.

### Pantalla cliente contador: `src/app/admin/contadores/cliente/[clientId]/page.tsx`

- L38-L44: usa `contract_machines` con `contracts!inner(client_id)`. Correcto.
- L56-L65: carga contadores activos. Correcto.

Esta parte esta alineada con el modelo nuevo.

## 7. Princity y automatizacion

### `supabase/functions/princity-counters/index.ts`

- L21-L40: carga lineas abiertas desde `contract_machines`, contratos activos y maquinas con `princity_device_id`. Bien.
- L52-L55: usa `contracts.billing_day`, no `contract_machines.billing_day_override`.
- L83-L91: idempotencia por consulta previa.
- L97-L109: inserta contador.
- L117-L122: aprende `contracts.billing_day`.

Riesgos:

- No respeta `billing_day_override`.
- Idempotencia no esta garantizada en BD.
- Si una maquina cambia de contrato en el mismo mes, el contador queda vinculado al contrato abierto en el momento del cron. Eso puede ser correcto si la lectura es mensual de cierre, pero debe definirse formalmente.
- No filtra `contract_machines.statut='actif'`, solo `date_fin IS NULL` y contrato activo. Una linea suspendida pero abierta podria importar contador.

Recomendaciones:

- Resolver `effective_billing_day = line.billing_day_override ?? contract.billing_day`.
- Filtrar `contract_machines.statut='actif'`.
- Crear indice unico parcial de contadores.
- Considerar guardar `contract_machine_id` en `machine_counters` para trazar la linea exacta, no solo contrato.

### `supabase/functions/princity-alerts/index.ts`

- L64-L70: busca linea abierta por maquina.
- L103-L105: inserta incidencia con `contract_machine_id` y tambien `contract_id` legacy.

Riesgos:

- Si el cleanup elimina `incidents.contract_id`, esta function debe actualizarse antes.
- No filtra `openLine.statut='actif'`.
- Si hay una linea suspendida abierta, creara incidencia interna asociada.

### `supabase/functions/princity-sync/index.ts`

- L61-L111: import inicial crea clientes y maquinas, pero no contratos ni lineas.
- L121-L185: sync normal crea nuevos clientes/maquinas y notifica para vincular manualmente.

Esto encaja con el modelo nuevo: Princity descubre, AMD vincula manualmente en contratos.

### `supabase/functions/maintenance-cron/index.ts`

- L56-L66: notificaciones de visitas aun leen `contracts -> machines`.

Bug conceptual:

- `maintenance_plans` sigue siendo 1 por contrato, pero `maintenance_visits` no tiene maquina/linea concreta. En un contrato de 14 maquinas, no se sabe que maquina se visita/cierra.

## 8. Mantenimiento preventivo

El schema original `20260511145143_maintenance_system.sql` define:

- L3-L11: `maintenance_plans` con `UNIQUE(contract_id)`.
- L14-L25: `maintenance_visits` solo tiene `plan_id`, no `machine_id` ni `contract_machine_id`.

Esto era suficiente con 1 contrato = 1 maquina. Tras N maquinas, ya no.

Sintomas:

- La app tecnico y agenda enlazan mantenimiento a una maquina via `contracts.machines`, que es legacy.
- El cierre de mantenimiento compara `serie` contra `contract.machines.numero_serie`. Con contratos nuevos, esa relacion no existe.

Decision necesaria:

1. Si el mantenimiento se planifica por contrato/sede, la visita deberia poder cubrir varias lineas y registrar maquinas revisadas.
2. Si el mantenimiento se planifica por maquina, `maintenance_visits` necesita `contract_machine_id`.

Para robustez operativa recomiendo opcion 2 en esta fase: `maintenance_visits.contract_machine_id NULL` migrado gradualmente. Luego se puede agrupar por contrato en UI.

## 9. Seguridad y RLS

Fortalezas:

- `service_role` solo en servidor/Edge Functions.
- Helpers SECURITY DEFINER para evitar recursion RLS.
- RLS de cliente sobre `contract_machine_id` protege nuevas incidencias.
- `verifyContractAction` compara email del cliente antes de vincular cuenta.

Riesgos:

- Funciones legacy `auth_tech_incident_contract_ids`, `auth_tech_incident_machine_ids`, `auth_tech_assigned_client_ids` siguen basadas en `incidents.contract_id` o `incidents.machine_id`.
- Algunas paginas usan admin client para flows concretos; hay que mantener inventario.
- RPCs legacy `create_client_with_contract` y `create_machine_with_contract` aun insertan `contracts.machine_id` y no crean `contract_machines`. Estan protegidas para `service_role`, pero si algun job externo las usa, generan datos mixtos.

## 10. Hallazgos por severidad

### Critico

1. `machine_counters` no tiene unicidad parcial de contador activo por mes.
2. Creacion/actualizacion de contratos no es atomica.
3. CSAT no funciona para incidencias nuevas.
4. Mantenimiento preventivo no identifica maquina en contratos N maquinas.
5. Formulario publico `/api/contact` devuelve exito sin guardar ni enviar.

### Alto

6. Admin incidencias usa `contract_id`/`machine_id` legacy.
7. Detalle admin incidencia no resuelve `contract_machine_id`.
8. `/admin/contadores` y detalle contador usan relacion legacy con `contracts.machine_id`.
9. `princity-counters` no usa `billing_day_override` ni `contract_machines.statut`.
10. `princity-alerts` sigue insertando `contract_id` legacy.

### Medio

11. `getOpenLineForMachine()` devuelve `null` en error y oculta fallos de DB como si no hubiera linea.
12. `ContractForm` serializa lineas en JSON hidden; requiere validacion server fuerte.
13. Edicion de contrato permite mutar `machine_id` de una linea existente.
14. Borrado de contrato puede borrar historia de lineas.
15. Portal lista incidencias nuevas pero muestra maquina vacia.

## 11. Recomendaciones de endurecimiento

### Fase 1: hotfixes de datos core

1. Crear indice unico parcial:

```sql
CREATE UNIQUE INDEX machine_counters_one_active_per_month
ON public.machine_counters (machine_id, year, month)
WHERE status = 'actif';
```

2. Crear indices:

```sql
CREATE INDEX incidents_contract_machine_id_idx ON public.incidents(contract_machine_id);
CREATE INDEX contract_machines_open_active_idx
  ON public.contract_machines(contract_id, machine_id)
  WHERE date_fin IS NULL AND statut = 'actif';
```

3. Actualizar `sendCsatForIncident` para `contract_machine_id`.
4. Actualizar admin incidencias y contador principal a `contract_machines`.
5. Actualizar `princity-counters` para `billing_day_override` y `statut='actif'`.

### Fase 2: transacciones Postgres

Crear RPC atomicas:

- `create_contract_with_lines(payload jsonb)`
- `update_contract_with_lines(contract_id uuid, payload jsonb)`
- opcional: `record_machine_counter(...)`

Estas RPC deben:

- validar duplicados internos;
- validar lineas abiertas por maquina;
- insertar cabecera y lineas en una unica transaccion;
- devolver errores claros (`machine_already_assigned`, `invalid_billing_day`, etc.);
- impedir mutar `machine_id` de lineas existentes.

### Fase 3: mantenimiento

Agregar `contract_machine_id` a `maintenance_visits` o tabla puente `maintenance_visit_machines`.

Recomendacion inicial:

```sql
ALTER TABLE public.maintenance_visits
  ADD COLUMN contract_machine_id uuid NULL REFERENCES public.contract_machines(id);

CREATE INDEX maintenance_visits_contract_machine_id_idx
  ON public.maintenance_visits(contract_machine_id);
```

Luego:

- al crear plan/visita, generar visitas por linea activa o permitir seleccion;
- al escanear QR, buscar visitas por `contract_machine_id`;
- al cerrar, validar que la visita corresponde a la linea de la maquina.

### Fase 4: cleanup seguro

No ejecutar cleanup de columnas legacy hasta que `rg` no encuentre usos operativos de:

- `incidents.contract_id`
- `contracts.machine_id`
- joins `contracts(... machines (...))`

Antes del cleanup:

- actualizar Edge Functions;
- actualizar `src/lib/supabase/types.ts`;
- correr build/typecheck;
- smoke test manual admin, portal, tech, Princity, contadores.

## 12. Checklist de pruebas manuales

Contratos:

- Crear contrato con 2 maquinas.
- Intentar crear otro contrato con una maquina ya abierta: debe fallar.
- Retirar una maquina y asignarla a otro contrato con fecha coherente.
- Confirmar que historico de lineas se conserva.

Incidencias:

- Crear incidencia admin sobre maquina de contrato multi-maquina.
- Verla en listado admin con cliente y maquina correctos.
- Filtrar por cliente.
- Asignar tecnico, mover Kanban a `resolu`, confirmar CSAT.
- Crear incidencia portal y verla en admin/portal/tech.

Contadores:

- Crear relevé manual.
- Intentar duplicado manual mismo mes: debe fallar por BD.
- Simular import Princity mismo mes: debe recibir `23505` y no duplicar.
- Confirmar agrupacion `/admin/contadores` por cliente usando contratos nuevos.
- Confirmar detalle de maquina muestra contrato activo correcto.

Princity:

- `princity-counters` solo procesa lineas `statut='actif'`.
- Respeta `billing_day_override`.
- `princity-alerts` crea incidencia con contexto visible en admin.

Mantenimiento:

- Crear plan para contrato con varias maquinas.
- Ver si cada visita tiene maquina definida.
- Escanear QR de maquina A: no debe permitir cerrar visita de maquina B.

## 13. Veredicto

El refactor es correcto como cambio de dominio, pero esta en una fase intermedia. La base nueva (`contract_machines`) es buena, pero el sistema todavia no esta completamente robusto para que contratos y contadores sean el core operacional sin riesgo.

Antes de cargar datos reales grandes o hacer el cleanup legacy, conviene cerrar los huecos de invariantes en BD y migrar todas las lecturas core. La prioridad maxima debe ser: unicidad de contadores, transacciones para contratos, CSAT por `contract_machine_id`, listados admin y mantenimiento por maquina.
