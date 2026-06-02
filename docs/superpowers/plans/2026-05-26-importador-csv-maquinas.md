# Importador CSV de Máquinas — Plan de Implementación (PR-A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Goal:** Añadir un importador CSV en `/admin/machines/import` para dar de alta en bloque las máquinas que **no están en Princity** (sin `princity_device_id`), como prerequisito de la Fase B (OCR de contadores).

**Architecture:** Una nueva ruta Next.js de 2 pasos (upload → preview → import), un helper de parseo CSV con validación tipo a tipo, y un server action que hace INSERT en batch con `princity_device_id=NULL` + `princity_pending=false`. No requiere migración SQL.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase (admin client), `papaparse` (nueva dependencia).

**Spec:** `docs/superpowers/specs/2026-05-26-ocr-contadores.md` (sección 8)

**Prerequisitos antes de empezar:**
- Trabajar desde rama nueva `feat/import-csv-maquinas` partiendo de `main` limpio
- Confirmar con el usuario que tiene un CSV de muestra para test manual

---

## Mapa de archivos

| Acción | Ruta |
|---|---|
| Crear | `web-amd/src/lib/csv-import.ts` |
| Crear | `web-amd/src/app/admin/machines/import/page.tsx` |
| Crear | `web-amd/src/app/admin/machines/import/actions.ts` |
| Crear | `web-amd/src/app/admin/machines/import/ImportPreview.tsx` (Client Component) |
| Modificar | `web-amd/src/app/admin/machines/page.tsx` (añadir botón) |
| Modificar | `web-amd/package.json` (añadir papaparse) |

---

## Decisiones de diseño cerradas

- **Parser:** `papaparse` (~16KB minified, sin dependencias). Maneja BOM UTF-8, comas en valores entre comillas, line endings mixtos. Excel export estándar funciona sin tocar nada.
- **Columnas requeridas:** `numero_serie`, `marque`, `modele`, `type` (`color` | `noir_blanc` — enum real, verificado con MCP el 2026-05-26).
- **Columnas opcionales:** `nom_client` (informacional para preview, `machines` no tiene `client_id` — la relación va por `contracts`), `localisation` (mapea a la columna `machines.localisation`).
- **Marcado distintivo:** todas las máquinas creadas vía CSV reciben `princity_device_id=NULL` + `princity_pending=false`. Esto las distingue de:
  - Princity (`princity_device_id NOT NULL`).
  - Princity pendientes de contrato (`princity_pending=true`).
- **Idempotencia:** si `numero_serie` ya existe en BD, la fila se marca como `skipped` en la preview y NO se inserta. No hay opción "update existing" en MVP.
- **Tamaño máximo CSV:** 1 MB (≈ 10.000 filas). Más que suficiente para 20-100 máquinas.
- **Flujo de 2 pasos:** upload → preview con validaciones → confirmar import. Sin import-on-upload (evita errores irreversibles).

---

## Task 1: Instalar dependencia papaparse

**Files:**
- `web-amd/package.json`

- [ ] **Step 1: Instalar papaparse + tipos**

```bash
cd web-amd
npm install papaparse
npm install --save-dev @types/papaparse
```

- [ ] **Step 2: Verificar versiones**

```bash
grep -E "(papaparse|@types/papaparse)" package.json
```

Expected: dos líneas, `papaparse` en dependencies y `@types/papaparse` en devDependencies.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

---

## Task 2: Helper `csv-import.ts`

**Files:**
- `web-amd/src/lib/csv-import.ts`

- [ ] **Step 1: Crear el helper con tipos y validador**

Contenido:

