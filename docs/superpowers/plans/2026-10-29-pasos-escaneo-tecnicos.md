# Ficha de avería en 3 pasos para los técnicos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el técnico de campo no tenga que adivinar nada con el doble escaneo: la ficha de la avería le guía en 3 pasos (Démarrer → Rapport → Clôturer), escanea **sin salir de la ficha**, y el escaneo de cierre **es** el botón de cerrar.

**Architecture:** Solo app (tipo A de `docs/cambios-en-produccion.md`): **sin migraciones**, el trigger `trg_guard_tech_scan_required` y `closeGate` no cambian. La cámara se saca de `qr-scanner.tsx` a un componente reutilizable (`QrCamera`) que se abre en una hoja a pantalla completa encima de la ficha. Escanear para empezar llama a una Server Action nueva que comprueba que es la máquina de la avería y sella (`stampQrScan`); escanear para cerrar manda el formulario con `scan_serie` y `submitInterventionAction` sella antes de comprobar el candado. Las decisiones de qué mostrar van en funciones puras de `scanGate.ts` (testeadas con vitest).

**Tech Stack:** Next.js 16 (Server Actions, Client Components), `@zxing/browser`, vitest (lógica pura), Playwright (E2E, solo local).

**Spec:** propuesta aprobada por el usuario el 2026-10-29 (abajo). No hay documento aparte.

## Spec — lo que pidió el usuario (2026-10-29)

Queja de los técnicos tras empezar a usarla: (1) hay dos botones de escanear (el flotante «Scanner une machine» y el de dentro de la avería) y no se sabe cuál usar; (2) el primer escaneo empieza la reparación sin avisar; (3) al cerrar no se sabe qué va antes, el informe o el escaneo.

Decisiones:
1. La ficha de la avería del técnico de campo es un camino de **3 pasos**: **1. Démarrer** (escanear) → **2. Rapport** (informe + piezas, se puede guardar sin cerrar) → **3. Clôturer**.
2. **El 2º escaneo cierra la avería directamente**, con el informe ya escrito. Desaparece la elección «En cours / Résolu» para el técnico de campo.
3. **El informe es obligatorio para cerrar**: el botón de cerrar no se activa sin informe.
4. Escanear se hace **encima de la ficha** (no se sale de ella). Escanear otra máquina → «ce n'est pas la bonne machine», y no se sella nada.
5. El botón flotante se queda (mantenimientos, consultar máquinas), pero **no aparece en la ficha de la avería**, y si el escaneo cae en una máquina con **una** avería abierta del técnico (y sin mantenimiento que toque), lleva **directo a esa avería**.
6. Atelier y admins (`requiresScan` = false) **no cambian**: siguen con la elección de estado de siempre.

## Global Constraints

- Sin cambios de BD. `CLOSE_SCAN_WINDOW_MINUTES = 60` y `SCAN_DEDUPE_SECONDS = 60` siguen igual, así como `CLOSE_SCAN_ERROR` y `START_SCAN_ERROR` (deben coincidir letra por letra con el trigger).
- Textos de pantalla en francés, exactamente estos:
  - Paso 1: título `1. Démarrer` · pendiente `Arrivé devant la machine ? Scannez son QR pour démarrer l'intervention.` · botón `Scanner pour démarrer` · hecho `Démarrée — scan à HH:MM` (o `Démarrée` sin hora si no hay escaneo, avería ya `résolu`).
  - Paso 2: título `2. Réparer et écrire le rapport` · bloqueado `Disponible après le scan de démarrage.` · botón secundario `Enregistrer sans clôturer` · ayuda `L'intervention reste en cours, le rapport est gardé.`
  - Paso 3: título `3. Clôturer` · sin informe `Écrivez d'abord le rapport (étape 2).` · escanear `Scannez à nouveau le QR de la machine : l'intervention sera clôturée.` + botón `Scanner pour clôturer` · esperar `Scan de clôture possible dans M:SS` (botón desactivado) · confirmar `Scan de clôture enregistré — clôture possible jusqu'à HH:MM.` + botón `Clôturer l'intervention` · ya cerrada `Intervention clôturée.`
  - Hoja de escaneo: títulos `Scan de démarrage` / `Scan de clôture` · botón `Annuler` · capa `QR détecté — enregistrement…` / `QR détecté — clôture…`.
  - Máquina equivocada: `WRONG_MACHINE_ERROR = 'Ce QR n\'est pas celui de la machine de cette intervention.'`
  - Escaneo de inicio sin red: `Scan non enregistré — vérifiez la connexion et scannez à nouveau.` (mismo texto que la ficha de máquina).
  - Aviso tras el botón flotante (`?scan=1`): `Scan enregistré.`
