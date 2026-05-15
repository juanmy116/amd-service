CREATE OR REPLACE FUNCTION public.wipe_data_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE
    maintenance_parts,
    maintenance_visits,
    maintenance_plans,
    incident_parts,
    incident_photos,
    incident_history,
    csat_responses,
    incidents,
    machine_counters,
    princity_alerts,
    client_profiles,
    contracts,
    machines,
    clients
  RESTART IDENTITY CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_data_tables() TO service_role;
