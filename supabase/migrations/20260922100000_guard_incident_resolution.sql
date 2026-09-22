-- CANDADO DE RESOLUCIÓN (PR-4 de 4) — plan: docs/plan-cierre-averias-2026-09-18.md
--
-- Los PR-1 a PR-3 cerraron las cinco puertas que daban una avería por resuelta: el formulario
-- del técnico exige informe, las cuatro puertas de oficina exigen motivo y explicación, y la
-- distinción se ve en el listado y en la ficha. Todo eso vive en la aplicación.
--
-- Esto es la red de debajo. Mismo espíritu que `tg_invoices_immutable` y que el candado de
-- facturación: si mañana aparece una sexta puerta —una Edge Function, un script de importación,
-- una llamada a mano con la service_role key— no podrá archivar una avería sin decir cómo se
-- resolvió. La regla deja de depender de que quien escriba el próximo camino se acuerde.
--
-- QUÉ MOMENTO PROTEGE: el paso de VIVA (nouveau/assigné/en_cours) a résolu o a fermé. Los dos,
-- porque desde el PR-3 una resolución de oficina va directa a `fermé`: vigilar solo `résolu`
-- dejaría abierto justo el atajo que el PR-2 cerró en la aplicación.
--
-- QUÉ NO TOCA, a propósito:
--   · El histórico. Una avería que ya estaba en `résolu` o `fermé` puede editarse, cerrarse y
--     archivarse sin rastro: nunca lo tuvo, y no se inventa uno. Por eso la condición mira el
--     estado ANTERIOR y no solo el nuevo.
--   · El cierre automático tras la encuesta (`csat.server.ts`), que va de `résolu` a `fermé`.
--   · Reabrir: volver a un estado vivo no exige nada; lo exigirá la próxima resolución.
--
-- El escaneo del QR (`qr_verified`) NO se exige aquí y no se exigirá nunca: es un semáforo. Una
-- etiqueta despegada o un móvil sin cobertura en Dakar no pueden dejar a un técnico sin poder
-- cerrar la avería que acaba de arreglar — buscaría un atajo, y volveríamos al principio.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_guard_incident_resolution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Solo importa lo que termina resuelto o archivado.
  IF NEW.status NOT IN ('résolu', 'fermé') THEN
    RETURN NEW;
  END IF;

  -- Y solo si la avería venía viva. Tocar una que ya estaba resuelta o cerrada no es
  -- resolverla: es mantenimiento del registro.
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('nouveau', 'assigné', 'en_cours') THEN
    RETURN NEW;
  END IF;

  IF NEW.resolved_via IS NULL THEN
    RAISE EXCEPTION 'Résolution sans trace : indiquez comment la panne a été résolue.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.resolved_via = 'intervention'
     AND COALESCE(btrim(NEW.rapport_intervention), '') = '' THEN
    RAISE EXCEPTION 'Le rapport d''intervention est obligatoire pour résoudre.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.resolved_via = 'bureau'
     AND (NEW.resolution_reason IS NULL OR COALESCE(btrim(NEW.resolution_note), '') = '') THEN
    RAISE EXCEPTION 'Le motif et l''explication sont obligatoires pour résoudre sans intervention.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_guard_incident_resolution() IS
  'Verrou de résolution: ninguna avería viva puede quedar résolu/fermé sin decir cómo se resolvió. Ver docs/plan-cierre-averias-2026-09-18.md';

DROP TRIGGER IF EXISTS trg_guard_incident_resolution ON public.incidents;
CREATE TRIGGER trg_guard_incident_resolution
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_incident_resolution();

COMMIT;
