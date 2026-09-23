# Escaneo de técnicos: cualquier máquina, mantenimientos y sello QR · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el técnico que escanea una máquina desde la app vea su ficha aunque no tenga nada asignado en ella, que pueda abrir y cerrar los mantenimientos que tiene asignados, que un serie inexistente dé un mensaje claro en vez del 404, y que el escáner de la app deje el sello QR (🟢) igual que la etiqueta.

**Architecture:** la ficha `/tech/scan/[serie]` lee la parte **de solo lectura** (máquina, línea, contrato, cliente, plan activo) con `createAdminClient()` después de `requireTechnician()`. Lo que da derecho a **actuar** sigue pasando por RLS con el cliente del usuario: incidencias (solo las suyas) y visitas de mantenimiento (`auth_tech_visit_ids()`: asignadas a él o de sus máquinas). La página de la visita autoriza con el cliente del usuario y solo pinta con el admin. El escáner llama a una Server Action que reutiliza `stampQrScan` antes de navegar. **Sin migraciones, sin cambios de RLS.**

**Tech Stack:** Next.js 16 (Server Components, Server Actions), Supabase (`@/lib/supabase/server`, `@/lib/supabase/admin`), Playwright.

**Decisión del usuario (2026-09-23):** cualquier técnico puede **ver** la ficha de cualquier máquina activa; solo **actúa** sobre lo suyo. La lista `/tech/machines` sigue siendo «mis máquinas».

---

## Diagnóstico (verificado en el código)

1. **404 al escanear.** `src/app/tech/scan/[serie]/page.tsx:37-43` lee la máquina con el cliente del usuario; la policy `tech_machines_select` solo deja ver `auth_tech_assigned_machine_ids()` = máquinas con **incidencias** asignadas al técnico (`supabase/migrations/20260609130000_*`). Cualquier otra ⇒ `null` ⇒ `notFound()`.
2. **Mantenimientos bloqueados.** Esa función no cuenta las visitas de mantenimiento. Un técnico con una visita asignada pero sin avería en la máquina recibe el 404 y **no llega a la visita**. Además el contrato (`tech_contracts_select`) tampoco es visible ⇒ el bloque «Maintenance» exige `contract && openLine` y no aparece. En `/tech/scan/[serie]/maintenance/[visitId]/page.tsx` la visita sí se ve (asignada a él), pero los datos embebidos de máquina/cliente salen `null` por RLS.
3. **El escáner de la app no sella.** `stampQrScan` (`src/lib/scan.server.ts`) solo se llama desde `/m/[serie]`. `src/app/tech/scan/qr-scanner.tsx` navega directo a `/tech/scan/<serie>` ⇒ el técnico que escanea con la app deja sus averías en 🟡. Con la PWA instalada es el único camino real: la cámara del iPhone abre los QR en **Safari**, donde no hay sesión ⇒ `/m` manda a `/signaler`.

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `src/app/tech/scan/[serie]/page.tsx` | Modificar: `requireTechnician`, lecturas de solo lectura con admin, visita pendiente vía RLS, mensaje «introuvable» |
| `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx` | Modificar: autorizar con el cliente del usuario, pintar con admin |
| `src/app/tech/scan/actions.ts` | Crear: `recordQrScanAction` |
| `src/app/tech/scan/qr-scanner.tsx` | Modificar: sellar antes de navegar |
| `src/app/tech/scan/page.tsx` | Modificar: aviso «scannez depuis l'application» |
| `src/lib/scan.server.ts` | Modificar: comentario (dos orígenes del sello) |
| `tests/e2e/fixtures.ts`, `tests/e2e/tech-scan.spec.ts` | Crear/Modificar: E2E |
| `docs/architecture.md` | Modificar |

Rama: `fix/escaneo-tecnicos` (ya creada desde `main`).

---

### Task 1: Ficha de máquina visible para cualquier técnico

**Files:** Modify `src/app/tech/scan/[serie]/page.tsx`

- [ ] **Step 1: Autenticación.** Sustituir el bloque manual `getUser()` + `profiles` (líneas ~27-35) por:

```ts
  // Admin o técnico; cualquier otro rol sale (requireTechnician redirige).
  const { user, supabase } = await requireTechnician()
```

(importar `requireTechnician` de `@/lib/auth`; quitar `createClient` y `redirect` si quedan sin uso).

- [ ] **Step 2: Lecturas de solo lectura con admin.** Mover `const admin = createAdminClient()` arriba, justo después de la autenticación, con este comentario:

```ts
  // Ficha de SOLO LECTURA: cualquier técnico puede ver cualquier máquina activa (decisión
  // 2026-09-23: en campo se topa con máquinas que no son suyas). Por eso máquina, línea,
  // contrato, cliente y plan se leen con service_role tras requireTechnician(). Lo que da
  // derecho a ACTUAR —incidencias y visitas— se sigue leyendo con el cliente del usuario (RLS).
  // createAdminClient() bypassa RLS — server-only, nunca llamar desde un Client Component.
  const admin = createAdminClient()
```

