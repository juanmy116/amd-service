-- Fase 3 de la PWA de técnicos: geolocalización (2026-09-25).
-- 1) Ubicación exacta de cada máquina (primer escaneo con buena precisión, o el admin).
-- 2) Dónde estaba el técnico al resolver una avería / cerrar un mantenimiento (tabla aparte
--    `field_presence`, solo la lee el admin: el cliente del portal no la ve), y el veredicto
--    calculado en el servidor contra la ubicación de la máquina (🟢 near ≤ 200 m con GPS
--    ≤ 150 m / 🟡 far = lejos incluso restando los márgenes de error del técnico y de la
--    máquina / 🟡 imprecise = el GPS no permite decir ni una cosa ni otra / 🟡 no_position = no dio permiso o sin GPS /
--    ⚪ no_machine_position = la máquina aún no tiene ubicación). Nunca bloquea nada.
-- 3) close_maintenance_visit deja de poner qr_verified = true a ciegas: el sello lo pone el
--    escaneo real (stampQrScan), igual que en las averías.

BEGIN;

ALTER TABLE public.machines
  ADD COLUMN lat                 double precision,
  ADD COLUMN lng                 double precision,
  ADD COLUMN location_accuracy_m real,
  ADD COLUMN location_source     text CHECK (location_source IN ('first_scan', 'admin')),
  ADD COLUMN location_set_at     timestamptz,
  ADD COLUMN location_set_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Los IS NOT NULL explícitos hacen falta: con lng NULL, `lng BETWEEN …` da NULL y un CHECK
  -- que evalúa a NULL se da por cumplido (dejaría pasar lat sin lng).
  ADD CONSTRAINT machines_location_complete_chk CHECK (
    (lat IS NULL AND lng IS NULL AND location_source IS NULL)
    OR (lat IS NOT NULL AND lng IS NOT NULL AND location_source IS NOT NULL
        AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  );

-- Primera ubicación y máquina que se mueve.
-- La posición del primer escaneo solo vale si la máquina está instalada en un cliente (línea de
-- contrato abierta, lo comprueba stampQrScan). Y cuando la máquina recibe una línea NUEVA (alta
-- desde el stock, sustitución, reasignación, importación…) puede haber cambiado de sitio: su
-- ubicación se borra y el próximo escaneo con buen GPS pone la nueva. Regla simple a propósito:
-- CUALQUIER línea nueva la borra, aunque la máquina no se haya movido (el coste es un escaneo).
-- Si el admin quiere fijarla a mano, que lo haga DESPUÉS de crear la línea.
-- SECURITY DEFINER: las RPC que crean líneas las llama gente sin permiso de UPDATE en machines.

CREATE OR REPLACE FUNCTION public.reset_machine_location_on_new_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.machines
     SET lat = NULL, lng = NULL, location_accuracy_m = NULL, location_source = NULL,
         location_set_at = NULL, location_set_by = NULL
   WHERE numero_serie = NEW.machine_id
     AND lat IS NOT NULL;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reset_machine_location_on_new_line() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.reset_machine_location_on_new_line() IS
  'Una línea de contrato nueva borra la ubicación de su máquina (puede haberse movido). Ver 20260925100000_geolocation.sql';

CREATE TRIGGER trg_reset_machine_location_on_new_line
  AFTER INSERT ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.reset_machine_location_on_new_line();

-- PRESENCIA DEL TÉCNICO: tabla aparte, SOLO para la oficina.
--
-- Dónde estaba el técnico al resolver una avería / cerrar una visita, y el veredicto contra la
-- ubicación de la máquina. NO va en `incidents`/`maintenance_visits`: el cliente del portal lee
-- sus averías fila entera (client_own_incidents_select), así que cualquier columna ahí la vería
-- con un `select=tech_lat,…` a PostgREST — y la posición de un empleado no es asunto suyo.
-- Aquí: RLS con SOLO la policy de lectura del admin; escribir, solo service_role (el servidor:
-- `computePresence` + upsert con el cliente admin). Un técnico no puede darse un 🟢 a sí mismo.
-- Una fila por tarea (PK entity_type + entity_id); sin FK porque apunta a dos tablas — los
-- triggers de abajo la borran cuando la tarea desaparece o se reabre.

CREATE TABLE public.field_presence (
  entity_type text NOT NULL CHECK (entity_type IN ('incident', 'visit')),
  entity_id   uuid NOT NULL,
  tech_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lat         double precision,
  lng         double precision,
  accuracy_m  real,
  distance_m  real,
  presence    text NOT NULL CHECK (presence IN ('near', 'far', 'imprecise', 'no_position', 'no_machine_position')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE public.field_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY field_presence_admin_select ON public.field_presence
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.field_presence FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.field_presence FROM authenticated;

COMMENT ON TABLE public.field_presence IS
  'Posición del técnico al resolver/cerrar y veredicto de presencia. Lectura: admin. Escritura: service_role. Ver 20260925100000_geolocation.sql';

-- Reabrir una avería (résolu/fermé → viva) borra su presencia, la reabra quien la reabra:
-- dónde estaba el técnico la primera vez no prueba nada sobre la segunda. Y borrar una avería o
-- una visita se lleva su fila (no hay FK que lo haga).
CREATE OR REPLACE FUNCTION public.field_presence_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_type text := CASE TG_TABLE_NAME WHEN 'incidents' THEN 'incident' ELSE 'visit' END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.field_presence WHERE entity_type = v_type AND entity_id = OLD.id;
  ELSIF OLD.status IN ('résolu', 'fermé') AND NEW.status NOT IN ('résolu', 'fermé') THEN
    DELETE FROM public.field_presence WHERE entity_type = v_type AND entity_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.field_presence_cleanup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_field_presence_cleanup
  AFTER UPDATE OF status OR DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.field_presence_cleanup();

CREATE TRIGGER trg_field_presence_cleanup
  AFTER DELETE ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.field_presence_cleanup();

-- SELLO DEL QR: solo lo escribe el servidor.
--
-- El sello del QR (`qr_verified`, y en incidents `qr_scanned_by`) es la prueba de que alguien
-- tuvo la etiqueta física delante. Si un técnico pudiera escribirlo con su propia sesión (la RLS
-- le deja actualizar sus averías y sus visitas, p. ej. con un PATCH a PostgREST), se sellaría
-- él mismo desde la oficina. Por eso, fuera de service_role (stampQrScan, las RPC), este trigger:
--   · en INSERT, lo deja vacío;
--   · en UPDATE, conserva el valor anterior si alguien intenta PONER uno. VACIARLO
--     (qr_verified = false / qr_scanned_by = NULL) sí se permite —es lo que hace
--     `clearResolution()` al reabrir—, salvo si la tarea sigue cerrada.
-- No da error: un intento a mano simplemente no surte efecto (mismo trato que la RLS da a un
-- UPDATE sin permiso). Al reabrir una avería, el sello lo vacía `tg_guard_incident_resolution`.
--
-- `auth.role()` sale del JWT, no del rol de Postgres: una RPC SECURITY DEFINER llamada por un
-- técnico sigue contando como 'authenticated'. SQL directo sin JWT (editor de Supabase) tampoco
-- pasa: para corregirlo a mano, hacerlo con la service_role key.

CREATE OR REPLACE FUNCTION public.guard_field_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_closed boolean;
BEGIN
  IF auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Ramas por tabla: `qr_scanned_by` solo existe en incidents y citarlo con una visita fallaría.
  IF TG_TABLE_NAME = 'incidents' THEN
    v_closed := NEW.status IN ('résolu', 'fermé');
  ELSE
    v_closed := NEW.status = 'fait';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.qr_verified := false;
    IF TG_TABLE_NAME = 'incidents' THEN
      NEW.qr_scanned_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: cambiar a un valor = no; vaciar = sí, salvo con la tarea cerrada.
  IF NEW.qr_verified IS DISTINCT FROM OLD.qr_verified AND (NEW.qr_verified IS DISTINCT FROM false OR v_closed) THEN
    NEW.qr_verified := OLD.qr_verified;
  END IF;
  IF TG_TABLE_NAME = 'incidents' THEN
    IF NEW.qr_scanned_by IS DISTINCT FROM OLD.qr_scanned_by AND (NEW.qr_scanned_by IS NOT NULL OR v_closed) THEN
      NEW.qr_scanned_by := OLD.qr_scanned_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_field_evidence() IS
  'Sello QR (qr_verified, qr_scanned_by): solo lo escribe service_role; vaciarlo se permite con la tarea abierta. Ver 20260925100000_geolocation.sql';

CREATE TRIGGER trg_guard_field_evidence
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.guard_field_evidence();

CREATE TRIGGER trg_guard_field_evidence
  BEFORE INSERT OR UPDATE ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.guard_field_evidence();

-- close_maintenance_visit: misma firma y mismo cuerpo que 20260604140000 (única definición
-- previa); solo cambia que ya NO fuerza qr_verified.
-- (CREATE OR REPLACE conserva grants; se re-aplican por claridad.)

CREATE OR REPLACE FUNCTION close_maintenance_visit(
  p_visit_id      uuid,
  p_serie         text,
  p_done_by       uuid,
  p_notes         text,
  p_part_ids      int[],
  p_autres_pieces text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- qr_verified ya NO se toca aquí: antes se ponía a true en todo cierre y el «QR vérifié» de
-- los mantenimientos no significaba nada. Ahora solo lo pone el escaneo real del QR
-- (stampQrScan), igual que en las averías; si nadie escaneó, se queda como estaba.
DECLARE
  v_machine_id   text;
  v_plan_id      uuid;
  v_cm_id        uuid;
  v_scheduled    date;
  v_freq_over    text;
  v_plan_freq    text;
  v_eff_freq     text;
  v_days         int;
  v_next         date;
  v_rows         int;
  v_part         int;
  v_marque       text;
  v_modele       text;
  v_numero_serie text;
  v_client       text;
  v_parts_count  int := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    cm.machine_id, mv.plan_id, mv.contract_machine_id, mv.scheduled_date,
    cm.maintenance_frequency_override, mp.frequency,
    m.marque, m.modele, m.numero_serie, cl.nom_client
  INTO
    v_machine_id, v_plan_id, v_cm_id, v_scheduled,
    v_freq_over, v_plan_freq,
    v_marque, v_modele, v_numero_serie, v_client
  FROM maintenance_visits mv
  JOIN contract_machines cm ON cm.id = mv.contract_machine_id
  JOIN maintenance_plans  mp ON mp.id = mv.plan_id
  JOIN machines  m  ON m.numero_serie = cm.machine_id
  JOIN contracts c  ON c.id = cm.contract_id
  LEFT JOIN clients cl ON cl.id = c.client_id
  WHERE mv.id = p_visit_id;

  IF v_machine_id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  IF v_machine_id <> p_serie THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  UPDATE maintenance_visits
    SET status = 'fait', done_at = now(), done_by = p_done_by, notes = p_notes
    WHERE id = p_visit_id AND status <> 'fait';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'already_closed';
  END IF;

  IF p_part_ids IS NOT NULL THEN
    FOREACH v_part IN ARRAY p_part_ids LOOP
      INSERT INTO maintenance_parts (visit_id, part_id, quantity)
        VALUES (p_visit_id, v_part, 1);
      v_parts_count := v_parts_count + 1;
    END LOOP;
  END IF;
  IF p_autres_pieces IS NOT NULL AND length(trim(p_autres_pieces)) > 0 THEN
    INSERT INTO maintenance_parts (visit_id, description, quantity)
      VALUES (p_visit_id, p_autres_pieces, 1);
    v_parts_count := v_parts_count + 1;
  END IF;

  v_eff_freq := COALESCE(v_freq_over, v_plan_freq);
  v_days := CASE WHEN v_eff_freq = 'mensuel' THEN 30 ELSE 90 END;
  v_next := v_scheduled + v_days;

  INSERT INTO maintenance_visits (plan_id, contract_machine_id, scheduled_date, status)
    VALUES (v_plan_id, v_cm_id, v_next, 'planifié');

  RETURN jsonb_build_object(
    'ok',           true,
    'next_date',    v_next,
    'marque',       v_marque,
    'modele',       v_modele,
    'numero_serie', v_numero_serie,
    'client',       v_client,
    'parts_count',  v_parts_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) TO service_role;

COMMIT;
