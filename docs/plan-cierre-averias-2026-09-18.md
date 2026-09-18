# Plan — Ninguna avería se cierra sin rastro

> **Fecha:** 2026-09-18
> **Origen:** hallazgo del usuario — «una avería puede darse por resuelta sin que el técnico haya
> escaneado el QR ni generado el informe de intervención».
> **Estado:** plan validado, sin implementar.

---

## 0. El hallazgo, verificado

Hay **5 puntos de código** que escriben `status = 'résolu'` y **ninguno** exige informe ni escaneo:

| Puerta | Fichero | Quién |
|---|---|---|
| 1 | `src/app/tech/incidents/[id]/actions.ts:41` | técnico (informe opcional: `if (rapport)`) |
| 2 | `src/app/admin/incidents/kanban-actions.ts:33` | admin/dispatcher, arrastrando en el kanban |
| 3 | `src/components/atelier/AtelierKanban.tsx:175` | kiosko, kanban (misma acción que 2) |
| 4 | `src/app/atelier/actions.ts:81` (`setIncidentStatusAction`) | kiosko, ficha (delega en 2) |
| 5 | `src/app/admin/incidents/[id]/actions.ts:49` | admin, ficha de la avería |

Además:

- El `<textarea name="rapport">` de `intervention-form.tsx:135` **no lleva `required`**.
- El escaneo del QR (`src/app/tech/scan/[serie]/page.tsx:69-90`) solo hace la auto-transición
  `assigné → en_cours`. **No deja ningún rastro en `incidents`**: no existe nada equivalente a
  `maintenance_visits.qr_verified`.
- **No hay red en la base de datos**: `incidents` no tiene CHECK ni trigger sobre esto
  (solo aparece en la migración inicial `20260508200752`).
- No hay máquina de estados: `nouveau → résolu` de un arrastre es legal, y la avería puede
  quedar resuelta con `assigned_to = NULL` — nadie firma la intervención.

### Consecuencias reales

1. **CSAT fantasma.** Las 5 puertas llaman a `sendCsatForIncident`. El cliente recibe encuesta de
   satisfacción por una intervención sin una sola línea escrita. Y como el envío del CSAT es lo que
   pasa la avería a `fermé` (`src/lib/csat.server.ts:186`), queda archivada en blanco.
2. **Contamina el agente de anomalías.** Sin formulario no hay filas en `incident_parts` → copias que
   suben sin cambio de pieza registrado → alertas falsas en `/admin/anomalies`.
3. **KPI de técnicos falseado** (`src/app/admin/page.tsx:132` cuenta por `assigned_to`).
4. **Nada que enseñar** si el cliente reclama: no hay informe, ni piezas, ni técnico, pero sí
   `resolved_at`.

### El contraste que lo delata

El mantenimiento preventivo **sí** tiene prueba de presencia física: `maintenance_visits.qr_verified`
y el formulario accesible solo vía `/tech/scan/[serie]/maintenance/[visitId]`
(`docs/architecture.md:305`). Las averías nunca recibieron ese tratamiento.

---

## 1. Decisiones tomadas

| Decisión | Valor |
|---|---|
| Informe del técnico | **Obligatorio** para pasar a `résolu` (bloqueante, cliente + servidor) |
| Escaneo del QR | **Semáforo, no bloqueante.** Se registra 🟢/🟡; nunca impide cerrar |
| Resolución desde el tablero | **Ventana obligatoria** con motivo + explicación + ¿intervino técnico? |
| ¿Dónde va la ventana? | En las **4** puertas de oficina (2, 3, 4, 5). No cerrar solo el kanban |
| Contenido de la ventana | **Sin checklist de piezas** — las piezas solo las declara quien tuvo la máquina delante |
| Marca de origen | **Automática**, por la puerta de entrada. No depende de lo que se escriba |
| Cierre en oficina | Directo a **`fermé`**, **sin encuesta** al cliente |
| Kiosko de la TV | **Conserva** el cierre (tiene teclado y ratón) + arreglo del reset por inactividad |

### Por qué la ventana de oficina no es una copia del formulario del técnico

1. **Piezas.** `incident_parts` alimenta el historial por máquina y el agente de anomalías. Un
   despachador en oficina no sabe si se cambió un ADF o un tambor. Darle esas casillas envenena los
   datos técnicos.
2. **Blanqueo.** Si el formulario fuese idéntico, una resolución de oficina con buena redacción
   quedaría *indistinguible* de una intervención real — peor que hoy, porque hoy el informe vacío es
   una señal. De ahí que `resolved_via` se ponga por la puerta de entrada, no por confesión.

---

## 2. Modelo de datos

Migración nueva: `supabase/migrations/20260918HHMMSS_verrou_resolution_incidents.sql`

