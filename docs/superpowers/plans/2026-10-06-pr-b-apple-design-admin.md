# PR B — Auditoría /apple-design de /admin (pasos 2–4) · Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (elegido por el usuario) para ejecutar este plan tarea a tarea, **en serie**. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el panel `/admin` responda al pulsar, se lea mejor y se mueva con sentido (ventanas, Agenda, Kanban), sin tocar lógica de negocio, rutas ni base de datos.

**Arquitectura:** cambios de presentación en componentes cliente existentes (clases Tailwind v4 y props de Headless UI). La única lógica nueva es un estado de error en `KanbanBoard` para mostrar lo que la Server Action ya devuelve. Cinco tareas sobre archivos que **no se cruzan**, un commit por tarea, todo en un único PR.

**Stack:** Next.js 16 · React 19 · Tailwind CSS v4 (`@theme` en `src/app/globals.css`) · `@headlessui/react` 2.2 · `@dnd-kit/core` 6.3 · vitest 4 (solo lógica pura en `src/lib`, entorno `node`).

**Origen:** auditoría `/apple-design` del 2026-10-06 (memoria `project_auditoria_apple_design`). PR A (#174) ya arregló las ventanas sin fondo. El paso 5 (títulos y limpieza de colores) es el PR C: **fuera de este plan**.

## Restricciones globales

- **App en producción real.** Seguir `docs/cambios-en-produccion.md`: rama + PR, CI verde, revisión en local antes de abrir el PR, *Instant Rollback* si algo falla.
- **Solo `/admin`** (`src/app/admin/**`, `src/components/admin/**`, `src/components/ui/Button.tsx`). No tocar `/tech`, `/portal`, `/atelier` ni la web pública. **Excepción vigilada:** `ResolutionDialog` también lo usa la TV del taller (`variant="kiosk"`), y su aspecto no debe cambiar.
- Solo tokens del `@theme` (`bg-card`, `bg-accent`, `text-ink-soft`, `bg-neutral-soft`…). **Prohibido** inventar clases que no estén en `globals.css` (fue la causa del PR A), y prohibido el hex inline.
- Textos visibles en **francés**; comentarios de código en **español**, con la densidad del archivo.
- Sin dependencias nuevas.
- Comprobación por tarea: `npm run typecheck` y `npm test` (403 tests) en verde. Al final, además: `npm run build` con las variables de entorno de prueba del CI.
- No hay tests de componentes (vitest corre en `node` y solo sobre `src/lib`). Las tareas de presentación se validan con typecheck, build y la lista visual de la Tarea 6. **No montar** jsdom ni Testing Library para este PR.

## Puntos a vigilar en la revisión

1. **Movimiento reducido:** con «Réduire les animations» activado en macOS, nada debe deslizarse ni escalar. Ya existe la regla global en `globals.css:119`, que deja las duraciones en 0.01ms; no hay que romperla con `!important` ni con estilos inline.
2. **Panel de Agenda cerrado (< 1280px):** no debe poder recibir el foco con Tab, ni tapar clics, ni verse asomando por el borde.
3. **Agenda en ≥ 1280px:** tiene que verse **idéntica** a hoy (columna fija a la derecha, sin sombra, sin animación).
4. **Kanban: fallo seguido de un arrastre correcto.** El aviso de error desaparece al empezar el siguiente arrastre y no se queda pegado.
5. **Kiosko del taller:** la ventana de resolución en `/atelier` se ve y se comporta igual que antes (sin animación nueva).

---

### Tarea 1: Reacción al pulsar en `Button`

**Archivos:**
- Modificar: `src/components/ui/Button.tsx` (función `buttonClasses`)

**Interfaces:**
- Consume: nada.
- Produce: `buttonClasses(variant?: ButtonVariant): string` (misma firma). Lo usan `admin/page.tsx`, `clients`, `contracts`, `machines`, `machines/import/ImportPreview.tsx`, `maintenance` e `incidents`.

- [ ] **Paso 1:** en la cadena base de `buttonClasses`, cambiar `transition-colors` por `transition duration-100 ease-out` y añadir `active:scale-[0.97] motion-reduce:active:scale-100`. El resto de la cadena y las variantes no cambian.
- [ ] **Paso 2:** comprobar. Ejecutar `npm run typecheck && npm test`. Esperado: sin errores y `403 passed`.
- [ ] **Paso 3:** commit: `git add src/components/ui/Button.tsx && git commit -m "feat(admin): reacción al pulsar en Button (active:scale)"`.

### Tarea 2: Contraste de las etiquetas de 10 px

**Archivos (modificar solo las cadenas que contienen `text-[10px]`):**
`src/app/admin/{clients,contracts,machines,factures,maintenance,anomalies}/page.tsx`, `src/app/admin/contadores/[serie]/page.tsx`, `src/app/admin/machines/[serie]/pieces/page.tsx`, `src/app/admin/maintenance/[id]/page.tsx`, `src/components/admin/{DashboardRecentIncidents,DashboardKpiStrip,DashboardTechTable,IncidentsListView,ContractForm}.tsx`.

**Interfaces:** ninguna.

- [ ] **Paso 1:** en cada cadena de clases que contenga a la vez `text-[10px]` y `text-ink-muted`, cambiar `text-ink-muted` por `text-ink-soft`. Ninguna otra clase cambia. Fuera de esas cadenas, `text-ink-muted` se queda como está.
  Motivo: #A1A1AA sobre blanco da ≈2,6:1; #71717A da ≈4,8:1, por encima del mínimo AA de 4,5:1.
- [ ] **Paso 2:** comprobar que no queda ninguna. Ejecutar:
  `grep -rnE "text-\[10px\][^\"'\`]*text-ink-muted|text-ink-muted[^\"'\`]*text-\[10px\]" src/app/admin src/components/admin`
  Esperado: sin salida. Ejecutar también `git diff --stat`. Esperado: solo los 14 archivos listados.
- [ ] **Paso 3:** ejecutar `npm run typecheck && npm test`. Esperado: verde.
- [ ] **Paso 4:** commit: `git commit -am "style(admin): etiquetas de 10px en ink-soft (contraste AA)"`.

### Tarea 3: Kanban — tarjeta que sigue al cursor sin fantasma, y error visible

**Archivos:**
- Modificar: `src/components/admin/KanbanBoard.tsx` (`IncidentCard` y `KanbanBoard`)

**Interfaces:**
- Consume: `updateIncidentStatusAction(id: string, status: string, office?: OfficeResolution | null): Promise<{ error?: string }>` (`src/app/admin/incidents/kanban-actions.ts:29`), sin cambios.
- Produce: nada para otras tareas.

Hecho verificado en `@dnd-kit/core` (`core.esm.js:3410`): `useDraggable` entrega `transform` a la tarjeta original **aunque** haya `DragOverlay`. Hoy, la tarjeta original (al 30 %) también se mueve, y con `transition-all` llega con retraso detrás de la copia.

- [ ] **Paso 1 (fantasma):** en `IncidentCard`, dejar de aplicar `transform` a la tarjeta original. La original se queda quieta en su columna al 30 %, como hueco, y solo se mueve el `DragOverlay`. Quitar la variable `style`, la prop `style` del `<div>`, `transform` del destructurado de `useDraggable` y el import de `CSS` de `@dnd-kit/utilities` si queda sin uso. En la rama no-overlay de las clases, cambiar `transition-all` por `transition-shadow`.
- [ ] **Paso 2 (error):** en `KanbanBoard`, añadir `const [moveError, setMoveError] = useState<string | null>(null)`.
  - En `onDragStart`, llamar a `setMoveError(null)`.
  - En el `startTransition` de `onDragEnd` (la rama sin ventana), si `result?.error`, llamar a `setMoveError(result.error)`. Si no hay error, `router.refresh()` como hasta ahora.
  - Encima del `<div className="flex gap-4 overflow-x-auto pb-4">`, renderizar, solo si `moveError`:
    `<p role="alert" className="mb-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-2.5 text-sm text-accent">`
    con el texto exacto `Le statut n'a pas pu être modifié : {moveError}. La carte a été remise à sa place.`
  - La ventana de resolución sigue con su propio `resolutionError`; no se toca.
- [ ] **Paso 3:** ejecutar `npm run typecheck && npm test`. Esperado: verde.
- [ ] **Paso 4:** commit: `git commit -am "fix(admin): Kanban sin tarjeta fantasma y con aviso si falla el cambio de estado"`.

### Tarea 4: Ventanas que aparecen y desaparecen con transición

**Archivos:**
- Modificar: `src/components/admin/TerminateContractModal.tsx`, `src/components/admin/ReplaceMachineModal.tsx`, `src/components/admin/ResolutionDialog.tsx`

**Interfaces:** ninguna. Las props de los tres componentes no cambian.

Valores elegidos: fundido + escala 95 %→100 %, entrada 200 ms `ease-out` y salida 150 ms `ease-in`, por el mismo camino (consistencia espacial). Sin rebote, porque no viene de un gesto con impulso.

- [ ] **Paso 1:** en `TerminateContractModal` y `ReplaceMachineModal`:
  - Importar `DialogBackdrop` de `@headlessui/react`.
  - Sustituir el `<div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />` por `<DialogBackdrop transition className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ease-out data-closed:opacity-0 data-leave:duration-150 data-leave:ease-in" />`.
  - Añadir al `DialogPanel` la prop `transition` y las clases `transition duration-200 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:duration-150 data-leave:ease-in`. Sin `transition` / `transition-opacity`, Tailwind no anima: `duration-*` solo fija el tiempo.
- [ ] **Paso 2:** en `ResolutionDialog`, igual, pero **solo en la variante admin**. El backdrop pasa a ser `<DialogBackdrop transition={!kiosk} …>`, con las clases de transición añadidas solo cuando `!kiosk`, y el `DialogPanel` lleva `transition={!kiosk}`, con las clases de transición solo en la cadena admin. La cadena kiosk queda byte a byte igual.
- [ ] **Paso 3:** ejecutar `npm run typecheck && npm test`. Esperado: verde.
- [ ] **Paso 4:** commit: `git commit -am "feat(admin): transición de entrada y salida en las ventanas de resolución, reemplazo y cierre"`.

### Tarea 5: Agenda que se desliza y barra lateral más ligera

**Archivos:**
- Modificar: `src/components/admin/AgendaPanelWrapper.tsx`, `src/components/admin/Sidebar.tsx`

**Interfaces:**
- Consume: `children` de `AgendaPanelWrapper` (sin cambios; lo usa `src/app/admin/layout.tsx`).

- [ ] **Paso 1 (Agenda):** renderizar **siempre** el panel, la cabecera de cierre (`xl:hidden`) y el fondo oscuro, y controlar el estado con clases en lugar de montar y desmontar:
  - Panel. Base: `flex flex-col fixed inset-y-0 right-0 w-80 z-50 overflow-hidden bg-card transition-[transform,visibility] duration-300 ease-out xl:relative xl:inset-auto xl:w-72 xl:h-screen xl:shrink-0 xl:z-auto xl:translate-x-0 xl:visible xl:shadow-none xl:transition-none`. Más `open ? 'translate-x-0 visible shadow-2xl' : 'translate-x-full invisible'`. Así entra y sale por la derecha, de donde viene; `invisible` lo saca del orden de Tab cuando está cerrado.
  - Fondo oscuro: `xl:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300`, más `open ? 'opacity-100' : 'opacity-0 pointer-events-none'`, y `aria-hidden="true"`.
  - Cabecera de cierre: cambiar `bg-white border-gray-200 text-gray-800 hover:bg-gray-100 text-gray-500` por `bg-card border-line text-ink hover:bg-neutral-soft text-ink-soft`, y añadir `aria-label="Fermer l'agenda"` al botón.
  - Botón flotante (FAB): quitar `style={{ backgroundColor: '#BF0D0D' }}` y añadir `bg-accent` a sus clases. Sigue mostrándose solo con `!open`.
- [ ] **Paso 2 (Sidebar):** en el `<aside>`, cambiar `transition-all duration-200` por `transition-[width] duration-200 ease-out`. Los textos que aparecen y desaparecen al plegar **no** se tocan en este PR: hacerlo bien exige rehacer el diseño plegado.
- [ ] **Paso 3:** ejecutar `npm run typecheck && npm test`. Esperado: verde.
- [ ] **Paso 4:** commit: `git commit -am "feat(admin): Agenda deslizante desde la derecha y transición solo de ancho en la barra lateral"`.

### Tarea 6: Code review, verificación final, revisión en local y PR

**Archivos:** ninguno nuevo (salvo los arreglos que salgan de la revisión).

- [ ] **Paso 0: `/code-review high` de toda la rama** contra `main`, **antes** de la prueba en local, para que el usuario pruebe exactamente lo que se publica. Cada hallazgo se comprueba en el código antes de darlo por bueno (memoria `feedback_verificar_hallazgos_revisores`). Los arreglos van en su propio commit (`fix(admin): arreglos del code review del PR B`), con `npm run typecheck && npm test` en verde. Si no hay hallazgos, se dice explícitamente y se pasa al Paso 1.
- [ ] **Paso 1:** ejecutar `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key SUPABASE_SECRET_KEY=placeholder-secret-key npm run build`. Esperado: termina sin errores.
- [ ] **Paso 2:** confirmar que las clases nuevas existen en el CSS compilado: `scale-[0.97]`, `data-closed:`, `translate-x-full`, `transition-[width]` y `text-ink-soft`. Basta con un `grep` sobre `.next/static/chunks/*.css`.
- [ ] **Paso 3: revisión del usuario en local** (`npm run dev`; ⚠️ BD real, cerrar siempre con «Annuler»):
  1. Botones «Nouveau …» de Clients o Machines: se hunden un poco al pulsar.
  2. Tablas del Dashboard y de Clients: las cabeceras grises pequeñas se leen mejor.
  3. Kanban: al arrastrar, la tarjeta original se queda quieta y transparente y solo se mueve la copia. Al soltarla en «Résolu», la ventana aparece con un fundido y al pulsar «Annuler» se va igual.
  4. Contrat → «Remplacer» y «Terminer le contrat»: entran y salen con fundido.
  5. Ventana del navegador estrecha (< 1280px): el botón rojo abre la Agenda deslizándose desde la derecha y «X» la cierra por el mismo camino. Con Tab no se llega a la Agenda cerrada. Ventana ancha: la Agenda se ve como siempre.
  6. Plegar y desplegar la barra lateral: sigue funcionando.
  7. Con «Réduire les animations» activado en macOS, todo aparece sin movimiento.
- [ ] **Paso 4:** con el visto bueno del usuario, `git push -u origin feat/admin-apple-design-pr-b` y `gh pr create`. La descripción lleva la lista anterior, cómo se deshace (*Instant Rollback* + revert) y que la TV del taller no cambia. Esperar el CI verde y **no mergear sin permiso del usuario**.
