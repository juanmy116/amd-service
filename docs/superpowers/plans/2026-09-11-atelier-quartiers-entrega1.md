# Entrega 1 — Datos de quartier (Atelier) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cliente (y opcionalmente cada máquina) tenga un *quartier* con coordenadas, rellenado automáticamente desde la dirección y corregible desde `/admin`, para que la entrega 2 pueda pintar el mapa del kiosko.

**Architecture:** Tabla nueva `quartiers` (catálogo + coordenadas, RLS lectura authenticated / escritura admin) y columna `quartier_code` en `clients` y `machines` con FK. Una segunda migración rellena `clients.quartier_code` a partir del texto de `adresse`. En la UI, un `<select>` reutilizable (`QuartierSelect`) se añade al formulario de cliente (justo después de `adresse`) y al de máquina (opcional, "si différent du client"), más columna y filtro en el listado de clientes.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (PostgreSQL 17 + RLS), Tailwind v4, vitest (unit + RLS contra Supabase local efímero).

**Spec:** `docs/superpowers/specs/2026-09-11-atelier-dashboard-carte-design.md`

---

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260911150000_quartiers.sql` | Crear tabla, seed del catálogo, columnas FK, índices, RLS |
| `supabase/migrations/20260911150100_quartiers_backfill.sql` | Rellenar `clients.quartier_code` desde `adresse`/`ville` |
| `src/lib/quartiers.ts` | Tipos + `resolveQuartierCode` + `groupByVille` (puro, testeable) |
| `src/lib/quartiers.test.ts` | Tests unitarios de lo anterior |
| `src/components/admin/QuartierSelect.tsx` | `<select>` con `<optgroup>` por ciudad |
| `src/components/admin/ClientForm.tsx` | Añadir el campo Quartier tras `adresse` |
| `src/app/admin/clients/new/page.tsx` · `[id]/page.tsx` | Cargar quartiers y pasarlos al formulario |
| `src/app/admin/clients/new/actions.ts` · `[id]/actions.ts` | Guardar `quartier_code` |
| `src/components/admin/MachineForm.tsx` + `machines/*/page.tsx` + `machines/*/actions.ts` | Lo mismo para máquinas (opcional) |
| `src/app/admin/clients/page.tsx` | Columna `Quartier` + filtro `Sans quartier` |
| `src/lib/supabase/types.ts` | Regenerado tras las migraciones |
| `tests/rls/quartiers-isolation.test.ts` | Aislamiento RLS de la tabla nueva |

---

## Preparación

- [ ] **Crear la rama de trabajo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b feat/atelier-quartiers
```

- [ ] **Arrancar Supabase local (necesario para migraciones y tests RLS)**

```bash
npx supabase start
npx supabase status -o env    # exporta API_URL, ANON_KEY, SERVICE_ROLE_KEY
```

Expected: la salida lista `API URL: http://127.0.0.1:54321` y las claves. Exporta `ANON_KEY` y `SERVICE_ROLE_KEY` en el shell donde correrás `npm run test:rls`.

---

## Task 1: Migración — tabla `quartiers`, columnas y RLS

