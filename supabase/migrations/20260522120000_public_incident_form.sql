-- Formulario público de incidencias via QR (sin autenticación).
-- 1. contract_id pasa a nullable: los incidentes públicos pueden no tener contrato activo.
-- 2. Columnas de contacto para almacenar datos del declarante anónimo.
-- 3. Columna source para distinguir origen del incidente.

ALTER TABLE public.incidents
  ALTER COLUMN contract_id DROP NOT NULL;

ALTER TABLE public.incidents
  ADD COLUMN contact_name  text,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_email text,
  ADD COLUMN source        text;
