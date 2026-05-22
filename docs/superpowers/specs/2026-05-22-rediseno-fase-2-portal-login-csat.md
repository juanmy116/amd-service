# Spec — Fase 2: Rediseño Portal `/portal` + `/login` + `/csat`

**Fecha:** 2026-05-22
**Fase:** 2 del rediseño UI "Híbrido" (ver spec maestro `2026-05-20-rediseno-ui-app-sav-design.md`)
**Alcance:** 10 archivos con markup propio
**Prerequisitos:** Fase 0 ✅ · 1a ✅ · 1b ✅ · 1c ✅ · 1d ✅ · 1e ✅

---

## Objetivo

Migrar el portal cliente, la pantalla de login y la encuesta CSAT a los tokens Tailwind v4 y componentes de la Fase 0. El hilo conductor: la topbar del portal se vuelve oscura (igual que la sidebar de `/admin`). Cambio puramente de presentación.

---

## Archivos modificados (10)

| Archivo | Tipo |
|---|---|
| `src/app/portal/layout.tsx` | Chrome — topbar oscura (cambio principal) |
| `src/app/portal/page.tsx` | Dashboard del portal (stats + tablas) |
| `src/app/portal/verify/page.tsx` | Pantalla de verificación de contrato |
| `src/app/portal/incidents/page.tsx` | Lista de incidentes |
| `src/app/portal/incidents/[id]/page.tsx` | Detalle de incidente |
| `src/app/portal/incidents/new/form.tsx` | Formulario nuevo incidente (Client Component) |
| `src/app/login/page.tsx` | Wrapper de la pantalla de login |
| `src/app/login/login-form.tsx` | Formulario de login/registro (Client Component) |
| `src/app/csat/[token]/page.tsx` | Página CSAT + shell + estados inválidos |
| `src/app/csat/[token]/csat-form.tsx` | Formulario CSAT con estrellas |

No se tocan:
- `src/app/portal/incidents/new/page.tsx` — Server Component sin markup propio (solo pasa props a `NewIncidentForm`)
- Lógica, queries, Server Actions, validaciones: sin cambios
- Google SVG inline en `login-form.tsx`: se mantiene intacto (SVG de tercero, no CSS nuestro)

---

## Patrón común (igual que bloques 1d/1e)

### Fondo de página
```
style={{ backgroundColor: '#F5F5F5' }} / bg-gray-50
→ bg-page  (en className, quitar style si lo hay)
```

### Card contenedor
```
bg-white rounded-2xl border border-gray-200 p-X shadow-sm
bg-white rounded-xl border border-gray-200 overflow-hidden
→ <Card className="pX"> / <Card className="overflow-hidden">  (importar Card)
```

### Título `<h1>`
```
style={{ fontFamily: 'Poppins, sans-serif' }} + text-gray-900
→ font-display text-ink  (quitar style)
```

