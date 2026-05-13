# PWA Técnico — Rediseño Visual e Interactivo

## Objetivo

Mejorar la experiencia del técnico de campo en el PWA `/tech` aplicando el diseño de referencia Stitch en tres áreas: home page (stats bento + widget próxima intervención), página de incidents (filtros + tarjetas con borde de prioridad), y navegación móvil (scanner como FAB, Machines en nav).

## Arquitectura

El PWA sigue siendo Server Components para el fetch de datos. Se introduce un único Client Component (`TechIncidentList`) para los chips de filtro reactivos en la página de incidents, evitando recarga de página. El FAB del scanner se añade en `layout.tsx` para que sea persistente en todas las páginas del PWA.

**Stack:** Next.js App Router · TypeScript · Tailwind CSS v4 · Supabase SSR · lucide-react

---

## Archivos modificados

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Modificar | `src/app/tech/page.tsx` | Home: stats bento 2×2 + Prochaine intervention + FAB scanner |
| Modificar | `src/app/tech/incidents/page.tsx` | Fetch incidents con join clients, pasa datos a TechIncidentList |
| Modificar | `src/app/tech/layout.tsx` | Añade FAB scanner persistente en móvil |
| Modificar | `src/app/tech/tech-nav.tsx` | 4 items: Accueil, Incidents, Machines, Planning |
| Crear | `src/components/tech/TechIncidentList.tsx` | Client Component: chips de filtro + tarjetas con borde de prioridad |

`tech-desktop-sidebar.tsx` — sin cambios (ya tiene los 4 ítems correctos).

---

## Área 1: Home page (`tech/page.tsx`)

### Data

Una sola query ampliada (reemplaza las dos queries actuales de incidents):

```typescript
const now = new Date()
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

const { data: incidents } = await supabase
  .from('incidents')
  .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
  .eq('assigned_to', user.id)
  .order('created_at', { ascending: false })
```

Stats calculados en JS:

| Stat | Cálculo |
|---|---|
| `openCount` | `status` not in `['résolu','fermé']` |
| `urgentCount` | `priority === 'urgente'` AND `status` not in `['résolu','fermé']` |
| `resolvedMonthCount` | `status` in `['résolu','fermé']` AND `created_at >= startOfMonth.toISOString()` |
| `totalCount` | `incidents.length` |

"Prochaine intervention" — primer incident activo ordenado por peso de prioridad:

```typescript
const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, haute: 1, normale: 2, basse: 3,
}
const nextIntervention = incidents
  ?.filter(i => !['résolu', 'fermé'].includes(i.status))
  .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4))[0]
  ?? null
```

### Componentes visuales

**Stats grid (2×2 bento) — siempre visible (móvil y desktop):**

```
┌──────────────────┬──────────────────┐
│  🕐  En cours    │  ⚠️  Urgents     │
│       5          │       2          │  ← card 2: bg rojo tenue
├──────────────────┼──────────────────┤
│  ✅  Résolus/mois│  📋  Total       │
│       12         │       19         │
└──────────────────┴──────────────────┘
```

Cada stat card: `bg-white rounded-xl border border-gray-200 p-4` con icono en contenedor de color.  
Card "Urgents": `bg-red-50 border-red-100` si `urgentCount > 0`, normal en caso contrario.

**Widget "Prochaine intervention":**

```
┌──────────────────────────────────────────┐
│ Prochaine intervention                   │
│ ───────────────────────────────────────  │
│ 🏢  Cabinet Médical Lumière              │
│     Ricoh IM C3000                       │
│     [URGENTE]                        →   │
└──────────────────────────────────────────┘
```

- Si `nextIntervention === null`: no renderiza la sección.
- Título: `inc.title`
- Cliente: `inc.clients?.nom_client ?? '—'`
- Badge de prioridad: mismo sistema de colores que las tarjetas de incidents.
- Botón flecha → `href="/tech/incidents/${nextIntervention.id}"`

