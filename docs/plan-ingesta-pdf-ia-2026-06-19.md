# Plan — Ingesta de contadores «PDF entero → IA»

**Fecha:** 2026-06-19 · **Sustituye:** el troceo foto-a-foto en el navegador (PRs #106–#111).

## Objetivo

Cambiar **solo la subida manual desde la app**: en vez de trocear el PDF en 46 imágenes y hacer 46 llamadas al OCR, **subir el PDF entero** y enviarlo a la IA (Claude) que devuelve la **lista completa de lecturas**. Las lecturas entran a la **misma cola** (`pending_counter_imports`), con los **mismos semáforos, validación y confirmar/rechazar** que ya existen.

### Condiciones fijadas por el usuario
1. **Código limpio (cirujano):** se EXTIRPA todo el andamiaje del método viejo. Cero código residual.
2. **Envío por trozos:** el PDF va a la IA en 2-3 trozos (límite por minuto). Coste ≈ $0,30/PDF (igual que ahora).
3. **El email NO se toca:** sigue con el método antiguo (1 foto = 1 lectura). Queda como deuda futura (ver `docs/pendientes.md` §6-bis).

---

## Qué se CONSERVA (intacto)

- Tabla `pending_counter_imports` (cola + audit log).
- RPC `process_counter_extraction` (match por serial + validaciones + semáforo). **Se reutiliza tal cual.**
- Página `/admin/contadores/pendientes` + `PendingList` + acciones `confirmPendingAction` / `rejectPendingAction`.
- RPC `import_counter_from_pending` (confirmar → `machine_counters`).
- **Camino EMAIL completo:** `receive-counter-email` + `parse-counter-image` + `register_counter_duplicate`. **No se modifica ni una línea.**
- Bucket `counter-images`.

## Qué se ELIMINA (extirpación limpia)

| Elemento | Acción |
|---|---|
| `src/lib/pdfToImages.ts` | **borrar** |
| Dependencia `pdfjs-dist` (package.json + lockfile) | **desinstalar** |
| Scripts `copy:pdf-wasm` + hooks `postinstall`/`predev`/`predev:turbo`/`prebuild` | **borrar** |
| Carpeta `/public/pdfjs/` + su línea en `.gitignore` | **borrar** |
| CSP `worker-src 'self' blob:` en `next.config.ts` | **borrar** (ya no hay worker) |
| Bucle de subida 1-a-1 / pool de concurrencia en `UploadCounterButton` | **reemplazar** por subida simple del PDF |
| `maxDuration = 60` en `page.tsx` | **revisar/quitar** (el trabajo pesado pasa a la Edge Function) |

`src/lib/counterUpload.ts` se **poda** a lo reutilizable (validación de tipo/tamaño, hash, ruta de bucket). `uploadCounterImageAction` se **sustituye** por `uploadCounterDocumentAction`.

---

## Arquitectura nueva (3 piezas)

### 1) Edge Function `parse-counter-document` (Deno) — NUEVA
Hace todo el trabajo pesado, en segundo plano (`EdgeRuntime.waitUntil`), guardando ANTHROPIC_API_KEY en servidor.

Flujo:
1. Recibe `{ document_path }` (ruta del PDF/imagen en el bucket).
2. Descarga el documento.
3. **Si es PDF:** lo parte en trozos de ~15 páginas con `pdf-lib` (copia de páginas, **sin renderizar** → no hay problema CCITT). **Si es imagen:** un solo "trozo".
4. Por cada trozo: llamada a Claude con `tool_choice` forzado a `submit_counter_readings` (devuelve un **array** de lecturas). **Espaciado entre llamadas** (~20-30 s) para no superar el límite por minuto.
5. **Agrega** las lecturas de todos los trozos y **deduplica por nº de serie** (cubre el caso de una máquina partida entre dos trozos → se queda la de mayor confianza).
6. Por cada lectura: `INSERT` en `pending_counter_imports` (`source='manual'`, `extracted_data`=lectura, `image_path`=PDF + nº de página para revisión) y `rpc process_counter_extraction` (match + validación + semáforo). → las filas aparecen en la cola progresivamente.

**Tool `submit_counter_readings`:** array de objetos con el MISMO shape que el OCR actual (`serial`, `counter_bw`, `counter_color`, `date_iso`, `is_valid_counter_sheet`, `confidence`, `issues`) para reusar el RPC. El prompt instruye los formatos conocidos:
- **Ricoh/HP "Page Counter":** `counter_bw` = *B & W Total*, `counter_color` = *Color/Colour Total*.
- **Pantum M7100 (mono):** `counter_bw` = *Total pages printed*, `counter_color` = 0. (Ocupa 2 págs → 1 sola lectura.)
- **Pantum CM1100A (color):** `counter_color` = *pages printed in color*, `counter_bw` = *in monocolor*.
- **HP PageWide (francés "Rapport d'utilisation"):** mapear *Couleur totale* / monochrome.
- Una máquina = una lectura, aunque ocupe varias páginas.

### 2) Server Action `uploadCounterDocumentAction` — reemplaza a `uploadCounterImageAction`
1. `requireAdmin`, valida que sea PDF o imagen, ≤ 12 MB.
2. Hash SHA-256 del fichero → **dedup de PDF** (no reprocesar el mismo documento; el solapamiento parcial lo cubre el ámbar «misma máquina+mes» existente).
3. Sube el documento al bucket (`counter-images/manual/{hash}.pdf`).
4. Dispara `parse-counter-document` (fire-and-forget, la función trabaja en background).
5. Devuelve rápido: «Document reçu, analyse en cours».

### 3) UI `UploadCounterButton` — simplificado
- Botón → elegir PDF/imagen → subir (sin trocear nada en el navegador) → mensaje «Analyse en cours, rafraîchissez dans quelques instants».
- **Revisión:** para filas de origen PDF, mostrar la **página concreta** del PDF (`<embed src="...#page=N">` o enlace) en vez de un JPEG. Sin renderizar nada en cliente.

---

## Fases de implementación

- **F1 — Edge Function `parse-counter-document`** + prompt/tool multi-formato + chunking con `pdf-lib` + dedup por serial. Probar con `2AS - mars.pdf` (gate: ~40 lecturas, incl. Pantum/HP).
- **F2 — Server Action** `uploadCounterDocumentAction` + dedup de PDF + subida + disparo.
- **F3 — UI** `UploadCounterButton` simplificado + revisión por página de PDF.
- **F4 — EXTIRPACIÓN** del andamiaje viejo (tabla de arriba) + verificar que nada lo referencia (grep).
- **F5 — Verificación:** `typecheck` + `test` + `build` verdes; prueba real en prod con el PDF de 2AS; gate.

## Riesgos / decisiones abiertas

- **Límite por minuto:** mitigado con trozos de ~15 págs espaciados. Si aún diera 429, ampliar el espaciado (no cambia el coste).
- **`pdf-lib` en Deno edge:** es JS puro (sin binarios nativos) → debería correr; **verificar en F1**.
- **Frontera de trozo** partiendo una Pantum: cubierto por la dedup-por-serial y/o solape de 1 página.
- **Dos funciones OCR temporalmente** (`parse-counter-image` para email, `parse-counter-document` para app): intencional. Unificarlas es parte de la deuda futura del email.

## Definición de «hecho»
Subir `2AS - mars.pdf` en prod → aparecen ~40 lecturas en la cola (incl. CCITT, Pantum, HP), sin cuelgues ni saturación, y el código viejo del troceo ya no existe en el repo.
