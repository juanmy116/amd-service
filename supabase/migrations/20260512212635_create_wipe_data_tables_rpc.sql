
CREATE OR REPLACE FUNCTION wipe_data_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM maintenance_parts;
  DELETE FROM maintenance_visits;
  DELETE FROM maintenance_plans;
  DELETE FROM incident_parts;
  DELETE FROM incident_photos;
  DELETE FROM incident_history;
  DELETE FROM csat_responses;
  DELETE FROM incidents;
  DELETE FROM machine_counters;
  DELETE FROM princity_alerts;
  DELETE FROM client_profiles;
  DELETE FROM contracts;
  DELETE FROM machines;
  DELETE FROM clients;
END;
$$;
