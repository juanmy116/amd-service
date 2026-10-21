# Doble escaneo obligatorio para los técnicos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un técnico solo puede **empezar** una avería escaneando el QR de la máquina y solo puede **cerrarla** escaneándolo otra vez; Atelier (TV) y los admins siguen cerrando sin escanear, con el formulario de oficina.

**Architecture:** Cada escaneo real (`stampQrScan`) deja una fila con hora en una tabla nueva `incident_scans` y, si la avería del técnico estaba `assigné`, la pasa a `en_cours` (el paso a «En cours» deja de hacerse al *abrir* `/tech/scan/[serie]`). Una función pura (`closeGate`) decide si el técnico puede cerrar; la usan la ficha (para habilitar «Résolu») y la Server Action (para rechazar). Un trigger en la BD aplica la misma regla a cualquier `UPDATE` con sesión de técnico, como el verrou de résolution.

**Tech Stack:** Next.js 16 (Server Actions), Supabase (Postgres, RLS, triggers), vitest (unit + `test:rls`), Playwright (E2E solo local).

**Spec:** decisiones acordadas con el usuario el 2026-10-21 (abajo). No hay documento aparte.

## Spec — decisiones del usuario (2026-10-21)

1. **Técnicos** (rol `technician` **sin** `is_dispatcher`): escanear el QR para **empezar** (`→ en_cours`) y escanear **otra vez** para **cerrar** (`→ résolu`/`fermé`).
2. **Excluidos:** Atelier (`is_dispatcher = true`) y los **admins**. Cierran sin escanear, como hoy, con el formulario de oficina (motivo + explicación). No se toca ese camino.
3. **La reparación no tiene límite de tiempo.** El **segundo** escaneo vale **1 hora** para escribir el informe y cerrar; pasado ese tiempo, se vuelve a escanear.
4. **Solo averías.** Los mantenimientos preventivos no cambian.
5. Si el técnico no puede escanear (etiqueta despegada, resuelto por teléfono…), no cierra él: avisa a la oficina o a Atelier, que cierran con el formulario.

## Global Constraints

- Ventana del escaneo de cierre: `CLOSE_SCAN_WINDOW_MINUTES = 60`.
- Dos escaneos del mismo técnico sobre la misma avería separados por menos de `SCAN_DEDUPE_SECONDS = 60` cuentan como **uno** (no se inserta la segunda fila): un doble disparo del escáner no puede valer como «empezar + cerrar».
- Solo cuentan los escaneos **de este ciclo**: `scanned_at > resolved_at` anterior (o todos si nunca se resolvió). Al reabrir, `resolved_at` se conserva (`clearResolution`), así que los escaneos de la resolución anterior dejan de contar solos.
- Solo `service_role` escribe en `incident_scans`. Lee el admin.
- Textos para el técnico, en francés:
  - empezar: `Scannez le QR de la machine pour démarrer l'intervention.`
  - cerrar: `Scannez à nouveau le QR de la machine pour clôturer (valable 1 heure).`
- Cambios en producción según `docs/cambios-en-produccion.md`: la BD va primero y en versión compatible; cada migración con su inversa en `docs/rollback-2026-10-21-doble-escaneo.md`; `supabase db push` y los merges los lanza el usuario; publicar tarde-noche.

## Review Focus

1. **Doble disparo del escáner** (dos llamadas a `recordQrScanAction` en el mismo segundo, o `/m/[serie]` + escáner) → debe contar como **un** escaneo; el técnico no puede cerrar con un solo gesto. Test en Task 2.
2. **Avería que la oficina o Atelier ya pusieron «En cours»** (pasó con SAV-2026-0005 y 0007) → el técnico no necesita «empezar»: su primer escaneo cuenta como inicio y el segundo como cierre. Test en Task 6.
3. **Avería reabierta** → los escaneos del ciclo anterior no valen para cerrar la nueva. Test en Task 1 (`closeGate`) y Task 6 (trigger).
4. **Técnico con la ficha abierta más de 1 hora tras el segundo escaneo** → al enviar «Résolu», error claro y el informe escrito no se pierde (el formulario conserva lo tecleado). Test en Task 4.
5. **Un técnico escanea una máquina con averías de otro técnico** → no les crea escaneo ni las pasa a «En cours». Test en Task 2.

