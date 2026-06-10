-- WP-1 Tarea 1.4 — Blindar wipe_data_tables para que no borre facturas
-- wipe_data_tables hace TRUNCATE ... RESTART IDENTITY CASCADE sobre clients/contracts;
-- el CASCADE arrastra invoices → invoice_lines y TRUNCATE NO dispara los triggers de
-- inmutabilidad. La invoca princity-sync en runInitialImport. Se añade un guard al
-- inicio que aborta si existe al menos una factura emitida (documento inmutable).
-- El cuerpo TRUNCATE se mantiene idéntico al de 20260513100119_wipe_data_tables_use_truncate.sql.
CREATE OR REPLACE FUNCTION public.wipe_data_tables()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices) THEN
    RAISE EXCEPTION 'wipe_data_tables bloqueado: existen facturas emitidas (documentos inmutables)';
  END IF;
  TRUNCATE TABLE
    maintenance_parts, maintenance_visits, maintenance_plans,
    incident_parts, incident_photos, incident_history, csat_responses,
    incidents, machine_counters, princity_alerts, client_profiles,
    contracts, machines, clients
  RESTART IDENTITY CASCADE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wipe_data_tables() TO service_role;