```typescript
import Papa from 'papaparse'
import { MACHINE_TYPES, type MachineType } from '@/lib/enums'

export const REQUIRED_COLUMNS = ['numero_serie', 'marque', 'modele', 'type'] as const
export const OPTIONAL_COLUMNS = ['nom_client', 'notes'] as const
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const

export type CsvParseError = {
  row: number  // 1-based, excludes header
  field?: string
  message: string
}

export type CsvMachineRow = {
  numero_serie: string
  marque: string
  modele: string
  type: MachineType
  nom_client: string | null
  notes: string | null
}

export type CsvParseResult = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
}

const MAX_FIELD_LEN = 200

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

function trimOrEmpty(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.trim()
}

export function parseMachinesCsv(content: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = parsed.meta.fields ?? []
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
  if (missingColumns.length > 0) {
    return { rows: [], errors: [], missingColumns }
  }

  const errors: CsvParseError[] = []
  const rows: CsvMachineRow[] = []
  const seenSeries = new Set<string>()

  parsed.data.forEach((raw, idx) => {
    const rowNum = idx + 1
    const numero_serie = trimOrEmpty(raw.numero_serie)
    const marque = trimOrEmpty(raw.marque)
    const modele = trimOrEmpty(raw.modele)
    const typeRaw = trimOrEmpty(raw.type).toLowerCase()
    const nom_client = trimOrNull(raw.nom_client)
    const notes = trimOrNull(raw.notes)

    if (!numero_serie) {
      errors.push({ row: rowNum, field: 'numero_serie', message: 'Valeur manquante' })
      return
    }
    if (numero_serie.length > MAX_FIELD_LEN) {
      errors.push({ row: rowNum, field: 'numero_serie', message: `Trop long (max ${MAX_FIELD_LEN})` })
      return
    }
    if (seenSeries.has(numero_serie)) {
      errors.push({ row: rowNum, field: 'numero_serie', message: 'Doublon dans le CSV' })
      return
    }
    seenSeries.add(numero_serie)

    if (!marque) {
      errors.push({ row: rowNum, field: 'marque', message: 'Valeur manquante' })
      return
    }
    if (!modele) {
      errors.push({ row: rowNum, field: 'modele', message: 'Valeur manquante' })
      return
    }
    if (!MACHINE_TYPES.includes(typeRaw as MachineType)) {
      errors.push({ row: rowNum, field: 'type', message: `Doit être l'une de: ${MACHINE_TYPES.join(', ')}` })
      return
    }

    rows.push({
      numero_serie,
      marque,
      modele,
      type: typeRaw as MachineType,
      nom_client,
      notes,
    })
  })

  return { rows, errors, missingColumns: [] }
}
```

- [ ] **Step 2: Verificar enums**

```bash
grep -E "MACHINE_TYPES|MachineType" web-amd/src/lib/enums.ts | head -10
```

Si `MACHINE_TYPES` o `MachineType` no existen con esos nombres exactos, ajustar el import.

- [ ] **Step 3: TypeScript check**

```bash
cd web-amd && npx tsc --noEmit
```

Expected: 0 errores.

---

## Task 3: Server actions

**Files:**
- `web-amd/src/app/admin/machines/import/actions.ts`

- [ ] **Step 1: Crear las dos actions (preview + import)**

Estructura (esqueleto — el agente completa nombres exactos según convenciones):

```typescript
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMachinesCsv, type CsvMachineRow, type CsvParseError } from '@/lib/csv-import'

const MAX_CSV_BYTES = 1024 * 1024  // 1 MB

export type PreviewState = {
  rows: CsvMachineRow[]
  errors: CsvParseError[]
  missingColumns: string[]
  duplicatesInDb: string[]    // numero_serie already in machines
  unknownClients: string[]    // nom_client provided but not in clients
  ok: boolean
}

export async function previewCsvAction(formData: FormData): Promise<PreviewState> {
  await requireAdmin()
  const file = formData.get('csv') as File | null

  if (!file) {
    return { rows: [], errors: [], missingColumns: [], duplicatesInDb: [], unknownClients: [], ok: false }
  }
  if (file.size > MAX_CSV_BYTES) {
    return {
      rows: [], errors: [{ row: 0, message: `Fichier trop volumineux (max ${MAX_CSV_BYTES / 1024} KB)` }],
      missingColumns: [], duplicatesInDb: [], unknownClients: [], ok: false,
    }
  }

  const content = await file.text()
  const { rows, errors, missingColumns } = parseMachinesCsv(content)

  if (missingColumns.length > 0 || rows.length === 0) {
    return { rows, errors, missingColumns, duplicatesInDb: [], unknownClients: [], ok: false }
  }

  const supabase = createAdminClient()

  // Check duplicates in BD
  const series = rows.map((r) => r.numero_serie)
  const { data: existing } = await supabase
    .from('machines')
    .select('numero_serie')
    .in('numero_serie', series)
  const duplicatesInDb = (existing ?? []).map((m) => m.numero_serie)

  // Check unknown clients
  const clientNames = [...new Set(rows.map((r) => r.nom_client).filter((c): c is string => c !== null))]
  let unknownClients: string[] = []
  if (clientNames.length > 0) {
    const { data: knownClients } = await supabase
      .from('clients')
      .select('nom_client')
      .in('nom_client', clientNames)
    const known = new Set((knownClients ?? []).map((c) => c.nom_client))
    unknownClients = clientNames.filter((c) => !known.has(c))
  }

  const ok = errors.length === 0
  return { rows, errors, missingColumns, duplicatesInDb, unknownClients, ok }
}