```sql
ALTER TABLE public.incidents
  ADD COLUMN resolved_via      text,
  ADD COLUMN resolution_reason text,
  ADD COLUMN resolution_note   text,
  ADD COLUMN qr_verified       boolean NOT NULL DEFAULT false,
  ADD COLUMN qr_scanned_by     uuid REFERENCES public.profiles(id);

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_resolved_via_chk
    CHECK (resolved_via IS NULL OR resolved_via IN ('intervention', 'bureau')),
  ADD CONSTRAINT incidents_resolution_reason_chk
    CHECK (resolution_reason IS NULL OR resolution_reason IN (
      'fausse_alerte', 'telephone', 'client', 'technicien_non_enregistre', 'doublon', 'autre'
    )),
  -- Coherencia: el motivo es exclusivo de la vía «bureau».
  ADD CONSTRAINT incidents_resolution_coherence_chk
    CHECK (resolved_via IS DISTINCT FROM 'intervention' OR resolution_reason IS NULL);
```

Notas de diseño:

- `text` + CHECK en lugar de enums de Postgres: `resolution_reason` va a crecer con el uso y
  `ALTER TYPE ... ADD VALUE` es incómodo en migraciones. Espejo en `src/lib/enums.ts` para validar
  con `parseEnum` (patrón ya existente).
- Las 4 columnas son nullable / con default → **las averías históricas no se tocan**. Quedan con
  `resolved_via = NULL`, que se muestra como «sin informar» y sin marca de alarma.
- `qr_verified` es `NOT NULL DEFAULT false`, igual que en `maintenance_visits`. Va acompañado de
  `qr_scanned_by`: sin saber **quién** escaneó, el escaneo de un técnico daría por presente a
  otro, y el semáforo verde debe pedir que quien escaneó sea quien resolvió.
- **No hacen falta policies nuevas**: las columnas heredan las de la tabla.
- Tras aplicar: `npx supabase gen types` → `src/lib/supabase/types.ts`.

### El candado (va en PR-4, no antes)

```sql
-- Red de seguridad: aunque mañana alguien añada una sexta puerta, no podrá resolver sin rastro.
-- Mismo patrón que el candado de facturación (trigger BEFORE en invoices).
CREATE OR REPLACE FUNCTION public.guard_incident_resolution() ...
  -- Si NEW.status = 'résolu' y (OLD.status IS DISTINCT FROM 'résolu' o es INSERT):
  --   resolved_via IS NULL                                    -> RAISE 'resolution_sans_trace'
  --   resolved_via = 'intervention' AND rapport_intervention IS NULL -> RAISE 'rapport_obligatoire'
  --   resolved_via = 'bureau' AND (resolution_reason IS NULL
  --                                OR resolution_note IS NULL) -> RAISE 'motif_obligatoire'
BEFORE INSERT OR UPDATE ON public.incidents
```

---

## 3. Una sola función para las 4 puertas

**Esto es lo más importante del plan.** El proyecto ya tiene la cicatriz de la regla duplicada: el
envío del CSAT se olvidó en 1 de las 3 puertas y hubo que arreglarlo después
(ver el comentario en `src/app/admin/incidents/[id]/actions.ts:68-70`).

Nuevo `src/lib/resolution.ts` — **puro, sin `server-only`, testeable con vitest**
(misma separación que `csat.ts` vs `csat.server.ts`):

```ts
export type ResolutionInput =
  | { via: 'intervention'; rapport: string | null; qrVerified: boolean }
  | { via: 'bureau'; reason: string | null; note: string | null; technicianId: string | null }

/** Valida la transición a `résolu` y devuelve los campos a escribir, o el error a mostrar. */
export function buildResolution(input: ResolutionInput):
  | { ok: true; updates: { resolved_via: string; ... } }
  | { ok: false; error: string }
```

Las 4 puertas la llaman. Ninguna decide por su cuenta.

---

## 4. Entregas

### PR-1 — Cimientos y la puerta del técnico ✅ (PR #143)

*Objetivo: el técnico ya no puede resolver sin informe, y el escaneo deja rastro.*

| Fichero | Cambio |
|---|---|
| `supabase/migrations/20260918*_verrou_resolution_incidents.sql` | columnas + CHECKs (§2), **sin trigger** |
| `src/lib/supabase/types.ts` | regenerar |
| `src/lib/enums.ts` | `RESOLVED_VIA`, `RESOLUTION_REASONS` |
| `src/lib/resolution.ts` | **nuevo** — `buildResolution()` (§3) |
| `src/lib/resolution.test.ts` | **nuevo** — casos: informe vacío, solo espacios, motivo sin nota, vía incoherente |
| `src/app/tech/incidents/[id]/intervention-form.tsx` | `required` en el textarea cuando se elige «Résolu» + mensaje |
| `src/app/tech/incidents/[id]/actions.ts` | validar vía `buildResolution`; escribir `resolved_via='intervention'` |
| `src/lib/scan.server.ts` | **nuevo** — `stampQrScan()`: marca `qr_verified` + `qr_scanned_by` |
| `src/app/m/[serie]/page.tsx` | llamar a `stampQrScan()` antes de redirigir al técnico |