---

## Orden de publicación

| PR | Contenido | Antes del merge |
|---|---|---|
| **A** | Task 1–5 (tabla nueva + app) | El usuario aplica la migración de la tabla con `supabase db push` (compatible: la app actual no la usa) |
| **B** | Task 6–7 (trigger en BD + docs) | PR A publicado y comprobado; el usuario aplica la migración del trigger |

Tras el PR A la regla ya funciona en la app; el PR B la hace imposible de saltar llamando a la API a mano.

---

### Task 1: Regla de cierre (lógica pura) y tabla `incident_scans`

**Files:**
- Create: `src/lib/scanGate.ts`
- Test: `src/lib/scanGate.test.ts`
- Create: `supabase/migrations/20261021100000_incident_scans.sql`
- Create: `docs/rollback-2026-10-21-doble-escaneo.md`
- Modify: `src/lib/supabase/types.ts` (regenerar con `supabase gen types` contra la BD local)

**Interfaces:**
- Produces:
  - `CLOSE_SCAN_WINDOW_MINUTES = 60`, `SCAN_DEDUPE_SECONDS = 60`
  - `type CloseGate = { canClose: boolean; closeUntil: Date | null }`
  - `closeGate(scans: Date[], resolvedAt: Date | null, now?: Date): CloseGate`
  - Tabla `incident_scans(id uuid pk default gen_random_uuid(), incident_id uuid not null references incidents(id) on delete cascade, scanned_by uuid not null references profiles(id), scanned_at timestamptz not null default now())`, índice `(incident_id, scanned_by, scanned_at)`.

- [ ] **Step 1: Tests de `closeGate`** en `src/lib/scanGate.test.ts`:
  - `sin escaneos → canClose false, closeUntil null`
  - `un escaneo → canClose false`
  - `dos escaneos, el último hace 10 min → canClose true, closeUntil = último + 60 min`
  - `dos escaneos, el último hace 61 min → canClose false`
  - `dos escaneos anteriores a resolvedAt → canClose false` (reabierta)
  - `uno antes y uno después de resolvedAt → canClose false`; `dos después → true`
  - `escaneos desordenados → usa el más reciente para la ventana`
