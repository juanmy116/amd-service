-- Fase 3 de la PWA de técnicos: geolocalización (2026-09-25).
-- 1) Ubicación exacta de cada máquina (primer escaneo con buena precisión, o el admin).
-- 2) Dónde estaba el técnico al resolver una avería / cerrar un mantenimiento, y el veredicto
--    calculado en el servidor contra la ubicación de la máquina (🟢 near ≤ 200 m con GPS
--    ≤ 150 m / 🟡 far = lejos incluso restando el margen del GPS / 🟡 imprecise = el GPS no
--    permite decir ni una cosa ni otra / 🟡 no_position = no dio permiso o sin GPS /
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

-- Mismas columnas de presencia en incidencias y visitas.
ALTER TABLE public.incidents
  ADD COLUMN tech_lat          double precision,
  ADD COLUMN tech_lng          double precision,
  ADD COLUMN tech_accuracy_m   real,
  ADD COLUMN tech_distance_m   real,
  ADD COLUMN tech_position_at  timestamptz,
  ADD COLUMN tech_presence     text CHECK (tech_presence IN ('near', 'far', 'imprecise', 'no_position', 'no_machine_position'));

ALTER TABLE public.maintenance_visits
  ADD COLUMN tech_lat          double precision,
  ADD COLUMN tech_lng          double precision,
  ADD COLUMN tech_accuracy_m   real,
  ADD COLUMN tech_distance_m   real,
  ADD COLUMN tech_position_at  timestamptz,
  ADD COLUMN tech_presence     text CHECK (tech_presence IN ('near', 'far', 'imprecise', 'no_position', 'no_machine_position'));

-- PRUEBAS DE CAMPO: solo las escribe el servidor.
--
-- La posición del técnico, su veredicto y el sello del QR son la prueba de que alguien estuvo
-- delante de la máquina. Si un técnico pudiera escribirlos con su propia sesión (la RLS le deja
-- actualizar sus averías y sus visitas, p. ej. con un PATCH a PostgREST), se daría a sí mismo un
-- 🟢 «sur place» desde la oficina. Por eso, fuera de service_role (el servidor: stampQrScan,
-- computePresence, las RPC), este trigger:
--   · en INSERT, las deja vacías;
--   · en UPDATE, conserva el valor anterior si alguien intenta PONER uno. VACIARLAS (NULL, o
--     qr_verified = false) sí se permite —es lo que hace `clearResolution()` al reabrir—, salvo
--     si la tarea sigue cerrada: borrar un 🟡 «loin» de una avería resuelta sería esconderlo.
-- No da error: la aplicación ya no manda estas columnas con la sesión del usuario, y un intento
-- a mano simplemente no surte efecto (mismo trato que la RLS da a un UPDATE sin permiso).
--
-- Y al REABRIR una avería (résolu/fermé → viva) la posición se vacía aquí, para cualquiera:
-- dónde estaba el técnico la primera vez no prueba nada sobre la segunda. El QR lo vacía ya
-- `tg_guard_incident_resolution`. El orden entre los dos triggers da igual: este solo vacía
-- columnas tech_* y en qr_* un vaciado siempre está permitido.
--
-- `auth.role()` sale del JWT, no del rol de Postgres: una RPC SECURITY DEFINER llamada por un
-- técnico sigue contando como 'authenticated'. SQL directo sin JWT (editor de Supabase) tampoco
-- pasa: para corregir estas columnas a mano, hacerlo con la service_role key.

CREATE OR REPLACE FUNCTION public.guard_field_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_closed boolean;
BEGIN
  -- Ramas por tabla: `qr_scanned_by` solo existe en incidents y citarlo con una visita fallaría.
  IF TG_TABLE_NAME = 'incidents' THEN
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('résolu', 'fermé')
       AND NEW.status NOT IN ('résolu', 'fermé') THEN
      NEW.tech_lat         := NULL;
      NEW.tech_lng         := NULL;
      NEW.tech_accuracy_m  := NULL;
      NEW.tech_distance_m  := NULL;
      NEW.tech_position_at := NULL;
      NEW.tech_presence    := NULL;
    END IF;
    v_closed := NEW.status IN ('résolu', 'fermé');
  ELSE
    v_closed := NEW.status = 'fait';
  END IF;

  IF auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.tech_lat         := NULL;
    NEW.tech_lng         := NULL;
    NEW.tech_accuracy_m  := NULL;
    NEW.tech_distance_m  := NULL;
    NEW.tech_position_at := NULL;
    NEW.tech_presence    := NULL;
    NEW.qr_verified      := false;
    IF TG_TABLE_NAME = 'incidents' THEN
      NEW.qr_scanned_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: cambiar a un valor = no; vaciar = sí, salvo con la tarea cerrada.
  IF NEW.tech_lat IS DISTINCT FROM OLD.tech_lat AND (NEW.tech_lat IS NOT NULL OR v_closed) THEN
    NEW.tech_lat := OLD.tech_lat;
  END IF;
  IF NEW.tech_lng IS DISTINCT FROM OLD.tech_lng AND (NEW.tech_lng IS NOT NULL OR v_closed) THEN
    NEW.tech_lng := OLD.tech_lng;
  END IF;
  IF NEW.tech_accuracy_m IS DISTINCT FROM OLD.tech_accuracy_m AND (NEW.tech_accuracy_m IS NOT NULL OR v_closed) THEN
    NEW.tech_accuracy_m := OLD.tech_accuracy_m;
  END IF;
  IF NEW.tech_distance_m IS DISTINCT FROM OLD.tech_distance_m AND (NEW.tech_distance_m IS NOT NULL OR v_closed) THEN
    NEW.tech_distance_m := OLD.tech_distance_m;
  END IF;
  IF NEW.tech_position_at IS DISTINCT FROM OLD.tech_position_at AND (NEW.tech_position_at IS NOT NULL OR v_closed) THEN
    NEW.tech_position_at := OLD.tech_position_at;
  END IF;
  IF NEW.tech_presence IS DISTINCT FROM OLD.tech_presence AND (NEW.tech_presence IS NOT NULL OR v_closed) THEN
    NEW.tech_presence := OLD.tech_presence;
  END IF;
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
  'Posición del técnico, veredicto de presencia y sello QR: solo los escribe service_role; vaciar se permite con la tarea abierta; reabrir una avería vacía la posición. Ver 20260925100000_geolocation.sql';

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
