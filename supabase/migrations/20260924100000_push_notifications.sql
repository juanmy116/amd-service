-- Notificaciones push a técnicos (Fase 2 de la PWA, 2026-09-24).
-- Cola de salida: el trigger ENCOLA en push_notifications (que es a la vez el registro de lo
-- enviado) y da un «toque» a la Edge Function send-push. Si la función falla o no hay Vault
-- configurado (CI, local), la fila queda 'pending' y el cron la reintenta. Nada se pierde en
-- silencio (lección de Princity/Matrix).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Suscripciones: un técnico puede tener varios aparatos. El endpoint identifica el aparato:
--    si un móvil compartido cambia de técnico, la Server Action reasigna la fila (upsert por endpoint).
CREATE TABLE public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text,
  disabled_at     timestamptz          -- Apple/Google respondió 404/410: el aparato la dio de baja
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id) WHERE disabled_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_admin());
-- Sin INSERT/UPDATE/DELETE para authenticated: el alta va por Server Action (service_role).
-- Los privilegios por defecto de prod dan ALL a anon/authenticated en tablas nuevas; RLS ya lo
-- bloquea, pero se retiran por defensa en profundidad.
REVOKE ALL ON public.push_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.push_subscriptions FROM authenticated;

-- 2. Cola + registro.
CREATE TABLE public.push_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('assigned', 'unassigned')),
  entity_type  text NOT NULL CHECK (entity_type IN ('incident', 'visit')),
  entity_id    uuid NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sending', 'sent', 'no_subscription', 'failed', 'expired')),
  attempts     int  NOT NULL DEFAULT 0,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  sent_at      timestamptz
);
CREATE INDEX push_notifications_queue_idx ON public.push_notifications (status, created_at);
CREATE INDEX push_notifications_recipient_idx ON public.push_notifications (recipient_id, created_at DESC);

ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_notifications_admin_select ON public.push_notifications
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.push_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.push_notifications FROM authenticated;

-- 3. «Toque» a la Edge Function. URL y secreto viven en Vault (se crean a mano en prod, ver
--    runbook). Sin ellos no se llama: la fila queda pendiente y ningún entorno de pruebas
--    dispara la función de producción.
--    NUNCA debe tumbar una asignación: corre dentro del UPDATE de la avería/visita, así que
--    cualquier fallo (Vault, pg_net, permisos) se degrada a WARNING; la fila sigue 'pending'
--    y el cron la reintenta.
CREATE OR REPLACE FUNCTION public.kick_push_sender() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'push_sender_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_sender_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;
  -- pg_net encola la petición y la envía tras el COMMIT: si la transacción se deshace, no sale.
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'kick_push_sender: % (%)', SQLERRM, SQLSTATE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kick_push_sender() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.kick_push_sender() TO service_role;

-- 4. Trigger: encola al cambiar assigned_to. No avisa a quien hace el cambio (auth.uid());
--    desde service_role (kiosko, crons) auth.uid() es NULL y avisa siempre.
CREATE OR REPLACE FUNCTION public.enqueue_assignment_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_entity text := CASE TG_TABLE_NAME WHEN 'incidents' THEN 'incident' ELSE 'visit' END;
  v_old    uuid := CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END;
  v_actor  uuid := auth.uid();
  v_queued boolean := false;
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM v_old THEN
    RETURN NEW;
  END IF;

  -- Una tarea ya terminada no se avisa: la resolución de OFICINA escribe assigned_to para
  -- acreditar al técnico (src/lib/resolution.ts) en el mismo UPDATE que la cierra.
  IF (TG_TABLE_NAME = 'incidents' AND NEW.status IN ('résolu', 'fermé'))
     OR (TG_TABLE_NAME = 'maintenance_visits' AND NEW.status = 'fait') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM v_actor THEN
    INSERT INTO public.push_notifications (recipient_id, kind, entity_type, entity_id)
    VALUES (NEW.assigned_to, 'assigned', v_entity, NEW.id);
    v_queued := true;
  END IF;

  -- El EXISTS no es decorativo: borrar un técnico (admin/team → deleteUser) pone
  -- assigned_to = NULL por la FK ON DELETE SET NULL y dispara este trigger con el perfil YA
  -- borrado. Encolarle un 'unassigned' violaría la FK de recipient_id y tumbaría el borrado.
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_actor
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_old) THEN
    INSERT INTO public.push_notifications (recipient_id, kind, entity_type, entity_id)
    VALUES (v_old, 'unassigned', v_entity, NEW.id);
    v_queued := true;
  END IF;

  IF v_queued THEN
    PERFORM public.kick_push_sender();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_assignment_push() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_push_incident_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_assignment_push();

CREATE TRIGGER trg_push_visit_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_assignment_push();

-- 5. Reclamo atómico de la cola (varias invocaciones simultáneas no envían dos veces).
--    Recupera también filas 'sending' abandonadas (> 5 min: la función murió a medias).
CREATE OR REPLACE FUNCTION public.claim_push_notifications(p_limit int DEFAULT 50)
RETURNS SETOF public.push_notifications
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.push_notifications
     SET status = 'sending', attempts = attempts + 1, claimed_at = now()
   WHERE id IN (
     SELECT id FROM public.push_notifications
      WHERE attempts < 3
        AND (status = 'pending' OR (status = 'sending' AND claimed_at < now() - interval '5 minutes'))
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_push_notifications(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_push_notifications(int) TO service_role;

-- 6. Red de seguridad cada minuto: da por fallidas las filas que agotaron sus 3 intentos,
--    caduca lo que ya no tiene sentido avisar (> 1 h), purga historial viejo (cola > 90 días,
--    log de pg_cron > 7 días: este job escribe ~1.440 filas/día) y, si queda algo reclamable,
--    vuelve a tocar la función. Idempotente.
SELECT cron.unschedule('push-notifications-retry') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'push-notifications-retry'
);
SELECT cron.schedule(
  'push-notifications-retry',
  '* * * * *',
  $$
  UPDATE public.push_notifications SET status = 'failed', error = coalesce(error, 'max_attempts')
   WHERE status IN ('pending', 'sending') AND attempts >= 3
     AND (status = 'pending' OR claimed_at < now() - interval '5 minutes');
  UPDATE public.push_notifications SET status = 'expired'
   WHERE status IN ('pending', 'sending') AND created_at < now() - interval '1 hour';
  DELETE FROM public.push_notifications WHERE created_at < now() - interval '90 days';
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  SELECT public.kick_push_sender()
   WHERE EXISTS (SELECT 1 FROM public.push_notifications
                  WHERE attempts < 3
                    AND (status = 'pending'
                         OR (status = 'sending' AND claimed_at < now() - interval '5 minutes')));
  $$
);

COMMIT;