- Cambios en producción según `docs/cambios-en-produccion.md`: rama + PR, CI en verde, merge lo pulsa el usuario, **tarde-noche**; deshacer = *Instant Rollback* de Vercel.

## Review Focus

1. **Escanear la máquina equivocada desde la hoja** (dos impresoras juntas) → error claro y **nada sellado** en ninguna de las dos (la comprobación va ANTES de `stampQrScan`). Test: `sameMachine` en Task 1; orden en Tasks 2 y 3 (revisión de código).
2. **Avería arreglada en menos de 1 min** → el paso 3 muestra la cuenta atrás, no un error tras escanear. Test `closeAction` → `wait` en Task 1.
3. **Avería que la oficina puso «En cours» sin ningún escaneo** → el paso 1 pide escanear (no se queda atascado en el 3 con un solo escaneo). Test `interventionStarted` en Task 1.
4. **Botón flotante en una máquina con avería del técnico Y mantenimiento que toca** → va a la ficha de máquina (se ven las dos cosas), no a la avería. Test `scanDestination` en Task 1.
5. **La ventana de 1 h vence con la ficha abierta** → al pulsar `Clôturer l'intervention`, error, el informe sigue ahí y el botón pasa a `Scanner pour clôturer`. Test E2E en Task 5.

---

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/scanGate.ts` (modificar) | + `sameMachine`, `interventionStarted`, `closeAction`, `scanDestination`, `WRONG_MACHINE_ERROR` |
| `src/lib/scan.server.ts` (modificar) | `stampQrScan` devuelve también las averías abiertas del técnico y si hay visita que toca |
| `src/components/tech/QrCamera.tsx` (crear) | Solo la cámara: vídeo, visor, lector zxing, error de permisos |
| `src/components/tech/ScanSheet.tsx` (crear) | Hoja a pantalla completa: título + `QrCamera` + `Annuler` |
| `src/app/tech/scan/qr-scanner.tsx` (modificar) | Usa `QrCamera`; navega con `scanDestination` |
| `src/app/tech/scan-fab.tsx` (crear) | Botón flotante, oculto en `/tech/incidents/[id]` |
| `src/app/tech/layout.tsx` (modificar) | Usa `ScanFab` |
| `src/app/tech/incidents/[id]/actions.ts` (modificar) | + `startInterventionScanAction`; `submitInterventionAction` acepta `scan_serie` |
| `src/app/tech/incidents/[id]/page.tsx` (modificar) | Pasa `mustScan`, `machineSerie`, `scanNotice` |
| `src/app/tech/incidents/[id]/intervention-form.tsx` (modificar) | Modo 3 pasos para `mustScan`; modo actual para el resto |
| `tests/e2e/sav-workflow.spec.ts` (modificar) | Recorridos con la ficha nueva |

---

### Task 1: Reglas puras de la ficha (`scanGate.ts`)

**Files:**
- Modify: `src/lib/scanGate.ts`
- Test: `src/lib/scanGate.test.ts`

**Interfaces:**
- Consumes: `CloseGate` (ya existe).
- Produces:
  ```ts
  export const WRONG_MACHINE_ERROR: string
  export function sameMachine(scanned: string, expected: string | null): boolean
  export function interventionStarted(status: string, firstScanAt: Date | null): boolean
  export type CloseAction =
    | { kind: 'confirm'; until: Date }   // 2º escaneo ya hecho y vigente: cerrar sin escanear
    | { kind: 'scan' }                    // escanear ahora cierra
    | { kind: 'wait'; from: Date }        // escanear ahora sería rebote: esperar hasta `from`
  export function closeAction(gate: CloseGate, now?: Date): CloseAction
  export function scanDestination(r: { serie: string; recorded: boolean; myIncidentIds: string[]; visitDue: boolean }): string
  ```

- [ ] **Step 1: Escribir los tests que fallan** en `scanGate.test.ts`:
  - `sameMachine('ab-12 ', 'AB-12')` → `true`; `sameMachine('AB-12', 'AB-13')` → `false`; `sameMachine('AB-12', null)` → `false`; `sameMachine('', '')` → `false`.
  - `interventionStarted('en_cours', fecha)` → `true`; `('en_cours', null)` → `false` (la oficina la puso en curso sin escaneo); `('assigné', fecha)` → `false` (escaneo de antes de asignarla); `('nouveau', fecha)` → `false`; `('résolu', null)` → `true`.
  - `closeAction` con `closeGate([minAgo(30), minAgo(10)], null, NOW)` → `{ kind: 'confirm', until: minAgo(10) + 60 min }`.
  - `closeAction` con un escaneo hace 20 s → `{ kind: 'wait', from: escaneo + 60 s }`.
  - `closeAction` con un escaneo hace 5 min → `{ kind: 'scan' }`; con dos escaneos y el último hace 61 min (`expired`) → `{ kind: 'scan' }`; sin escaneos → `{ kind: 'scan' }`.
  - `scanDestination({ serie: 'A B', recorded: false, myIncidentIds: ['x'], visitDue: false })` → `'/tech/scan/A%20B?scan=echec'`.
  - `scanDestination({ serie: 'A B', recorded: true, myIncidentIds: ['x'], visitDue: false })` → `'/tech/incidents/x?scan=1'`.
  - Con `myIncidentIds: ['x', 'y']` → `'/tech/scan/A%20B'`; con `['x']` y `visitDue: true` → `'/tech/scan/A%20B'`; con `[]` → `'/tech/scan/A%20B'`.

- [ ] **Step 2: Ejecutar y ver que fallan**

  Run: `npx vitest run src/lib/scanGate.test.ts` · Expected: FAIL (`sameMachine is not a function`…).

- [ ] **Step 3: Implementar en `scanGate.ts`**. `sameMachine` compara tras `trim()` + `toUpperCase()` y devuelve `false` si alguno queda vacío. `interventionStarted` = `status === 'résolu' || (!['nouveau','assigné'].includes(status) && firstScanAt !== null)`. `closeAction`: `canClose` → `confirm` con `closeUntil`; `nextScanAfter` posterior a `now` → `wait`; si no, `scan`. `WRONG_MACHINE_ERROR` con el texto de Global Constraints. Cada función con un comentario corto del porqué, como las que ya hay.

- [ ] **Step 4: Ejecutar y ver que pasan**

  Run: `npx vitest run src/lib/scanGate.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit** — `feat(tech): reglas puras de la ficha en 3 pasos`