export async function importCsvAction(formData: FormData) {
  await requireAdmin()
  // Read same file again (no server state between actions in Next.js 16)
  const previewState = await previewCsvAction(formData)
  if (!previewState.ok) {
    throw new Error('Preview invalid; cannot import')
  }

  const supabase = createAdminClient()
  const skipSerials = new Set(previewState.duplicatesInDb)
  const toInsert = previewState.rows.filter((r) => !skipSerials.has(r.numero_serie))

  if (toInsert.length === 0) {
    redirect('/admin/machines?imported=0')
  }

  // Resolve client_id for rows with nom_client
  const clientNames = [...new Set(toInsert.map((r) => r.nom_client).filter((c): c is string => c !== null))]
  const clientMap = new Map<string, number>()
  if (clientNames.length > 0) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, nom_client')
      .in('nom_client', clientNames)
    for (const c of clients ?? []) clientMap.set(c.nom_client, c.id)
  }

  const records = toInsert.map((r) => ({
    numero_serie: r.numero_serie,
    marque: r.marque,
    modele: r.modele,
    type: r.type,
    active: true,
    princity_device_id: null,
    princity_pending: false,
    notes: r.notes,
    // Note: machines table does NOT have client_id directly — clients are linked via contracts.
    // nom_client is informational only for the preview; ignored at INSERT level.
  }))

  const { error } = await supabase.from('machines').insert(records)
  if (error) throw new Error(`Insert failed: ${error.message}`)

  revalidatePath('/admin/machines')
  redirect(`/admin/machines?imported=${records.length}`)
}
```

**IMPORTANTE:** verificar el esquema de `machines` antes — `client_id` puede o no existir. En el spec sabemos que clientes van por `contracts`. El agente debe **verificar** esto con `\d machines` antes de escribir el código final.

- [ ] **Step 2: Verificar esquema de machines**

```bash
# Vía MCP Supabase
mcp__supabase__execute_sql project_id=myyejbviunyvywfukysj
  query="SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' ORDER BY ordinal_position"
