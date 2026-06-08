# Deuda técnica — Divergencia `computeLineConsumption` vs `calcDeltas`

> **Estado:** ✅ RESUELTO (2026-06-08, rama `fix/billing-consumption-divergence`) · **Severidad:** media (riesgo a futuro, no bug actual) · **Detectado:** 2026-06-08 (sesión 33, supervisión cruzada FASE D facturación) · **Módulo:** facturación / contadores

---

## ✅ Resolución (2026-06-08)

Se aplicó la **Opción 1 + 2 + 3** (la red completa). Hallazgo durante la implementación: la "aritmética duplicada" era en realidad solo la resta `final − inicial`; el manejo de **null/negativo diverge a propósito** entre ambas funciones (Contadores muestra negativos, facturación los estima). Por eso lo compartido es solo la resta + guard de null:

1. **Primitiva compartida** `counterDelta(final, initial)` en `src/lib/counters.ts`. La usan `calcDeltas` (Contadores) y `computeLineConsumption` (facturación). La política sobre el resultado se queda en cada caller.
2. **Documentado** como decisión consciente en `docs/architecture.md` (§12 Facturación), con la nota "para una línea sin reemplazo ambos caminos deben dar el mismo número".
3. **Tests** (primera infra de tests del repo): `vitest` + `src/lib/invoicing.test.ts` (7 tests). Cubre la primitiva, la **coincidencia factura↔Contadores** para línea normal, la divergencia intencional de negativos y el fix **H-D7**. Scripts: `npm test` / `npm run test:watch`.
4. **Bonus — H-D7 cerrado:** `closedByReplacementInMonth` ahora exige `end_counter_bw` **y** `end_counter_color` no nulos (antes solo bw).

Verificación: `npm test` (7/7) + `npm run typecheck` + `npm run build` limpios.

---

## El problema

Tras el rediseño de la FASE D (reemplazo de máquina, PR #36), el cálculo del "consumo de copias" vive ahora en **dos funciones independientes**:

- **`calcDeltas`** (`src/lib/counters.ts`) — usada por la **pantalla de Contadores**. Calcula el delta de cada relevé contra el anterior.
- **`computeLineConsumption`** (`src/lib/invoicing.ts`) — usada por la **facturación**. Calcula el consumo de una línea en un mes combinando los relevés normales de `machine_counters` con los `start_counter`/`end_counter` de la línea de contrato (introducidos para el reemplazo).

Antes del rediseño, ambas compartían `calcDeltas` — era una **decisión congelada del proyecto** ("fuente única de verdad", para que la factura cuadre copia a copia con la pantalla de Contadores). El rediseño rompió esa unidad.

Hay que separar dos partes del cálculo:

| Parte | ¿Legítimamente distinta? |
|---|---|
| **Cómo se elige el punto inicial/final** (qué relevé tomar, o `start/end_counter`) | ✅ Sí, *debe* diferir: Contadores muestra historial por máquina; facturación calcula consumo por puesto con reemplazos. No se puede ni se debe unificar. |
| **La aritmética del delta** (final − inicial, manejo de nulos y negativos) | ❌ No — es idéntica, y está **duplicada** en las dos funciones. Aquí está el riesgo. |

**El peligro futuro real:** que alguien toque la aritmética (p. ej. cómo se trata un contador que se resetea, o el redondeo) en una función y no en la otra → factura y pantalla dejan de cuadrar sin que salte ninguna alarma.

**Contexto relevante:** el proyecto **no tiene infraestructura de tests** — solo `typecheck` y `build`, ningún runner (vitest/jest), cero ficheros `.test`. Todo se ha validado con tsc + build + smoke E2E manual. Esto condiciona cuál es la mejor solución.

---

## La solución

### Opciones (dado que no hay tests)

**1. Unificar la primitiva del delta (la de fondo, barata, sin infra).**
Extraer la resta "final − inicial con su manejo de null/negativo" a **una sola función compartida** en `src/lib/counters.ts`, y que tanto `calcDeltas` como `computeLineConsumption` la usen. La selección de puntos sigue siendo distinta (legítimo), pero el cálculo es único → un cambio aritmético afecta a ambas a la vez. **Recomendada.**

**2. Documentar la divergencia de selección como consciente.**
Porque esa parte sí es distinta a propósito.

**3. Montar `vitest` + 1 test de coincidencia (la red completa, pero mete infra nueva).**
Un test que, para una línea **normal**, compruebe que ambos caminos dan el mismo delta. Es lo que protege también la parte de selección. Pero implica configurar el runner por primera vez en el proyecto — es una decisión de alcance. Para un módulo de **facturación (dinero)**, está justificado como primera piedra de una suite, pero no se metería sin visto bueno.

### Recomendación
**Opción 1 + 2 ya** (de fondo y barato), y **valorar la 3** como inversión a futuro. La 1 ataca la causa (duplicación aritmética); la 2 deja claro lo que es divergencia intencional; la 3 es el blindaje completo cuando se quiera dotar al proyecto de tests.

### Instrucción concreta para implementar

> **Divergencia `computeLineConsumption` vs `calcDeltas`:**
> 1. Extrae la aritmética del delta (final − inicial, con manejo de null y de negativos) a una función compartida en `src/lib/counters.ts` y haz que **ambas** la usen. La selección de puntos (relevés vs `start/end_counter`) puede seguir siendo distinta.
> 2. Documenta en `architecture.md`, **como decisión consciente** (no entre paréntesis), que facturación y Contadores comparten la aritmética pero eligen los puntos de forma distinta, con la nota "deben coincidir para líneas sin reemplazo".
> 3. (Opcional, si se aprueba meter test infra) `vitest` + un test que verifique esa coincidencia para una línea normal.

### Verificación (al cerrar)
Revisar que la primitiva quede realmente compartida y que ninguna de las dos funciones conserve su propia copia de la resta.
