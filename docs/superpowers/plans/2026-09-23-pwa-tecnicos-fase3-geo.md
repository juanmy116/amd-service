# PWA técnicos — Fase 3: geolocalización · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada máquina tenga su ubicación exacta (se guarda sola al primer escaneo; el admin la corrige), que el técnico tenga un botón **«Itinéraire»** (Google Maps / Waze / Plans) y un orden **«Plus proche»**, y que la oficina vea si el técnico **estaba en el sitio** al resolver una avería o cerrar un mantenimiento (🟢 ≤ 200 m / 🟡 lejos o sin posición). De paso, el «QR vérifié» de los mantenimientos pasa a ser **real**.

**Architecture:** la posición del navegador se pide **solo** en tres momentos (escaneo, resolución, cierre) con un helper cliente con tope de tiempo; nunca en segundo plano. El servidor calcula la distancia a la máquina (haversine, `src/lib/geo.ts`, puro y testeado) y guarda posición + veredicto en la tarea. Nunca bloquea: sin permiso o sin GPS ⇒ se cierra igual, queda 🟡 «sans position». La ubicación de la máquina solo la fija el **primer escaneo con buena precisión** (≤ 100 m) o el admin.

**Spec:** `docs/superpowers/specs/2026-09-22-pwa-tecnicos-design.md` §Fase 3. **Decisiones del usuario (2026-09-23):** arreglar aquí el falso «QR vérifié» de mantenimientos · al técnico lejos **no** se le avisa, solo se registra · «Plus proche» en la lista de averías **y** en Planning. Anteriores: por máquina, captura automática al primer escaneo, admin corrige, menú de 3 apps, umbral 200 m, orden por urgencia por defecto.

---

## Datos verificados en el código (exploración 2026-09-23)

