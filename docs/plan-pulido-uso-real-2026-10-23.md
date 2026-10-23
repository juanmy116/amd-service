# Plan de pulido tras la primera semana de uso real (2026-10-23)

> Origen: lista de 9 detalles que el usuario anotó usando la app durante una semana.
> Cada punto se comprobó en el código antes de escribir este plan (rutas `file:línea` abajo).
> Todo cambio sigue `docs/cambios-en-produccion.md`.

## Decisiones del usuario (2026-10-23)

| Punto | Decisión |
|---|---|
| 6 · Quién marca «Hors service (obsolète)» | **Cualquier admin** (no hace falta permiso aparte). |
| 8 · Qué técnicos crean incidencias | **Solo los elegidos**: permiso por persona. Empezar con Issa y Modou Dieme. |
| 8 · Qué pasa con la incidencia creada | **Va a la oficina sin asignar** (`nouveau`, sin `assigned_to`); la asigna la oficina o el Atelier. |
| 9 · Teléfono obligatorio | **Al menos uno de los dos** (móvil o fijo). Ambos con `+221 ` escrito por defecto. |

## Tandas

| Tanda | Puntos | ¿BD? | Estado |
|---|---|---|---|
| 1 · Retoques rápidos | 3, 5, 7 y el fallo del punto 2 | No | ⏳ |
| 2 · Ventana emergente en contratos | 4 | No | ⏳ |
| 3 · Mantenimientos en la ficha del cliente | 1 | No | ⏳ |
| 4 · Teléfono móvil y fijo | 9 | Sí (columna nueva) | ⏳ |
| 5 · Las máquinas nunca se borran | 6 | Sí (estado obsolète) | ⏳ |
| 6 · Técnicos que crean incidencias | 8 | Sí (permiso + acción) | ⏳ |

---

## Tanda 1 — Retoques rápidos (sin BD)

### Punto 3 · Precios de la tarifa no visibles sin «override»
- `ContractForm.tsx:500-563`: las casillas solo muestran `*_override` (`value={line.fixed_fee_override ?? ''}`), placeholder «Du plan».
- Los planes se cargan con `select('id, name, type')` → no hay precios para mostrar: `contracts/[id]/page.tsx:39`, `contracts/new/page.tsx:13`; `BillingPlanOption` (`ContractForm.tsx:12`) sin precios.
- Para `hybrid_tiered` / `tiered_total` (la tarifa real de AMD) los tramos no se ven nunca.
- Hacer: cargar `fixed_fee, price_bw, price_color, tiers`; con override vacío mostrar el precio del plan (formateado) como placeholder o texto de ayuda; resumen de tramos en solo lectura. La lógica de prioridad ya existe en `resolveEffectiveTariff` (`lib/billing.ts:66-86`).

### Punto 5 · Separador de miles
- `billing-plans/page.tsx:33-36` imprime `Number(...)` en crudo («25000»); tramos solo como número de tramos.
- `lib/invoice-xlsx.ts:32-56`: celdas numéricas sin formato.
- `formatPrice` (`lib/billing.ts:296-303`) redondea a FCFA entero → no vale para precio por copia (`numeric(10,6)`): hace falta una variante con decimales.
- Inputs `type="number"` no admiten separador → mostrar «= 25 000 FCFA» bajo la casilla (`BillingPlanForm.tsx`, `ContractForm.tsx`).

### Punto 7 · Nombre del cliente en las tarjetas
- Falta en: Kanban admin (`admin/incidents/page.tsx:110-119` descarta `clientName`; `KanbanBoard.tsx:24-33,86-96`), `admin/AgendaPanel.tsx:67-72`, `admin/calendrier/page.tsx:38-43,74`, `tech/planning/page.tsx:42-47,118-119` (2ª línea vacía en incidencias internas), `tech/AgendaPanel.tsx:49-55,147-148`.
- Ya sale en: lista admin, widget del dashboard, `/tech/incidents` (sustituye a la serie: mejor mostrar ambos), inicio técnico, Atelier.
- RLS no bloquea (`tech_clients_select` vía `auth_tech_assigned_client_ids()`). Solo select + UI.

### Punto 2 · Fecha de inicio tras reemplazo — comportamiento y fallo
- Comportamiento (correcto): `replace_contract_machine` (`20260617180000_cierres_por_linea_fecha.sql:205-322`) cierra la línea vieja en la fecha del reemplazo y crea la nueva con `date_debut` = esa fecha, heredando plan, overrides, notas y visitas pendientes.
- **Fallo:** `ReplaceMachineModal.tsx:28-33` solo hace `router.refresh()`; `ContractForm` guarda las líneas en `useState(initialLines)` (`ContractForm.tsx:104`) y se monta sin `key` (`contracts/[id]/page.tsx:83`) → sigue mostrando la máquina antigua. «Enregistrer» en ese estado manda el id de la línea cerrada y `update_contract_with_lines` la actualiza sin mirar `date_fin` (`20260617200000_guards_by_line.sql:247-259`).
- Hacer: `key` con los ids de las líneas abiertas en `<ContractForm>`; valorar además que el RPC rechace actualizar líneas cerradas.

