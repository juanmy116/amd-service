-- Permite borrar un técnico/usuario sin que las claves foráneas lo bloqueen.
-- Las 6 referencias a profiles(id) pasan de NO ACTION (RESTRICT) a ON DELETE SET NULL:
-- así, al borrar un perfil, las incidencias, el historial, las fotos y las visitas
-- de mantenimiento se conservan, solo pierden el enlace al usuario borrado.

ALTER TABLE public.incidents DROP CONSTRAINT incidents_opened_by_fkey;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_opened_by_fkey
  FOREIGN KEY (opened_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.incidents DROP CONSTRAINT incidents_assigned_to_fkey;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.incident_history DROP CONSTRAINT incident_history_changed_by_fkey;
ALTER TABLE public.incident_history ADD CONSTRAINT incident_history_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.incident_photos DROP CONSTRAINT incident_photos_uploaded_by_fkey;
ALTER TABLE public.incident_photos ADD CONSTRAINT incident_photos_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_visits DROP CONSTRAINT maintenance_visits_done_by_fkey;
ALTER TABLE public.maintenance_visits ADD CONSTRAINT maintenance_visits_done_by_fkey
  FOREIGN KEY (done_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_visits DROP CONSTRAINT maintenance_visits_assigned_to_fkey;
ALTER TABLE public.maintenance_visits ADD CONSTRAINT maintenance_visits_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