- `next.config.ts:63` → `Permissions-Policy: camera=(self), microphone=(), geolocation=()` **bloquea** la geolocalización.
- Ninguna tabla tiene lat/lng salvo `quartiers` (`lat`, `lng`). `machines`: `localisation` (texto), `quartier_code`. `clients`: `adresse`, `ville`, `quartier_code`. Barrio efectivo: `resolveQuartierCode(machine, client)` en `src/lib/quartiers.ts`. No existe helper de distancia.
- Resolución de avería: `src/app/tech/incidents/[id]/intervention-form.tsx` (cliente, `useActionState`) → `submitInterventionAction` en `actions.ts` (actualiza `incidents`, `buildResolution`, `clearResolution` al reabrir — `src/lib/resolution.ts:261-276`).
- Cierre de mantenimiento: `src/components/tech/MaintenanceVisitForm.tsx` (cliente, `useActionState`) → `closeMaintenance` → RPC `close_maintenance_visit` (`supabase/migrations/20260604140000_*`), que pone **siempre** `qr_verified = true` (línea 66).
- Escáner: `qr-scanner.tsx` → `recordQrScanAction(serie)` (tope 2,5 s) → `stampQrScan` (`src/lib/scan.server.ts`) sella **solo incidencias**.
- Oficina: marca QR en `src/app/admin/incidents/[id]/page.tsx:96-97,203-213`; visitas en `src/app/admin/maintenance/[id]/page.tsx:49,176-179`.
- Máquina admin: `src/app/admin/machines/[serie]/page.tsx` → `MachineForm`.
- Listas técnico: `/tech/incidents` (`TechIncidentList`, cliente), `/tech/planning` (servidor).

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260925100000_geolocation.sql` | Columnas de posición, RPC de cierre sin QR falso |
| `src/lib/geo.ts` + `.test.ts` | Distancia, veredicto, enlaces de itinerario, parseo de enlace/coords, formato, orden |
| `src/lib/pwa/geolocation.ts` | `getPositionOnce()` (cliente) |
| `next.config.ts` | `geolocation=(self)` |
| `src/lib/scan.server.ts`, `src/app/tech/scan/actions.ts`, `src/app/tech/scan/qr-scanner.tsx` | Sellar visitas + guardar ubicación de la máquina en el primer escaneo |
| `src/lib/presence.server.ts` | `computePresence(serie, position)` servidor (lee la máquina, devuelve columnas) |
| `src/app/tech/incidents/[id]/intervention-form.tsx`, `actions.ts`, `src/lib/resolution.ts` | Posición al resolver; limpiar al reabrir |
| `src/components/tech/MaintenanceVisitForm.tsx`, `.../maintenance/[visitId]/actions.ts` | Posición al cerrar |
| `src/components/tech/ItineraryButton.tsx` | Menú Google Maps / Waze / Plans |
| `src/app/tech/incidents/[id]/page.tsx`, `src/app/tech/scan/[serie]/page.tsx` | Datos de destino + botón |
| `src/components/tech/TechIncidentList.tsx`, `src/app/tech/incidents/page.tsx`, `src/app/tech/planning/page.tsx` (+ componente cliente) | «Plus proche» |
| `src/app/admin/incidents/[id]/page.tsx`, `src/app/admin/maintenance/[id]/page.tsx` | Fila/columna «Position» |
| `src/app/admin/machines/[serie]/page.tsx` + `MachinePositionCard.tsx` + acción | Ver y corregir la posición |
| `tests/rls/geolocation.test.ts`, `tests/e2e/*` | Tests |
| `docs/architecture.md`, `docs/pendientes.md`, spec | Docs |

Rama: `feat/pwa-tecnicos-fase3-geo` (creada desde `main`).

---

### Task 1: Migración

**File:** `supabase/migrations/20260925100000_geolocation.sql`

```sql
-- Fase 3 de la PWA de técnicos: geolocalización (2026-09-25).
-- 1) Ubicación exacta de cada máquina (primer escaneo con buena precisión, o el admin).
-- 2) Dónde estaba el técnico al resolver una avería / cerrar un mantenimiento, y el veredicto
--    calculado en el servidor contra la ubicación de la máquina (🟢 near ≤ 200 m / 🟡 far /
--    🟡 no_position = no dio permiso o sin GPS / ⚪ no_machine_position = la máquina aún no
--    tiene ubicación). Nunca bloquea nada.
-- 3) close_maintenance_visit deja de poner qr_verified = true a ciegas: el sello lo pone el
--    escaneo real (stampQrScan), igual que en las averías.

BEGIN;

ALTER TABLE public.machines
  ADD COLUMN lat                 double precision,
  ADD COLUMN lng                 double precision,
  ADD COLUMN location_accuracy_m real,
  ADD COLUMN location_source     text CHECK (location_source IN ('first_scan', 'admin')),
  ADD COLUMN location_set_at     timestamptz,
  ADD COLUMN location_set_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT machines_location_complete_chk CHECK (
    (lat IS NULL AND lng IS NULL AND location_source IS NULL)
    OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND location_source IS NOT NULL)
  );

-- Mismas columnas de presencia en incidencias y visitas.
ALTER TABLE public.incidents
  ADD COLUMN tech_lat          double precision,
  ADD COLUMN tech_lng          double precision,
  ADD COLUMN tech_accuracy_m   real,
  ADD COLUMN tech_distance_m   real,
  ADD COLUMN tech_position_at  timestamptz,
  ADD COLUMN tech_presence     text CHECK (tech_presence IN ('near', 'far', 'no_position', 'no_machine_position'));

ALTER TABLE public.maintenance_visits
  ADD COLUMN tech_lat          double precision,
  ADD COLUMN tech_lng          double precision,
  ADD COLUMN tech_accuracy_m   real,
  ADD COLUMN tech_distance_m   real,
  ADD COLUMN tech_position_at  timestamptz,
  ADD COLUMN tech_presence     text CHECK (tech_presence IN ('near', 'far', 'no_position', 'no_machine_position'));

-- close_maintenance_visit: misma firma; solo cambia que ya NO fuerza qr_verified.
-- (CREATE OR REPLACE conserva grants; se re-aplican por claridad.)
-- >>> Copiar íntegro el cuerpo vigente de 20260604140000_close_maintenance_visit_rpc.sql
-- >>> cambiando SOLO el UPDATE:
--   UPDATE maintenance_visits
--     SET status = 'fait', done_at = now(), done_by = p_done_by, notes = p_notes
--     WHERE id = p_visit_id AND status <> 'fait';
-- >>> y añadiendo al principio del cuerpo un comentario con el porqué.

COMMIT;
```

- [ ] **Step 1:** escribir la migración (con el cuerpo completo de la RPC, no el marcador). Verificar antes que no hay una definición posterior de `close_maintenance_visit` (`grep -l close_maintenance_visit supabase/migrations`) y que ninguna policy/vista usa `select *` de `machines`/`incidents`/`maintenance_visits` de forma que columnas nuevas rompan algo (vistas con `SELECT *` se congelan en su definición: no rompen).
- [ ] **Step 2: tests RLS** `tests/rls/geolocation.test.ts` (patrón de `tests/rls/push-notifications.test.ts`): (a) `close_maintenance_visit` con service_role sobre una visita con `qr_verified = false` la deja `fait` **y `qr_verified` sigue false**; con `qr_verified = true` previo, sigue true; (b) el CHECK de `machines` rechaza lat sin lng y lat fuera de rango; (c) un técnico no puede escribir `machines.lat` con su sesión (no hay policy de UPDATE de técnico en `machines` — confirmarlo en migraciones; si existiera, adaptar el test al comportamiento real y reportarlo).
- [ ] **Step 3:** añadir las columnas nuevas a `src/lib/supabase/types.ts` a mano, en el formato existente (Row/Insert/Update de las tres tablas).
- [ ] **Step 4:** `npm run typecheck`. **Commit** — `feat(geo): columnas de posición y cierre de mantenimiento sin QR falso`.

---

### Task 2: `src/lib/geo.ts` (puro, TDD)

- [ ] **Step 1: tests primero** (`src/lib/geo.test.ts`):
  - `distanceMeters(a, b)`: mismo punto ⇒ 0; Dakar Plateau (14.6708, -17.4381) → Almadies (14.7447, -17.5130) ≈ 11 400 m (±2 %); simétrica.
  - `presenceFor({ tech, machine })`: sin `tech` ⇒ `{ presence: 'no_position', distance: null }`; sin `machine` ⇒ `'no_machine_position'` (con `distance: null`); ≤ 200 m ⇒ `'near'`; > 200 m ⇒ `'far'`; devuelve `distance` redondeada al metro.
  - `PRESENCE_RADIUS_M === 200`, `FIRST_SCAN_MAX_ACCURACY_M === 100`.
  - `parseLatLng(text)`: `"14.6928, -17.4467"` ✓; `"14.6928,-17.4467"` ✓; enlaces de Google Maps: `https://www.google.com/maps/@14.6928,-17.4467,17z` ✓, `https://www.google.com/maps/place/X/@14.69,-17.44,17z/data=!3d14.6931!4d-17.4471` ⇒ prefiere `!3d/!4d` (el punto del lugar) sobre `@`; `https://maps.google.com/?q=14.69,-17.44` ✓; `https://maps.app.goo.gl/abc` ⇒ `null` (enlace corto: no se puede sin red); fuera de rango ⇒ `null`; texto cualquiera ⇒ `null`.
  - `itineraryLinks(dest)`: con coordenadas ⇒ `google: https://www.google.com/maps/dir/?api=1&destination=14.69,-17.44`, `waze: https://waze.com/ul?ll=14.69,-17.44&navigate=yes`, `apple: https://maps.apple.com/?daddr=14.69,-17.44`; con texto ⇒ los mismos con el texto `encodeURIComponent` (`destination=`, `q=` + `&navigate=yes`, `daddr=`); `null` si no hay ni coordenadas ni texto.
  - `destinationText({ adresse, quartier, ville })` ⇒ une lo que haya con `, ` y añade `Sénégal`; `null` si no hay nada.
  - `formatDistance(m)`: `45` ⇒ `45 m`; `1234` ⇒ `1,2 km`; `12345` ⇒ `12 km`.
  - `sortByDistance(items, origin, getCoords)`: ordena por distancia; los `null` al final conservando su orden relativo.
- [ ] **Step 2: implementar** con esas firmas exactas (tipos `LatLng = { lat: number; lng: number }`, `Presence = 'near' | 'far' | 'no_position' | 'no_machine_position'`). Radio terrestre 6 371 008 m.
- [ ] **Step 3:** `npx vitest run src/lib/geo.test.ts`. **Commit** — `feat(geo): distancia, veredicto de presencia e itinerarios`.

---

### Task 3: Permiso y helper de posición en el navegador

- [ ] **Step 1:** `next.config.ts`: `geolocation=(self)` (comentario: la PWA de técnicos pide la posición al escanear/resolver/cerrar; sigue prohibida para iframes de terceros).
- [ ] **Step 2:** `src/lib/pwa/geolocation.ts` (solo navegador, sin tests unitarios):

```ts
// Posición del técnico en un momento concreto (escanear, resolver, cerrar). Nunca lanza y nunca
// espera más de `timeoutMs`: sin permiso, sin GPS o sin respuesta ⇒ null (queda 🟡 «sans position»).
// maximumAge: una posición de hace < 60 s vale (respuesta inmediata si el iPhone ya la tiene).
export type CapturedPosition = { lat: number; lng: number; accuracy: number }

export function getPositionOnce(timeoutMs = 4000): Promise<CapturedPosition | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }) },
      () => { clearTimeout(timer); resolve(null) },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/** Para enviar la posición en un FormData de Server Action. */
