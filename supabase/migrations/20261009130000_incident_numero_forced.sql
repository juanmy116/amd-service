-- Numeración SAV: el cliente (o el técnico) no elige el número, y un número ocupado no bloquea
-- las altas. Visto en la revisión de F3 (2026-10-09).
--
-- `set_incident_numero` respetaba el `numero_incident` que enviase quien inserta. Un cliente del
-- portal podía crear su avería con el número que tocaba al contador (p. ej. `SAV-2026-0004`):
-- la siguiente alta legítima recibía ese mismo número, chocaba con el UNIQUE y, como el contador
-- vuelve atrás con la transacción fallida, todas las siguientes también. Nadie (portal, QR,
-- oficina, Princity) podía crear averías hasta arreglarlo a mano.
--
-- Dos cambios:
--   1. Para las sesiones que no son de confianza (cliente, técnico, anónimo) el número lo pone
--      siempre el contador, envíen lo que envíen. La app nunca lo envía. Siguen pudiendo fijarlo
--      la oficina, service_role y las sesiones directas a la BD (tests, scripts, migraciones).
--   2. El contador se salta los números que ya existan, así que un número ocupado por cualquier
--      vía ya no deja la numeración atascada.
--
-- Deshacer: docs/rollback-2026-10-09-numero-incident.md

CREATE OR REPLACE FUNCTION public.next_incident_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year   int := EXTRACT(year FROM now())::int;
  v_num    int;
  v_numero text;
BEGIN
  LOOP
    INSERT INTO public.incident_counters (year, last_number)
         VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE
         SET last_number = public.incident_counters.last_number + 1
    RETURNING last_number INTO v_num;

    v_numero := format('SAV-%s-%s', v_year, lpad(v_num::text, 4, '0'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.incidents WHERE numero_incident = v_numero);
  END LOOP;

  RETURN v_numero;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_incident_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.numero_incident IS NULL
     OR NOT (auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin()) THEN
    NEW.numero_incident := public.next_incident_number();
  END IF;
  RETURN NEW;
END;
$function$;
