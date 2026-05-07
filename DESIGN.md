---
name: AMD Service
description: Soluciones de impresión profesional gestionada para empresas en Senegal
colors:
  page-bg: "#FFFFFF"
  surface: "#F5F5F5"
  raised: "#EFEFEF"
  border: "#E5E7EB"
  crimson: "#BF0D0D"
  crimson-deep: "#9A0A0A"
  text-primary: "#111827"
  text-secondary: "#6B7280"
  text-tertiary: "#9CA3AF"
  text-meta: "#374151"
  text-on-red: "#FFFFFF"
  text-on-red-muted: "rgba(255,255,255,0.85)"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.crimson}"
    textColor: "{colors.text-on-red}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.crimson-deep}"
    textColor: "{colors.text-on-red}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-on-red:
    backgroundColor: "{colors.page-bg}"
    textColor: "{colors.crimson}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    borderColor: "{colors.border}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-ghost-on-red:
    backgroundColor: "transparent"
    textColor: "{colors.text-on-red}"
    borderColor: "rgba(255,255,255,0.4)"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  service-card:
    backgroundColor: "{colors.page-bg}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border}"
    rounded: "{rounded.none}"
    padding: "32px"
  service-card-hover:
    backgroundColor: "#FFF5F5"
    borderColor: "rgba(191,13,13,0.4)"
    rounded: "{rounded.none}"
    padding: "32px"
  input-field:
    backgroundColor: "#F9FAFB"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  input-field-focus:
    backgroundColor: "#F9FAFB"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.crimson}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
---

# Design System: AMD Service

## 1. Overview

**Creative North Star: "El Estándar de Senegal"**

AMD Service lleva más de 10 años siendo el referente técnico de gestión de impresión en Senegal. El sistema de diseño refleja esa autoridad: no intenta impresionar, simplemente demuestra. La arquitectura visual es limpia, estructurada y precisa.

La paleta combina el blanco y el gris claro para el contenido con el rojo crimson como acento dominante en puntos de entrada y salida — hero, stats, CTA. El rojo no decora: lidera. Aparece donde el usuario necesita orientarse y donde la marca debe imponerse con claridad.

Las secciones de contenido alternan entre blanco (`#FFFFFF`) y gris claro (`#F5F5F5`) para crear ritmo visual sin recurrir a sombras. Los bordes son rectos, las esquinas son cuadradas, los márgenes son generosos. El conjunto transmite solidez estructural.

**Key Characteristics:**
- Tema claro con rojo como color de acento estructural (heroes, stats, CTAs)
- Arquitectura cuadrada: cero border-radius en toda la interfaz
- Tipografía bicéfala: Poppins para autoridad, Inter para legibilidad
- Etiquetas de sección con franja roja vertical como firma visual
- Sin sombras: profundidad construida con color de fondo y bordes

## 2. Paleta de Color

### Rojo — El color de la marca

- **AMD Crimson** (`#BF0D0D`): El acento principal. Se usa en heroes, CTAs, stats, iconos de acción, estados activos de navegación y la franja de sección. En secciones hero y CTA puede ocupar el fondo completo.
- **Deep Crimson** (`#9A0A0A`): Variante hover/profundidad. Solo para transiciones de estado.

### Neutros claros — El sistema de contenido

- **Page White** (`#FFFFFF`): Fondo de página base y secciones de contenido principales.
- **Surface Grey** (`#F5F5F5`): Secciones alternas. Crea ritmo visual entre bloques blancos.
- **Raised Grey** (`#EFEFEF`): Estado hover de elementos sobre Surface Grey.
- **Border Grey** (`#E5E7EB`): Separadores, bordes de tarjetas, líneas entre secciones. La única línea del sistema de contenido.
- **Gap Grey** (`#E5E7EB`): Color del `gap-px` en grids de tarjetas — el gap IS el borde.

### Texto

