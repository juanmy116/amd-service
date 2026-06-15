import { expect } from 'vitest'

// Aserciones de vitest para los tests RLS. VIVEN APARTE de helpers.ts a propósito:
// helpers.ts lo reutilizan también los tests E2E de Playwright (vía tests/e2e/
// fixtures.ts), que NO corren bajo vitest — si helpers.ts importara `vitest`,
// Playwright reventaría con "Vitest cannot be imported in a CommonJS module".

// Aserción para "este rol autenticado NO ve la fila": el resultado debe ser un set
// VACÍO devuelto por RLS, NO un error de consulta. Sin el chequeo de `error`, una
// consulta rota (columna/tabla mal escrita, permiso denegado) devuelve data=null →
// length 0 → el test "no ve nada" pasaría por el motivo equivocado (falso verde).
// NO usar para el cliente anónimo: anon puede recibir permission-denied legítimo
// (no tiene GRANT en varias tablas), y ahí 0 filas por error sí es lo esperado.
export function expectEmpty(res: { data: unknown[] | null; error: unknown }): void {
  expect(res.error).toBeNull()
  expect(res.data ?? []).toHaveLength(0)
}