**Incidents activos (lista):** se mantiene igual que ahora (mobile cards / desktop table), sin cambios visuales en esta área.

---

## Área 2: Página de incidents (`tech/incidents/page.tsx` + `TechIncidentList.tsx`)

### Data

Ampliar la query actual para incluir el cliente:

```typescript
const { data: incidents } = await supabase
  .from('incidents')
  .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
  .eq('assigned_to', user.id)
  .order('created_at', { ascending: false })
```

El tipo resultante (cast con `as unknown as`):

```typescript
type TechIncident = {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}
```

`page.tsx` pasa `incidents` a `<TechIncidentList incidents={incidents} />`.

### TechIncidentList (Client Component)

**Chips de filtro (horizontal scroll):**

```
[Tous (12)]  [Urgents (3)]  [Aujourd'hui (2)]
```

- Estado local `filter: 'all' | 'urgent' | 'today'`.
- Conteos calculados una vez del prop `incidents`.
- Filtrado:
  - `all` → todos
  - `urgent` → `priority === 'urgente'`
  - `today` → `created_at` es de hoy (comparar fecha local)

**Tarjetas de incident:**

```
┌──────────────────────────────────────────┐
▌  Cabinet Médical Lumière     [EN COURS]  │
│  Ricoh IM C3000 · Bourrage              │
│  #INC-2409-104 · URGENTE · 13 mai   →  │
└──────────────────────────────────────────┘
```

- `rounded-xl border border-gray-200 bg-white overflow-hidden relative`
- Borde izquierdo: `absolute left-0 top-0 bottom-0 w-1` coloreado por prioridad:
  - `urgente` → `#BF0D0D`
  - `haute` → `#F97316`
  - `normale` → `#3B82F6`
  - `basse` → `#9CA3AF`
- Padding izquierdo extra para compensar el borde: `pl-5`
- Estado vacío si la lista filtrada está vacía: mensaje centrado.

---

## Área 3: Navegación móvil (`tech-nav.tsx` + `layout.tsx`)

### tech-nav.tsx — 4 ítems

Reemplazar la constante `NAV`:

```typescript
const NAV = [
  { href: '/tech',           label: 'Accueil',   icon: LayoutDashboard, exact: true },
  { href: '/tech/incidents', label: 'Incidents',  icon: AlertCircle },
  { href: '/tech/machines',  label: 'Machines',   icon: Printer },
  { href: '/tech/planning',  label: 'Planning',   icon: CalendarDays },
]
```

Se elimina la entrada de Scanner del nav. Se añade `Printer` de lucide-react.

### layout.tsx — FAB Scanner

Añadir el FAB entre `<main>` y `<TechNav />`, visible solo en móvil (`lg:hidden`):

```tsx
{/* FAB Scanner — móvil */}
<div className="lg:hidden fixed bottom-16 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
  <Link
    href="/tech/scan"
    className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full shadow-lg text-white text-sm font-semibold"
    style={{ backgroundColor: '#BF0D0D' }}
  >
    <QrCode size={20} />
    Scanner une machine
  </Link>
</div>
```

El FAB se posiciona `bottom-16` (justo encima de la nav de 64px). Al ser parte del layout, es persistente en todas las páginas del PWA móvil.

---

## Comportamiento en desktop

- Stats bento: visible (mismo grid 2×2).
- "Prochaine intervention": visible.
- FAB scanner: oculto (`lg:hidden`) — el sidebar ya tiene acceso a scan.
- TechIncidentList: los chips de filtro funcionan igual en desktop.
- Nav móvil: oculta en desktop (`lg:hidden`).

---

## Restricciones

- No tocar ningún archivo fuera de `/tech` ni componentes del admin.
- No tocar el sitio web público.
- No añadir dependencias nuevas.
- Mantener los `rounded-*` y `shadow-*` del SAV app (sin respetar el reset de border-radius del Stitch).
- Todos los colores de marca vía `style={{ color/backgroundColor: '#BF0D0D' }}` o clases Tailwind estándar.