**Cómo probarlo:** marcar «Résolu» con el informe vacío → no guarda. Escanear el QR y luego resolver
→ avería con `qr_verified = true`. Resolver desde la lista sin escanear → guarda, con `false`.

> **⚠️ El sello NO puede vivir en `/tech/scan/[serie]`.** Parece la página del escaneo, pero es un
> enlace normal: `components/tech/AgendaPanel.tsx:97` (presente en el layout de **todas** las páginas
> `/tech`) y `tech/planning/page.tsx:134,180` apuntan ahí, y al ser `<Link>` con prefetch y no haber
> ningún `loading.tsx` bajo `src/app/tech`, el servidor puede renderizarla sin que nadie pulse nada.
> Sellar ahí daría por presente en la máquina a un técnico sentado en la oficina. La única ruta que
> codifican las etiquetas impresas es `/m/[serie]` (`src/lib/qr.ts` → `machineReportUrl`), y ahí va.
> *(Hallazgo del `/code-review` alto del PR-1.)*

**Adelantado desde el PR-2 por el mismo review:** las tres puertas de oficina ya leen el estado
anterior **de la base** en lugar de aceptarlo del cliente, y ya **borran el rastro al reabrir**
(`reopens()` + `clearResolution()`). Sin eso, devolver una tarjeta a «En cours» y volver a
arrastrarla a «Résolu» dejaba la avería con el informe y el escaneo de la intervención anterior —
el blanqueo que el verrou quiere impedir, disponible ya con solo el PR-1 puesto. El PR-2 solo añade
la ventana; `updateIncidentStatusAction` perdió el parámetro `oldStatus` y los dos kanbans ya no lo
mandan.

---

### PR-2 — La ventana, en las cuatro puertas ✅

*Objetivo: arrastrar o pulsar «Résolu» fuera del formulario del técnico exige explicación.*

> La regla se aplica en la **Server Action**, no solo en la ventana: arrastrar una tarjeta es un
> `fetch` como cualquier otro y no se puede confiar en que el navegador haya pasado por el
> formulario.

| Fichero | Cambio |
|---|---|
| `src/components/admin/ResolutionDialog.tsx` | **nuevo** — motivo (desplegable) + explicación + ¿intervino técnico? |
| `src/app/admin/incidents/kanban-actions.ts` | la resolución exige el payload de oficina; usa `buildResolution` (el estado anterior ya se lee de la BD desde el PR-1) |
| `src/app/atelier/actions.ts` | `setIncidentStatusAction` propaga el payload (sigue delegando) |
| `src/components/admin/KanbanBoard.tsx` | `onDragEnd` a `résolu` → abre la ventana; la tarjeta **no se mueve** hasta confirmar; cancelar la devuelve |
| `src/components/atelier/AtelierKanban.tsx` | ídem, estilo kiosko |
| `src/components/atelier/AtelierBoard.tsx` | el «Résolu» de la ficha abre la ventana (el estado vive en el tablero, no en la ficha: de él dependen el refresco y el reposo) |
| `src/app/admin/incidents/page.tsx` | cargar los técnicos para el desplegable de la ventana |
| `src/components/admin/IncidentForm.tsx` | elegir «Résolu» en el `<select>` despliega los campos en línea (no modal). **Sin selector de técnico**: esta ficha ya tiene «Assigné à» y dos fuentes para el mismo dato se pisarían |
| `src/app/admin/incidents/[id]/actions.ts` | valida vía `buildResolution` |
| `src/components/atelier/AtelierBoard.tsx` | **arreglo del reset por inactividad** (ver abajo) |

#### El arreglo del kiosko — no es opcional

`AtelierBoard.tsx:96-107`: si nadie **hace clic** durante `IDLE_RESET_MS = 120_000` (2 min), el
kiosko cierra la ficha abierta y vuelve al mapa. **Teclear no llama a `touch()`** — solo lo hacen los
clics (líneas 121, 136-185).

Sin arreglar esto, quien escriba la explicación en la TV y tarde más de dos minutos **pierde lo
escrito sin aviso**, y a la tercera vez deja de usar la función. Mínimo:

- la ventana abierta entra en `isBusy` → no hay auto-refresco;
- `needsReset` se desactiva mientras esté abierta (o `onKeyDown` llama a `touch()`).

#### Requisitos de la ventana en la TV

