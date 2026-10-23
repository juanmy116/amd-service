# Cómo deshacer «las máquinas nunca se borran / hors service» (2026-10-23)

> Tanda 5 del plan de pulido (`docs/plan-pulido-uso-real-2026-10-23.md`, punto 6).

| Qué | Migración |
|---|---|
| Sin `DELETE` de `machines` para `authenticated` (policy `admin_all_machines` partida en SELECT/INSERT/UPDATE); columnas `hors_service_at/_reason/_by`; triggers `trg_guard_machine_hors_service` (no se pone hors service con contrato abierto) y `trg_guard_line_machine_in_service` (una máquina hors service no entra en un contrato) | `20261023180000_machines_hors_service.sql` |

## Orden para deshacerlo

1. **Revertir la app** (el PR de la tanda 5). La app nueva lee y escribe `hors_service_*`; sin las
   columnas, la ficha de la máquina falla al cargar.
2. **Revertir la base** (SQL de abajo).

La app ANTERIOR funciona con la migración puesta: su casilla «Machine active» sigue guardando
`active` (y respeta la regla del contrato abierto). Lo único que deja de funcionar es su botón
«Supprimer», y eso es justo lo que se buscaba.

## Reversión de la base

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push`:

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_line_machine_in_service ON public.contract_machines;
DROP FUNCTION IF EXISTS public.guard_line_machine_in_service();
DROP TRIGGER IF EXISTS trg_guard_machine_hors_service ON public.machines;
DROP FUNCTION IF EXISTS public.guard_machine_hors_service();

ALTER TABLE public.machines
  DROP COLUMN IF EXISTS hors_service_at,
  DROP COLUMN IF EXISTS hors_service_reason,
  DROP COLUMN IF EXISTS hors_service_by;

DROP POLICY IF EXISTS admin_select_machines ON public.machines;
DROP POLICY IF EXISTS admin_insert_machines ON public.machines;
DROP POLICY IF EXISTS admin_update_machines ON public.machines;
CREATE POLICY "admin_all_machines" ON public.machines
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT DELETE ON public.machines TO authenticated;

COMMIT;
```

**Qué se pierde:** el motivo, la fecha y el autor de las bajas hechas. Las máquinas siguen
`active = false`. Antes de revertir, si importa:

```sql
SELECT numero_serie, hors_service_at, hors_service_reason, hors_service_by
FROM public.machines WHERE NOT active;
```

## Comprobación tras revertir

```sql
SELECT polname FROM pg_policy WHERE polrelid = 'public.machines'::regclass;  -- admin_all_machines + las de técnico/cliente
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_guard_%machine%';       -- 0 filas
```