Y cambiar a `admin`: la lectura de `machines` (usar `.maybeSingle()` en vez de `.single()`), `getOpenLineForMachine(admin, numero_serie)`, la de `contracts` y la de `maintenance_plans`. La auto-transición `assigné → en_cours` ya usa `admin` y queda igual. La lista de `incidents` **sigue** con `supabase` (solo las suyas).

- [ ] **Step 3: Máquina inexistente o dada de baja ⇒ mensaje, no 404.** Sustituir `if (!machine || !machine.active) notFound()` por:

```tsx
  if (!machine || !machine.active) {
    return (
      <div className="p-4 space-y-5">
        <div className="flex items-center gap-3 pt-2">
          <Link href="/tech/scan" className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
            <ArrowLeft size={16} className="text-ink-muted" />
          </Link>
          <h1 className="text-base font-semibold text-ink font-display">Fiche machine</h1>
        </div>
        <Card className="p-6 text-center space-y-2">
          <AlertTriangle size={24} className="text-warning mx-auto" />
          <p className="text-sm font-semibold text-ink">Machine introuvable ou retirée du parc</p>
          <p className="font-mono text-xs text-ink-muted break-all">{numero_serie}</p>
          <p className="text-xs text-ink-muted">Vérifiez l&apos;étiquette ou prévenez le bureau.</p>
        </Card>
      </div>
    )
  }
```

(quitar el import de `notFound` si queda sin uso).

- [ ] **Step 4: Visita pendiente: el plan con admin, la visita con RLS.** El bloque de mantenimiento pasa a exigir solo `openLine` y a buscar el plan activo por el contrato de la línea:

```ts
  // El enlace a la visita solo aparece si el técnico puede abrirla: la visita se lee con el
  // cliente del usuario (RLS `auth_tech_visit_ids()`: asignada a él o de sus máquinas).
  let pendingVisit: { id: string; scheduled_date: string; status: string } | null = null
  if (openLine) {
    const { data: plan } = await admin
      .from('maintenance_plans')
      .select('id')
      .eq('contract_id', openLine.contract_id)
      .eq('active', true)
      .maybeSingle()

    if (plan) {
      const { data: visit } = await supabase
        .from('maintenance_visits')
        .select('id, scheduled_date, status')
        .eq('plan_id', plan.id)
        .eq('contract_machine_id', openLine.id)
        .in('status', ['planifié', 'en_retard'])
        .order('scheduled_date')
        .limit(1)
        .maybeSingle()
      pendingVisit = visit ?? null
    }
  }
```

- [ ] **Step 5: Verificar.** `npm run typecheck && npm run build`. Expected: OK.

- [ ] **Step 6: Commit** — `fix(tech): cualquier técnico ve la ficha de cualquier máquina y sus mantenimientos`.

---

### Task 2: Página de la visita — autorizar con RLS, pintar con admin

**Files:** Modify `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx`

- [ ] **Step 1:** Sustituir la consulta única embebida por dos:

```ts
  const { supabase } = await requireTechnician()

  // Autorización: la visita debe ser visible para el técnico por RLS (asignada a él o de sus
  // máquinas). Si no, no existe para él.
  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select('id, scheduled_date, status')
    .eq('id', visitId)
    .maybeSingle()

  if (!visit) notFound()

  // Datos para pintar (máquina, cliente, notas del plan): solo lectura con service_role, porque
  // el técnico puede tener la visita sin tener la máquina ni el contrato visibles por RLS.
  const admin = createAdminClient()
  const { data: detail } = await admin
    .from('maintenance_visits')
    .select(`
      maintenance_plans ( notes ),
      contract_machines (
        machine_id,
        machines ( numero_serie, marque, modele, localisation ),
        contracts ( clients ( nom_client ) )
      )
    `)
    .eq('id', visitId)
    .single()

  const plan    = detail?.maintenance_plans
  const line    = detail?.contract_machines
  const machine = line?.machines
  const client  = line?.contracts?.clients
```

El resto (comprobación `line?.machine_id !== numero_serie` ⇒ `notFound()`, `boundAction`, JSX) no cambia. Importar `requireTechnician` y `createAdminClient`; quitar `createClient` si queda sin uso.

- [ ] **Step 2:** `npm run typecheck`. **Commit** — `fix(tech): la visita de mantenimiento muestra máquina y cliente aunque no sean del técnico`.

---

### Task 3: El escáner de la app deja el sello QR

**Files:** Create `src/app/tech/scan/actions.ts`; Modify `src/app/tech/scan/qr-scanner.tsx`, `src/app/tech/scan/page.tsx`, `src/lib/scan.server.ts` (solo comentario)

