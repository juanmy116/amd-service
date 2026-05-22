# Spec — Bloque 1e: Rediseño Secundarias `/admin`

**Fecha:** 2026-05-22
**Fase:** 1e del rediseño UI "Híbrido" (ver spec maestro `2026-05-20-rediseno-ui-app-sav-design.md`)
**Alcance:** 6 archivos con markup propio (team list, TeamMemberForm, calendrier, princity, contadores detail, machines QR)
**Prerequisitos:** Fase 0 ✅ · 1a ✅ · 1b ✅ · 1c ✅ · 1d ✅

---

## Objetivo

Migrar las páginas secundarias de `/admin` a los tokens Tailwind v4 y componentes de la Fase 0. Cambio puramente de presentación: no se toca lógica, queries, Server Actions ni validaciones.

---

## Archivos modificados (6)

| Archivo | Tipo |
|---|---|
| `src/app/admin/team/page.tsx` | Lista del equipo (tabla) |
| `src/components/admin/TeamMemberForm.tsx` | Formulario miembro del equipo |
| `src/app/admin/calendrier/page.tsx` | Cabecera + stats del calendario |
| `src/app/admin/princity/page.tsx` | Cards de estado + tabla de logs |
| `src/app/admin/contadores/[serie]/page.tsx` | Detalle de contadores (tabla + cards) |
| `src/app/admin/machines/[serie]/qr/page.tsx` | Etiqueta imprimible QR |

No se tocan:
- `src/app/admin/team/new/page.tsx` — shell que monta TeamMemberForm, sin markup propio
- `src/app/admin/team/[id]/page.tsx` — idem
- Componentes internos (`CalendarView`, `CounterForm`, `CounterChart`, `CancelModal`, `QrCanvas`, `PrintButtons`) — fuera de alcance
- `VISIT_COLOR` / `INCIDENT_COLOR` en `calendrier/page.tsx` — hex values consumidos por FullCalendar (librería externa), no son clases Tailwind; se mantienen

---

## Patrón común (ver bloque 1d para referencia)

### Back button
```
border-gray-200 bg-white hover:bg-gray-50, text-gray-600 (icono)
→ border-line bg-card hover:bg-neutral-soft, text-ink-soft
```

### Título `<h1>`
```
style={{ fontFamily: 'Poppins, sans-serif' }} + text-gray-900
→ font-display text-ink  (quitar el style)
```

### Botón primario (Link o button con fondo rojo)
```
style={{ backgroundColor: '#BF0D0D' }}
→ bg-accent  (en className, quitar style)
```

### Botón "Supprimer" (idle)
```
border-red-200 text-red-600 bg-white hover:bg-red-50
→ border-accent/20 text-accent bg-card hover:bg-accent-soft
```

### Confirmación de borrado
- Texto "Confirmer ?": `text-gray-600` → `text-ink-soft`
- AlertTriangle: `text-red-500` → `text-accent`
- Botón "Oui, supprimer": quitar `style={{ backgroundColor: '#BF0D0D' }}`, añadir `bg-accent`
- Botón "Annuler": `text-gray-600 border-gray-300 hover:bg-gray-50` → `text-ink-soft border-line hover:bg-neutral-soft`

### Card contenedor
```
bg-white rounded-xl border border-gray-200 p-X
→ <Card className="pX">  (importar Card)
```

### Banner / sección de aviso (amber)
```
bg-amber-50 border border-amber-200 rounded-xl
→ bg-warning-soft border border-warning/30 rounded-card
texto amber-800 → text-ink
texto amber-700 → text-ink-soft
```

### Labels de formulario
```
text-gray-700 → text-ink-soft
```

### Inputs
```
border-gray-300 text-gray-900 placeholder-gray-400
focus:ring-red-500 focus:border-transparent
→
border-line text-ink placeholder-ink-muted
focus:ring-accent/30 focus:border-accent
```

### Select
Igual que input + `bg-white` → `bg-card`

