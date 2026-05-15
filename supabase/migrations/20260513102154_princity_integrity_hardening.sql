-- 1. Bloquear wipe_data_tables al público (mantener service_role)
REVOKE EXECUTE ON FUNCTION public.wipe_data_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wipe_data_tables() FROM anon;
REVOKE EXECUTE ON FUNCTION public.wipe_data_tables() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.wipe_data_tables() TO service_role;

-- 2. UNIQUE para evitar duplicados en futuros syncs
ALTER TABLE public.clients
  ADD CONSTRAINT clients_princity_company_id_key  UNIQUE (princity_company_id);

ALTER TABLE public.machines
  ADD CONSTRAINT machines_princity_device_id_key UNIQUE (princity_device_id);