- **Text Primary** (`#111827`): Encabezados, texto de alta jerarquía sobre fondos claros.
- **Text Secondary** (`#6B7280`): Subtítulos, descripciones, cuerpo de tarjeta.
- **Text Tertiary** (`#9CA3AF`): Metadatos, labels, contenido de baja jerarquía.
- **Text Meta** (`#374151`): Texto de apoyo en listas y detalles.
- **Text on Red** (`#FFFFFF`): Todo texto sobre fondos AMD Crimson.
- **Text on Red Muted** (`rgba(255,255,255,0.85)`): Subtítulos y descripciones sobre fondos rojos.

### Reglas de uso del color

**La Regla del Rojo Estructural.** El rojo se usa como fondo en secciones de alto impacto: hero de página, bloques de estadísticas, CTA final. Nunca en secciones de contenido largo (services grid, FAQ, formulario). El contraste entre rojo y blanco/gris define el ritmo de la página.

**La Regla de la Alternancia.** Las secciones de contenido alternan blanco → gris → blanco. Nunca dos rojos seguidos. El rojo siempre está separado de otro rojo por al menos una sección clara.

**La Regla de Dos Sistemas.** Sobre fondos claros: texto oscuro, iconos rojos. Sobre fondos rojos: texto blanco, botón primario en blanco con texto rojo.

## 3. Tipografía

**Display / Headings:** Poppins (fallback: system-ui, sans-serif)
**Body / UI:** Inter (fallback: system-ui, sans-serif)

Poppins aporta peso y presencia institucional en encabezados. Inter garantiza lectura precisa y neutral en el cuerpo. La combinación transmite: "somos expertos que hablan con claridad."

### Jerarquía

- **Display** (Poppins 700, clamp(3rem→3.75rem), line-height 1.1): Solo H1 de página. Un único display por pantalla.
- **Headline** (Poppins 700, clamp(1.875rem→2.25rem), line-height 1.2): H2 de sección.
- **Title** (Poppins 600, 1rem, line-height 1.4): H3 de tarjeta o componente.
- **Body** (Inter 400, 1rem, line-height 1.625): Párrafos. Máximo 72ch de ancho.
- **Body Small** (Inter 400, 0.875rem, line-height 1.5): Descripciones de tarjeta, texto secundario.
- **Label** (Inter 600, 0.75rem, line-height 1, tracking 0.1em, uppercase): Etiquetas de sección. Siempre en AMD Crimson sobre fondos claros, o blanco sobre fondos rojos.

### Reglas tipográficas

**La Regla del Encabezado Único.** Una sola instancia de Display por página.

**La Regla de la Etiqueta.** Toda etiqueta de sección lleva: franja vertical (`4px × 16px`) + texto Label en uppercase. Sobre fondo claro: franja y texto en AMD Crimson. Sobre fondo rojo: franja y texto en blanco semitransparente.

## 4. Elevación

Sin sombras. La profundidad se construye con color de fondo:

- **Fondo página** (`#FFFFFF`): base de contenido
- **Fondo superficie** (`#F5F5F5`): secciones alternas, fondos de tarjetas en contexto gris
- **Fondo elevado** (`#EFEFEF`): estado hover sobre superficie

Los bordes de separación son siempre `1px solid #E5E7EB`. En grids de tarjetas se usa `gap: 1px` con fondo `#E5E7EB` — el gap funciona como borde nativo.

**La Regla Sin Sombras.** `box-shadow` está prohibido. Si un elemento necesita destacar, se eleva mediante color o borde, no mediante efecto visual.

## 5. Estructura de Página

### Patrón de secciones (home como referencia)

```
1. Hero           → ROJO (#BF0D0D) — texto blanco
2. Value bar      → ROJO OSCURO (#9A0A0A) — texto blanco
3. Contenido 1    → GRIS (#F5F5F5)
4. Contenido 2    → BLANCO (#FFFFFF)
5. Stats / Logos  → ROJO (#BF0D0D) — texto blanco
6. Contenido 3    → GRIS (#F5F5F5)
7. Contenido 4    → BLANCO (#FFFFFF)
8. Contenido 5    → GRIS (#F5F5F5)
9. CTA Final      → ROJO (#BF0D0D) — texto blanco
```

