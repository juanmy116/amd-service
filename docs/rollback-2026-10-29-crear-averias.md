# Cómo deshacer «técnicos y Atelier crean averías» (2026-10-29)

> Tanda 6 del plan de pulido (`docs/plan-pulido-uso-real-2026-10-23.md`, punto 8) más la burbuja «+»
> del kiosko. Plan: `docs/superpowers/plans/2026-10-29-tecnicos-atelier-crean-averias.md`.

| Qué | Migración |
|---|---|
| Valor `recuperation` en el enum `incident_category`; columna `profiles.can_create_incidents`; el trigger `tg_profiles_protect_privileged` protege también esa columna y `can_bill` | `20261029100000_staff_create_incidents.sql` |

## Orden para deshacerlo

1. **Revertir la app** (el PR de la tanda 6). La app nueva lee `can_create_incidents`; sin la
   columna, la ficha de máquina del técnico y la ficha del miembro del equipo fallan al cargar.
2. **Revertir la base** (SQL de abajo).

La app ANTERIOR funciona con la migración puesta: no lee la columna nueva y no escribe la categoría
nueva.

## Reversión de la base

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push`:

```sql
BEGIN;

-- Las recogidas ya creadas pasan a «autre»: el título conserva «Récupération — …».
UPDATE public.incidents SET category = 'autre' WHERE category = 'recuperation';

CREATE OR REPLACE FUNCTION public.tg_profiles_protect_privileged()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_dispatcher IS DISTINCT FROM OLD.is_dispatcher THEN
      RAISE EXCEPTION 'forbidden: cannot change privileged columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS can_create_incidents;

COMMIT;
```

**El valor `recuperation` del enum se queda.** Postgres no permite quitar un valor de un enum sin
rehacer el tipo entero (y las vistas que dependen de `incidents.category`). Sin filas que lo usen y
sin app que lo escriba, es inofensivo.

**Qué se pierde:** quién tenía el permiso. Antes de revertir, si importa:

```sql
SELECT id, full_name FROM public.profiles WHERE can_create_incidents;
```

## Comprobación tras revertir

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'can_create_incidents';  -- 0 filas
SELECT count(*) FROM public.incidents WHERE category = 'recuperation';    -- 0
```