```

Si hay columnas NOT NULL no contempladas → añadir defaults o pedir al usuario.

- [ ] **Step 3: TypeScript check**

```bash
cd web-amd && npx tsc --noEmit
```

Expected: 0 errores.

---

## Task 4: Página `/admin/machines/import`

**Files:**
- `web-amd/src/app/admin/machines/import/page.tsx`
- `web-amd/src/app/admin/machines/import/ImportPreview.tsx`

- [ ] **Step 1: Crear `page.tsx` (Server Component)**

Layout en 2 pasos:
1. **Upload zone** — drag&drop + file picker (acepta solo `.csv`)
2. **Preview** (cliente) — tabla con primeras 50 filas, badges por estado, botón "Importer X machines"

Página simple, sigue el patrón de `/admin/machines/new/page.tsx` (auth via `requireAdmin()` + render).

- [ ] **Step 2: Crear `ImportPreview.tsx` (Client Component)**

`'use client'`. Recibe el `PreviewState` del server action vía `useActionState`. Renderiza:
- Bloque rojo si `missingColumns.length > 0` o `errors.length > 0`
- Tabla de las primeras 50 filas válidas con columnas: nº série, marque, modèle, type, client, status (badge "Nouveau" / "Existe déjà" / "Client inconnu")
- Botón "Importer N machines" deshabilitado si `!ok` o si todas son duplicadas
- Botón "Annuler" → vuelve a `/admin/machines`
- Usa `Card`, `Badge`, `buttonClasses` del rediseño Híbrido (token `bg-page`, `font-display`, etc.)

Importante: ya tenemos el formulario del CSV (file input) en el server component, el preview es client. El flujo es: form GET con `previewCsvAction` → render preview → segundo form POST con `importCsvAction`.

Como `useActionState` no se conserva entre navegaciones, este caso particular es mejor manejarlo con:
- Server component renderiza el formulario de upload
- Al submit, server action procesa preview y guarda en URL params? — NO, el CSV es grande.
- **Solución correcta:** subir el CSV **dos veces** (una para preview, otra para confirmar). El usuario reselecciona el mismo archivo. Es 1 segundo más pero garantiza statelessness.

Alternativa más UX-friendly: usar el patrón `<form action={previewCsvAction}>` con `useActionState`, y al confirmar reenviar el mismo File desde el cliente al action de import. Esto requiere mantener el File en estado de cliente.

**Recomendación:** patrón con File en cliente:
1. Cliente lee File, llama action de preview, recibe `PreviewState`
2. Cliente conserva el File en estado
3. Al click "Importer", cliente envía el MISMO File al action de import
4. Server hace preview de nuevo (defensa en profundidad) y, si ok, inserta

Este patrón es el más limpio. Lo implementa `ImportPreview.tsx`.

- [ ] **Step 3: TypeScript check + build**

```bash
cd web-amd && npx tsc --noEmit && npm run build
```

Expected: 0 errores, build OK.

---

## Task 5: Botón "Importer CSV" en `/admin/machines/page.tsx`

**Files:**
- `web-amd/src/app/admin/machines/page.tsx`

- [ ] **Step 1: Añadir botón secundario junto a "Nouvelle machine"**

```tsx
<div className="flex items-center gap-3">
  <Link href="/admin/machines/import" className={buttonClasses('secondary')}>
    <Upload size={16} />
    Importer CSV
  </Link>
  <Link href="/admin/machines/new" className={buttonClasses('primary')}>
    <Plus size={16} />
    Nouvelle machine
  </Link>
</div>
```

Importar `Upload` de `lucide-react`. Verificar que `buttonClasses('secondary')` existe (el rediseño Híbrido lo introdujo). Si no existe, usar `buttonClasses('outline')` o equivalente.

- [ ] **Step 2: Banner toast post-import**

Cuando `?imported=N` está en searchParams, mostrar banner verde arriba: «N machines importées avec succès». Auto-hide tras click (Server Component con condicional, sin animación necesaria).

- [ ] **Step 3: TypeScript check**

```bash
cd web-amd && npx tsc --noEmit
```

Expected: 0 errores.

---

## Task 6: Test manual con CSV de prueba

**Files:**
- Crear `test-fixtures/machines-sample.csv` (NO commitear — añadir a `.gitignore` si no está)

- [ ] **Step 1: Crear CSV de prueba**

Contenido sugerido (10 filas: 7 válidas, 1 con duplicado en BD, 1 con type inválido, 1 con cliente desconocido):

```csv
numero_serie,marque,modele,type,nom_client,notes
TEST-CSV-001,Ricoh,MP C2003,multifunction,Instituto Cervantes,Sede principal
TEST-CSV-002,Ricoh,MP C3503,color,SACOM,
TEST-CSV-003,Kyocera,TASKalfa 3252ci,multifunction,,Sin cliente asignado
E204RA65472,Ricoh,MP C2003,multifunction,SACOM,DUPLICADO existente
TEST-CSV-005,Ricoh,MP C2003,fax,Instituto Cervantes,Type invalido
TEST-CSV-006,Ricoh,MP 5055,bw,Cliente Inexistente,
TEST-CSV-007,HP,LaserJet Pro M404n,bw,Instituto Cervantes,
TEST-CSV-008,Brother,DCP-L2540DW,bw,,
TEST-CSV-009,Canon,iR-ADV C5550i,color,SACOM,
TEST-CSV-010,Xerox,VersaLink C405,multifunction,,
```

- [ ] **Step 2: Levantar dev server**

```bash
cd web-amd && npm run dev
```

Login como admin. Ir a `/admin/machines/import`. Subir CSV.

- [ ] **Step 3: Verificar preview**

Esperado:
- 7 filas válidas mostradas
- 1 fila con badge rojo "Type invalide"
- 1 fila con badge "Existe déjà" (E204RA65472)
- 1 cliente desconocido reportado ("Cliente Inexistente")
- Botón "Importer 6 machines" habilitado (7 válidas - 1 duplicado = 6 a importar; o 7 si la lógica importa duplicados como skip)

Ajustar el conteo en el botón según diseño final.

- [ ] **Step 4: Confirmar import**

Click "Importer". Esperado:
- Redirect a `/admin/machines?imported=6`
- Banner verde
- Las 6 máquinas TEST-CSV-* aparecen en el listado
- `princity_device_id` es NULL y `princity_pending` es false en BD

```bash
mcp__supabase__execute_sql project_id=myyejbviunyvywfukysj
  query="SELECT numero_serie, princity_device_id, princity_pending FROM machines WHERE numero_serie LIKE 'TEST-CSV-%' ORDER BY numero_serie"
