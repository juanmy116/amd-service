# Rediseño UI/UX de la app SAV — Estilo "Híbrido"

**Fecha:** 2026-05-20
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Autor:** Juan Miguel + Claude

---

## 1. Contexto y objetivo

La aplicación SAV de AMD Service está completa y en producción. Su interfaz funciona bien pero tiene una estética de dashboard genérica (blanco, gris, esquinas redondeadas).

El objetivo es **un refresco estético**: dar a la app un aire moderno y una identidad visual más propia, sin cambiar flujos, navegación funcional ni lógica de negocio.

Este es un rediseño **puramente de presentación**. No es un rediseño de UX ni de arquitectura de información.

---

## 2. Alcance

Se rediseñan las **tres superficies** de la app SAV:

| Superficie | Ruta | Público | Dispositivo |
|---|---|---|---|
| Back-office | `/admin/*` | Equipo AMD | Escritorio |
| Portal cliente | `/portal/*` | Clientes de AMD | Escritorio y móvil |
| PWA técnico | `/tech/*` | Técnicos en campo | Móvil |

También se rediseñan las pantallas compartidas asociadas: `/login` y `/csat/[token]`.

### Fuera de alcance

- La web pública (`/`, `/location`, `/services`, etc.) — no se toca.
- Cambios de flujo, navegación funcional o lógica de negocio.
- Cambio de las familias tipográficas (se mantienen Poppins + Inter).
- Modo claro/oscuro conmutable: el estilo Híbrido es fijo.
- Cambios de contenido o textos.

---

## 3. Dirección visual: estilo "Híbrido"

**Principio rector:** el "marco" de navegación va **oscuro**, el área de contenido va **clara**.

- Da una sensación moderna y premium de inmediato.
- Mantiene la legibilidad del contenido en jornadas largas con tablas y datos.
- Funciona bien en la PWA del técnico bajo luz solar (contenido claro).

Aplicación del principio en cada superficie:

- **Admin:** sidebar oscura + contenido claro.
- **Portal:** barra superior oscura + contenido claro.
- **Técnico:** cabecero oscuro + barra inferior de navegación oscura + contenido claro.

El hilo conductor de las tres zonas: navegación oscura, contenido claro, rojo AMD para la acción principal, mismas tarjetas y misma tipografía. Deben sentirse como un único producto.

---

## 4. Sistema de diseño (tokens)

Todos los valores de estilo se centralizan como tokens en `src/app/globals.css`, usando el sistema de temas de Tailwind v4 (`@theme`). Ningún color de marca, radio o sombra se vuelve a escribir a mano en los componentes.

### 4.1 Color

**Chrome (navegación oscura)**
- `chrome-bg`: `#1A1A1E` — fondo de sidebar / topbar / bottom nav
- `chrome-border`: `rgba(255,255,255,0.07)` — divisores sobre oscuro
- `chrome-text`: `#9A9AA2` — texto/iconos inactivos
- `chrome-text-strong`: `#FFFFFF` — texto activo
- `chrome-hover`: `rgba(255,255,255,0.06)` — hover de ítems

**Superficies (contenido claro)**
- `bg-page`: `#F6F6F7` — fondo de página
- `bg-card`: `#FFFFFF` — tarjetas y paneles
- `border`: `#EAEAEC` — bordes de tarjetas
- `border-subtle`: `#F1F1F2` — divisores internos

**Texto**
- `text-strong`: `#18181B` — principal
- `text`: `#71717A` — secundario
- `text-muted`: `#A1A1AA` — terciario / metadatos

**Acento de marca**
- `accent`: `#BF0D0D` — rojo AMD (acción principal, ítem activo, enlaces)
- `accent-dark`: `#7E0808` — degradados, estados pressed
- `accent-soft`: `#FEF2F2` — fondo suave para iconos y badges

**Estados**
- Éxito: texto `#16A34A`, fondo `#ECFDF3`
- Aviso: texto `#D97706`, fondo `#FEF3C7`
- Peligro/urgente: usa `accent` (`#BF0D0D`), fondo `accent-soft`
- Neutro: texto `#71717A`, fondo `#F4F4F5`

### 4.2 Tipografía

