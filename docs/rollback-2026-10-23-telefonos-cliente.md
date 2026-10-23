# Cómo deshacer los teléfonos móvil y fijo del cliente (2026-10-23)

> Runbook de reversión de la tanda 4 del plan de pulido (`docs/plan-pulido-uso-real-2026-10-23.md`).

| Qué | Migración |
|---|---|
| Columna `clients.telephone_fixe` + paso de los fijos (prefijo 33) que estaban en `telephone` | `20261023140000_clients_telephone_fixe.sql` |

## Orden para deshacerlo

1. **Revertir la app** (el PR de los teléfonos). La app nueva lee y escribe `telephone_fixe`; con la
   columna borrada, guardar un cliente fallaría.
2. **Revertir la base** (SQL de abajo).

La app ANTERIOR funciona con la columna puesta (no la conoce), así que el paso 1 se puede hacer solo
y dejar la columna. Lo único que se nota: los clientes cuyo fijo se movió a `telephone_fixe` salen
con el teléfono vacío en el formulario antiguo, que lo exige para guardar. El paso 2 lo devuelve.

## Reversión de la base

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push`:

```sql
BEGIN;

-- Devolver el fijo a `telephone` donde no hay móvil (lo que hizo la migración, al revés).
UPDATE public.clients
SET telephone = telephone_fixe
WHERE telephone IS NULL AND telephone_fixe IS NOT NULL;

ALTER TABLE public.clients DROP COLUMN telephone_fixe;

COMMENT ON COLUMN public.clients.telephone IS NULL;

COMMIT;
```

**Qué se pierde:** el fijo de los clientes que, después del cambio, tengan **los dos** teléfonos
(solo cabe uno en `telephone`; se queda el móvil). Antes de revertir, si importa, sacar la lista:

```sql
SELECT id, nom_client, telephone, telephone_fixe
FROM public.clients
WHERE telephone IS NOT NULL AND telephone_fixe IS NOT NULL;
```

## Comprobación tras revertir

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients' AND column_name LIKE 'telephone%';
-- debe dar solo: telephone
```
