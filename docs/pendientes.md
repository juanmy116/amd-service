# Tareas pendientes — AMD Service

> Backlog vivo. Cada entrada: qué, por qué, y pasos concretos. Al cerrar una, moverla a `docs/architecture.md` o borrarla.

> 📋 **Auditoría del sistema de incidencias (2026-06-10):** `docs/auditoria-incidentes-2026-06-10.md` — valoración de escala, aislamiento RLS y mejoras priorizadas. Punto de partida para mañana.

---

## ✋ Capa 2 del candado de facturación — confirmación antes de emitir «Émettre»/«Forcer»

> **Qué:** hoy los botones **«Émettre la facture»** y **«Forcer la facturation»** (`src/components/admin/ContractInvoicePreview.tsx`) emiten una factura **real, definitiva e inmutable en un solo clic**, sin diálogo de confirmación. El único freno actual es la **Capa 1** (candado global `billing_settings`, 2026-09-04) que mantiene la facturación APAGADA durante la fase de prueba del SAV.
>
> **Cuándo retomar:** **antes de ENCENDER la facturación** (antes de `UPDATE public.billing_settings SET billing_enabled = true`). Una vez encendida, un clic accidental de un admin emite una factura de verdad → hay que interponer una confirmación.
>
> **Cómo (propuesta):** modal de confirmación (usar `@headlessui/react`, ya es dependencia) al pulsar «Émettre»/«Forcer», que:
> 1. Recuerde que la factura es **irreversible** (solo se puede anular, no borrar) e indique cliente, contrato, mes y total.
> 2. Exija una acción deliberada extra (p. ej. escribir `EMETTRE`, o un segundo clic explícito «Confirmer l'émission»).
> 3. Para «Forcer», remarque además que hay **máquinas sin relevé** que se facturarán al forfait (estimadas).
>
> **Por qué pendiente:** decisión consciente (2026-09-04). Con la Capa 1 apagando la facturación durante la prueba, la confirmación no es urgente; se implementa como paso previo a encender. Ver memoria del candado y `docs/architecture.md` (§Sistema de Facturación → Candado de facturación).

---

## ⏰ Verificar el agente de anomalías cuando empiecen a entrar datos reales

> **Qué:** las Fases 0-3 del *historial de piezas + agente de anomalías* (spec `docs/superpowers/specs/2026-06-15-historial-piezas-anomalias-design.md`) están en prod, pero el agente **no produce alertas hasta que haya datos**: hoy (2026-06-16) hay **0 lecturas de contador** cargadas y casi ningún cambio de pieza registrado.
>
> **Cuándo retomar:** en cuanto se empiece a cargar contadores con regularidad (vía el agente OCR / importación). Entonces:
> 1. Verificar que `v_part_yield_baseline` empieza a producir rendimientos aprendidos coherentes (revisar `samples`; exigir un mínimo antes de fiarse).
> 2. Ejecutar el recálculo del agente (`/admin/anomalies`) y revisar que los semáforos 🟢🟡🔴 tienen sentido con los datos reales; ajustar los umbrales con AMD.
> 3. Confirmar que el cálculo respeta los reemplazos de máquina (ya cubierto por `repl_epoch`, pero validar con un caso real).
> 4. **Cargar las fichas del fabricante** (`part_yield_specs`) de los modelos principales (Ricoh MP C3002/C3003, etc.) por SQL — da la referencia preventiva desde el día 1, sin esperar al histórico. Se puede hacer en cualquier momento; la vista `v_part_yield_effective` las prioriza automáticamente.
>    - ⚠️ **`marque`/`modele` EXACTOS:** el enlace ficha↔máquina es por igualdad de texto. Copiar los valores de `SELECT DISTINCT marque, modele FROM machines` (sin espacios de borde ni variaciones de mayúsculas) — si no casan, la anomalía NO salta y NO da error. Detectado en el review holístico (2026-06-16); hoy `machines` está limpia, pero al cargar fichas a mano es el fallo más probable.
>    - ⚠️ **Unidad:** la vista efectiva solo usa `unit='copies_total'`. Las fichas de tóner color suelen venir del fabricante en *copias color*; conviértelas a copias totales (o decide el mapeo pieza→unidad como ampliación) antes de cargarlas, o no producirán señal.
>
> **Por qué pendiente:** decisión consciente (2026-06-16) de construir el armazón completo ahora y verificarlo con datos cuando lleguen, en vez de bloquear la feature esperando a los contadores.

---

## 1. ✅ Tests de los flujos críticos — Fases 1 y 2 COMPLETADAS (2026-06-11)

- ✅ **Fase 1** (PR #77): `extractSerie()` → `src/lib/qr.ts` + tests; `getIncidentDisplayName` + `TECH_INCIDENT_SELECT` en `src/lib/incident.ts` + tests.
- ✅ **Fase 2 — aislamiento RLS** (PR #82): `tests/rls/` corre contra Supabase local efímero (Docker) en el job de CI `.github/workflows/rls.yml` (`npm run test:rls`). 6 tests: técnico ve solo lo suyo (no lo de otro técnico), cliente sus contratos, admin todo, anon nada, técnico no edita incidencia ajena. **Verificado en CI sobre base reconstruida desde cero.**
- ✅ **Fase 3 — E2E Playwright** (PR #84): `tests/e2e/` corre en el job de CI `.github/workflows/e2e.yml` (Supabase local + build/start de la app + Chromium). 4 tests: login por rol (admin/técnico/cliente aterrizan en su sección) + recorrido SAV completo (admin asigna → auto `assigné` → técnico la ve en /tech → abre /tech/scan/<serie> → auto `en_cours` + `incident_history`). **Verificado en CI (4 passed, estable).** Gotcha extra: sin `GRANT SELECT` table-level a `authenticated` en local, los **embeddings** de PostgREST (`/tech/incidents`) fallan → el workflow otorga las default privileges a los 3 roles.

> ⚠️ **Hallazgo del montaje (P0-1 parcialmente reabierto y vuelto a cerrar):** la reconstrucción limpia de migraciones fallaba por un `REVOKE` sobre funciones legacy inexistentes (`20260508182457`) — arreglado con `to_regprocedure` condicional. Además, el Postgres local del CLI no reproduce las default privileges de Supabase para `service_role` → el job de CI las otorga explícitamente (solo `service_role`, backend). La cadena de migraciones **ahora sí se reconstruye desde cero** (verificado en CI).

<details><summary>Contexto original (histórico)</summary>

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

</details>

---

## 2. ✅ RLS de `maintenance_visits` — COMPLETADO (2026-06-11, PR #79)

Antes `tech_read_visits`/`tech_update_visits` filtraban solo por rol → cualquier técnico veía/editaba las visitas de otro. Ahora un técnico ve "las suyas + las de sus máquinas" vía la función `auth_tech_visit_ids()` (`assigned_to = él` OR la visita es de una máquina en `auth_tech_assigned_machine_ids()`). `admin_all_visits` intacta. Migración `20260611150000`. Verificado en prod (advisor `auth_rls_initplan` = 0 en toda la BD; smoke test) y por los tests RLS de la Fase 2.

---

## 3. ✅ Cierre de líneas al terminar un contrato — COMPLETADO (2026-06-11)

Implementado en PR #80: acción "Terminer le contrat" + RPC `terminate_contract` (migración `20260611160000`). Cierra todas las líneas abiertas exigiendo la lectura final del contador de cada máquina, marca el contrato `terminé`, devuelve las máquinas al stock y borra las visitas futuras no realizadas. Decisión tomada: **se exige lectura final** (coherente con `return_machine_to_stock`). Verificado E2E en prod sobre datos sintéticos con rollback. Detalle abajo (histórico).

<details><summary>Especificación original (histórico)</summary>

### Por qué
Marcar un contrato como `terminé` (vía `update_contract_with_lines`, `supabase/migrations/20260610101000_update_contract_lines_counter_guards.sql:107-114`) **NO cierra** sus líneas `contract_machines` abiertas (`date_fin IS NULL`). Consecuencias:
- La factura está protegida — `isLineBillable` (`src/lib/invoicing.ts:107-116`) excluye la línea huérfana de un contrato `terminé` — así que **no se factura mal**.
- Pero la máquina sigue figurando como **alquilada** en `v_machine_park` (que considera alquilada toda línea con `date_fin IS NULL`) → inventario parque/stock incoherente: una máquina que ya no está en servicio aparece como ocupada y no vuelve al stock.

Hoy el único cierre desde UI es el array `retire` manual del formulario (`ContractForm.tsx`), que el admin debe usar a mano máquina por máquina.

### Decisiones de negocio a resolver antes de implementar
1. **¿Exigir lectura final del contador (`end_counter`) al cerrar?** `return_machine_to_stock` la exige (`20260608120000:81-82`, `end_counter_required`); el array `retire` la permite opcional. Afecta a la última factura del tramo.
2. **¿Qué `date_fin`?** hoy / `date_renouvellement` / editable por el admin.
3. **¿Cerrar TODAS las líneas abiertas** del contrato automáticamente al pasar a `terminé`, o seguir permitiendo mezcla actif/terminé?
4. **Transaccionalidad:** ¿nueva RPC `close_contract_lines(p_contract_id, …)` o extender `update_contract_with_lines` para auto-cerrar cuando `statut → terminé`?
5. **Mantenimiento:** ¿cancelar/migrar las visitas futuras de las líneas cerradas? (referencia: `replace_contract_machine` ya migra visitas, `20260608140000:104-110`).

### Restricción de BD a respetar
El CHECK `contract_machines_termine_has_date_fin` (`statut <> 'terminé' OR date_fin IS NOT NULL`) obliga a que toda línea `terminé` tenga `date_fin`. El índice único `contract_machines_one_open_per_machine` garantiza una sola línea abierta por máquina.

> Origen: nota operativa del triaje de la auditoría de facturación (2026-06-11), hallazgo asociado a P1-6. No bloquea facturar, pero conviene cerrarlo para mantener el parque coherente. PR propio.

**Decisiones tomadas al implementar:** (1) se exige lectura final; (3) se cierran todas las líneas abiertas; (4) RPC nueva `terminate_contract`; (5) se borran las visitas futuras no realizadas (la máquina sale del parque). `date_fin` = fecha indicada por el admin en el modal.

</details>

---

## 4. ✅ PR-cleanup del refactor N-máquinas — COMPLETADO (2026-06-11)

- ✅ Columnas legacy eliminadas en prod (`contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id`) — Fase 4, PR #30.
- ✅ NO tocar: `auth_tech_incident_ids()` y `auth_tech_incident_contract_ids()` están EN USO por policies RLS del técnico (verificado vía `pg_depend`).
- ✅ `auth_tech_incident_machine_ids()` (huérfana) ELIMINADA — migración `20260611110000`.

Nada pendiente. (Historial: `docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md` §6.)

---

## 5. 🔴 Confirmación antes de emitir una factura (evitar emisión accidental) — PRIORITARIO

> **Qué:** añadir un **diálogo de confirmación** antes de emitir una factura en `/admin/facturation`. Al pulsar "Émettre la facture" o "Forcer la facturation", mostrar un modal con cliente, total, periodo y nº de líneas estimadas, y la advertencia **"acción irreversible"**, que exija un segundo clic de confirmación.
>
> **Por qué:** el 2026-06-18, durante la primera prueba real con 2AS, se emitió la factura `FACT-2026-0001` **por accidente** — bastó un Enter/toque con el foco en el botón "Forcer la facturation" para emitir una factura real. Las facturas son **inmutables** (solo se pueden anular, no borrar), así que un disparo accidental deja huella permanente (factura anulada + número quemado). Hoy el botón emite **al instante, sin confirmación** → demasiado fácil de activar sin querer.
>
> **Pasos:** en `src/components/admin/ContractInvoicePreview.tsx`, interceptar el submit del `<form action={emitAction}>` con un diálogo de confirmación (estado `useState` + modal, o `onSubmit` con `confirm()` como mínimo viable). Mostrar el resumen (total, `has_estimated`, nº líneas). Aplica a **ambos** botones (normal y "Forcer"). Bajo esfuerzo, alto valor de seguridad.

---

## 6. ✅ Subir los contadores directamente desde la app (ingesta sin depender de CloudMailin) — INGESTA DIRECTA + TROCEO PDF HECHOS

> **Qué:** una forma de **subir las fotos/PDF de contadores directamente desde la app** (panel admin y/o PWA del técnico), sin pasar por email → CloudMailin. Las imágenes irían directas a storage + `pending_counter_imports` + `parse-counter-image` (el lector OCR ya existe).
>
> **Por qué:** la ingesta actual (email a `admin@test-sav.site` → CloudMailin free → OCR) tiene un tope de **512 KB por correo** (plan gratuito de CloudMailin). Inviable para clientes con muchas máquinas: 2AS tiene **40** y sus lecturas no caben (en la prueba del 2026-06-18 hubo que comprimir y mandar de a pocas). Es un cuello de botella duro de un tercero.
>
> **✅ Hecho (PR `feat/subida-directa-contadores`):** botón **"Ajouter une photo / un PDF"** en `/admin/contadores/pendientes`. Server Action `uploadCounterImageAction` (`actions.ts`) + lógica pura testeada `src/lib/counterUpload.ts` (tipos JPG/PNG/WEBP/PDF, tope **10 MB**, hash SHA-256 → reutiliza la dedup `register_counter_duplicate`). Sube a `counter-images`, inserta en `pending_counter_imports` (`source='manual'`) y dispara `parse-counter-image`. `next.config.ts` `bodySizeLimit` subido a **12 MB**. Reutiliza cola/semáforos/confirmación. → **resuelve el tope de 512 KB.**
>
> **✅ Troceo de PDF multipágina (mismo PR):** el PDF se trocea **en el navegador** con `pdfjs-dist` (`src/lib/pdfToImages.ts`) — 1 página = 1 JPEG (~1654px, q0.85) — y cada página se sube por el mismo flujo de imagen → N relevés a la cola. Se hace en cliente a propósito: en Vercel/serverless renderizar PDF es frágil y choca con el límite de 4,5 MB/petición (el PDF de 2AS son 46 págs / 5 MB). `worker-src 'self' blob:` añadido al CSP; el worker se emite como asset propio. **Formato real verificado (PDF `2AS - mars.pdf`): cada página es un "Page Counter" autocontenido con N° série + 6 contadores → 1 página = 1 máquina.** Las Pantum de 2 páginas / páginas dudosas las absorbe la **revisión humana** de la cola (semáforos): la buena se confirma, la sobrante se rechaza. ⚠️ **Verificación en runtime pendiente**: el render en navegador + calidad de imagen se prueban subiendo el PDF real en el preview de Vercel (build y worker-asset OK, pero canvas/render solo se ejercita en navegador).
>
> **Pendiente opcional:** misma subida desde la **PWA del técnico** (`/tech`) para que suban en campo (hoy es admin-only).
>
> Encaja con la ampliación del "agente de contadores" (capacidades 2-4 sin empezar, ver `project_agente_supervisor_contadores`).

---

### 6-bis. ✅ REDISEÑO IMPLEMENTADO (2026-06-19): troceo en navegador → **PDF entero a la IA**

> **Estado:** implementado en rama `feat/ingesta-pdf-ia`. Edge Function `parse-counter-document` desplegada (v1). Andamiaje viejo EXTIRPADO (cero rastros: sin `pdfToImages.ts`, sin `pdfjs-dist`, sin scripts wasm, sin `/public/pdfjs/`, sin `worker-src` en CSP, sin `maxDuration`, `buildImagePath` podado). ⏰ Pendiente: gate en prod con el PDF real de 2AS.


> **Por qué cambiamos:** el método foto-a-foto (trocear el PDF en 46 imágenes en el navegador + 1 llamada OCR por imagen) dio una cadena larga de problemas en pruebas reales (PRs #106–#111): páginas CCITT en blanco (wasm de pdf.js), saturación/cuelgues del OCR, y el **límite por minuto del servicio de IA** al disparar ~46 llamadas. Además **no podía con los formatos especiales** (Pantum a 2 páginas, HP PageWide en francés).
>
> **Prueba decisiva (2026-06-19):** se leyó el PDF `2AS - mars.pdf` ENTERO con el mismo modelo (Claude) → **las ~40 máquinas legibles**, incluidas las CCITT, las Pantum (2 págs) y la HP. El método foto-a-foto se quedaba en 27 y fallaba en los formatos raros.
>
> **Nuevo enfoque a implementar:** subir el **PDF entero** → enviarlo a la IA (en 2-3 trozos por el límite por minuto) → devuelve la **lista** de todas las lecturas → entran a la MISMA cola/semáforos/validación. Coste ≈ **$0,30/PDF mensual** (≈ igual que ahora). **Extirpación limpia** del andamiaje viejo: `src/lib/pdfToImages.ts`, dependencia `pdfjs-dist`, script `copy:pdf-wasm` + hooks, `/public/pdfjs/`, `worker-src 'self' blob:` del CSP, y el bucle de subida 1-a-1.
>
> ### ⚠️ DECISIÓN EXPLÍCITA — el buzón por EMAIL se queda con el método antiguo (POR AHORA)
> La ingesta por **email** (CloudMailin → `receive-counter-email` → `parse-counter-image`, **1 foto = 1 lectura**) **NO se toca** en este rediseño: sigue funcionando con el OCR de imagen actual. El rediseño afecta **solo a la subida manual desde la app** (PDF entero).
>
> **🔴 PENDIENTE FUTURO (a abordar): el email NO es fiable a largo plazo.** Hereda las mismas debilidades que estamos eliminando en la app: tope de 512 KB de CloudMailin free, 1 foto por correo (inviable para clientes con muchas máquinas), y depende de un tercero. Cuando se estabilice la subida por app, **hay que rediseñar también la ingesta por email** hacia algo más robusto (idealmente el mismo motor "documento entero → IA", o un canal distinto). Mientras tanto, el email queda como vía secundaria/legacy. **No darlo por bueno como solución definitiva.**
