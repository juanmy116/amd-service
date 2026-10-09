# Cómo deshacer la numeración forzada (2026-10-09)

> Runbook de reversión del arreglo de la numeración SAV (visto en la revisión de F3). Escrito el
> día del despliegue.

## Qué se desplegó

| Qué | Migración |
|---|---|
| `set_incident_numero()`: para cliente, técnico y anónimo el número lo pone siempre el contador · `next_incident_number()`: se salta los números que ya existen | `20261009130000_incident_numero_forced.sql` |

No toca datos ni el contador. La oficina, `service_role` y las sesiones directas a la BD siguen
pudiendo fijar el número a mano.

## Síntoma que haría falta deshacerlo

Las averías nuevas no reciben número o fallan al crearse (portal, QR, oficina o Princity). No
debería pasar: la app nunca envía el número y el contador solo añade una comprobación.

## Reversión

En el **SQL Editor** del dashboard de Supabase (el DDL en producción no va por el MCP), o con una
migración nueva y `supabase db push --linked`. Devuelve las dos funciones a como estaban
(`20260519092101`):

```sql
CREATE OR REPLACE FUNCTION public.next_incident_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(year FROM now())::int;
  v_num  int;
BEGIN
  INSERT INTO public.incident_counters (year, last_number)
       VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
       SET last_number = public.incident_counters.last_number + 1
  RETURNING last_number INTO v_num;

  RETURN format('SAV-%s-%s', v_year, lpad(v_num::text, 4, '0'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_incident_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.numero_incident IS NULL THEN
    NEW.numero_incident := public.next_incident_number();
  END IF;
  RETURN NEW;
END;
$function$;
```

`CREATE OR REPLACE` conserva los permisos: `next_incident_number()` sigue sin poder ejecutarla
`anon` ni `authenticated`.

Si se revierte a mano, la migración `20261009130000` sigue en el historial de `supabase_migrations`:
para que git y la BD no se desalineen, añadir después una migración con el mismo SQL.
