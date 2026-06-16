# Historial de piezas/tóner por máquina + detección de anomalías

> **Fecha:** 2026-06-15
> **Estado:** ✅ **Validado (2026-06-16).** Fase 0 en implementación (rama `feat/historial-piezas-fase0`).
> **Tipo:** Feature multi-fase (modelo de datos + UI + agente)
> **Decisiones del cliente:** referencia de rendimiento = **mezcla** (specs del fabricante cuando existan, aprendizaje del histórico si no); alcance = **diseño completo por fases**; **añadir dos piezas al catálogo: `ADF` y `Poubelle Transfer`**.

---

## 1. Objetivo

Dar a cada máquina un **historial fiable de piezas y consumibles (tóner) cambiados** y, sobre esa base, un **agente que detecte comportamientos anómalos** cruzando el consumo real (nº de copias) con el consumo de consumibles/piezas.

Casos de uso que debe habilitar:

- **Preventivo:** "esta máquina lleva 200.000 copias y nunca se le ha cambiado el tambor → toca cambiarlo / revisar."
- **Anomalía:** "se ha cambiado el tóner negro 5 veces este mes pero solo hizo 3.000 copias → avería, fuga o tóner defectuoso."
- **Comparación:** "esta máquina consume el doble de tóner que otras del mismo modelo a igualdad de copias."

**Principio rector:** integración real, no parche. Una sola fuente de verdad lógica, sin duplicar datos, reutilizando los flujos y patrones que ya existen (formulario de intervención, cierre de mantenimiento, semáforos del OCR de contadores).

---

## 2. Estado actual (verificado en código)

### 2.1. Dónde se registran HOY los cambios de pieza — están en **dos** tablas

| Flujo | Ruta | Tabla | ¿Cantidad? | ¿Texto libre? |
|---|---|---|---|---|
| Avería / incidencia | `/tech/incidents/[id]` → `submitInterventionAction` | `incident_parts` (`incident_id`, `part_id`) | ❌ **No** | `incidents.autres_pieces` (texto suelto, no estructurado) |
| Mantenimiento preventivo | `/tech/scan/[serie]/maintenance/[visitId]` → RPC `close_maintenance_visit` | `maintenance_parts` (`visit_id`, `part_id` nullable, `description`, `quantity`) | ✅ Sí | ✅ Sí (`description`) |

**Consecuencia clave:** cualquier solución que mire solo una de las dos tablas tiene el historial cojo. Además, las dos tablas **no son homogéneas** (una tiene cantidad, la otra no), lo que rompería las comparaciones del agente.

### 2.2. Contadores de copias (ya existe)

- Tabla `machine_counters`: `machine_id`, `year`, `month`, `day`, `counter_bw`, `counter_color`, `recorded_at`, `status` ('actif'/'annule'), `is_replacement_start`, `previous_machine_id`.
- `src/lib/counters.ts` → `calcDeltas()` / `counterDelta()`: calculan el consumo (delta) entre lecturas consecutivas y **ya saltan** las lecturas marcadas `is_replacement_start` (cambio de máquina). Reutilizable tal cual.

### 2.3. Relación máquina ↔ cambio de pieza

- Incidencia → máquina: **XOR** entre `incidents.machine_id` (públicas, directo a `machines.numero_serie`) y `incidents.contract_machine_id` (internas → `contract_machines.machine_id`).
- Visita de mantenimiento → máquina: `maintenance_visits.contract_machine_id` → `contract_machines.machine_id`.
- `parts`: catálogo fijo de 12 piezas; los tóner son ids 7-10 (`Toner BK/C/M/Y`). El tóner **es una pieza más**, no se gestiona aparte.

### 2.4. Patrón reutilizable ya en producción

El OCR de contadores (`pending_counter_imports`) usa **semáforos 🟢🟡🔴** + cola de revisión humana en `/admin/contadores/pendientes`. El agente de anomalías debe **reutilizar este mismo patrón y lenguaje UX**, no inventar uno nuevo.

---

## 3. Diseño

### Principios

1. **Una sola fuente de verdad, sin duplicar.** No se crea una tabla que copie los cambios de pieza (se desincronizaría). Se crea una **vista** que une las dos tablas existentes. La verdad sigue donde el técnico la mete.

