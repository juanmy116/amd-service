-- WP-1 Tarea 1.1 — Cerrar escalada a admin vía profiles.role
-- Hoy `authenticated` tiene GRANT UPDATE sobre TODAS las columnas de profiles,
-- incluidas role e is_dispatcher. La policy users_update_own_profile solo restringe
-- la fila, no la columna → un usuario podía hacer PATCH con {"role":"admin"}.

-- Revocar el UPDATE a nivel tabla y re-otorgarlo SOLO en columnas no sensibles.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- Defensa en profundidad: trigger que rechaza cambios de role/is_dispatcher
-- salvo que los haga service_role.
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_privileged()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_dispatcher IS DISTINCT FROM OLD.is_dispatcher THEN
      RAISE EXCEPTION 'forbidden: cannot change privileged columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_privileged();