```

- [ ] **Step 5: Limpiar test data**

```sql
DELETE FROM machines WHERE numero_serie LIKE 'TEST-CSV-%';
```

---

## Task 7: Build + commit + PR

- [ ] **Step 1: Build final**

```bash
cd web-amd && npx tsc --noEmit && npm run build
```

Expected: 0 errores, build OK.

- [ ] **Step 2: Verificar git status**

```bash
git status --short
```

Esperado (archivos nuevos):
- `web-amd/package.json` + `package-lock.json` (modificados)
- `web-amd/src/lib/csv-import.ts`
- `web-amd/src/app/admin/machines/import/page.tsx`
- `web-amd/src/app/admin/machines/import/actions.ts`
- `web-amd/src/app/admin/machines/import/ImportPreview.tsx`
- `web-amd/src/app/admin/machines/page.tsx` (modificado)
- `docs/superpowers/specs/2026-05-26-ocr-contadores.md` (ya existe del spec)
- `docs/superpowers/plans/2026-05-26-importador-csv-maquinas.md` (este archivo)

NO commitear: `test-fixtures/`, `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add web-amd/package.json web-amd/package-lock.json \
        web-amd/src/lib/csv-import.ts \
        web-amd/src/app/admin/machines/import/ \
        web-amd/src/app/admin/machines/page.tsx \
        docs/superpowers/
git commit -m "feat: import masivo de máquinas vía CSV en /admin/machines/import"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/import-csv-maquinas
gh pr create --title "feat: import masivo de máquinas vía CSV" --body "$(cat <<'EOF'
## Summary
- Nueva ruta `/admin/machines/import` con flujo upload → preview → confirm
- Helper `csv-import.ts` con `papaparse` y validación tipo a tipo
- INSERT en batch con `princity_device_id=NULL` + `princity_pending=false`
- Prerequisito para PR-B (OCR de contadores)

## Test plan
- [ ] CSV con 10 filas mixtas (válidas, duplicados, type inválido, cliente desconocido)
- [ ] Preview detecta los 3 tipos de problemas correctamente
- [ ] Importa solo filas válidas y no-duplicadas
- [ ] Banner verde post-import con count correcto
- [ ] `princity_device_id` queda NULL en las filas importadas

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Code review**

```
/code-review <N>
```

5 agentes Sonnet en paralelo + scorers Haiku. Aplicar fixes si scorean ≥80.

- [ ] **Step 6: Merge**

```bash
gh pr merge <N> --merge --delete-branch
```

- [ ] **Step 7: Verificar Vercel deploy + smoke test**

Esperar deploy automático, entrar a `/admin/machines/import` en producción, verificar que carga sin errores.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Usuario sube un CSV con BOM UTF-8 (Excel típico) | `papaparse` lo maneja automáticamente |
| Usuario sube un CSV con `,` dentro de valores entre comillas | `papaparse` lo parsea correctamente |
| Usuario sube un archivo enorme (10 MB+) | Validación de tamaño en server action (1 MB) |
| Race: dos admins importan el mismo CSV a la vez | UNIQUE constraint en `machines(numero_serie)` rechaza el segundo. El segundo admin verá fila como duplicada en preview |
| Nombres de cliente con whitespace inconsistente | `trimOrNull()` lo limpia antes de match |
| Usuario olvida la columna `type` | `missingColumns` lo detecta y muestra error claro |

---

## Fuera de alcance

- Update de máquinas existentes (solo INSERT)
- Vinculación automática `client_id` → contrato (las máquinas se ligan a clientes vía `contracts`, no directamente)
- Importar contratos en el mismo CSV
- Validación de marca/modelo contra catálogo (no existe)
- Histórico de imports anteriores (no se guarda log de imports)