> #### ¿Por qué dos tablas físicas pero una sola vista? (decisión de diseño)
>
> Una pregunta natural es: *¿no sería más simple una única tabla de piezas?* La respuesta separa **dónde se escribe** de **dónde se lee**:
>
> - **Escritura — se mantienen las dos tablas** (`incident_parts` y `maintenance_parts`). Cada una está anclada a su proceso y a su "dueño" mediante una FK fuerte: las piezas de avería cuelgan de `incidents` (con `ON DELETE CASCADE`), las de mantenimiento cuelgan de `maintenance_visits`. Esto garantiza integridad referencial real y limpieza automática. Fusionarlas obligaría a un patrón de FK polimórfica (`source_type` + `source_id` sin FK), que **renuncia a la integridad referencial** y a los borrados en cascada — justo lo contrario de un diseño robusto. Además ambas ya están en producción con sus RLS y tests; fusionarlas es un refactor grande y arriesgado de bajo retorno.
> - **Lectura — una sola "tabla" lógica:** la vista `v_machine_parts_history` (Fase 1). El historial y el agente consultan un único punto y no necesitan saber que por debajo hay dos orígenes.
>
> Resultado: la simplicidad de "una sola tabla" donde importa (consultar), con la solidez de cada registro anclado a su proceso (escribir).
2. **Homogeneizar el modelo** antes de construir encima: que ambos flujos guarden *cantidad*.
3. **Integrar en la ficha de máquina**, no en un módulo aislado.
4. **El agente reutiliza el patrón de semáforos + cola de revisión** del OCR.

---

### Fase 0 — Cimientos: homogeneizar el modelo de piezas + ampliar catálogo

**Objetivo:** que averías y mantenimiento guarden la misma información, con cantidad, y añadir las dos piezas que faltan.

1. **Migración** (`20260616094356_parts_quantity_and_new_parts.sql`):
   - `incident_parts.quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0)`. `DEFAULT 1` deja los registros históricos coherentes (1 unidad por pieza marcada).
   - **Dos piezas nuevas en `parts`** con id explícito (la PK es `GENERATED BY DEFAULT`, lo permite) + `setval` para resincronizar la secuencia:
     - `13 → ADF`
     - `14 → Poubelle Transfer`

2. **Fuente única de la lista en cliente** (`src/lib/parts.ts`): la constante `PARTS` estaba **triplicada** (`intervention-form.tsx`, `actions.ts`, `MaintenanceVisitForm.tsx`). Se centraliza en un módulo único que todos importan, evitando que el catálogo se desincronice. Las dos piezas nuevas se añaden una sola vez aquí.

3. **UI técnico** (`intervention-form.tsx`): junto a cada pieza, input numérico de cantidad (default 1, `min=1`). Se precarga con la cantidad ya registrada al reabrir. `MaintenanceVisitForm.tsx` pasa a importar la lista central (las piezas nuevas aparecen automáticamente). El filtro server-side del mantenimiento (`maintenance/[visitId]/actions.ts`) deriva ahora `PART_IDS` de la lista central en vez de hardcodear `[1..12]` — si no, las piezas 13/14 marcadas en una visita se perderían en silencio (detectado en code-review).

   > **Limitación conocida (no regresión):** el cierre de mantenimiento sigue guardando `quantity = 1` por pieza (el RPC `close_maintenance_visit` no recibe cantidades). Añadir input de cantidad al formulario de mantenimiento queda fuera del alcance de la Fase 0 (requiere tocar el RPC). Ver pregunta abierta #5.

4. **Server action** (`submitInterventionAction`): captura y persiste `quantity` por pieza. El reemplazo del set se hace de forma **atómica vía RPC `set_incident_parts(p_incident_id, p_parts jsonb)`** (`SECURITY INVOKER`, respeta la RLS del técnico) — borra y reinserta en una sola transacción, de modo que un fallo en la inserción no deja la incidencia sin piezas, y desmarcar todas vacía la lista. Sustituye al `delete()+insert()` no transaccional que detectó el code-review. Migración `20260616101329_set_incident_parts_rpc.sql`. Cubierto por `tests/rls/incident-parts-isolation.test.ts` (aislamiento por rol + cantidad + pieza nueva).