**Files:**
- Create: `supabase/migrations/20260911150000_quartiers.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- QUARTIERS — ubicación por barrio para el mapa del kiosko /atelier (2026-09-11).
--
-- Contexto: `clients` solo tiene `ville` y `adresse` (texto libre). El dashboard de Atelier
-- necesita pintar cada aviso sobre un mapa, y geocodificar direcciones senegalesas no es fiable.
-- Se elige granularidad de BARRIO: cada quartier lleva su centroide (lat/lng) y el mapa dibuja
-- una burbuja por quartier.
--
-- La tabla es catálogo Y fuente de coordenadas: añadir una zona nueva es un INSERT, sin desplegar.
-- Ubicación de un aviso = machines.quartier_code ?? clients.quartier_code (ver src/lib/quartiers.ts).

BEGIN;

CREATE TABLE public.quartiers (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  ville       text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  sort_order  integer NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.quartiers IS
  'Catálogo de barrios/zonas con centroide, usado por el mapa del kiosko /atelier.';

INSERT INTO public.quartiers (code, label, ville, lat, lng, sort_order) VALUES
  ('plateau',     'Plateau · Centre-ville',             'Dakar',       14.6690, -17.4300, 10),
  ('medina',      'Médina · Gueule Tapée',              'Dakar',       14.6800, -17.4480, 20),
  ('point-e',     'Fann · Point E · Amitié',            'Dakar',       14.6900, -17.4640, 30),
  ('mermoz',      'Mermoz · Sacré-Cœur · Sipres',       'Dakar',       14.7060, -17.4720, 40),
  ('liberte',     'Liberté · Grand Dakar · HLM',        'Dakar',       14.7080, -17.4520, 50),
  ('ouakam',      'Ouakam · Mamelles',                  'Dakar',       14.7200, -17.4900, 60),
  ('almadies',    'Almadies · Ngor',                    'Dakar',       14.7440, -17.5140, 70),
  ('yoff',        'Yoff · Aéroport · Foire',            'Dakar',       14.7480, -17.4750, 80),
  ('parcelles',   'Parcelles Assainies · Cambérène',    'Dakar',       14.7650, -17.4400, 90),
  ('hann',        'Hann · Bel-Air · Port · Patte d''Oie','Dakar',      14.7100, -17.4270, 100),
  ('pikine',      'Pikine · Guédiawaye · Thiaroye',     'Dakar',       14.7550, -17.3950, 110),
  ('keur-massar', 'Keur Massar · Malika · Mbao',        'Dakar',       14.7800, -17.3200, 120),
  ('rufisque',    'Rufisque · Bargny',                  'Dakar',       14.7150, -17.2700, 130),
  ('diamniadio',  'Diamniadio',                         'Diamniadio',  14.7280, -17.1830, 200),
  ('thies',       'Thiès',                              'Thiès',       14.7910, -16.9260, 210),
  ('mbour',       'Mbour · Saly',                       'Mbour',       14.4200, -16.9600, 220),
  ('diass',       'Diass',                              'Diass',       14.6400, -17.0700, 230),
  ('touba',       'Touba',                              'Touba',       14.8500, -15.8800, 240),
  ('kaolack',     'Kaolack',                            'Kaolack',     14.1500, -16.0700, 250),
  ('saint-louis', 'Saint-Louis',                        'Saint-Louis', 16.0300, -16.5000, 260),
  ('ziguinchor',  'Ziguinchor',                         'Ziguinchor',  12.5800, -16.2700, 270);

-- ── Ubicación del cliente y (opcional) de la máquina ──
ALTER TABLE public.clients
  ADD COLUMN quartier_code text REFERENCES public.quartiers(code);
ALTER TABLE public.machines
  ADD COLUMN quartier_code text REFERENCES public.quartiers(code);

COMMENT ON COLUMN public.clients.quartier_code IS
  'Barrio del cliente. Fuente por defecto de la ubicación de sus avisos en /atelier.';
COMMENT ON COLUMN public.machines.quartier_code IS
  'Barrio de ESTA máquina; solo se rellena si está en una sede distinta a la del cliente.';

CREATE INDEX idx_clients_quartier  ON public.clients(quartier_code);
CREATE INDEX idx_machines_quartier ON public.machines(quartier_code);

-- ── RLS: catálogo legible por cualquier usuario autenticado, escritura solo admin ──
ALTER TABLE public.quartiers ENABLE ROW LEVEL SECURITY;

-- En prod los default privileges ya dan los GRANT a `authenticated`; en la BD local efímera
-- (tests RLS) hay que darlos explícitamente. RLS sigue gobernando qué filas se ven.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quartiers TO authenticated;

CREATE POLICY quartiers_select_authenticated ON public.quartiers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY quartiers_admin_all ON public.quartiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
```

- [ ] **Step 2: Aplicarla en la base local**

Run: `npx supabase migration up`
Expected: `Applying migration 20260911150000_quartiers.sql...` sin errores.

- [ ] **Step 3: Comprobar el seed**

Run:
```bash
npx supabase db psql -c "select count(*) as total, count(*) filter (where ville='Dakar') as dakar from quartiers;"
```
Expected: `total = 21`, `dakar = 13`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911150000_quartiers.sql
git commit -m "feat(atelier): tabla quartiers + quartier_code en clients y machines

Catálogo de barrios con centroide para el mapa del kiosko /atelier.
RLS: lectura authenticated, escritura admin.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Test RLS de la tabla nueva