- [ ] **Step 1: `src/app/tech/scan/actions.ts`**

```ts
'use server'

import { requireTechnician } from '@/lib/auth'
import { stampQrScan } from '@/lib/scan.server'

// Sello «el técnico tuvo la máquina delante» cuando escanea con la cámara DE LA APP. Es tan
// creíble como `/m/[serie]`: en ambos casos el serie sale de leer la etiqueta física. Nunca
// bloquea (stampQrScan registra y sigue).
export async function recordQrScanAction(numeroSerie: string): Promise<void> {
  const { user } = await requireTechnician()
  await stampQrScan(numeroSerie, user.id)
}
```

Comprobar que `stampQrScan` no lanza ante un fallo de BD (su comentario dice que registra y sigue); si alguna rama puede lanzar, el escáner lo absorbe en el Step 2.

- [ ] **Step 2: `qr-scanner.tsx`** — dentro del callback de lectura, sustituir la navegación por:

```ts
        // Sellar ANTES de navegar: la ficha de la máquina ya no pasa por /m (ver comentario de
        // abajo), así que el sello QR se deja aquí. Un fallo del sello nunca impide abrir la ficha.
        void (async () => {
          try {
            await recordQrScanAction(serie)
          } catch (err) {
            console.error('[scan] sello QR fallido', err)
          }
          router.push(`/tech/scan/${encodeURIComponent(serie)}`)
        })()
```

(importar `recordQrScanAction` de `./actions`; mantener el `releaseAllStreams()` previo y el comentario de «Navegación DIRECTA»).

- [ ] **Step 3: `src/lib/scan.server.ts`** — actualizar el comentario de cabecera: el sello se deja desde **dos** sitios, `/m/[serie]` (etiqueta abierta con la cámara del sistema) y `recordQrScanAction` (escáner de la app); **sigue sin** dejarse al renderizar `/tech/scan/[serie]` (prefetch de `<Link>`).

- [ ] **Step 4: Aviso en `src/app/tech/scan/page.tsx`** — bajo «Pointez la caméra…», añadir:

```tsx
        <p className="text-xs text-ink-muted mb-4">
          Scannez toujours depuis l&apos;application AMD SAV, pas avec l&apos;appareil photo du téléphone.
        </p>
```

(quitar el `mb-4` del párrafo anterior y dejar `mb-1`, para que los dos textos vayan juntos).

- [ ] **Step 5:** `npm run typecheck && npm test`. **Commit** — `fix(tech): el escáner de la app deja el sello QR`.

---

### Task 4: E2E y documentación

**Files:** `tests/e2e/fixtures.ts`, `tests/e2e/tech-scan.spec.ts` (nuevo), `docs/architecture.md`

- [ ] **Step 1: Seed.** En `fixtures.ts`, añadir a la siembra (mismo contrato `TEST-E2E-C1`) una segunda máquina **sin incidencias**: `TEST-SN-E2E-LIBRE` con su línea `contract_machines`, un `maintenance_plans` activo para el contrato y una `maintenance_visits` `planifié` en esa línea **asignada al técnico E2E**. Exportar el serie en `E2E`. Comprobar que `cleanup()` borra estas filas (prefijo `TEST`) en el orden correcto de FKs; ampliarlo si no. Mirar `supabase/migrations/20260511145143_maintenance_system.sql` para las columnas obligatorias de plan y visita.

- [ ] **Step 2: `tests/e2e/tech-scan.spec.ts`**, logueado como técnico (`loginAs(page, E2E.techEmail)`, patrón de `login.spec.ts`):
  1. `/tech/scan/TEST-SN-E2E-LIBRE` (sin incidencias del técnico) ⇒ se ve «Fiche machine», el serie y el nombre del cliente del seed; **no** 404.
  2. Misma página ⇒ se ve «Maintenance planifiée»; al pulsarlo, la página de la visita muestra la máquina (`TEST E2E`) y el cliente.
  3. `/tech/scan/NO-EXISTE-E2E` ⇒ «Machine introuvable ou retirée du parc».

- [ ] **Step 3:** `npx playwright test --list tests/e2e/tech-scan.spec.ts` (el E2E completo necesita Docker; si no hay, lo corre `e2e.yml`).

- [ ] **Step 4: `docs/architecture.md`** — en la sección del técnico / escaneo y en §Verrou de résolution (sello QR): ficha de solo lectura para cualquier técnico (admin tras `requireTechnician`), actuar sigue por RLS, mensaje «introuvable», y los dos orígenes del sello (`/m` y `recordQrScanAction`), con la razón (la cámara del iPhone abre Safari, no la PWA).

- [ ] **Step 5:** `npm run typecheck && npm test && npm run build`. **Commit** — `test(tech): E2E del escaneo de máquinas ajenas y mantenimientos + docs`.