---

### Task 2: El escaneo dice adónde ir + cámara reutilizable + botón flotante

**Files:**
- Modify: `src/lib/scan.server.ts` (`stampQrScan`, `stampIncidents`, `stampMaintenanceVisit`)
- Modify: `src/app/tech/scan/actions.ts` (tipo de vuelta de `recordQrScanAction`)
- Create: `src/components/tech/QrCamera.tsx`, `src/components/tech/ScanSheet.tsx`, `src/app/tech/scan-fab.tsx`
- Modify: `src/app/tech/scan/qr-scanner.tsx`, `src/app/tech/layout.tsx`

**Interfaces:**
- Consumes: `scanDestination` (Task 1).
- Produces:
  ```ts
  // scan.server.ts
  export type ScanStamp = { needsLocation: boolean; myIncidentIds: string[]; visitDue: boolean }
  export async function stampQrScan(numeroSerie: string, userId: string): Promise<ScanStamp>
  // QrCamera.tsx (default export)
  function QrCamera(props: { onDecode: (serie: string) => void; overlay: string | null }): JSX.Element
  // ScanSheet.tsx (default export)
  function ScanSheet(props: { title: string; overlay: string | null; onDecode: (serie: string) => void; onCancel: () => void }): JSX.Element
  ```

- [ ] **Step 1: `stampQrScan` devuelve `ScanStamp`.** `myIncidentIds` = ids de las averías leídas en `stampIncidents` con `assigned_to === userId` y estado abierto (las que ya lee; sin consulta nueva). `visitDue` = `stampMaintenanceVisit` encontró visita que toca (`due !== null`, aunque ya estuviera `qr_verified`). Máquina inactiva o error de lectura → `{ needsLocation: false, myIncidentIds: [], visitDue: false }`. Sigue sin lanzar nunca. `/m/[serie]` ignora la vuelta: no se toca.