**Files:**
- Create: `tests/rls/quartiers-isolation.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// quartiers: catálogo de barrios con coordenadas para el mapa de /atelier.
// Lo lee cualquier usuario autenticado (el kiosko usa cuenta technician-dispatcher);
// solo el admin puede tocarlo. Supabase LOCAL efímero.

const admin = adminClient()

const ADMIN  = 'admin@rls.test'
const TECH   = 'tech-a@rls.test'
const CLIENT = 'client@rls.test'

async function clearTestRows() {
  await admin.from('quartiers').delete().like('code', 'test-%')
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await clearTestRows()
  await createUserWithRole(admin, ADMIN, 'admin')
  await createUserWithRole(admin, TECH, 'technician')
  await createUserWithRole(admin, CLIENT, 'client')
}, 60_000)

afterAll(async () => {
  await clearTestRows()
  await cleanup(admin)
})

describe('RLS — quartiers (lectura authenticated, escritura admin)', () => {
  it('el seed de la migración está presente', async () => {
    const { data } = await admin.from('quartiers').select('code').eq('code', 'plateau')
    expect((data ?? []).length).toBe(1)
  })

  it('el técnico PUEDE leer el catálogo', async () => {
    const c = await signInAs(TECH)
    const { data, error } = await c.from('quartiers').select('code, lat, lng').eq('code', 'almadies')
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
  })

  it('el cliente PUEDE leer el catálogo', async () => {
    const c = await signInAs(CLIENT)
    const { data } = await c.from('quartiers').select('code').eq('code', 'plateau')
    expect((data ?? []).length).toBe(1)
  })

  it('el anónimo NO puede leer el catálogo', async () => {
    // Ojo: aquí NO se usa expectEmpty (ver tests/rls/assert.ts). El anónimo no tiene GRANT
    // sobre la tabla, así que recibir un permission-denied con data null es el resultado
    // esperado, no un falso verde.
    const c = anonClient()
    const { data } = await c.from('quartiers').select('code')
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin puede crear un quartier', async () => {
    const c = await signInAs(ADMIN)
    const { error } = await c.from('quartiers').insert({
      code: 'test-zone', label: 'Test Zone', ville: 'Dakar', lat: 14.7, lng: -17.45,
    })
    expect(error).toBeNull()
  })

  it('el técnico NO puede crear un quartier', async () => {
    const c = await signInAs(TECH)
    await c.from('quartiers').insert({
      code: 'test-tech', label: 'Test Tech', ville: 'Dakar', lat: 14.7, lng: -17.45,
    })
    const { data } = await admin.from('quartiers').select('code').eq('code', 'test-tech')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico NO puede mover un quartier existente', async () => {
    const c = await signInAs(TECH)
    await c.from('quartiers').update({ lat: 0 }).eq('code', 'plateau')
    const { data } = await admin.from('quartiers').select('lat').eq('code', 'plateau').single()
    expect(data?.lat).toBeCloseTo(14.669, 3)
  })
})
```

- [ ] **Step 2: Ejecutar y ver que pasa**

Run: `npm run test:rls -- tests/rls/quartiers-isolation.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/quartiers-isolation.test.ts
git commit -m "test(rls): aislamiento de la tabla quartiers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migración — relleno automático desde la dirección

**Files:**
- Create: `supabase/migrations/20260911150100_quartiers_backfill.sql`

Diccionario verificado contra la base real de producción: 51/68 con los patrones de barrio, ~90 % añadiendo calles del Plateau y los casos sueltos (Gueule Tapée, Cambérène, Mbao, Grand Moulin/Port, Centenaire, Sipres).

> El diccionario vive en SQL, no en TypeScript, así que su prueba **es** la consulta del Step 3
> contra los datos reales: es el único sitio donde se puede medir si acierta. No hay test de vitest
> para esto, y es deliberado (un test contra direcciones inventadas no probaría nada).

- [ ] **Step 1: Escribir la migración**

```sql
-- BACKFILL de quartier_code en clients a partir del texto de `adresse` (2026-09-11).
--
-- Las direcciones de AMD llevan el barrio escrito dentro ("POINT E, AVENUE BIRAGO DIOP",
-- "ALMADIES ZONE 3", "SICAP BAOBABS ... MERMOZ"). Este UPDATE aprovecha eso.
-- Lo que no encaje queda a NULL y se corrige a mano en /admin/clients (filtro «Sans quartier»).
--
-- Solo toca filas con quartier_code IS NULL: es reejecutable y nunca pisa una corrección manual.

BEGIN;

