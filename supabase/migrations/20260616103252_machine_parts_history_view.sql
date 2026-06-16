-- Fase 1 — Vista unificada del historial de piezas/tóner por máquina.
-- Une los dos orígenes donde se registran cambios de pieza: incidencias
-- (incident_parts) y mantenimiento preventivo (maintenance_parts).
-- security_invoker = true → hereda la RLS de las tablas base (cada rol ve lo suyo).
CREATE OR REPLACE VIEW public.v_machine_parts_history
WITH (security_invoker = true) AS
-- Origen 1: averías / incidencias
SELECT
  COALESCE(i.machine_id, cm.machine_id)        AS machine_id,
  'incident'::text                             AS source,
  i.id::text                                   AS source_id,
  i.numero_incident                            AS reference,
  ip.part_id,
  p.name                                       AS part_name,
  NULL::text                                   AS description,
  ip.quantity,
  COALESCE(i.resolved_at, i.created_at)        AS changed_at,
  i.category::text                             AS category,
  i.assigned_to                                AS technician_id,
  prof.full_name                               AS technician_name
FROM public.incident_parts ip
JOIN public.incidents i               ON i.id = ip.incident_id
JOIN public.parts p                   ON p.id = ip.part_id
LEFT JOIN public.contract_machines cm ON cm.id = i.contract_machine_id
LEFT JOIN public.profiles prof        ON prof.id = i.assigned_to
UNION ALL
-- Origen 2: mantenimiento preventivo
SELECT
  cm.machine_id,
  'maintenance'::text,
  mv.id::text,
  to_char(mv.scheduled_date, 'YYYY-MM-DD'),
  mp.part_id,
  COALESCE(p.name, mp.description)             AS part_name,
  mp.description,
  mp.quantity,
  COALESCE(mv.done_at, mv.scheduled_date::timestamptz),
  'maintenance'::text,
  mv.done_by,
  prof.full_name
FROM public.maintenance_parts mp
JOIN public.maintenance_visits mv     ON mv.id = mp.visit_id
JOIN public.contract_machines cm      ON cm.id = mv.contract_machine_id
LEFT JOIN public.parts p              ON p.id = mp.part_id
LEFT JOIN public.profiles prof        ON prof.id = mv.done_by;

GRANT SELECT ON public.v_machine_parts_history TO authenticated;
