-- Dashboard Atelier: flag de dispatcher en profiles + técnico planificado en visitas de mantenimiento.

ALTER TABLE public.profiles
  ADD COLUMN is_dispatcher boolean NOT NULL DEFAULT false;

ALTER TABLE public.maintenance_visits
  ADD COLUMN assigned_to uuid REFERENCES public.profiles(id);