UPDATE public.clients SET quartier_code = CASE
  WHEN adresse ILIKE ANY (ARRAY['%ALMADIES%','%NGOR%','%ARC EN CIEL%'])
    THEN 'almadies'
  WHEN adresse ILIKE ANY (ARRAY['%OUAKAM%','%OUKAM%','%MAMELLE%','%RENAISSANCE%'])
    THEN 'ouakam'
  WHEN adresse ILIKE ANY (ARRAY['%YOFF%','%AEROPORT%','%FOIRE%'])
    THEN 'yoff'
  WHEN adresse ILIKE ANY (ARRAY['%POINT E%','%FANN%','%AMITIE%','%BIRAGO DIOP%','%BOULEVARD DE L%EST%'])
    THEN 'point-e'
  WHEN adresse ILIKE ANY (ARRAY['%MERMOZ%','%SACRE%','%KEUR GORGUI%','%SOTRAC%','%SICAP%','%BAOBAB%','%SIPRES%','%VDN%'])
    THEN 'mermoz'
  WHEN adresse ILIKE ANY (ARRAY['%LIBERTE%','%HLM%','%GRAND DAKAR%','%FRONT DE TERRE%','%SODIDA%','%DIEUPPEUL%','%CASTORS%'])
    THEN 'liberte'
  WHEN adresse ILIKE ANY (ARRAY['%PLATEAU%','%PLACE DE L%','%MOHAMED V%','%DJILY MBAYE%','%PONTY%','%FELIX FAURE%','%CARDINAL%','%THIANDOUM%','%AVENUE PASTEUR%','%RUE VICENS%','%GALANDOU DIOUF%','%BOULEVARD DE LA REPUBLIQUE%','%BLD DE LA LIBERATION%','%RUE DU PORT%','%ABDOU KARIM BOURGI%','%WAGANE DIOUF%'])
    THEN 'plateau'
  WHEN adresse ILIKE ANY (ARRAY['%MEDINA%','%BLAISE DIAGNE%','%ALLEES PAPE%','%MALICK SY%','%GUELE TAPEE%','%GUEULE TAPEE%'])
    THEN 'medina'
  WHEN adresse ILIKE ANY (ARRAY['%HANN%','%BEL AIR%','%BEL-AIR%','%ZONE INDUSTRIELLE%','%PATTE D%OIE%','%GRAND MOULIN%','%DAKAR PETROLE%','%MOLE 4%','%CENTENAIRE%'])
    THEN 'hann'
  WHEN adresse ILIKE ANY (ARRAY['%PARCELLES%','%CAMBERENE%'])
    THEN 'parcelles'
  WHEN adresse ILIKE ANY (ARRAY['%PIKINE%','%GUEDIAWAYE%','%THIAROYE%'])
    THEN 'pikine'
  WHEN adresse ILIKE ANY (ARRAY['%KEUR MASSAR%','%MALIKA%','%MBAO%'])
    THEN 'keur-massar'
  WHEN adresse ILIKE ANY (ARRAY['%RUFISQUE%','%BARGNY%'])
    THEN 'rufisque'
  WHEN adresse ILIKE '%DIAMNIADIO%' OR ville ILIKE '%DIAMNIADIO%'
    THEN 'diamniadio'
  -- Fuera de Dakar: manda la ciudad
  WHEN ville ILIKE '%THIES%'       THEN 'thies'
  WHEN ville ILIKE '%MBOUR%'       THEN 'mbour'
  WHEN ville ILIKE '%DIASS%'       THEN 'diass'
  WHEN ville ILIKE '%TOUBA%'       THEN 'touba'
  WHEN ville ILIKE '%KAOLACK%'     THEN 'kaolack'
  WHEN ville ILIKE '%SAINT%LOUIS%' THEN 'saint-louis'
  WHEN ville ILIKE '%ZIGUINCHOR%'  THEN 'ziguinchor'
  ELSE NULL
END
WHERE quartier_code IS NULL;

COMMIT;
```

- [ ] **Step 2: Aplicarla en local**

Run: `npx supabase migration up`
Expected: aplicada sin error. (En local la tabla `clients` está vacía o con datos de prueba; el resultado real se mide contra producción en el Step 4.)

- [ ] **Step 3: Comprobar el diccionario contra los datos REALES de producción (solo lectura)**

Ejecuta este `SELECT` contra producción (MCP Supabase, `execute_sql` — es una lectura, no modifica nada). Reproduce el mismo `CASE` sobre `clients` y cuenta:

```sql
with z as (
  select nom_client, adresse, ville,
    case
      when adresse ilike any (array['%ALMADIES%','%NGOR%','%ARC EN CIEL%']) then 'almadies'
      when adresse ilike any (array['%OUAKAM%','%OUKAM%','%MAMELLE%','%RENAISSANCE%']) then 'ouakam'
      when adresse ilike any (array['%YOFF%','%AEROPORT%','%FOIRE%']) then 'yoff'
      when adresse ilike any (array['%POINT E%','%FANN%','%AMITIE%','%BIRAGO DIOP%','%BOULEVARD DE L%EST%']) then 'point-e'
      when adresse ilike any (array['%MERMOZ%','%SACRE%','%KEUR GORGUI%','%SOTRAC%','%SICAP%','%BAOBAB%','%SIPRES%','%VDN%']) then 'mermoz'
      when adresse ilike any (array['%LIBERTE%','%HLM%','%GRAND DAKAR%','%FRONT DE TERRE%','%SODIDA%','%DIEUPPEUL%','%CASTORS%']) then 'liberte'
      when adresse ilike any (array['%PLATEAU%','%PLACE DE L%','%MOHAMED V%','%DJILY MBAYE%','%PONTY%','%FELIX FAURE%','%CARDINAL%','%THIANDOUM%','%AVENUE PASTEUR%','%RUE VICENS%','%GALANDOU DIOUF%','%BOULEVARD DE LA REPUBLIQUE%','%BLD DE LA LIBERATION%','%RUE DU PORT%','%ABDOU KARIM BOURGI%','%WAGANE DIOUF%']) then 'plateau'
      when adresse ilike any (array['%MEDINA%','%BLAISE DIAGNE%','%ALLEES PAPE%','%MALICK SY%','%GUELE TAPEE%','%GUEULE TAPEE%']) then 'medina'
      when adresse ilike any (array['%HANN%','%BEL AIR%','%BEL-AIR%','%ZONE INDUSTRIELLE%','%PATTE D%OIE%','%GRAND MOULIN%','%DAKAR PETROLE%','%MOLE 4%','%CENTENAIRE%']) then 'hann'
      when adresse ilike any (array['%PARCELLES%','%CAMBERENE%']) then 'parcelles'
      when adresse ilike any (array['%PIKINE%','%GUEDIAWAYE%','%THIAROYE%']) then 'pikine'
      when adresse ilike any (array['%KEUR MASSAR%','%MALIKA%','%MBAO%']) then 'keur-massar'
      when adresse ilike any (array['%RUFISQUE%','%BARGNY%']) then 'rufisque'
      when adresse ilike '%DIAMNIADIO%' or ville ilike '%DIAMNIADIO%' then 'diamniadio'
      when ville ilike '%THIES%' then 'thies'
      when ville ilike '%MBOUR%' then 'mbour'
      when ville ilike '%DIASS%' then 'diass'
      when ville ilike '%TOUBA%' then 'touba'
      when ville ilike '%KAOLACK%' then 'kaolack'
      when ville ilike '%SAINT%LOUIS%' then 'saint-louis'
      when ville ilike '%ZIGUINCHOR%' then 'ziguinchor'
      else null
    end as code
  from clients where active
)
select coalesce(code,'SIN DEDUCIR') as code, count(*) from z group by 1 order by 2 desc;
```

Expected: como mucho **6 clientes** en `SIN DEDUCIR` (de 68). Si salen más, revisa qué direcciones son y añade sus patrones a la migración **antes** de continuar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911150100_quartiers_backfill.sql
git commit -m "feat(atelier): relleno automático de quartier_code desde adresse

Diccionario verificado contra los 68 clientes activos de prod.
Solo toca filas con quartier_code IS NULL: reejecutable y no pisa correcciones manuales.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Regenerar los tipos de Supabase

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Regenerar contra la base local (ya migrada)**

Run:
```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 2: Verificar que aparecen la tabla y las columnas**