### Páginas interiores

```
1. Hero           → ROJO (#BF0D0D)
2. Contenido      → alternar GRIS / BLANCO
3. CTA Final      → ROJO (#BF0D0D)
```

## 6. Componentes

### Botones

- **Primary (sobre fondo claro):** Fondo AMD Crimson, texto blanco. Hover: opacidad 0.8 en 150ms.
- **Primary (sobre fondo rojo):** Fondo blanco, texto AMD Crimson. Hover: opacidad 0.9 en 150ms.
- **Ghost (sobre fondo claro):** Sin fondo, borde `#E5E7EB`, texto `#6B7280`. Hover: borde AMD Crimson, texto `#111827`.
- **Ghost (sobre fondo rojo):** Sin fondo, borde `rgba(255,255,255,0.4)`, texto blanco.
- **Shape:** `border-radius: 0`. Sin excepciones.
- **Transición:** 150ms ease-out.

### Tarjetas de servicio

- Fondo `#FFFFFF`, borde `1px solid #E5E7EB`.
- Hover: fondo `#FFF5F5`, borde `rgba(191,13,13,0.4)`.
- Padding interno `32px`.
- Grid con `gap: 1px` y fondo `#E5E7EB`.

### Inputs / Formularios

- Fondo `#F9FAFB`, borde `#E5E7EB`, texto `#111827`, placeholder `#9CA3AF`.
- Focus: borde AMD Crimson. Sin glow.
- `border-radius: 0`.

### Navigation

- Sticky, fondo `#0B1120` (excepción intencional: el nav mantiene fondo oscuro para contraste con el body claro).
- Links: texto blanco. Activo: texto AMD Crimson + borde inferior 2px crimson.
- Botón CTA: AMD Crimson.

### Footer

- Fondo `#0B1120` (excepción intencional: pie de página oscuro es patrón estándar sobre web clara).
- Texto: `#64748B` en reposo, `#F1F5F9` en hover.

### Section Label (firma visual)

```
[▌] TEXTO EN MAYÚSCULAS
```

- Sobre fondo claro: franja `#BF0D0D` + texto `#BF0D0D`
- Sobre fondo rojo: franja `rgba(255,255,255,0.7)` + texto `rgba(255,255,255,0.75)`
- Siempre precede al Headline de sección.

## 7. Do's and Don'ts

### Do:
- **Do** usar AMD Crimson como fondo completo en heroes, stats y CTAs finales.
- **Do** alternar blanco y gris en secciones de contenido. Nunca dos rojos seguidos.
- **Do** usar botón blanco con texto rojo cuando el CTA está sobre fondo rojo.
- **Do** mantener `border-radius: 0` en absolutamente todos los elementos.
- **Do** usar `gap: 1px` + fondo `#E5E7EB` en grids de tarjetas — el gap es el borde.
- **Do** separar secciones claras con `border-bottom: 1px solid #E5E7EB`.
- **Do** usar `transition-duration: 150ms` para todos los cambios de estado.
- **Do** mantener texto de cuerpo en máximo 72ch de ancho.

### Don't:
- **Don't** usar `box-shadow` en ningún componente.
- **Don't** usar gradientes de ningún tipo.
- **Don't** redondear esquinas. Ni `rounded-sm`, ni `rounded-full`.
- **Don't** poner dos secciones rojas seguidas sin una sección clara entre ellas.
- **Don't** usar texto oscuro sobre fondo rojo. Solo blanco.
- **Don't** usar texto blanco sobre fondo blanco o gris. Solo sobre rojo o navy.
- **Don't** añadir colores fuera de la paleta definida.
- **Don't** aplicar animaciones de entrada elaboradas. Las transiciones son de estado, no de espectáculo.
- **Don't** usar `border-left` mayor de `4px` como acento cromático en tarjetas.