- [ ] **Step 2: Crear `QrCamera`** con lo que hoy es cámara en `qr-scanner.tsx`: lector zxing, `scannedRef` (una sola lectura), `releaseAllStreams()` al leer y al desmontar, `extractSerie` sobre el texto, mensaje de permisos, visor y capa `overlay` cuando no es null. No sella ni navega: llama a `onDecode(serie)`.

- [ ] **Step 3: Reescribir `qr-scanner.tsx` sobre `QrCamera`**: misma lógica de sello (tope 2,5 s, posición si `needsLocation`), pero la navegación final es `router.push(scanDestination({ serie, recorded, myIncidentIds, visitDue }))` (si el sello no llegó, `myIncidentIds: []`, `visitDue: false`).

- [ ] **Step 4: Crear `ScanSheet`**: `fixed inset-0 z-50 bg-page`, con `safe-area` arriba y abajo, título, `QrCamera`, y botón `Annuler` (`onCancel`). Se monta solo mientras está abierta: al cerrarla, `QrCamera` se desmonta y libera la cámara.

- [ ] **Step 5: Crear `scan-fab.tsx`** (Client Component, `usePathname`) con el enlace flotante que hoy está en `layout.tsx`, mismo marcado; devuelve `null` si la ruta casa con `/^\/tech\/incidents\/[^/]+/`. `layout.tsx` lo usa en lugar del bloque actual.

- [ ] **Step 6: Comprobar**

  Run: `npm run typecheck && npm test` · Expected: sin errores, todo PASS.

- [ ] **Step 7: Commit** — `feat(tech): el escáner lleva a la avería del técnico y la cámara se reutiliza`

---

### Task 3: Server Actions — empezar y cerrar escaneando

**Files:**
- Modify: `src/app/tech/incidents/[id]/actions.ts`

**Interfaces:**
- Consumes: `stampQrScan` (Task 2), `sameMachine`, `WRONG_MACHINE_ERROR` (Task 1), `incidentSerie` (ya existe en este archivo).
- Produces:
  ```ts
  export async function startInterventionScanAction(
    incidentId: string, rawSerie: string,
  ): Promise<{ error: string } | { needsLocation: boolean }>
  // submitInterventionAction: nuevo campo opcional del FormData `scan_serie`
  ```

- [ ] **Step 1: `startInterventionScanAction`.** Usuario con sesión (si no, `redirect('/login')`); lee la avería con el cliente del usuario (`assigned_to, contract_machine_id, machine_id`); no es suya → `{ error: 'Non autorisé.' }`; `!sameMachine(rawSerie, await incidentSerie(...))` → `{ error: WRONG_MACHINE_ERROR }` **sin sellar**; si no, `stampQrScan(rawSerie.trim(), user.id)` y devuelve `{ needsLocation }`. Comentario: misma credibilidad que `recordQrScanAction` (el serie sale de leer la etiqueta).

- [ ] **Step 2: `scan_serie` en `submitInterventionAction`.** Justo antes del bloque del doble escaneo: si `formData.get('scan_serie')` es un texto no vacío y `new_status === 'résolu'`, calcular `serie = await incidentSerie(supabase, incident)`; `!sameMachine` → `{ error: WRONG_MACHINE_ERROR }` (antes de escribir nada); si coincide, `await stampQrScan(serie, user.id)`. Reutilizar ese `serie` más abajo en `computePresence` en vez de volver a calcularlo. Sin `scan_serie` la acción se comporta exactamente como hoy.