Run: `grep -n "quartiers:" src/lib/supabase/types.ts | head -3 && grep -n "quartier_code" src/lib/supabase/types.ts | head -5`
Expected: aparece `quartiers: {` y varias líneas `quartier_code`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: regenerar tipos de Supabase con quartiers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `src/lib/quartiers.ts` (lógica pura, TDD)

**Files:**
- Create: `src/lib/quartiers.ts`
- Test: `src/lib/quartiers.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { resolveQuartierCode, groupByVille, type Quartier } from './quartiers'

const QUARTIERS: Quartier[] = [
  { code: 'plateau',  label: 'Plateau',  ville: 'Dakar', lat: 14.669, lng: -17.43,  sortOrder: 10 },
  { code: 'almadies', label: 'Almadies', ville: 'Dakar', lat: 14.744, lng: -17.514, sortOrder: 70 },
  { code: 'mbour',    label: 'Mbour',    ville: 'Mbour', lat: 14.42,  lng: -16.96,  sortOrder: 220 },
]

describe('resolveQuartierCode', () => {
  it('usa el quartier de la máquina cuando lo tiene (sede distinta)', () => {
    expect(resolveQuartierCode('almadies', 'plateau')).toBe('almadies')
  })

  it('cae al quartier del cliente cuando la máquina no tiene', () => {
    expect(resolveQuartierCode(null, 'plateau')).toBe('plateau')
  })

  it('devuelve null cuando no hay ninguno', () => {
    expect(resolveQuartierCode(null, null)).toBeNull()
  })

  it('trata undefined igual que null', () => {
    expect(resolveQuartierCode(undefined, undefined)).toBeNull()
    expect(resolveQuartierCode(undefined, 'mbour')).toBe('mbour')
  })
})

describe('groupByVille', () => {
  it('agrupa por ciudad conservando el orden de sortOrder', () => {
    expect(groupByVille(QUARTIERS)).toEqual([
      { ville: 'Dakar', quartiers: [QUARTIERS[0], QUARTIERS[1]] },
      { ville: 'Mbour', quartiers: [QUARTIERS[2]] },
    ])
  })

  it('ordena los quartiers dentro de cada ciudad aunque lleguen desordenados', () => {
    const groups = groupByVille([QUARTIERS[1], QUARTIERS[0]])
    expect(groups[0].quartiers.map((q) => q.code)).toEqual(['plateau', 'almadies'])
  })

  it('con lista vacía devuelve lista vacía', () => {
    expect(groupByVille([])).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -- src/lib/quartiers.test.ts`
Expected: FAIL — `Failed to resolve import "./quartiers"`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Catálogo de barrios (tabla `quartiers`) y resolución de la ubicación de un aviso.
 *
 * La ubicación de una incidencia o de una visita es la de SU MÁQUINA si la máquina tiene
 * quartier propio (sede distinta), y si no la del CLIENTE. Si no hay ninguno, el aviso
 * aparece en el kiosko bajo «Sans quartier» y no se pinta en el mapa.
 */