- [ ] **Step 2:** `npx vitest run src/lib/scanGate.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar `closeGate`** en `src/lib/scanGate.ts` (sin `server-only`: la usa también el cliente). Filtra los `> resolvedAt`, exige `length >= 2` y `max >= now - 60 min`.
- [ ] **Step 4:** `npx vitest run src/lib/scanGate.test.ts` → PASS.
- [ ] **Step 5: Migración** `20261021100000_incident_scans.sql`: la tabla de arriba + `enable row level security` + una sola policy `select` para `public.is_admin()`. Sin policies de escritura (solo `service_role`). `revoke insert, update, delete on incident_scans from anon, authenticated` (ver memoria `reference_tests_rls_fase2.md`, gotcha de GRANT).
- [ ] **Step 6: Rollback** `docs/rollback-2026-10-21-doble-escaneo.md`, sección «Migración 1»: `drop table public.incident_scans;` (modelo: `docs/rollback-2026-10-09-f2.md`).
- [ ] **Step 7:** `supabase db reset` en local, `npm run typecheck`, regenerar tipos.
- [ ] **Step 8: Commit** — `feat(scan): tabla incident_scans y regla de cierre closeGate`.

### Task 2: El escaneo deja rastro y empieza la avería

**Files:**
- Modify: `src/lib/scan.server.ts` (`stampIncidents`)
- Modify: `src/app/tech/scan/[serie]/page.tsx:95-125` (quitar la auto-transición al renderizar)
- Test: `tests/rls/scan-stamp.test.ts`

**Interfaces:**
- Consumes: `SCAN_DEDUPE_SECONDS` (Task 1), tabla `incident_scans`.
- Produces: tras `stampQrScan(serie, userId)`, cada avería abierta de la máquina **asignada a `userId` o sin técnico** tiene una fila nueva en `incident_scans` (salvo duplicado < 60 s) y, si estaba `assigné` **y asignada a `userId`**, pasa a `en_cours` con historial `Mise en cours — scan QR`.

- [ ] **Step 1: Tests** en `tests/rls/scan-stamp.test.ts` (nuevo `describe('stampQrScan — averías')`):
  - `inserta un escaneo por avería del técnico y por avería sin técnico`
  - `no inserta en averías de otro técnico ni las cambia de estado`
  - `dos escaneos en menos de 60 s dejan una sola fila`
  - `assigné del técnico → en_cours, con línea de historial`
  - `en_cours puesta por la oficina: escanear no cambia el estado pero sí deja fila`
- [ ] **Step 2:** `npm run test:rls -- scan-stamp` → FAIL.
- [ ] **Step 3: Implementar** en `stampIncidents`: el `select` añade `status`; tras el sello actual, para cada `target` leer el último `scanned_at` de ese usuario (`incident_scans`) e insertar si no hay o es de hace ≥ 60 s; después `update status = 'en_cours'` (con `.eq('status','assigné')` como guard) para las del propio usuario en `assigné` e insertar su historial. Mantener la regla de la función: nunca lanza, registra y sigue.
- [ ] **Step 4: Quitar** de `/tech/scan/[serie]/page.tsx` el bloque «Auto-transición primer escaneo» (`toTransition`…): renderizar esa página ya no cambia nada (cierra la fila 7a de `docs/pendientes.md`).
- [ ] **Step 5:** `npm run test:rls -- scan-stamp` → PASS.
- [ ] **Step 6: Commit** — `feat(scan): el escaneo registra la hora y pone la avería en cours`.

### Task 3: Lectura de la regla para una avería

**Files:**
- Modify: `src/lib/scan.server.ts` (función nueva)
- Test: `tests/rls/scan-stamp.test.ts`

**Interfaces:**
- Consumes: `closeGate`, `CloseGate` (Task 1).
- Produces: `getCloseGate(incidentId: string, userId: string, resolvedAt: string | null): Promise<CloseGate>` — lee con el cliente admin los `scanned_at` de ese usuario en esa avería y devuelve `closeGate(...)`. Ante error de lectura devuelve `{ canClose: false, closeUntil: null }` y registra.

- [ ] **Step 1: Test** `getCloseGate: dos escaneos recientes → canClose true; uno → false`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(scan): getCloseGate para la ficha y la acción del técnico`.

### Task 4: La acción del técnico aplica la regla

**Files:**
- Modify: `src/app/tech/incidents/[id]/actions.ts` (`submitInterventionAction`)
- Test: `tests/e2e/sav-workflow.spec.ts`

**Interfaces:**
- Consumes: `getCloseGate` (Task 3).

- [ ] **Step 1: Implementar**, justo después de leer `old_status` y validar `new_status`, y solo si el usuario es técnico **sin** `is_dispatcher` (leer `profiles.role, is_dispatcher`; un admin que use la PWA queda excluido):
  - `new_status === 'en_cours' && old_status !== 'en_cours'` → `{ error: 'Scannez le QR de la machine pour démarrer l\'intervention.' }` (empezar solo lo hace el escaneo; reabrir es cosa de la oficina).
  - `new_status === 'résolu' && old_status !== 'résolu'` y `!(await getCloseGate(id, user.id, incident.resolved_at)).canClose` → `{ error: 'Scannez à nouveau le QR de la machine pour clôturer (valable 1 heure).' }`. Añadir `resolved_at` al `select` de la avería.
  - Devolver el error **antes** de escribir nada (ni archivo de rastro ni `update`).
- [ ] **Step 2:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 3: Commit** — `feat(tech): no se empieza ni se cierra una avería sin escanear`.

### Task 5: La ficha del técnico lo explica