export function appendPosition(fd: FormData, p: CapturedPosition | null): void {
  if (!p) return
  fd.set('pos_lat', String(p.lat)); fd.set('pos_lng', String(p.lng)); fd.set('pos_accuracy', String(p.accuracy))
}
```

- [ ] **Step 3:** en `src/lib/geo.ts` (y su test) añadir `readPosition(fd: FormData): { lat; lng; accuracy } | null` que valida números finitos y rangos (el FormData viene del cliente: no fiarse). **Commit** — `feat(geo): permiso de ubicación y captura puntual en el navegador`.

---

### Task 4: Presencia en el servidor + escaneo

- [ ] **Step 1: `src/lib/presence.server.ts`** (`import 'server-only'`, admin client): `computePresence(numeroSerie, position)` lee `machines.lat/lng` y devuelve el objeto de columnas `{ tech_lat, tech_lng, tech_accuracy_m, tech_distance_m, tech_position_at, tech_presence }` usando `presenceFor` (con `position = null` ⇒ `tech_presence: 'no_position'` y el resto `null` salvo `tech_position_at: null`).
- [ ] **Step 2: `stampQrScan(numeroSerie, userId, position?)`** en `src/lib/scan.server.ts`:
  - además de las incidencias, sella las **visitas de mantenimiento pendientes** de la línea abierta de esa máquina (`status IN ('planifié','en_retard')`, `assigned_to = userId OR assigned_to IS NULL`) con `qr_verified = true`;
  - si la máquina **no** tiene `lat` y `position.accuracy <= FIRST_SCAN_MAX_ACCURACY_M` ⇒ guardar `lat, lng, location_accuracy_m, location_source='first_scan', location_set_at=now, location_set_by=userId` con `.is('lat', null)` en el UPDATE (evita pisar una ubicación puesta en paralelo);
  - sigue sin lanzar nunca (registra y sigue). Actualizar su comentario de cabecera.
- [ ] **Step 3:** `recordQrScanAction(numeroSerie, position?)` en `src/app/tech/scan/actions.ts`: valida `position` (números finitos, rangos; si no, `null`) y la pasa.
- [ ] **Step 4:** `qr-scanner.tsx`: tras leer el QR, `const position = await getPositionOnce(3000)` y luego la carrera existente del sello (2,5 s) con `recordQrScanAction(serie, position)`. El overlay dice «QR détecté — localisation…» mientras tanto. Nunca más de ~5,5 s en total; navega siempre.
- [ ] **Step 5:** `/m/[serie]` sigue llamando `stampQrScan` **sin** posición (la cámara del sistema no da posición a esa página): comprobar que compila.
- [ ] **Step 6:** `npm run typecheck && npm test`. **Commit** — `feat(geo): el escaneo sella mantenimientos y fija la ubicación de la máquina`.

---

### Task 5: Posición al resolver una avería y al cerrar un mantenimiento

- [ ] **Step 1: avería.** En `intervention-form.tsx`, envolver la acción de `useActionState` para que, **solo si el estado elegido es `résolu`**, capture `getPositionOnce(4000)` y la añada con `appendPosition` antes de llamar a la acción real. Botón: «Localisation…» mientras captura. En `submitInterventionAction`: si pasa a `résolu`, `Object.assign(updates, await computePresence(serie, readPosition(formData)))` (serie: la de la línea o `machine_id`; si no hay máquina, `tech_presence: 'no_machine_position'`). Al **reabrir**, `clearResolution()` (`src/lib/resolution.ts`) también pone a `null` las 6 columnas de presencia (+ test en `resolution.test.ts`).
- [ ] **Step 2: mantenimiento.** Igual en `MaintenanceVisitForm.tsx` (siempre, es un cierre). En `closeMaintenance`, tras el RPC OK, `admin.from('maintenance_visits').update(await computePresence(serie, readPosition(formData))).eq('id', visitId)`; error ⇒ `console.error`, no bloquea.
- [ ] **Step 3:** `npm run typecheck && npm test`. **Commit** — `feat(geo): la oficina sabe dónde estaba el técnico al resolver o cerrar`.

---

### Task 6: Lo que ve la oficina

- [ ] **Step 1:** `src/lib/geo.ts`: `presenceLabel(presence, distance)` ⇒ `{ tone: 'green'|'amber'|'grey', text }`: near ⇒ «Sur place (à 45 m)»; far ⇒ «Loin de la machine (à 2,3 km)»; no_position ⇒ «Position non transmise»; no_machine_position ⇒ «Machine sans position enregistrée»; `null` ⇒ `null` (tareas anteriores a la fase: no se muestra nada). Tests.
- [ ] **Step 2:** `src/app/admin/incidents/[id]/page.tsx`: fila «Position» junto a la de «QR machine», mismo estilo (reutilizar los tonos existentes). Enlace «voir» a Google Maps con la posición del técnico si existe.
- [ ] **Step 3:** `src/app/admin/maintenance/[id]/page.tsx`: columna «Position» en la tabla de visitas (con `presenceLabel`). La columna QR queda igual (ahora significa algo; las visitas antiguas siguen mostrando ✓ del cierre antiguo — anotar en la leyenda/nota: «avant le 25/09/2026 le QR n'était pas vérifié»).
- [ ] **Step 4:** `npm run typecheck`. **Commit** — `feat(geo): posición del técnico en las fichas de la oficina`.

---

### Task 7: Botón «Itinéraire»

- [ ] **Step 1: `src/components/tech/ItineraryButton.tsx`** (cliente): recibe `{ lat, lng } | null` y `text | null`; usa `itineraryLinks`; si `null` no renderiza. Botón «Itinéraire» (icono `Navigation` de lucide) que abre un pequeño menú con **Google Maps**, **Waze**, **Plans** (enlaces `<a target="_blank" rel="noopener">`). Botones grandes (≥ 44 px), estilo de las tarjetas de `/tech`.
- [ ] **Step 2: destino.** Preferencia: coordenadas de la máquina; si no, texto `destinationText({ adresse: client.adresse, quartier: label del barrio efectivo, ville: client.ville })`. Ampliar los `select`:
  - `src/app/tech/incidents/[id]/page.tsx`: `machines(..., lat, lng, quartier_code)`, `clients(nom_client, adresse, ville, quartier_code)`; incidencia pública ⇒ leer la máquina por `machine_id` (y su línea abierta para el cliente, como en la ficha de escaneo). Barrio: `getQuartiers()` + `resolveQuartierCode`. Pasar el destino al formulario y pintar el botón en la cabecera (`intervention-form.tsx:90-99`).
  - `src/app/tech/scan/[serie]/page.tsx`: ya lee la máquina con `select('*')`; ampliar `clients(...)`. Botón en la tarjeta de la máquina.
- [ ] **Step 3:** `npm run typecheck && npm run build`. **Commit** — `feat(geo): botón Itinéraire con Google Maps, Waze y Plans`.

---

### Task 8: «Plus proche»

- [ ] **Step 1: coordenadas por tarea** (servidor): la de la máquina si tiene; si no, el centro de su barrio efectivo (`quartiers.lat/lng`); si no, `null`. Helper servidor reutilizable en `src/lib/presence.server.ts` o `src/lib/geo.server.ts`: `coordsForMachines(series: string[]): Map<serie, LatLng | null>` (una consulta de máquinas + una de líneas abiertas→clientes + `getQuartiers()`).
- [ ] **Step 2: `/tech/incidents`:** la página añade `coords` a cada item; `TechIncidentList` añade un botón «Plus proche» junto a los filtros: al pulsarlo, `getPositionOnce(6000)`; con posición ⇒ ordena con `sortByDistance` y muestra la distancia en cada tarjeta (`formatDistance`); sin posición ⇒ aviso «Position indisponible». Otro toque vuelve al orden normal. El orden por defecto no cambia.
- [ ] **Step 3: `/tech/planning`:** mover el render de las visitas a un componente cliente pequeño (`PlanningVisits.tsx`) que reciba los grupos ya calculados + coordenadas, con el mismo botón «Plus proche» (ordena las visitas planas por distancia mientras está activo; desactivado ⇒ agrupación actual).
- [ ] **Step 4:** `npm run typecheck && npm run build`. **Commit** — `feat(geo): ordenar averías y mantenimientos por cercanía`.

---

### Task 9: Posición de la máquina en el panel (ver y corregir)

- [ ] **Step 1:** `src/components/admin/MachinePositionCard.tsx` (cliente) bajo `<MachineForm>` en `src/app/admin/machines/[serie]/page.tsx`: muestra lat/lng, precisión, origen («Premier scan de X le …» / «Saisie manuelle»), enlace «Voir sur la carte»; campo «Coller un lien Google Maps ou « lat, lng »» + «Enregistrer»; botón «Effacer la position» (confirmación). Sin posición: «Position inconnue — elle sera enregistrée au premier scan sur place.»
- [ ] **Step 2:** acciones en `src/app/admin/machines/[serie]/actions.ts`: `setMachinePositionAction(serie, text)` (`requireAdmin`, `parseLatLng`; inválido ⇒ error «Lien ou coordonnées non reconnus»; guarda `location_source='admin'`, `location_accuracy_m = null`, `set_at`, `set_by`) y `clearMachinePositionAction(serie)` (pone las 6 columnas a `null`). `revalidatePath`.
- [ ] **Step 3:** `npm run typecheck`. **Commit** — `feat(geo): el admin ve y corrige la posición de una máquina`.

---

### Task 10: E2E y documentación

- [ ] **Step 1: E2E** (`tests/e2e/geo.spec.ts`; seed en `fixtures.ts`: `lat/lng` en la máquina `TEST-SN-E2E`): como técnico, la ficha de su avería muestra «Itinéraire» y al abrirlo el enlace de Google Maps contiene `destination=<lat>,<lng>`; como admin, pegar `14.7, -17.45` en la posición de una máquina la guarda y se muestra «Saisie manuelle». (La geolocalización del navegador no se prueba en E2E.) Limitar selectores a `<main>`.
- [ ] **Step 2: Docs:** `docs/architecture.md` sección «Geolocalización (Fase 3)» (columnas, veredictos, umbrales, cuándo se captura, privacidad: solo 3 momentos, nunca en segundo plano; `Permissions-Policy`); `docs/pendientes.md`: cerrar la entrada del falso «QR vérifié» de mantenimientos (moverla a hecho, con la nota de que las visitas anteriores al 25/09 siguen marcadas); spec §Fase 3: decisiones del 23/09.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build`. **Commit** — `test(geo): E2E de itinerario y posición + docs`.