### Campo read-only
```
border-gray-200 bg-gray-50 text-gray-600
→ border-line bg-neutral-soft text-ink-soft
```

### Helper text
```
text-xs text-gray-400 → text-xs text-ink-muted
```

### Banner de error de formulario
```
bg-red-50 border-red-200 text-red-700
→ bg-accent-soft border-accent/20 text-accent
```

### Asterisco de campo requerido
```
text-red-500 → text-accent
```

### Link "Annuler" en footer de formulario
```
border-gray-300 text-gray-700 bg-white hover:bg-gray-50
→ border-line text-ink bg-card hover:bg-neutral-soft
```

### Cabecera de tabla (thead)
```
border-b border-gray-200 bg-gray-50  →  bg-neutral-soft border-b border-line-subtle
th text-gray-500  →  th text-ink-muted
```

### Cuerpo de tabla (tbody)
```
divide-y divide-gray-100 → divide-y divide-line-subtle
hover:bg-gray-50 → hover:bg-neutral-soft transition-colors
td font-medium text-gray-900 → font-medium text-ink
td text-gray-600 / text-gray-500 → text-ink-soft
td text-gray-400 / text-gray-300 → text-ink-muted
```

### Panel header de tabla
```
<div className="px-5 py-4 border-b border-gray-100">
  <p className="text-sm font-semibold text-gray-900">Título</p>
</div>
→ <PanelHeader title="Título" />  (importar PanelHeader)
```

### th de tabla con estilo bloque 1d
```
text-xs font-medium text-gray-500
→ text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]
```

---

## team/page.tsx — específico

### ROLE_STYLE → Badge component
Eliminar el mapa `ROLE_STYLE`. Importar `Badge`. Usar:
- `admin` → `<Badge variant="danger">Administrateur</Badge>`
- `technician` → `<Badge variant="info">Technicien</Badge>`
- fallback → `<Badge variant="neutral">{p.role}</Badge>`

Mantener `ROLE_LABEL` para el label, o eliminar y poner el texto directamente en el Badge (simplifica).

### "Modifier" link
```
text-gray-600 hover:text-gray-900 → text-ink-soft hover:text-ink
```

---

## TeamMemberForm.tsx — específico

Mismo patrón completo que los formularios del bloque 1d (ClientForm, MachineForm, etc.).

---

## calendrier/page.tsx — específico

Solo 3 cambios en el JSX (los `VISIT_COLOR`/`INCIDENT_COLOR` no se tocan):

### h1
```
text-gray-900 style={{ fontFamily: 'Poppins, sans-serif' }}
→ text-ink font-display  (quitar style)
```

### Stats en retard
```
text-red-500 → text-accent
```

### Stats incidents abiertos
```
text-orange-500 → text-warning
```

### Subtítulo
```
text-sm text-gray-400 → text-sm text-ink-muted
```

---

## princity/page.tsx — específico

### Section headers `<h2>`
```
text-sm font-semibold text-gray-700 uppercase tracking-wider
→ text-sm font-semibold text-ink uppercase tracking-wider
```

### Health cards
- `bg-white rounded-xl border border-gray-200 p-5` → `<Card className="p-5">`
- Label de función: `text-xs font-medium text-gray-500` → `text-xs font-medium text-ink-muted`
- `CheckCircle2`: `text-green-500` → `text-success`
- `XCircle`: `text-red-500` → `text-accent`
- Texto "Dernière sync": `text-xs text-gray-600` → `text-xs text-ink-soft`
- Error message: `text-xs text-red-600` → `text-xs text-accent`

### Tabla de logs
- Wrapper: `bg-white rounded-xl border border-gray-200 overflow-hidden` → `<Card className="overflow-hidden">`
- `font-mono text-gray-700` → `font-mono text-ink-soft`
- `text-gray-500` (endpoint, fecha) → `text-ink-muted`
- Badges de status: reemplazar `<span className={...}>` por `<Badge>`:
  - `success` → `variant="success"`
  - `partial` → `variant="warning"`
  - `error` (default) → `variant="danger"`