**Files:**
- Modify: `src/app/tech/incidents/[id]/page.tsx` (pasar `closeGate` y `needsStart`)
- Modify: `src/app/tech/incidents/[id]/intervention-form.tsx`
- Test: `tests/e2e/sav-workflow.spec.ts`

**Interfaces:**
- Consumes: `getCloseGate` (Task 3), `CloseGate` (Task 1).
- Produces: props nuevas de `InterventionForm`: `needsStart: boolean` (avería `nouveau`/`assigné`), `closeGate: CloseGate` (serializar `closeUntil` como `string | null`).

- [ ] **Step 1: Página:** calcular `needsStart` y `closeGate` (solo para técnico sin `is_dispatcher`; si no, `needsStart=false` y `canClose=true`).
- [ ] **Step 2: Formulario:**
  - `needsStart` → en lugar del formulario, un aviso con el texto de empezar y un botón «Scanner la machine» a `/tech/scan` (el escáner de la app).
  - opción «Résolu» deshabilitada si `!closeGate.canClose`, con el texto de cerrar y el mismo botón; si `canClose`, una línea «Clôture possible jusqu'à HH:MM» (`closeUntil`, hora local `fr-FR`).
  - El estado `en_cours` sigue disponible para guardar el informe a medias cuando la avería ya está `en_cours`.
  - Corregir de paso la errata `nuevo: 'Nuevo'` → `nouveau: 'Nouveau'` en `STATUS_LABEL` (misma línea que se toca).
- [ ] **Step 3: E2E** en `tests/e2e/sav-workflow.spec.ts`, ajustando el recorrido actual (que espera `en_cours` al abrir `/tech/scan/<serie>`):
  - `abrir /tech/scan/<serie> ya NO pone en_cours`
  - `ir a /m/<serie> (escaneo) → en_cours`
  - `ficha: «Résolu» deshabilitado con un solo escaneo`
  - `segundo /m/<serie> → «Résolu» habilitado → resolver con informe → status résolu` (para no esperar los 60 s de la deduplicación, el test retrasa 2 min el `scanned_at` del primer escaneo con el cliente admin antes del segundo `/m/<serie>`)
  - `escaneo de cierre de hace 61 min (fixture) → error de cierre y el informe tecleado sigue en el textarea` (Review Focus 4)
- [ ] **Step 4:** `supabase start` + `eval "$(supabase status -o env)"` + `npm run test:e2e -- sav-workflow` → PASS. `npm run typecheck && npm test && npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(tech): la ficha pide escanear para empezar y para cerrar`.
- [ ] **Step 6: PR A.** Descripción con el orden de publicación. **Antes del merge:** el usuario lanza `supabase db push` (solo la migración `20261021100000`) y se comprueba en prod que la tabla existe y está vacía. Merge en buena hora; comprobar con `docs/cambios-en-produccion.md` §5.

### Task 6: El trigger en la BD (PR B)

**Files:**
- Create: `supabase/migrations/20261021110000_guard_tech_scan_required.sql`
- Modify: `docs/rollback-2026-10-21-doble-escaneo.md` (sección «Migración 2»)
- Create: `tests/rls/tech-scan-required.test.ts`
- Modify: los tests RLS existentes en los que **una sesión de técnico** cambia el estado (`tests/rls/tech-scope-columns.test.ts`, `tests/rls/geolocation.test.ts:408` y los que salgan al correr la suite): sembrar dos escaneos con el cliente admin antes del cambio, o esperar el rechazo si el test trata de eso.

**Interfaces:**
- Produces: función `public.guard_tech_scan_required()` + `trigger trg_guard_tech_scan_required BEFORE UPDATE ON public.incidents FOR EACH ROW`.