- El **desplegable de motivo hace el trabajo**: un clic, sin teclear.
- Letra grande y fondo oscuro (el layout ya sube la base un 15 %, `src/app/atelier/layout.tsx:17`).
- Explicación obligatoria pero **corta**, con un mínimo de unos pocos caracteres para que «ok» no
  pase. No pedir párrafos: la barrera real contra el atajo es el motivo registrado y la marca 🟡,
  no la longitud del texto.
- Botón de cancelar claro.

---

### PR-3 — Consecuencias visibles

*Objetivo: que la distinción sirva para algo.*

| Fichero | Cambio |
|---|---|
| `src/lib/csat.server.ts` | **no enviar** encuesta si `resolved_via <> 'intervention'` |
| `src/app/admin/incidents/kanban-actions.ts` + `src/app/atelier/actions.ts` | resolución de oficina → directo a `fermé` + `closed_at` (sin encuesta no hay nada que esperar) |
| `src/components/admin/IncidentsListView.tsx` | marca 🟢 intervención / 🟡 oficina |
| `src/app/admin/incidents/page.tsx` | añadir las columnas al `select`; filtro por vía |
| `src/app/admin/incidents/[id]/page.tsx` | mostrar motivo + explicación + quién |
| `src/lib/atelier/board.ts` + `src/app/atelier/data.ts` | `resolvedVia` en `BoardIncident` si se muestra en el kiosko |

**Y el subproducto que hoy no existe:** el desplegable de motivo se vuelve estadística. En tres meses
se podrá responder *«el 40 % de lo que cerramos en oficina son falsas alarmas de Princity»* — dato
que cruza directo con `project_princity_crons_silenciosos`.

---

### PR-4 — El candado y la documentación (pequeño)

*Va al final, y no antes: el trigger solo puede entrar cuando las 4 puertas ya escriben bien.*

| Fichero | Cambio |
|---|---|
| `supabase/migrations/20260918*_guard_incident_resolution.sql` | trigger de §2 |
| `tests/rls/incident-resolution-guard.test.ts` | **nuevo** — el trigger rechaza las 3 formas de resolver sin rastro |
| `tests/rls/anomalies-e2e.test.ts:46` | fixture: añadir `resolved_via` (inserta `status:'résolu'` directo) |
| `tests/rls/part-yield-baseline.test.ts:45,119` | ídem |
| `docs/architecture.md` | flujo de averías (§ línea 260), tabla `incidents` (§ línea 510), las 4 puertas |
| `docs/pendientes.md` | cerrar el hallazgo |

---

## 5. Riesgos

1. **El trigger rompe fixtures existentes.** Dos tests insertan `status: 'résolu'` directamente
   (`anomalies-e2e.test.ts:46`, `part-yield-baseline.test.ts:45,119`). Se arreglan añadiendo
   `resolved_via` al insert — pero hay que hacerlo **en el mismo PR** que el trigger.
2. **`admin-only-isolation.test.ts` es sensible** a cambios de columnas en tablas admin; ya se rompió
   con la foto de incidencia (PR #116).
3. **Regenerar los tipos de Supabase** tras la migración, o el typecheck cae en CI
   (`main` tiene required check `typecheck · test · build`).
4. **El kiosko**: ver §PR-2. Es el riesgo que más probablemente hunda la función en uso real.
5. ~~**Averías reabiertas**~~ **RESUELTO en el PR-1**: reabrir limpia `resolved_via`,
   `resolution_reason`, `resolution_note`, `qr_verified` y `qr_scanned_by` (`clearResolution()`).
   `resolved_at` se conserva a propósito — hay recuentos que lo usan
   (`src/app/atelier/data.ts:104-106`). La condición mira los **dos** estados (`reopens()`): cuenta
   venir de `fermé`, porque el envío de la encuesta cierra la avería al instante y una resuelta casi
   nunca se queda en `résolu`; y no cuenta guardar una que ya estaba `en_cours`, que borraría el
   escaneo recién hecho.

---

## 6. Criterios de aceptación

- [ ] Un técnico **no puede** pasar a `résolu` con el informe vacío, por ninguna vía.
- [ ] Arrastrar a «Résolu» en los **dos** kanbans abre la ventana; cancelar devuelve la tarjeta.
- [ ] El botón «Résolu» de la ficha del kiosko y el `<select>` de la ficha admin piden lo mismo.
- [ ] Escribir dos minutos en la TV **no** cierra la ventana ni pierde el texto.
- [ ] Una resolución de oficina **no** manda encuesta y queda en `fermé`.
- [ ] En `/admin/incidents` se distinguen 🟢 y 🟡 de un vistazo.
- [ ] Con el trigger puesto, un `UPDATE` directo a `résolu` sin rastro **falla**.
- [ ] `npm run typecheck && npm test && npm run build` y `npm run test:rls` en verde.