Se mantienen las familias actuales (ya están en la guía de marca AMD):
- **Poppins** (500/600/700) — títulos, cabeceras y cifras grandes (KPIs).
- **Inter** (400/500/600) — texto, datos, tablas, etiquetas.

El salto de modernidad viene de la jerarquía y el espaciado, no de cambiar la fuente.

### 4.3 Radios, sombras, espaciado

- Radios: `sm` 8px (botones, inputs, badges de icono), `md` 10–12px, `lg` 13px (tarjetas/paneles), `full` 999px (pills de estado).
- Sombras: `card` = `0 1px 2px rgba(0,0,0,0.03)` (sutil); `raised` = sombra más marcada para el FAB y el botón rojo primario.
- Espaciado: rejilla base de 4px; padding generoso en tarjetas y secciones para dar aire.

---

## 5. Componentes compartidos

Se crea/consolida un set de componentes UI reutilizables por las tres superficies, en `src/components/ui/`. Hoy cada página reescribe este markup en línea; centralizarlo garantiza consistencia y reduce código.

| Componente | Propósito |
|---|---|
| `Card` / `Panel` | Contenedor blanco con borde y sombra estándar |
| `PanelHeader` | Cabecera de panel con título y enlace opcional ("Voir tout") |
| `Badge` / `StatusPill` | Píldora de estado (urgent, en cours, résolu, assigné…). Variante sólida para "Urgent" (fondo rojo, texto blanco) y variante suave para el resto |
| `Button` | Variantes: primario (rojo), secundario, ghost |
| `KpiCard` | Tarjeta KPI con icono, valor, etiqueta e indicador de tendencia |
| `Avatar` | Iniciales sobre degradado rojo |

Componentes de "chrome" específicos de cada superficie (se refactorizan los existentes):

- **Admin:** `Sidebar` oscura, con secciones agrupadas ("Pilotage", "Service") y footer de usuario.
- **Portal:** `PortalTopBar` oscura.
- **Técnico:** `TechHeader` oscuro, `TechBottomNav` oscura con FAB de escáner rojo.

La iconografía sigue usando `lucide-react`, ya presente en el proyecto.

---

## 6. Plan de implementación por fases

El trabajo se divide en fases verificables de forma independiente. El plan de implementación detallado (siguiente paso) desarrollará cada una.

- **Fase 0 — Fundamentos:** tokens en `globals.css` + componentes compartidos en `src/components/ui/`.
- **Fase 1 — Back-office `/admin`:** sidebar oscura, topbar, y migración de las 10 secciones a tokens + componentes.
- **Fase 2 — Portal cliente `/portal`:** topbar oscura y migración de sus páginas, más `/login` y `/csat`.
- **Fase 3 — PWA técnico `/tech`:** cabecero oscuro, bottom nav oscura, FAB, y migración de sus páginas.

Cada fase termina con: `tsc --noEmit` limpio, `npm run build` correcto y revisión visual de las pantallas afectadas.

---

## 7. Restricciones

- Mantener `#BF0D0D` como color de marca (requisito de `CLAUDE.md`).
- Stack fijo: Next.js 16, Tailwind v4, React 19. Sin librerías de UI nuevas.
- No romper funcionalidad: el rediseño es solo de presentación; la lógica, las Server Actions y las rutas no cambian.
- Accesibilidad: contraste mínimo AA; conservar el anillo de foco para navegación por teclado (ya en `globals.css`).
- Respetar `prefers-reduced-motion` (ya implementado en `globals.css`).
- No tocar la lógica específica de la PWA técnico (escáner QR, flujo automático de incidencias): solo su estilo.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Volumen: muchos archivos con colores y fuentes escritos a mano | Trabajo por fases + componentes compartidos; migración página por página |
| Regresiones visuales al migrar | Revisión visual de cada pantalla al cerrar cada fase |
| Romper comportamiento al refactorizar chrome (sidebar, bottom nav) | No alterar lógica; cambiar solo markup y estilos; verificar con `build` |

---

## 9. Criterios de éxito

- Las tres superficies usan los tokens centralizados; no se introducen colores de marca escritos a mano.
- Aspecto coherente entre admin, portal y técnico — se sienten un mismo producto.
- `tsc --noEmit` limpio y `npm run build` correcto al cerrar cada fase.
- Sin regresiones funcionales.
- Validación visual del usuario para cada superficie.