### Botón primario (fondo rojo)
```
style={{ backgroundColor: '#BF0D0D' }}
→ bg-accent  (en className, quitar style)
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

### Asterisco de campo requerido
```
text-red-500 → text-accent
```

### Banner de error de formulario
```
bg-red-50 border-red-200 text-red-700
→ bg-accent-soft border-accent/20 text-accent
```

### Banner de aviso (amber/warning)
```
bg-amber-50 border border-amber-200 text-amber-800
→ bg-warning-soft border border-warning/30 text-ink
icono amber → text-warning
```

### Banner de éxito (verde)
```
bg-green-50 border border-green-200 text-green-800
→ bg-success-soft border border-success/20 text-ink
icono verde → text-success
```

### Banner de info (azul)
```
bg-blue-50 border border-blue-200 text-blue-800
→ bg-info-soft border border-info/20 text-ink
```

### Link "Annuler" en footer de formulario
```
border-gray-300 text-gray-700 bg-white hover:bg-gray-50
→ border-line text-ink bg-card hover:bg-neutral-soft
```

### Back button
```
border-gray-200 bg-white hover:bg-gray-50, text-gray-600 (icono)
→ border-line bg-card hover:bg-neutral-soft, text-ink-soft
```

### Cabecera de tabla (thead)
```
border-b border-gray-200 bg-gray-50
→ bg-neutral-soft border-b border-line-subtle
th text-gray-500 (font-medium) → text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]
```

### Cuerpo de tabla (tbody)
```
divide-y divide-gray-100 → divide-y divide-line-subtle
hover:bg-gray-50 → hover:bg-neutral-soft transition-colors
td font-medium text-gray-900 → font-medium text-ink
td text-gray-600 / text-gray-500 → text-ink-soft
td text-gray-400 / text-gray-300 → text-ink-muted
```

### Badges de estado/prioridad
Eliminar `STATUS_STYLE` / `PRIORITY_STYLE`. Importar `Badge` + `BadgeVariant`. Usar:

**Estados de incidente:**
- `nouveau` → `<Badge variant="info">Nouveau</Badge>`
- `assigné` → `<Badge variant="violet">Assigné</Badge>`
- `en_cours` → `<Badge variant="warning">En cours</Badge>`
- `résolu` → `<Badge variant="success">Résolu</Badge>`
- `fermé` → `<Badge variant="neutral">Fermé</Badge>`

**Prioridades:**
- `basse` → `<Badge variant="neutral">Basse</Badge>`
- `normale` → `<Badge variant="info">Normale</Badge>`
- `haute` → `<Badge variant="warning">Haute</Badge>`
- `urgente` → `<Badge variant="danger">Urgente</Badge>`

**Tipo máquina (portal dashboard):**
- `color` → `<Badge variant="violet">Couleur</Badge>`
- otros → `<Badge variant="neutral">N&B</Badge>`

---

## portal/layout.tsx — específico (cambio principal)

### Header (topbar oscura)
```
bg-white border-b border-gray-200
→ bg-chrome border-b border-chrome-line
```

### Logo AMD en topbar
```
style={{ backgroundColor: '#BF0D0D' }} → bg-accent  (quitar style)
style={{ fontFamily: 'Poppins, sans-serif' }} → font-display  (quitar style)
```

### Nombre de marca en topbar
```
text-gray-900 style fontFamily Poppins
→ text-chrome-fg-strong font-display
```

### Nav links
```
text-gray-600 hover:bg-gray-100
→ text-chrome-fg hover:bg-chrome-hover
```

### Botón logout en topbar
```
text-gray-400 hover:bg-gray-100 hover:text-gray-600
→ text-chrome-fg hover:bg-chrome-hover
```

---

## portal/page.tsx — específico

### Stats cards — icono wrappers
```
bg-blue-50 + text-blue-600  → bg-info-soft + text-info
bg-amber-50 + text-amber-600 → bg-warning-soft + text-warning
bg-green-50 + text-green-600 → bg-success-soft + text-success
text-gray-500 (label) → text-ink-soft
```

### "Voir tout" link
```
text-gray-500 hover:text-gray-900 → text-ink-soft hover:text-ink
```

### "Voir" / "Signaler" links en empty state
```
style={{ color: '#BF0D0D' }} → text-accent  (quitar style)
text-gray-400 hover:text-gray-700 → text-ink-muted hover:text-ink-soft
```

### numero_incident
```
style={{ color: '#BF0D0D' }} → text-accent  (quitar style)
```

### Empty state icon
```
text-gray-200 → text-ink-muted
```

---

## portal/verify/page.tsx — específico

### Icon container header
```
bg-red-50 → bg-accent-soft
style={{ color: '#BF0D0D' }} → text-accent (en className, quitar style)
```

---

## portal/incidents/[id]/page.tsx — específico

### STATUS_DOT (timeline)
Los dots de colores del timeline son indicadores funcionales del estado del incidente — se mantienen como están (`bg-blue-500`, `bg-purple-500`, `bg-amber-500`, `bg-green-500`, `bg-gray-400`). Son equivalentes semánticos de los badges.

### Separador timeline
```
border-gray-100 → border-line-subtle
```

### Texto timeline
```
text-gray-500 → text-ink-muted
text-gray-800 → text-ink
text-gray-300 (·) → text-ink-muted
text-gray-400 (fecha) → text-ink-muted
text-gray-500 (comment) → text-ink-muted
```

### Section title "Suivi"
```
text-gray-700 → text-ink
```

### Detail field labels
```
text-xs font-medium text-gray-400 → text-xs font-medium text-ink-muted
```

### Detail field values
```
text-gray-700 → text-ink-soft
```

### Badge de status en header
El span inline `inline-flex px-2.5 py-1 rounded-lg text-xs font-medium` + `STATUS_STYLE`
→ `<span className="shrink-0"><Badge variant={...}>...</Badge></span>`

---

## portal/incidents/new/form.tsx — específico

### Opciones de radio (category / priority)
```
border-gray-200 hover:border-gray-300 text-gray-700
→ border-line hover:border-ink-muted text-ink-soft
```
El `className="accent-red-600"` de `<input type="radio">` se mantiene (no hay token Tailwind v4 para `accent-`).

---

## login/login-form.tsx — específico

### Tabs (selector login/registro)
```
bg-gray-100 rounded-lg (wrapper) → bg-neutral-soft rounded-lg
tab activo: bg-white text-gray-900 shadow-sm → bg-card text-ink shadow-sm
tab inactivo: text-gray-500 hover:text-gray-700 → text-ink-muted hover:text-ink-soft
```

### Separador "ou"
```
border-t border-gray-200 → border-t border-line
text-xs text-gray-400 bg-white → text-xs text-ink-muted bg-card
```

### Botón Google OAuth
```
border-gray-300 text-gray-700 bg-white hover:bg-gray-50
→ border-line text-ink bg-card hover:bg-neutral-soft
```

### Helper text bajo registro
```
text-xs text-gray-400 → text-xs text-ink-muted
```

---

## csat/[token]/page.tsx — específico

### CsatShell — nombre de marca
```
text-gray-900 style fontFamily Poppins
→ text-ink font-display  (quitar style)
```

### CsatShell — logo AMD
```
style={{ backgroundColor: '#BF0D0D' }} → bg-accent  (quitar style)
style fontFamily Poppins (letra A) → font-display  (quitar style)
```

### h1 principal
```
text-gray-900 → text-ink
```

### Incident subtitle
```
text-gray-500 → text-ink-muted
text-gray-700 (nombre incidente) → text-ink-soft
```

### InvalidState
```
bg-green-100 (success) → bg-success-soft
bg-gray-100 (error) → bg-neutral-soft
text-green-600 (check icon) → text-success
text-gray-400 (info icon) → text-ink-muted
text-gray-600 (message) → text-ink-soft
```

---

## csat-form.tsx — específico

### Estrellas sin seleccionar
```
text-gray-200 → text-ink-muted
(peer-checked:text-amber-400 y group-hover:text-amber-300 se mantienen — son la interacción visual)
```

### Label "Votre note globale"
```
text-gray-700 → text-ink-soft
```

### Label campo comentario
```
text-gray-700 → text-ink-soft
text-gray-400 (facultatif) → text-ink-muted
```

### Textarea comentario
```
border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-red-200
→ border-line text-ink placeholder-ink-muted focus:ring-accent/30 focus:border-accent
```

### Error
```
text-red-600 → text-accent
```

### Estado éxito
```
bg-green-100 → bg-success-soft
text-green-600 (check icon) → text-success
text-gray-900 (h2) → text-ink
text-gray-500 → text-ink-muted
```

---

## Fuera de alcance

- Lógica, queries, Server Actions, validaciones: sin cambios.
- `portal/incidents/new/page.tsx`: sin markup propio.
- Google SVG icon en `login-form.tsx`: SVG de tercero — no se toca.
- `STATUS_DOT` en `portal/incidents/[id]/page.tsx`: colores funcionales de timeline — se mantienen.
- `accent-red-600` en `<input type="radio">`: no hay token Tailwind v4 para `accent-` — se mantiene.
