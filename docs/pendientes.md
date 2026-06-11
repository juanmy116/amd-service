# Tareas pendientes — AMD Service

> Backlog vivo. Cada entrada: qué, por qué, y pasos concretos. Al cerrar una, moverla a `docs/architecture.md` o borrarla.

> 📋 **Auditoría del sistema de incidencias (2026-06-10):** `docs/auditoria-incidentes-2026-06-10.md` — valoración de escala, aislamiento RLS y mejoras priorizadas. Punto de partida para mañana.

---

## 1. 🧪 Tests de los flujos críticos — PRIORIDAD ALTA

### Por qué
La cobertura de tests actual (`billing.test.ts`, `invoicing.test.ts` = 67 tests) cubre **solo el núcleo financiero**. Toda la experiencia de usuario —flujo de incidencias, queries dependientes de RLS, escáner QR, Server Actions— **no tiene tests**. Los 4 bugs de incidencias arreglados el 2026-06-09/10 (técnico veía 0 incidencias por un `select` roto; RLS de `machines` que ignoraba incidencias públicas; escáner que parseaba mal el QR; pantalla en blanco) vivían justo en esa zona y llegaron a producción sin que nada saltara. Esta tarea cierra ese hueco.

### Setup actual a respetar
`vitest` (entorno `node`, `include: src/**/*.test.ts`), tests unitarios de lógica pura en `src/lib`. Sin Supabase ni testing de React/DOM hoy. El plan crece por fases para no romper ese setup de golpe.

---

### Fase 1 — Unit tests de lógica pura ya extraíble (esfuerzo: bajo · empezar por aquí)

Encaja con el setup actual sin tocar infraestructura. Alto retorno inmediato.

- [ ] **`extractSerie()` del escáner** (`src/app/tech/scan/qr-scanner.tsx`).
  - Ya es función pura. Moverla a `src/lib/qr.ts` y testear `src/lib/qr.test.ts`:
    - URL completa del gateway → `…/m/CN88THY0CK` ⇒ `CN88THY0CK`
    - `/m/<serie>` relativo ⇒ `<serie>`
    - rutas antiguas `/maquina/<serie>` y `/tech/scan/<serie>` ⇒ `<serie>`
    - nº de serie suelto ⇒ él mismo
    - serie con caracteres especiales (URL-encoded) ⇒ decodificado correcto
  - *Habría cazado el bug #3 directamente.*

- [ ] **Mapeo incidencia → nombre a mostrar** (lista del técnico).
  - Extraer a `src/lib/incidents.ts` la función que, dada una fila de incidencia, devuelve el nombre (`cliente ?? machine_id ?? título`). Testear los 3 caminos (interna con cliente, pública con machine_id, sin nada).
  - Centralizar el **string del `select`** de la lista del técnico como constante exportada y testeada (que mencione `contract_machines(contracts(clients(nom_client)))`, `machine_id`). Evita que vuelva a colarse un `select` apuntando a una columna inexistente.

- [ ] *(Stretch)* **Test de "contrato de esquema"**: un test que lea `src/lib/supabase/types.ts` (tipos generados) y verifique que las columnas referenciadas en los `select` críticos existen. Cazaría bugs tipo `clients!client_id` en CI. Avanzado; opcional.

---

### Fase 2 — Integración de RLS contra Supabase local (esfuerzo: medio-alto · MÁXIMO valor)

Es la capa que cubre los bugs #1 y #2 de verdad: visibilidad por rol. Requiere stack local para no tocar producción.

- [ ] **Infra:** `supabase start` (stack local) + `supabase db reset` (aplica las 62 migraciones). Script `test:rls` aparte del `test` unitario (no correrlo en el CI normal hasta que sea estable; o job separado con servicio Supabase).
- [ ] **Helpers de fixtures** (vía `service_role`/admin client): crear usuarios auth de prueba (`auth.admin.createUser`) para cada rol, un cliente, un contrato con línea, máquinas, y dos incidencias (una **pública** `machine_id`, una **interna** `contract_machine_id`).
- [ ] **Casos (firmando como cada rol, ejecutando las queries reales de las páginas):**
  - Técnico A ve **su** incidencia (pública **y** de contrato); **no** ve la de Técnico B.
  - Técnico A ve **su máquina** vía RLS (`auth_tech_assigned_machine_ids`), tanto si la incidencia es pública como de contrato. *(Cubre el bug #2.)*
  - Cliente ve solo las incidencias de **sus** contratos; no las de otros.
  - Admin ve todo. Anónimo no ve nada.
  - Inmutabilidad/permisos ya cubiertos por billing — no duplicar.
- [ ] **Teardown** limpio entre tests (borrar usuarios y datos sintéticos).

---

### Fase 3 — E2E del recorrido completo (esfuerzo: alto · opcional)

Solo si se quiere blindar el camino entero de punta a punta. Playwright.

- [ ] Recorrido: admin asigna incidencia → técnico la ve en `/tech` → escanea/abre `/tech/scan/<serie>` → la incidencia pasa a `en_cours`.
- [ ] 1-2 smoke tests, no suite exhaustiva.

---

### Orden recomendado
**Fase 1 primero** (rápida, ya cierra el bug del escáner y fija el `select`). Luego **Fase 2** (la que más vale). Fase 3 solo si sobra tiempo. Cada fase es un PR propio.

---

## 2. 🔒 RLS permisiva de `maintenance_visits` (prioridad media)

`supabase/migrations/20260511145143_maintenance_system.sql` (policies `tech_read_visits` / `tech_update_visits`) filtra solo por `role = 'technician'`, **sin** `assigned_to`. Cualquier técnico puede leer/editar visitas de otro. Contrasta con `incidents`, que sí restringe por `assigned_to = auth.uid()`. Endurecer con cuidado: el flujo de scan de mantenimiento (`tech/scan/[serie]/page.tsx`) lee visitas; validar que no se rompe. PR propio.

---

## 3. 🧹 PR-cleanup del refactor N-máquinas — esencialmente hecho (queda 1 función huérfana)

- ✅ Columnas legacy eliminadas en prod (`contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id`) — verificado 2026-06-11: no existen (Fase 4, PR #30).
- ✅ NO tocar: `auth_tech_incident_ids()` y `auth_tech_incident_contract_ids()` están EN USO por policies RLS del técnico (verificado vía `pg_depend`).
- ⏳ **Pendiente menor:** `DROP FUNCTION auth_tech_incident_machine_ids()` — función HUÉRFANA (su policy `tech_machines_select` se reescribió a `auth_tech_assigned_machine_ids()` en `20260603170237`; 0 usos verificados el 2026-06-11). Se dejó intacta a propósito en `20260605000000`. PR de una línea cuando se quiera limpiar.

Historial: `docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md` §6.
