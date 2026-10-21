-- Doble escaneo de técnicos: cada vez que un técnico escanea el QR de una máquina con una
-- avería abierta se guarda una fila aquí. Con dos escaneos del ciclo actual (empezar + terminar)
-- se permite cerrar la avería (regla pura en src/lib/scanGate.ts).
--
-- Solo escribe `service_role` (la ruta de escaneo valida técnico, avería y dedupe): sin policies
-- de INSERT/UPDATE/DELETE y con los privilegios revocados, para que un técnico no pueda
-- fabricarse escaneos por PostgREST. Los admins solo leen.
--
-- Deshacer: docs/rollback-2026-10-21-doble-escaneo.md

CREATE TABLE public.incident_scans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid        NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  scanned_by  uuid        NOT NULL REFERENCES public.profiles(id),
  scanned_at  timestamptz NOT NULL DEFAULT now()
);

-- Cubre el dedupe (último escaneo de este técnico en esta avería) y la lectura por avería.
CREATE INDEX incident_scans_incident_scanned_by_at_idx
  ON public.incident_scans (incident_id, scanned_by, scanned_at);

ALTER TABLE public.incident_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_scans_admin_select ON public.incident_scans
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Supabase concede ALL a anon/authenticated por defecto en `public`; la falta de policy ya
-- bloquea, pero se quita el privilegio también (defensa en profundidad).
REVOKE ALL ON public.incident_scans FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.incident_scans FROM authenticated;