## Tanda 2 — Punto 4 · Ventana emergente para añadir máquinas (sin BD)
- Hoy: cada línea es un bloque grande con todos los campos (`ContractForm.tsx:379-621`); con 40 máquinas (contrato 2AS `099-28`) la página es enorme.
- Las líneas viven en estado local y se envían juntas (`name="lines"` / `name="retire"`, L238-239) → la ventana solo edita ese estado; no cambian acciones ni RPC.
- Propuesta: lista compacta (serie, modelo, plan, fecha) con «Modifier» / «Retirer» + «Ajouter une machine» que abre un `Dialog`.
- Reutilizar: patrón de `ReplaceMachineModal.tsx` + `components/ui/dialogTransitions.ts`; `max-h-[90vh] overflow-y-auto`; `anchor` en `ComboboxOptions` para que no se corte. Solo tokens definidos en `globals.css`.

## Tanda 3 — Punto 1 · Mantenimientos en la ficha del cliente (sin BD)
- La sección no existe: `admin/clients/[id]/page.tsx` solo pinta `ClientForm`.
- Solo existe la PRÓXIMA visita por máquina (la siguiente la crea `close_maintenance_visit` al cerrar: +30/+90 días).
- Reutilizar el cálculo de `admin/maintenance/page.tsx:110-116` (próxima = menor `scheduled_date` ≠ fait; última hecha; en retard), agrupado por `contract_machine_id`.
- ⚠️ `maintenance_visits` tiene 2 FK a `profiles`: usar `profiles!maintenance_visits_done_by_fkey` / `..._assigned_to_fkey` (ver `admin/maintenance/[id]/page.tsx:36-53`).

## Tanda 4 — Punto 9 · Teléfono móvil y fijo (BD)
- Hoy: una columna `clients.telephone` (obligatoria en el form, sin formato): `ClientForm.tsx:147-159`, `clients/new/actions.ts`, `clients/[id]/actions.ts`.
- Hacer: `telephone_mobile` + `telephone_fixe`; copiar `telephone` → móvil; ambos con `+221 ` por defecto; **al menos uno obligatorio**; un `+221` solo cuenta como vacío; normalizar con el criterio de `sanitizePhone` (`signaler/[serie]/actions.ts:42-45`).
- Actualizar el mapeo de `princity-sync/index.ts:72,142` y regenerar tipos. El teléfono del cliente no se muestra en ningún otro sitio.

## Tanda 5 — Punto 6 · Las máquinas nunca se borran (BD)
- «Retirer» en el contrato NO borra: cierra la línea → la máquina queda en stock. Se mantiene.
- «Supprimer» en la ficha de la máquina SÍ borra (`MachineForm.tsx:77-112` → `deleteMachineAction`, `machines/[serie]/actions.ts:44-49`, error ignorado). Igual en el cliente (`clients/[id]/actions.ts:43-47`). → Quitar ambos.
- Añadir estado «Hors service (obsolète)» (hoy solo `machines.active`), **cualquier admin**; prohibido si la máquina tiene línea abierta; excluida de los selectores; visible en el historial.
- Botón «Remplacer» en la ficha de la máquina reutilizando `ReplaceMachineModal` + `replaceMachineAction` (cargar su línea abierta y los candidatos como en `contracts/[id]/page.tsx:73-75`; revalidar también la ruta de la máquina).
- Valorar quitar el `DELETE` de la política RLS admin sobre `machines` para que no se pueda borrar ni por otra vía.

## Tanda 6 — Punto 8 · Técnicos que crean incidencias (BD + permisos)
- Hoy no existe: sin política INSERT de técnicos en `incidents`; `/tech/scan/[serie]` sin botón.
- Hacer: flag `profiles.can_create_incidents` (precedente `is_dispatcher` / `can_bill`, protegido por el trigger de `20260610100000_secure_profiles_role.sql`), interruptor en `/admin/team`.
- Botón «Signaler une panne» en `/tech/scan/[serie]` → acción de servidor que comprueba el flag y crea con el cliente admin, resolviendo la línea abierta como `/signaler` (`signaler/[serie]/actions.ts:103-140`); `status = 'nouveau'`, **sin asignar**, `opened_by` = técnico, línea en `incident_history`.
- Activar para Issa y Modou Dieme.

---

## Detalles que salieron por el camino

- **Build dependía de Google Fonts** (preview del PR #197 cayó al descargar Inter): PR #200 sirve las
  tipografías desde `src/app/fonts` con `next/font/local`. Comprobado compilando sin internet.
- **E2E en local: no se puede pasar la suite completa dos veces seguidas.** `facturation.spec.ts`
  emite una factura (inmutable) con `issued_by` = `admin@e2e.test`; el teardown no puede borrar ese
  usuario y el siguiente `global-setup` falla con «A user with this email address has already been
  registered». En CI no pasa (base nueva cada vez). Hoy: `supabase db reset --local` + los GRANT de
  `e2e.yml` entre pasadas. Arreglo posible: que la factura de ese spec la emita un admin propio
  `TESTINV…`, fuera del barrido de `cleanup()`.