- [ ] **Step 3: Comprobar**

  Run: `npm run typecheck && npm test` · Expected: sin errores, todo PASS.

- [ ] **Step 4: Commit** — `feat(tech): empezar y cerrar la avería escaneando desde la ficha`

---

### Task 4: La ficha en 3 pasos

**Files:**
- Modify: `src/app/tech/incidents/[id]/page.tsx`
- Modify: `src/app/tech/incidents/[id]/intervention-form.tsx`

**Interfaces:**
- Consumes: `interventionStarted`, `closeAction`, `CloseAction` (Task 1); `ScanSheet` (Task 2); `startInterventionScanAction`, `scan_serie` (Task 3); `recordMachineLocationAction` (`src/app/tech/scan/actions.ts`).
- Produces: props de `InterventionForm` — se quita `needsStart`; se añaden `mustScan: boolean`, `machineSerie: string | null`, `scanNotice: boolean`.

- [ ] **Step 1: `page.tsx`.** Pasar `mustScan` (ya calculado), `machineSerie` (el `numero_serie` de la máquina de la línea, que ya se selecciona, o `incident.machine_id`) y `scanNotice` (`searchParams.scan === '1'`). Quitar `needsStart`.

- [ ] **Step 2: Modo actual intacto para `!mustScan`.** Atelier/admin: radios, `handleSubmit` con posición, botón `Enregistrer l'intervention`, igual que hoy. Lo de bloquear «Résolu» (`closeHint`, `resolveLocked`, `scanButton`) desaparece: con `!mustScan`, `closeGate.canClose` siempre es `true`.

- [ ] **Step 3: Modo 3 pasos para `mustScan`**, con los textos exactos de Global Constraints:
  - `started = interventionStarted(incident.status, firstScanAt)`. Sin empezar: paso 1 con `Scanner pour démarrer`, pasos 2 y 3 en gris con `Disponible après le scan de démarrage.` (sin campos).
  - Paso 2 = los campos de siempre (informe, piezas, comentario) + `<input type="hidden" name="status">` con `résolu` si la avería ya está resuelta y `en_cours` si no, y el botón secundario `Enregistrer sans clôturer` (envío normal, sin posición).
  - Paso 3 según `closeRejected ? { kind: 'scan' } : closeAction(gate)`; con `rapport.trim() === ''` el botón queda desactivado y sale `Écrivez d'abord le rapport (étape 2).` La cuenta atrás de `wait` se refresca cada segundo (`setInterval` en un efecto, que se limpia al llegar a `from`).
  - `state.error` se pinta dentro del paso 3, encima de los botones (es donde mira el técnico).
  - `scanNotice` → aviso verde `Scan enregistré.` arriba.

- [ ] **Step 4: Escanear desde la hoja.** Estado `sheet: null | 'start' | 'close'`.
  - `start`: `onDecode` → capa `QR détecté — enregistrement…` → `startInterventionScanAction(incident.id, serie)`. Error → se cierra la hoja y se muestra el error en el paso 1; excepción de red → el texto `Scan non enregistré…`. OK → si `needsLocation`, `getPositionOnce(3000, 0)` y `recordMachineLocationAction`; luego se cierra la hoja y `router.refresh()`.
  - `close`: `onDecode` → capa `QR détecté — clôture…` → `close(serie)`.
  - `close(scanSerie?: string)`, también para `Clôturer l'intervention` (sin serie): `FormData` del `<form>` (ref), `set('status', 'résolu')`, `set('scan_serie', …)` si hay serie, `appendPosition(data, await getPositionOnce(4000))`, `clearDraft`, `startTransition(() => formAction(data))`. La hoja se cierra al empezar el envío.
  - Actualizar el comentario del borrador: sigue haciendo falta porque el técnico puede salir de la ficha (atrás, botón flotante en otra pantalla), ya no por el escaneo.

- [ ] **Step 5: Comprobar**

  Run: `npm run typecheck && npm test && npm run build` · Expected: sin errores.

- [ ] **Step 6: Commit** — `feat(tech): ficha de avería en 3 pasos para el técnico de campo`

---

### Task 5: E2E y documentación

