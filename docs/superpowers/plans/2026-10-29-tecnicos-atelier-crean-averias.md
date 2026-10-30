# Técnicos y Atelier crean averías (tanda 6) — Plan

**Goal:** que los técnicos con permiso (Issa y Modou Dieme primero) puedan declarar una avería desde la
ficha de máquina del escáner, y que el kiosko del taller pueda crear una **avería** o una **recogida de
máquina** desde una burbuja roja «+».

**Origen:** fila 16 de `docs/pendientes.md`, tanda 6 de `docs/plan-pulido-uso-real-2026-10-23.md`, más la
ampliación al Atelier que pidió el usuario el 2026-10-29.

## Decisiones del usuario

1. **Técnicos:** solo los que tengan el permiso, persona por persona (interruptor en la ficha del miembro
   en `/admin/team`). La avería entra `nouveau` y **sin asignar**; `opened_by` = el técnico.
2. **Atelier:** burbuja roja con «+» en el kiosko → ventana con dos opciones: **Panne** o **Récupération**.
3. **La recogida es una avería con su propia categoría** (`recuperation`), no un circuito aparte: misma
   columna, asignación, push, doble escaneo e informe de cierre. **No** saca la máquina del contrato (eso
   sigue siendo «Remplacer» / «Hors service»).
4. **Motivos de recogida:** `Réparation à l'atelier` · `Fin de contrat` · `Remplacement`. Se guardan en el
   título (sin columna nueva).

## Decisiones tomadas por defecto (corregibles)

- El kiosko puede **asignar** un técnico al crear (es despachador); si no elige, entra `nouveau` sin asignar.
  El técnico de campo **no** asigna.
- La máquina se busca en la ventana por número de serie, modelo o cliente (todas las máquinas activas).
  Recogida: solo máquinas **en contrato** (una de almacén no se recoge). Panne: cualquiera activa.
- El técnico solo declara **pannes** (no recogidas).
- **La campana no suena** por lo que crea el propio kiosko (pedido por el usuario el 2026-10-29); sí por lo
  que declaran los técnicos.
- Encuesta CSAT: una **panne** creada así la recibe en el email del portal del cliente si lo tiene (igual que
  las de `/admin`). Una **recogida nunca**: al resolverse se archiva sin encuesta (revisión del PR #213).

## Base de datos (tipo B — una migración, compatible con la app publicada)

`20261029100000_staff_create_incidents.sql`:
- `ALTER TYPE incident_category ADD VALUE 'recuperation'`.
- `profiles.can_create_incidents boolean NOT NULL DEFAULT false`. Ya protegido por el GRANT de columnas de
  `20260610100000` (el usuario solo puede tocar `full_name`, `phone`); además se añade al trigger
  `tg_profiles_protect_privileged`.
- Inversa en `docs/rollback-2026-10-29-crear-averias.md`. El valor del enum **no se puede quitar** sin
  rehacer el tipo: la inversa pasa las filas a `autre` y deja el valor (inofensivo, nadie lo usa).

La app publicada tolera el cambio: no lee la columna nueva y ninguna fila tendrá `recuperation` hasta la
app nueva.

## App (tipo A)

1. `src/lib/staffIncident.ts` — núcleo común: resuelve la línea abierta (`getOpenLineForMachine`, mismo
   criterio XOR que `/signaler`), inserta con service_role y escribe la línea de `incident_history`.
2. `/admin/team/[id]` — casilla «Peut signaler des pannes» (solo técnicos).
3. `/tech/scan/[serie]` — botón «Signaler une panne» si el técnico tiene el permiso → formulario corto
   (description + urgente) → acción de servidor que **vuelve a comprobar** el permiso.
4. Kiosko — `NewIncidentFab` (burbuja roja abajo a la derecha, en Carte y Kanban) + ventana con pestañas
   Panne / Récupération. Acción `createAtelierIncidentAction` tras `requireDispatcherActor()`.
5. Etiqueta «Récupération» en tarjetas del kiosko, Kanban de `/admin` y selector de `/admin`. El portal
   cliente **no** ofrece la categoría (su validación usa una lista propia).

## Comprobación tras publicar

- Oficina: activar el permiso a Issa y Modou Dieme en `/admin/team`.
- Técnico con permiso: escanear máquina de prueba → «Signaler une panne» → aparece en la TV sin técnico.
- Técnico sin permiso: no ve el botón.
- Kiosko: «+» → Panne y Récupération → aparecen en la TV; asignar → push al iPhone.
- Borrar las averías de prueba.