- [ ] **Step 1: Tests** en `tests/rls/tech-scan-required.test.ts` (patrón de `tech-scope-columns.test.ts`, con `signInAs`):
  - `técnico: assigné → en_cours con su sesión → rechazado`
  - `técnico: en_cours → résolu sin escaneos → rechazado`
  - `técnico: con un escaneo → rechazado`
  - `técnico: con dos escaneos (el último hace 5 min) → permitido`
  - `técnico: con dos escaneos (el último hace 61 min) → rechazado`
  - `técnico: en_cours → fermé con vía intervention e informe, sin escaneos → rechazado` (no se salta la regla yendo directo a fermé)
  - `técnico: escaneos anteriores al resolved_at de una reabierta → rechazado`
  - `oficina puso en_cours; técnico con dos escaneos posteriores → permitido` (Review Focus 2)
  - `admin con su sesión cierra sin escaneos → permitido` (con motivo de oficina)
  - `dispatcher (técnico con is_dispatcher) cierra sin escaneos → permitido`
  - `service_role → permitido`
  - `técnico guarda el informe sin cambiar de estado → permitido`
- [ ] **Step 2:** `npm run test:rls -- tech-scan-required` → FAIL.
- [ ] **Step 3: Migración.** `guard_tech_scan_required()`, `SECURITY DEFINER`, `set search_path = public`:
  - Sale (`return new`) si `auth.role() is distinct from 'authenticated'`, si `new.status is not distinct from old.status`, o si el usuario no es `role = 'technician' and not is_dispatcher` en `profiles`.
  - `new.status = 'en_cours'` → `raise exception` con el texto de empezar, `errcode = 'check_violation'`.
  - `new.status in ('résolu','fermé')` y `old.status in ('nouveau','assigné','en_cours')` → contar en `incident_scans` los de `scanned_by = auth.uid()`, `incident_id = new.id`, `scanned_at > coalesce(old.resolved_at, '-infinity')`; si `count < 2` o `max(scanned_at) < now() - interval '60 minutes'` → `raise exception` con el texto de cerrar.
  - Misma ventana que `CLOSE_SCAN_WINDOW_MINUTES`: comentario en los dos sitios apuntando al otro.
- [ ] **Step 4: Rollback** «Migración 2»: `drop trigger trg_guard_tech_scan_required on public.incidents; drop function public.guard_tech_scan_required();`.
- [ ] **Step 5:** `supabase db reset` + `npm run test:rls` (suite completa) → PASS, ajustando los tests existentes indicados en **Files**.
- [ ] **Step 6: Commit** — `feat(db): la BD exige el doble escaneo a los técnicos`.

### Task 7: Documentación (PR B)

**Files:**
- Modify: `docs/architecture.md` (sección «El QR: semáforo, nunca bloqueo» → nueva regla; §3 PWA técnico: el paso a en_cours ya no ocurre al abrir la ficha; tabla `incident_scans` en el esquema; cabecera «Última actualización»)
- Modify: `docs/pendientes.md` (fila 7: cerrada la parte a; nota del 2026-10-21)
- Modify: `CLAUDE.md` (hito)

- [ ] **Step 1:** Actualizar los tres documentos (fechas absolutas, estilo existente).
- [ ] **Step 2: Commit** — `docs: doble escaneo obligatorio para los técnicos`.
- [ ] **Step 3: PR B.** Antes del merge: PR A en prod y comprobado; el usuario lanza `supabase db push` (migración `20261021110000`). Comprobación en prod: un `UPDATE` de estado con sesión de técnico sin escaneos debe fallar (hacerlo en la BD local, no en prod: no hay técnico de prueba en prod).

---

## Fuera de alcance (anotado, no se hace)

- Mantenimientos preventivos (decisión 4).
- Mostrar en la ficha de `/admin` la lista de escaneos con su hora: útil para supervisar, pero es otro cambio.
- El sello sigue siendo falsificable por un técnico que teclee `/m/<serie>` sin tener la etiqueta delante (hallazgos F10–F12, aceptados): la regla nueva lo hace más pesado (dos veces, en la ventana), no imposible.

## Aviso a los técnicos (lo hace el usuario, antes de publicar el PR A)

> «À partir de [fecha], pour démarrer une intervention il faut scanner le QR de la machine avec l'application, et le scanner une deuxième fois pour la clôturer (vous avez ensuite 1 heure pour écrire le rapport). Si vous ne pouvez pas scanner (étiquette abîmée, panne réglée par téléphone…), appelez le bureau : c'est lui qui clôture.»
