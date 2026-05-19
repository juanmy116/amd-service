-- ============================================================================
-- numero_incident: identificador humano por incidencia con formato SAV-YYYY-NNNN
--   - Contador secuencial por año (se resetea cada 1 de enero)
--   - Asignado automáticamente por trigger BEFORE INSERT
--   - Backfill de incidencias existentes ordenadas por created_at
-- ============================================================================

-- 1. Contador por año -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_counters (
  year         int  PRIMARY KEY,
  last_number  int  NOT NULL DEFAULT 0
);

ALTER TABLE public.incident_counters ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo accesible vía service_role / SECURITY DEFINER functions.

-- 2. Función generadora -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_incident_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.next_incident_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_incident_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_incident_number() FROM authenticated;
-- Solo el trigger (que corre como owner del trigger function) la usa.

-- 3. Columna y trigger ------------------------------------------------------
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS numero_incident text;

CREATE OR REPLACE FUNCTION public.set_incident_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_incident IS NULL THEN
    NEW.numero_incident := public.next_incident_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_incident_numero ON public.incidents;
CREATE TRIGGER trg_set_incident_numero
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_incident_numero();

-- 4. Backfill ---------------------------------------------------------------
-- Numerar las incidencias existentes por año + orden cronológico.
WITH numbered AS (
  SELECT id,
         EXTRACT(year FROM created_at)::int AS y,
         row_number() OVER (
           PARTITION BY EXTRACT(year FROM created_at)
           ORDER BY created_at, id
         )::int AS n
  FROM public.incidents
  WHERE numero_incident IS NULL
)
UPDATE public.incidents i
   SET numero_incident = format('SAV-%s-%s', n.y, lpad(n.n::text, 4, '0'))
  FROM numbered n
 WHERE i.id = n.id;

-- Sincronizar el contador para que los próximos INSERT continúen la serie.
INSERT INTO public.incident_counters (year, last_number)
SELECT EXTRACT(year FROM created_at)::int AS y, count(*)::int AS n
  FROM public.incidents
 GROUP BY EXTRACT(year FROM created_at)
ON CONFLICT (year) DO UPDATE
   SET last_number = GREATEST(public.incident_counters.last_number, EXCLUDED.last_number);

-- 5. Constraints finales ----------------------------------------------------
ALTER TABLE public.incidents
  ALTER COLUMN numero_incident SET NOT NULL;

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_numero_incident_key UNIQUE (numero_incident);

-- Índice para búsquedas ILIKE rápidas
CREATE INDEX IF NOT EXISTS incidents_numero_incident_idx
  ON public.incidents (numero_incident);
