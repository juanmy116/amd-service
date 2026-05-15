
-- Revocar acceso SELECT a anon y authenticated en todas las tablas
-- Las Edge Functions y el agente usan service_role que bypassa esto
REVOKE SELECT ON public.profiles         FROM anon, authenticated;
REVOKE SELECT ON public.clients          FROM anon, authenticated;
REVOKE SELECT ON public.machines         FROM anon, authenticated;
REVOKE SELECT ON public.contracts        FROM anon, authenticated;
REVOKE SELECT ON public.client_profiles  FROM anon, authenticated;
REVOKE SELECT ON public.incidents        FROM anon, authenticated;
REVOKE SELECT ON public.parts            FROM anon, authenticated;
REVOKE SELECT ON public.incident_parts   FROM anon, authenticated;
REVOKE SELECT ON public.incident_photos  FROM anon, authenticated;
REVOKE SELECT ON public.incident_history FROM anon, authenticated;
REVOKE SELECT ON public.csat_responses   FROM anon, authenticated;
REVOKE SELECT ON public.princity_alerts  FROM anon, authenticated;