export type Quartier = {
  code: string
  label: string
  ville: string
  lat: number
  lng: number
  sortOrder: number
}

export type QuartierGroup = {
  ville: string
  quartiers: Quartier[]
}

export function resolveQuartierCode(
  machineQuartierCode: string | null | undefined,
  clientQuartierCode: string | null | undefined
): string | null {
  return machineQuartierCode ?? clientQuartierCode ?? null
}

export function groupByVille(quartiers: Quartier[]): QuartierGroup[] {
  const byVille = new Map<string, Quartier[]>()
  for (const q of [...quartiers].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = byVille.get(q.ville)
    if (list) list.push(q)
    else byVille.set(q.ville, [q])
  }
  return [...byVille.entries()].map(([ville, list]) => ({ ville, quartiers: list }))
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -- src/lib/quartiers.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quartiers.ts src/lib/quartiers.test.ts
git commit -m "feat(atelier): helper de quartiers (resolución máquina>cliente + agrupación por ciudad)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Componente `QuartierSelect`

**Files:**
- Create: `src/components/admin/QuartierSelect.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
'use client'

import { groupByVille, type Quartier } from '@/lib/quartiers'

type Props = {
  quartiers: Quartier[]
  defaultValue?: string | null
  /** Nombre del campo en el FormData. */
  name?: string
  label: string
  hint?: string
}

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function QuartierSelect({
  quartiers,
  defaultValue,
  name = 'quartier_code',
  label,
  hint,
}: Props) {
  const groups = groupByVille(quartiers)

  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-1.5">{label}</label>
      <select name={name} defaultValue={defaultValue ?? ''} className={selectClass}>
        <option value="">— Non défini —</option>
        {groups.map((group) => (
          <optgroup key={group.ville} label={group.ville}>
            {group.quartiers.map((q) => (
              <option key={q.code} value={q.code}>{q.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {hint && <p className="text-xs text-ink-muted mt-1.5">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/QuartierSelect.tsx
git commit -m "feat(admin): desplegable de quartier reutilizable

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Quartier en el formulario de cliente

**Files:**
- Modify: `src/components/admin/ClientForm.tsx`
- Modify: `src/app/admin/clients/new/page.tsx`
- Modify: `src/app/admin/clients/[id]/page.tsx`
- Modify: `src/app/admin/clients/new/actions.ts`
- Modify: `src/app/admin/clients/[id]/actions.ts`

- [ ] **Step 1: Añadir la prop y el campo en `ClientForm.tsx`**

En el bloque de imports, añadir:

```tsx
import QuartierSelect from '@/components/admin/QuartierSelect'
import type { Quartier } from '@/lib/quartiers'
```

En `type ClientData`, añadir tras `ville`:

```tsx
  quartier_code?: string | null
```

En `type Props`, añadir:

```tsx
  quartiers:     Quartier[]
```

En la firma del componente, añadir `quartiers`:

```tsx
export default function ClientForm({ action, defaultValues, title, clientId, deleteAction, quartiers }: Props) {
```

Y justo DESPUÉS del bloque `{/* Row 3: adresse */}` (el `</div>` que cierra el campo `adresse`), insertar:

```tsx
          {/* Row 3-bis: quartier — alimenta el mapa du kiosque Atelier */}
          <QuartierSelect
            quartiers={quartiers}
            defaultValue={defaultValues?.quartier_code}
            label="Quartier"
            hint="Sert à situer les pannes de ce client sur la carte de l'atelier."
          />
```

- [ ] **Step 2: Cargar los quartiers en la página de alta**

`src/app/admin/clients/new/page.tsx` completo:

```tsx
import ClientForm from '@/components/admin/ClientForm'
import { createClient } from '@/lib/supabase/server'
import type { Quartier } from '@/lib/quartiers'
import { createClientAction } from './actions'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order')
    .eq('active', true)
    .order('sort_order')

  const quartiers: Quartier[] = (data ?? []).map((q) => ({
    code: q.code, label: q.label, ville: q.ville, lat: q.lat, lng: q.lng, sortOrder: q.sort_order,
  }))

  return <ClientForm action={createClientAction} title="Nouveau client" quartiers={quartiers} />
}
```

- [ ] **Step 3: Cargar los quartiers en la página de edición**

En `src/app/admin/clients/[id]/page.tsx`, después de obtener `client` y antes del `return`, añadir la misma consulta y pasar la prop:

```tsx
  const { data: quartierRows } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order')
    .eq('active', true)
    .order('sort_order')

  const quartiers: Quartier[] = (quartierRows ?? []).map((q) => ({
    code: q.code, label: q.label, ville: q.ville, lat: q.lat, lng: q.lng, sortOrder: q.sort_order,
  }))
```

…y en el JSX: `<ClientForm ... quartiers={quartiers} />`. Añadir también el import `import type { Quartier } from '@/lib/quartiers'`.

- [ ] **Step 4: Guardar el campo en las dos Server Actions**

En `src/app/admin/clients/new/actions.ts`, tras `const ville = str(formData, 'ville')`:

```ts
  const quartier_code = str(formData, 'quartier_code') || null
```

y en el `insert`, añadir `quartier_code` a las columnas:

```ts
  const { error } = await supabase.from('clients').insert({
    nom_client, ninea, email, telephone, adresse, ville, quartier_code,
    active: formData.get('active') === 'on',
  })
```

En `src/app/admin/clients/[id]/actions.ts`, lo mismo con `update`:

```ts
  const quartier_code = ((formData.get('quartier_code') as string) ?? '').trim() || null
```

```ts
  const { error } = await supabase.from('clients').update({
    nom_client, ninea, email, telephone, adresse, ville, quartier_code,
    active: formData.get('active') === 'on',
  }).eq('id', id)
```

> No se valida como obligatorio: un cliente sin quartier es legítimo (se ve en el filtro «Sans quartier»).

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ambos sin errores.

- [ ] **Step 6: Prueba manual**

Run: `npm run dev` y abre `http://localhost:3000/admin/clients/new`.
Expected: el desplegable **Quartier** aparece justo debajo de Adresse, con los grupos `Dakar`, `Mbour`, `Thiès`… Crear un cliente con quartier y comprobar en la edición que sale seleccionado.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ClientForm.tsx src/app/admin/clients
git commit -m "feat(admin): campo Quartier en la ficha de cliente

Se carga el catálogo desde la tabla quartiers y se guarda en clients.quartier_code.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Quartier opcional en el formulario de máquina

**Files:**
- Modify: `src/components/admin/MachineForm.tsx`
- Modify: `src/app/admin/machines/new/page.tsx`
- Modify: `src/app/admin/machines/[serie]/page.tsx`
- Modify: `src/app/admin/machines/new/actions.ts`
- Modify: `src/app/admin/machines/[serie]/actions.ts`

- [ ] **Step 1: Añadir el campo al formulario**

Mismo patrón que en `ClientForm`: importar `QuartierSelect` y `type Quartier`, añadir `quartier_code?: string | null` a los valores por defecto, `quartiers: Quartier[]` a las props, y colocar el componente **justo después del campo `localisation`**:

```tsx
          <QuartierSelect
            quartiers={quartiers}
            defaultValue={defaultValues?.quartier_code}
            label="Quartier (si différent du client)"
            hint="Laisser vide si la machine est au même endroit que le client."
          />
```

- [ ] **Step 2: Cargar el catálogo en las dos páginas**

`src/app/admin/machines/new/page.tsx` completo:

```tsx
import MachineForm from '@/components/admin/MachineForm'
import { createClient } from '@/lib/supabase/server'
import type { Quartier } from '@/lib/quartiers'
import { createMachineAction } from './actions'

export default async function NewMachinePage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order')
    .eq('active', true)
    .order('sort_order')

  const quartiers: Quartier[] = (data ?? []).map((q) => ({
    code: q.code, label: q.label, ville: q.ville, lat: q.lat, lng: q.lng, sortOrder: q.sort_order,
  }))

  return <MachineForm action={createMachineAction} title="Nouvelle machine" quartiers={quartiers} />
}
```

En `src/app/admin/machines/[serie]/page.tsx`, añadir el import `import type { Quartier } from '@/lib/quartiers'` y, junto a la consulta de la máquina:

```tsx
  const { data: quartierRows } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order')
    .eq('active', true)
    .order('sort_order')

  const quartiers: Quartier[] = (quartierRows ?? []).map((q) => ({
    code: q.code, label: q.label, ville: q.ville, lat: q.lat, lng: q.lng, sortOrder: q.sort_order,
  }))
```

…y pasar `quartiers={quartiers}` al `<MachineForm />`.

- [ ] **Step 3: Guardar el campo en las dos actions**

En `src/app/admin/machines/new/actions.ts`, dentro del `insert`, añadir:

```ts
    quartier_code: str(formData, 'quartier_code') || null,
```

En `src/app/admin/machines/[serie]/actions.ts`, añadir la misma línea al `update`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/MachineForm.tsx src/app/admin/machines
git commit -m "feat(admin): quartier opcional en la ficha de máquina (sedes distintas)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Columna y filtro «Sans quartier» en el listado de clientes

**Files:**
- Modify: `src/app/admin/clients/page.tsx`

- [ ] **Step 1: Traer el quartier en la consulta**

Sustituir el `select` actual por:

```tsx
  let query = supabase
    .from('clients')
    .select('id, nom_client, ninea, ville, active, quartier_code, quartiers(label)')
    .order('nom_client')
    .limit(RESULT_LIMIT)
```

- [ ] **Step 2: Añadir el filtro**

Tras `const activeFilter = ...`, añadir:

```tsx
  const quartierFilter = firstParam(sp.quartier) ?? null
```

Y tras `if (activeFilter !== null) query = query.eq('active', activeFilter)`:

```tsx
  if (quartierFilter === 'none') query = query.is('quartier_code', null)
  else if (quartierFilter) query = query.eq('quartier_code', quartierFilter)
```

Cargar el catálogo para las opciones del desplegable (antes del `return`):

```tsx
  const { data: quartierRows } = await supabase
    .from('quartiers')
    .select('code, label')
    .eq('active', true)
    .order('sort_order')
```

Y añadir el filtro a `SearchFilters`:

```tsx
          {
            param: 'quartier',
            label: 'Tous les quartiers',
            options: [
              { value: 'none', label: 'Sans quartier' },
              ...(quartierRows ?? []).map((q) => ({ value: q.code, label: q.label })),
            ],
          },
```

- [ ] **Step 3: Añadir la columna a la tabla**

En el `<thead>`, tras `<th className={TH}>Ville</th>`:

```tsx
                <th className={TH}>Quartier</th>
```

En el `<tbody>`, tras la celda de `ville`:

```tsx
                  <td className="px-6 py-4 text-sm text-ink-soft">
                    {client.quartiers?.label ?? <span className="text-ink-muted">—</span>}
                  </td>
```

> Si el tipo generado declara `quartiers` como array (PostgREST puede tipar el embed de las dos
> formas según cómo detecte la relación), el typecheck lo dirá: en ese caso usar
> `client.quartiers?.[0]?.label`. No cambies el `select`, solo el acceso.

- [ ] **Step 4: Typecheck + build + prueba manual**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

Con `npm run dev`, abrir `http://localhost:3000/admin/clients?quartier=none`.
Expected: se listan solo los clientes sin quartier; el desplegable muestra «Sans quartier» seleccionado.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/clients/page.tsx
git commit -m "feat(admin): columna Quartier y filtro «Sans quartier» en el listado de clientes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Verificación completa y PR

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck limpio, todos los tests unitarios PASS, build OK.

- [ ] **Step 2: Suite RLS**

Run: `npm run test:rls`
Expected: todos PASS (incluido `quartiers-isolation.test.ts`). Si algún test previo falla por el cambio de tipos, arréglalo antes de seguir.

- [ ] **Step 3: Revisión de código**

Ejecutar `/code-review` sobre la rama y corregir los hallazgos antes de abrir el PR.

- [ ] **Step 4: Abrir el PR**

```bash
git push -u origin feat/atelier-quartiers
gh pr create --title "feat(atelier): ubicación por quartier (entrega 1 del nuevo dashboard)" --body "$(cat <<'EOF'
## Qué hace

Primera de las dos entregas del rediseño del kiosko `/atelier`. Añade la ubicación por barrio que alimentará el mapa:

- Tabla `quartiers` (13 zonas de Dakar + 8 ciudades) con centroide, RLS lectura authenticated / escritura admin.
- `clients.quartier_code` y `machines.quartier_code` (esta última solo para sedes distintas).
- Relleno automático desde `adresse` (verificado contra los 68 clientes activos de prod).
- Desplegable **Quartier** en la ficha de cliente (tras la dirección) y en la de máquina.
- Columna y filtro «Sans quartier» en el listado de clientes.

Diseño: `docs/superpowers/specs/2026-09-11-atelier-dashboard-carte-design.md`

## Verificación

- `npm run typecheck` · `npm test` · `npm run build` ✅
- `npm run test:rls` ✅ (incluye `quartiers-isolation.test.ts`)
- Prueba manual del alta/edición de cliente y del filtro

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Tras el merge — desplegar las migraciones a producción**

```bash
npx supabase db push
```

Expected: aplica `20260911150000_quartiers.sql` y `20260911150100_quartiers_backfill.sql`.

> ⚠️ El MCP de Supabase bloquea `execute_sql` ad-hoc contra producción para escrituras: el despliegue se hace **siempre** con `db push` (lección de la cadena de facturación).

- [ ] **Step 6: Comprobar el resultado real en producción**

```sql
select coalesce(q.label,'SIN QUARTIER') as quartier, count(*)
from clients c left join quartiers q on q.code = c.quartier_code
where c.active group by 1 order by 2 desc;
```

Expected: ≤ 6 clientes sin quartier. Repartirlos a mano desde `/admin/clients?quartier=none`.

---

## Definición de terminado

- Las dos migraciones están en producción.
- Menos de 7 clientes activos sin quartier, y los que quedan son casos de dirección imposible.
- Un admin puede cambiar el quartier de un cliente o de una máquina desde `/admin`.
- `npm run typecheck`, `npm test`, `npm run build` y `npm run test:rls` en verde.