- `text-gray-600` (números) → `text-ink-soft`
- Empty state: `text-gray-400` → `text-ink-muted`

---

## contadores/[serie]/page.tsx — específico

### Info cards
```
bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3
→ <Card className="p-4 flex items-center gap-3">
```
- Íconos `Building2`/`FileText`: `text-gray-400 shrink-0` → `text-ink-muted shrink-0`
- Labels: `text-xs text-gray-400` → `text-xs text-ink-muted`
- Valores: `text-sm font-semibold text-gray-900` → `text-sm font-semibold text-ink`

### Gráfico card
```
bg-white rounded-xl border border-gray-200 p-5
→ <Card className="p-5">
text-sm font-semibold text-gray-900 (título)  → text-sm font-semibold text-ink
```

### Historique tabla
- Wrapper: `bg-white rounded-xl border border-gray-200 overflow-hidden` → `<Card className="overflow-hidden">`
- Panel header inline → `<PanelHeader title="Historique des relevés" />`
- `text-blue-400` (RefreshCw icon) → `text-info`
- Periodo actif: `font-medium text-gray-900` → `font-medium text-ink`
- Periodo annulé: `line-through text-gray-400` → `line-through text-ink-muted`
- Notes: `text-xs text-gray-400` → `text-xs text-ink-muted`
- Razón anulación: `text-xs text-amber-600` → `text-xs text-warning`
- Valores numéricos: `font-mono text-xs text-gray-700` → `font-mono text-xs text-ink-soft`
- Null delta (`—`): `text-gray-300` → `text-ink-muted`
- Delta negativo: `text-red-600 font-semibold` → `text-accent font-semibold`
- Delta normal: `text-gray-700` → `text-ink-soft`
- Badges de status:
  - actif → `<Badge variant="success">Actif</Badge>`
  - annulé → `<Badge variant="neutral">Annulé</Badge>`
- Empty state: `text-gray-400 text-sm` → `text-ink-muted text-sm`
- Fila annulé: `bg-gray-50 opacity-60` → `bg-neutral-soft opacity-60`

### Form card "Nouveau relevé"
```
bg-white rounded-xl border border-gray-200 p-5 sticky top-6
→ <Card className="p-5 sticky top-6">
text-sm font-semibold text-gray-900 (título)  → text-sm font-semibold text-ink
```

---

## machines/[serie]/qr/page.tsx — específico

La etiqueta es un documento de impresión. Se mantiene `style={{ width: 320, fontFamily: 'Helvetica, Arial, sans-serif' }}` (tipografía del documento impreso, no del sistema de diseño). Los estilos funcionales de imagen (`objectFit`, `filter`) también se mantienen.

### Wrapper de la etiqueta
```
className="label bg-white rounded-2xl shadow-lg overflow-hidden"
→ className="label bg-card rounded-card shadow-card overflow-hidden"
```

### Cabecera roja
```
style={{ backgroundColor: '#BF0D0D' }}  →  quitar style, añadir bg-accent a className
```

### Textos de etiqueta
```
text-gray-400 uppercase tracking-wide  →  text-ink-muted uppercase tracking-wide
text-gray-900 (machine name)            →  text-ink
text-gray-800 (serie, type, client data)  →  text-ink
```

### Separador
```
border-t border-gray-100 → border-t border-line-subtle
```

### Sección QR
```
bg-gray-50 mt-2 → bg-neutral-soft mt-2
text-gray-400 (caption) → text-ink-muted
```

### Sin contrato
```
text-gray-400 italic → text-ink-muted italic
```

---

## Fuera de alcance

- Lógica, queries, Server Actions, validaciones: sin cambios.
- `CalendarView`, `CounterForm`, `CounterChart`, `CancelModal`, `QrCanvas`, `PrintButtons`: componentes hijo — bloque futuro.
- `VISIT_COLOR` / `INCIDENT_COLOR`: valores hex para FullCalendar — no son Tailwind, no se migran.
- `tailwind.config.ts` legacy: limpieza aparte.
