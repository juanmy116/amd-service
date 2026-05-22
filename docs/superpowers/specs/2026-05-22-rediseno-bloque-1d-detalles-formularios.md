# Spec — Bloque 1d: Rediseño Detalles y Formularios `/admin`

**Fecha:** 2026-05-22
**Fase:** 1d del rediseño UI "Híbrido" (ver spec maestro `2026-05-20-rediseno-ui-app-sav-design.md`)
**Alcance:** 5 componentes `*Form` + 2 páginas de detalle con markup inline
**Prerequisitos:** Fase 0 ✅ · 1a ✅ · 1b ✅ · 1c ✅

---

## Objetivo

Migrar los formularios y páginas de detalle de `/admin` a los tokens Tailwind v4 y componentes de la Fase 0. Cambio puramente de presentación: no se toca lógica, queries, Server Actions ni validaciones.

---

## Archivos modificados (7)

| Archivo | Tipo |
|---|---|
| `src/components/admin/ClientForm.tsx` | Formulario |
| `src/components/admin/MachineForm.tsx` | Formulario |
| `src/components/admin/ContractForm.tsx` | Formulario |
| `src/components/admin/NewMaintenancePlanForm.tsx` | Formulario |
| `src/components/admin/IncidentForm.tsx` | Formulario (más complejo) |
| `src/app/admin/incidents/[id]/page.tsx` | Detalle con paneles inline |
| `src/app/admin/maintenance/[id]/page.tsx` | Detalle con tabla y tarjetas |

Las páginas shell puras (`clients/[id]`, `clients/new`, `contracts/[id]`, etc.) solo montan un componente form y no tienen markup propio — no se tocan.

---

## Patrón común de migración (todos los formularios)

### Back button
```
border-gray-200 bg-white hover:bg-gray-50, text-gray-600
→ border-line bg-card hover:bg-neutral-soft, text-ink-soft
```

### Título `<h1>`
```
style={{ fontFamily: 'Poppins, sans-serif' }} + text-gray-900
→ font-display text-ink  (quitar el style)
```

### Botón "Supprimer" (estado idle)
```
border-red-200 text-red-600 bg-white hover:bg-red-50
→ border-accent/20 text-accent bg-card hover:bg-accent-soft
```

### Confirmación de borrado
- Texto "Confirmer ?": `text-gray-600` → `text-ink-soft`
- Botón "Oui, supprimer": quitar `style={{ backgroundColor: '#BF0D0D' }}`, añadir `bg-accent` a className
- Botón "Annuler": `text-gray-600 border-gray-300 hover:bg-gray-50` → `text-ink-soft border-line hover:bg-neutral-soft`

### Contenedor del formulario
```
bg-white rounded-xl border border-gray-200 p-6 space-y-5
→ <Card className="p-6 space-y-5">...</Card>  (importar Card)
```

### Banner de error
```
bg-red-50 border-red-200 text-red-700
→ bg-accent-soft border-accent/20 text-accent
```

### Labels
```
text-gray-700  → text-ink-soft
```

### Inputs y textareas
```
border-gray-300 text-gray-900 placeholder-gray-400
focus:ring-red-500 focus:border-transparent
→
border-line text-ink placeholder-ink-muted
focus:ring-accent/30 focus:border-accent
```

### Selects
Igual que inputs + `bg-white` → `bg-card`

### Campo de solo lectura (isEdit en ContractForm y MachineForm)
```
border-gray-200 bg-gray-50 text-gray-600
→ border-line bg-neutral-soft text-ink-soft
```

### Texto de aviso amarillo
```
text-amber-600  → text-warning
```

### Botón submit (con spinner)
```
style={{ backgroundColor: '#BF0D0D' }}  →  bg-accent  (en className, quitar style)
```

### Link "Annuler" en footer
```
border-gray-300 text-gray-700 bg-white hover:bg-gray-50
→ border-line text-ink bg-card hover:bg-neutral-soft
```

### Checkbox
```
accent-red-600  → accent-accent
```

---

## IncidentForm — específico

### Panel de contexto (isEdit)
```
bg-gray-50 rounded-lg border border-gray-200
→ bg-neutral-soft rounded-lg border border-line
text-xs font-medium text-gray-500  → text-xs font-medium text-ink-muted
text-sm text-gray-700  → text-sm text-ink-soft
```

### Texto de ayuda en label
```
text-xs font-normal text-gray-400  → text-xs font-normal text-ink-muted
```

---

## incidents/[id]/page.tsx — paneles inline