5. **Carga previa** (`page.tsx`): `checkedParts` pasa de `Set<number>` a `Map<number, number>` (part_id → cantidad).

6. **Tipos**: `incident_parts` en `src/lib/supabase/types.ts` actualizado con `quantity` (Row/Insert/Update). Regenerar contra prod tras desplegar la migración.

7. **Fecha de cambio — convención explícita y documentada (para Fase 1):**
   - Avería: `COALESCE(incidents.resolved_at, incidents.created_at)`.
   - Mantenimiento: `COALESCE(maintenance_visits.done_at, maintenance_visits.scheduled_date)`.

**Entregable:** modelo homogéneo + catálogo ampliado. Cambio visible mínimo (input de cantidad + dos piezas nuevas en los formularios del técnico). Tests vitest del action + test RLS de `incident_parts` a revisar.

---

### Fase 1 — Vista unificada + Historial visible por máquina

> **Estado:** ✅ **IMPLEMENTADA (2026-06-16).** Vista `v_machine_parts_history` aplicada a prod (mig. `20260616103252`) y página `/admin/machines/[serie]/pieces` enlazada desde la ficha. Decisiones de implementación frente al diseño original:
> - **Página hermana, no pestaña:** la ficha de máquina es un formulario sin sistema de tabs; se siguió el patrón ya existente de `/admin/contadores/[serie]` (página dedicada) con enlaces de navegación (Compteurs · Historique pièces) en la cabecera de la ficha.
> - **La vista expone también `technician_name`** (LEFT JOIN a `profiles`) y resuelve el texto libre de mantenimiento como `part_name` (`COALESCE(p.name, mp.description)`).
> - **Curva de contadores:** no se duplica aquí; se enlaza a `/admin/contadores/[serie]` (donde ya vive el gráfico Recharts). El cruce real copias↔piezas es trabajo de la Fase 3.
> - **Enlace de la referencia:** las incidencias enlazan a `/admin/incidents/[id]`; las visitas de mantenimiento se muestran como texto (la vista no expone `plan_id`; añadir enlace requeriría incluirlo).
> - **RLS verificada:** test `tests/rls/machine-parts-history.test.ts`. Hallazgo confirmado: `incident_parts` no tiene policy de SELECT para clientes → la vista (security_invoker) **no** expone el desglose de piezas a clientes (es interno de AMD); admin ve todo, cada técnico solo lo suyo.

**Objetivo:** ver, por máquina, qué se le ha cambiado y cuándo, junto a su consumo.

1. **Vista `v_machine_parts_history`** (`security_invoker = true` para respetar RLS por rol):
   ```sql
   CREATE VIEW public.v_machine_parts_history
   WITH (security_invoker = true) AS
   -- Origen 1: averías
   SELECT
     COALESCE(i.machine_id, cm.machine_id)        AS machine_id,
     'incident'::text                              AS source,
     i.id                                          AS source_id,
     i.numero_incident                             AS reference,
     ip.part_id, p.name                            AS part_name,
     NULL::text                                    AS description,
     ip.quantity,
     COALESCE(i.resolved_at, i.created_at)         AS changed_at,
     i.category, i.assigned_to                     AS technician_id
   FROM incident_parts ip
   JOIN incidents i        ON i.id = ip.incident_id
   JOIN parts p            ON p.id = ip.part_id
   LEFT JOIN contract_machines cm ON cm.id = i.contract_machine_id
   UNION ALL
   -- Origen 2: mantenimiento preventivo
   SELECT
     cm.machine_id,
     'maintenance'::text,
     mv.id,
     to_char(mv.scheduled_date, 'YYYY-MM-DD'),
     mp.part_id, p.name,
     mp.description,
     mp.quantity,
     COALESCE(mv.done_at, mv.scheduled_date::timestamptz),
     'maintenance'::text, mv.done_by
   FROM maintenance_parts mp
   JOIN maintenance_visits mv ON mv.id = mp.visit_id
   JOIN contract_machines cm  ON cm.id = mv.contract_machine_id
   LEFT JOIN parts p          ON p.id = mp.part_id;
   ```
   Notas de diseño:
   - Maneja el XOR de incidencias vía `COALESCE`.
   - `maintenance_parts.part_id` es nullable (texto libre): `LEFT JOIN parts` + se expone `description`.
   - Una sola consulta por `machine_id` da el historial completo de ambos orígenes.