**Files:**
- Modify: `tests/e2e/sav-workflow.spec.ts`
- Modify: `docs/architecture.md` (§ PWA técnicos, líneas «Empezar = escanear» y «FAB»), `docs/pendientes.md` (fila 15 y nota «Por dónde seguir»)

- [ ] **Step 1: Reescribir el test 1** (recorrido). Tras asignar y comprobar la lista:
  - ficha de la avería: visible el botón `Scanner pour démarrer` y `Disponible après le scan de démarrage.`; `page.getByRole('link', { name: 'Scanner une machine' })` → `toHaveCount(0)` (y `toHaveCount(1)` en `/tech`);
  - `/m/<serie>` → `en_cours`; recargar la ficha: `/^Démarrée — scan à \d{2}:\d{2}$/`, botón de cierre desactivado + `Écrivez d'abord le rapport (étape 2).`;
  - rellenar informe → `/Scan de clôture possible dans \d:\d{2}/`;
  - `backdateScans(…, 2)` + recargar → botón `Scanner pour clôturer` activo; pulsarlo abre `Scan de clôture` y `Annuler` la cierra (en headless la cámara falla: basta con que la hoja abra y cierre);
  - `/m/<serie>` otra vez + recargar → `/clôture possible jusqu'à \d{2}:\d{2}/`, pulsar `Clôturer l'intervention` → `résolu`.
- [ ] **Step 2: Reescribir el test 2** (ventana vencida) sin radios: con dos escaneos (el último hace 59 min) escribir el informe, `backdateScans(…, 2)`, pulsar `Clôturer l'intervention` → visible `CLOSE_SCAN_ERROR`, el informe sigue, estado `en_cours`, aparece `Scanner pour clôturer`; `/m/<serie>` + recargar → el informe vuelve del borrador, `Clôturer l'intervention` → `résolu` con ese informe y el borrador borrado (mismas comprobaciones finales que hoy).
- [ ] **Step 3: Ejecutar E2E en local**

  Run: `supabase start && eval "$(supabase status -o env)" && npm run test:e2e` · Expected: todo PASS.

- [ ] **Step 4: Docs.** `architecture.md`: la ficha en 3 pasos, la hoja de escaneo, `scan_serie`, `startInterventionScanAction`, `scanDestination` y que el FAB se oculta en la ficha de avería (con fecha 2026-10-29 en la cabecera). `pendientes.md` fila 15: tachar (c) (la hora «à partir de» la sustituye la cuenta atrás) y anotar que (e) solo queda en la ficha de máquina; nota del día en «Por dónde seguir». Sin migraciones: no hace falta documento de reversión (*Instant Rollback*).
- [ ] **Step 5: Commit + PR** — `docs: ficha de avería en 3 pasos`. PR con la lista de pruebas en el iPhone de abajo.

---

## Prueba en el iPhone tras publicar (§5 de cambios-en-produccion)

Con la cuenta y la máquina de prueba, tarde-noche:
1. Avería asignada → ficha → `Scanner pour démarrer` → escanear **otra** máquina → `Ce QR n'est pas celui…`, nada cambia.
2. Escanear la buena → la hoja se cierra, paso 1 `Démarrée — scan à …`, sin salir de la ficha.
3. Botón de cierre gris sin informe; con informe, cuenta atrás si no ha pasado 1 min.
4. `Scanner pour clôturer` → escanear → avería resuelta, vuelta a `/tech`.
5. Botón flotante desde `/tech` sobre una máquina con una avería propia → abre esa avería con `Scan enregistré.`
6. Atelier: su formulario sigue igual.
7. Desde la lista de averías, abrir una cerrada (`fermé`) → paso 3 `Intervention clôturée.`, el informe visible (sin poder editarlo) y sin pedir escanear.

## Mensaje para los técnicos (WhatsApp, tras publicar)

> Nouvelle version de l'appli AMD SAV. Dans chaque intervention, suivez les 3 étapes :
> **1.** Devant la machine : « Scanner pour démarrer ».
> **2.** Réparez, puis écrivez le rapport.
> **3.** « Scanner pour clôturer » : le scan clôture l'intervention.
> Plus besoin de choisir « En cours » ou « Résolu ».
