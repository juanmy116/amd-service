# Cómo deshacer la primera visita automática de una máquina nueva (2026-10-23)

| Qué | Migración |
|---|---|
| Trigger `trg_schedule_first_visit_for_new_line` en `contract_machines` + función `schedule_first_visit_for_new_line()` | `20261023160000_first_visit_for_new_line.sql` |

Solo base de datos: la app no cambia ni conoce el trigger, así que se puede quitar en cualquier
momento sin tocar Vercel.

## Reversión

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push`:

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_schedule_first_visit_for_new_line ON public.contract_machines;
DROP FUNCTION IF EXISTS public.schedule_first_visit_for_new_line();
COMMIT;
```

**Qué NO deshace:** las visitas que el trigger ya creó se quedan (son visitas normales, `planifié`).
Si hiciera falta quitarlas, son las que nacieron a la vez que su línea:

```sql
-- Revisar antes de borrar nada.
SELECT v.id, v.scheduled_date, cm.machine_id
FROM public.maintenance_visits v
JOIN public.contract_machines cm ON cm.id = v.contract_machine_id
WHERE v.status = 'planifié'
  AND abs(extract(epoch FROM v.created_at - cm.created_at)) < 5;
```

## Comprobación tras revertir

```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_schedule_first_visit_for_new_line';
-- debe dar 0 filas
```