Añadir imports: `import { Card } from '@/components/ui/Card'` y `import { Badge } from '@/components/ui/Badge'`

### Paneles Contact, Rapport, Historique
```
bg-white rounded-xl border border-gray-200 p-6
→ <Card className="p-6">...</Card>
```

### Cabeceras de sección
```
text-sm font-semibold text-gray-700  → text-sm font-semibold text-ink
```

### Badge "Public" (inline span)
```
inline-flex ... bg-amber-100 text-amber-700
→ <Badge variant="warning">Public</Badge>
```

### Etiquetas en Contact
```
text-gray-500 w-24 shrink-0  → text-ink-muted w-24 shrink-0
```

### Valores en Contact
```
text-gray-900 font-medium  → text-ink font-medium
text-gray-900 hover:underline  → text-ink hover:underline
```

### Separador en Rapport
```
border-t border-gray-100  → border-t border-line-subtle
```

### Texto Rapport
```
text-sm text-gray-600 whitespace-pre-wrap  → text-sm text-ink-soft whitespace-pre-wrap
text-xs font-medium text-gray-500  → text-xs font-medium text-ink-muted
```

### Historique — timeline
```
border-b border-gray-100  → border-b border-line-subtle
text-xs text-gray-500  → text-xs text-ink-muted
text-xs font-medium text-gray-800  → text-xs font-medium text-ink
text-xs text-gray-400  → text-xs text-ink-muted
text-xs text-gray-300 (separadores ·)  → text-xs text-ink-muted
text-xs text-gray-500 italic (comment)  → text-xs text-ink-muted italic
```

---

## maintenance/[id]/page.tsx — detalle con tabla

Añadir imports: `import { Card } from '@/components/ui/Card'`, `import { PanelHeader } from '@/components/ui/PanelHeader'`, `import { Badge } from '@/components/ui/Badge'`
Eliminar imports sin uso: `CheckCircle2`, `Clock`, `AlertTriangle`
`Wrench` se mantiene (se usa en el panel de notas).

### Back button + header
- Back button: tokens del patrón común
- `<h1>` + `style={{ fontFamily: 'Poppins' }}`: quitar style, añadir `font-display text-ink`
- Subtítulo: `text-xs text-gray-400` → `text-xs text-ink-muted`

### Info cards (grid 3 columnas)
```
bg-white rounded-xl border border-gray-200 p-4
→ <Card className="p-4">...</Card>
text-xs text-gray-400 mb-1  → text-xs text-ink-muted mb-1
text-sm font-semibold text-gray-900  → text-sm font-semibold text-ink
text-sm font-semibold text-green-700  → text-sm font-semibold text-success
```

### Panel de notas
```
bg-amber-50 border border-amber-200 rounded-xl p-4
→ bg-warning-soft border border-warning/30 rounded-card p-4
text-amber-600  → text-warning
text-sm text-amber-800  → text-sm text-ink
```

### Tabla de visitas
- Wrapper: `bg-white rounded-xl border border-gray-200 overflow-hidden` → `<Card className="overflow-hidden">...</Card>`
- Cabecera de panel: `<div className="px-5 py-4 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Historique des visites</p></div>` → `<PanelHeader title="Historique des visites" />`
- `<thead>` row: `border-b border-gray-100 bg-gray-50` → `bg-neutral-soft border-b border-line-subtle`
- `<th>` classes: `text-left px-5 py-3 text-xs font-medium text-gray-500` → `text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]`
- `<tbody>`: `divide-y divide-gray-50` → `divide-y divide-line-subtle`
- Filas: `hover:bg-gray-50` → `hover:bg-neutral-soft transition-colors`
- `<td>` texto: `font-medium text-gray-900` → `font-medium text-ink`; `text-gray-500` → `text-ink-soft`; `text-gray-300` → `text-ink-muted`
- Badges de estado: reemplazar los `<span>` de `STATUS_CFG` por `<Badge>`:
  - `fait` → `variant="success"`, `en_retard` → `variant="danger"`, `planifié` → `variant="info"`
- QR verificado: `text-xs text-green-600 font-medium` → `text-xs text-success font-medium`
- Empty state: `text-gray-400` → `text-ink-muted`

---

## Fuera de alcance

- Lógica, queries, Server Actions, validaciones: sin cambios.
- Páginas shell que solo montan un Form component: no se tocan.
- `team/*`, `calendrier`, `princity`, `contadores/[serie]`, `qr`: bloque 1e.
- `tailwind.config.ts` legacy: limpieza aparte.