2. **RLS:** al ser `security_invoker`, la vista hereda las políticas de las tablas base. **Punto de verificación:** comprobar que un técnico/cliente que lee la vista no pierde filas legítimas ni gana acceso indebido (cruzar con la suite RLS, 88 tests). Añadir tests de la vista por rol.

3. **UI — pestaña "Historique pièces" en la ficha de máquina** (`/admin/machines/[serie]`):
   - Línea de tiempo: fecha · origen (badge avería/mantenimiento) · pieza(s) + cantidad · técnico · enlace al incidente/visita.
   - En la misma pantalla (o adyacente), la curva de contadores ya existente, para leer "copias vs cambios" de un vistazo.
   - Reutiliza componentes UI existentes (`Card`, `Badge`, estilo Híbrido).

4. **Tipos:** regenerar tipos TypeScript de Supabase tras la migración/vista.

**Entregable:** historial consultable y útil por sí solo, con datos que ya existen. No bloquea nada posterior.

---

### Fase 2 — Referencia de "lo normal" (rendimientos esperados)

**Objetivo:** dar al agente con qué comparar. Decisión del cliente = **mezcla**.

1. **Tabla `part_yield_specs`** (rendimiento oficial del fabricante, cuando se disponga):
   ```sql
   CREATE TABLE public.part_yield_specs (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     marque        text,          -- ej. 'Konica Minolta'
     modele        text,          -- ej. 'bizhub C300i'
     part_id       smallint REFERENCES parts(id),
     expected_yield int NOT NULL CHECK (expected_yield > 0),
     unit          text NOT NULL CHECK (unit IN ('copies_bw','copies_color','copies_total','mois')),
     source        text NOT NULL DEFAULT 'fabricant' CHECK (source IN ('fabricant','estimé')),
     notes         text,
     created_at    timestamptz NOT NULL DEFAULT now(),
     UNIQUE (marque, modele, part_id, unit)
   );
   ```
   - RLS: solo admin. UI mínima de carga (puede ser una pantalla simple en `/admin` o, en una primera iteración, carga por SQL/CSV).

2. **Baseline aprendido del histórico** (vista o RPC): para cada (modelo, pieza), calcula las copias medias transcurridas entre cambios consecutivos (usando `v_machine_parts_history` + `machine_counters`/`calcDeltas`). Esto da una referencia incluso sin specs del fabricante.

3. **Rendimiento efectivo** (`v_part_yield_effective`): **prioriza el spec del fabricante** si existe para ese (modelo, pieza); si no, usa el baseline aprendido. Marca el origen para transparencia.

**Entregable:** capa de referencia consultable. Sin specs cargadas, el sistema ya funciona con el aprendido.

---

### Fase 3 — Agente de detección de anomalías

**Objetivo:** vigilar y levantar banderas para revisión humana. **Reutiliza el patrón semáforo + cola** del OCR.

1. **Tabla `machine_anomalies`** (cola de revisión, espejo conceptual de `pending_counter_imports`):
   ```sql
   CREATE TABLE public.machine_anomalies (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     machine_id   text NOT NULL REFERENCES machines(numero_serie),
     part_id      smallint REFERENCES parts(id),
     anomaly_type text NOT NULL,   -- 'consumo_alto_sin_cambio' | 'consumo_excesivo' | 'desviacion_modelo'
     light        text NOT NULL CHECK (light IN ('green','amber','red')),
     reason       text NOT NULL,   -- explicación legible en francés
     period_start date, period_end date,
     metrics      jsonb,           -- copias, cambios, esperado, ratio...
     status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','dismissed','resolved')),
     reviewed_by  uuid REFERENCES profiles(id),
     reviewed_at  timestamptz,
     created_at   timestamptz NOT NULL DEFAULT now()
   );
   ```

2. **Reglas de detección** (lógica en `src/lib/anomalies.ts`, testeable con vitest):
   - **`consumo_alto_sin_cambio` (🟡 preventivo):** copias acumuladas desde el último cambio de una pieza > rendimiento efectivo esperado → toca cambio / revisar.
   - **`consumo_excesivo` (🔴 avería):** nº de cambios de tóner/pieza en un periodo muy por encima de lo esperado para las copias hechas → fuga, defecto o avería.
   - **`desviacion_modelo` (🟡):** consumo de la máquina se desvía N desviaciones de la media de su modelo a igualdad de copias.

