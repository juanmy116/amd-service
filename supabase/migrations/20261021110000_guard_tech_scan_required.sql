-- Doble escaneo de técnicos, red de la BD: un técnico de campo no puede empezar una avería
-- (pasarla a `en_cours`) ni cerrarla (`résolu`/`fermé`) saltándose el escaneo del QR.
--
-- La app ya lo exige (src/lib/scanGate.ts + las acciones de /tech), pero la RLS deja al técnico
-- asignado hacer UPDATE de su avería por PostgREST con su propio JWT, y sin esta red bastaría
-- una llamada directa para ignorar el escaneo. Mismo patrón que `tg_guard_incident_resolution`
-- y `guard_tech_scope_columns`: la regla vive en la base, no en la buena voluntad de la app.
--
-- Qué se vigila: solo sesiones de usuario cuyo perfil es técnico de campo
-- (`role = 'technician'` y no `is_dispatcher`). Pasan service_role (la ruta de escaneo y el
-- taller escriben así), la oficina (admin), el Atelier (técnico con `is_dispatcher`: reparte
-- trabajo desde el taller, no está delante de la máquina) y las sesiones directas a la BD
-- (SQL Editor, migraciones, pg_cron: sin JWT, `auth.role()` es NULL).
--
-- Reglas para el técnico de campo, solo cuando CAMBIA el estado:
--   * Empezar (`en_cours`): nunca con su sesión. Empezar es escanear, y eso lo graba el
--     servidor con service_role.
--   * Cerrar (`résolu`/`fermé`) una avería viva: hacen falta, en el ciclo actual (escaneos
--     posteriores al `resolved_at` anterior, para que una reabierta exija escanear de nuevo),
--       - al menos 2 escaneos suyos,
--       - el primero y el último separados por 60 s como mínimo (dos filas con milésimas de
--         diferencia son un solo escaneo disparado dos veces, no «empezar» y «terminar»),
--       - y el último con no más de 60 min.
--
-- Estas constantes deben coincidir con `CLOSE_SCAN_WINDOW_MINUTES` (60) y `SCAN_DEDUPE_SECONDS`
-- (60) de src/lib/scanGate.ts; allí hay un comentario que apunta aquí. Si cambia una, cambia la otra.
--
-- Orden de disparo: los BEFORE UPDATE corren por orden alfabético de nombre
-- (trg_guard_field_evidence, trg_guard_incident_resolution, este, trg_guard_tech_scope_columns).
-- No se pisan: este solo mira `status` y `incident_scans`, y no modifica NEW.
--
-- Deshacer: docs/rollback-2026-10-21-doble-escaneo.md

CREATE OR REPLACE FUNCTION public.guard_tech_scan_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_count integer;
  v_first timestamptz;
  v_last  timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Solo el técnico de campo. SECURITY DEFINER para leer `profiles` sin depender de su RLS.
  -- Sin perfil se deja pasar: la RLS de `incidents` ya le impide este UPDATE (solo actualiza el
  -- asignado, y `assigned_to` apunta a `profiles`, o el admin). La acción de la app, en cambio,
  -- falla cerrada (exige escanear): allí un perfil ilegible puede ser un fallo de lectura.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'technician'
      AND COALESCE(p.is_dispatcher, false) = false
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'en_cours' THEN
    RAISE EXCEPTION 'Scannez le QR de la machine pour démarrer l''intervention.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('résolu', 'fermé') AND OLD.status IN ('nouveau', 'assigné', 'en_cours') THEN
    SELECT count(*), min(s.scanned_at), max(s.scanned_at)
      INTO v_count, v_first, v_last
      FROM public.incident_scans s
     WHERE s.incident_id = NEW.id
       AND s.scanned_by = auth.uid()
       AND s.scanned_at > COALESCE(OLD.resolved_at, '-infinity'::timestamptz);

    -- 60 min = CLOSE_SCAN_WINDOW_MINUTES; 60 s = SCAN_DEDUPE_SECONDS (src/lib/scanGate.ts).
    IF v_count < 2
       OR v_last < now() - interval '60 minutes'
       OR v_last - v_first < interval '60 seconds' THEN
      RAISE EXCEPTION 'Scannez à nouveau le QR de la machine pour clôturer (valable 1 heure).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_tech_scan_required() IS
  'Doble escaneo: el técnico de campo no empieza ni cierra una avería con su sesión sin los escaneos del QR. Ver docs/rollback-2026-10-21-doble-escaneo.md';

CREATE TRIGGER trg_guard_tech_scan_required
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.guard_tech_scan_required();