3. **Disparador:** Edge Function programada (cron diario), **siguiendo el patrón de `maintenance-cron`**. Recalcula y abre/actualiza anomalías. No decide nada solo: alimenta la cola.

4. **UI — cola de anomalías** en `/admin` (estilo `/admin/contadores/pendientes`): lista con semáforo, motivo, máquina, acciones (acuse/descartar/resuelto). Badge/contador en el dashboard admin. Textos en francés.

5. **Edge case crítico — reemplazos de máquina:** el cálculo de consumo debe respetar las fronteras de reemplazo (`is_replacement_start` / `previous_machine_id`). `calcDeltas()` ya lo contempla; el agente debe apoyarse en él y no sumar copias a través de un cambio de equipo.

**Entregable:** vigilante automático con revisión humana, coherente con la experiencia ya existente.

---

## 4. Consideraciones transversales (calidad)

- **RLS:** cada vista/tabla nueva con política explícita; ampliar la suite de tests RLS (hoy 88) para cubrirlas. Fuente de verdad de policies = `pg_policies` de prod.
- **Migraciones:** nomenclatura por timestamp; desplegar a prod tras gate, con reconciliación de historial git↔BD si aplica.
- **Tipos:** regenerar tipos TS de Supabase tras cada cambio de schema.
- **Tests:** vitest para `src/lib/anomalies.ts` y la lógica de rendimiento; tests RLS por rol para las vistas/tablas nuevas.
- **CI:** `typecheck · test · build` debe pasar (check requerido en `main`).
- **Documentación:** actualizar `docs/architecture.md` (regla del proyecto en CLAUDE.md) con las nuevas tablas/vistas.
- **Idioma UI:** francés (primario), igual que el resto de la app.

---

## 5. Orden de ejecución sugerido

| Fase | Aporta valor por sí sola | Bloquea a |
|---|---|---|
| 0 — Homogeneizar modelo (`quantity`) | Indirecto (cimiento) | 1, 2, 3 |
| 1 — Vista + historial visible | ✅ Sí (consultar historial) | 3 |
| 2 — Rendimientos (mezcla) | Parcial (referencia) | 3 |
| 3 — Agente de anomalías | ✅ Sí (vigilancia) | — |

Cada fase = una rama / PR independiente, revisable y desplegable por separado.

---

## 6. Preguntas abiertas / a confirmar antes de implementar

1. **Modelo de máquina:** ¿`machines` tiene `marque` + `modele` fiables y normalizados para agrupar por modelo en las Fases 2-3? (verificar calidad del dato).
2. **`autres_pieces`** (texto libre en incidencias): ¿migrar a `incident_parts` estructurado o dejarlo como nota? Afecta a la completitud del historial.
3. **Umbral de los semáforos** (cuántas copias / cuántos cambios disparan 🟡 vs 🔴): definir con AMD valores iniciales razonables, ajustables después.
4. **UI de carga de specs del fabricante:** ¿pantalla en admin desde el inicio o carga por CSV/SQL en la primera iteración?
5. **Cantidad en mantenimiento:** ¿añadir input de cantidad al formulario de mantenimiento preventivo (hoy siempre `quantity = 1`)? Requiere ampliar el RPC `close_maintenance_visit` para aceptar pares pieza/cantidad. Conviene para que el historial de la Fase 1 no quede sesgado en el lado preventivo.
6. **Defensa en profundidad — policy de `maintenance_parts`** (deuda pre-existente, detectada en la verificación de Fase 1): `tech_read_parts` es permisiva (cualquier técnico puede leer todas las filas de `maintenance_parts`, sin filtrar por visita). Hoy NO hay fuga observable: la vista `v_machine_parts_history` la enmascara con el INNER JOIN a `maintenance_visits` (que sí filtra por `auth_tech_visit_ids()`), y el flujo de cierre usa `service_role`. Endurecerla a `visit_id IN (auth_tech_visit_ids())` (análogo a `incident_parts`) sería defensa en profundidad. No se aborda en el PR de Fase 1 para no mezclar hardening de otra tabla.
