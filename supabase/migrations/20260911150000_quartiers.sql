-- QUARTIERS — ubicación por barrio para el mapa del kiosko /atelier (2026-09-11).
--
-- Contexto: `clients` solo tiene `ville` y `adresse` (texto libre). El dashboard de Atelier
-- necesita pintar cada aviso sobre un mapa, y geocodificar direcciones senegalesas no es fiable.
-- Se elige granularidad de BARRIO: cada quartier lleva su centroide (lat/lng) y el mapa dibuja
-- una burbuja por quartier.
--
-- La tabla es catálogo Y fuente de coordenadas: añadir una zona nueva es un INSERT, sin desplegar.
-- Ubicación de un aviso = machines.quartier_code ?? clients.quartier_code (ver src/lib/quartiers.ts).

BEGIN;

CREATE TABLE public.quartiers (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  ville       text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  sort_order  integer NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.quartiers IS
  'Catálogo de barrios/zonas con centroide, usado por el mapa del kiosko /atelier.';

INSERT INTO public.quartiers (code, label, ville, lat, lng, sort_order) VALUES
  ('plateau',     'Plateau · Centre-ville',              'Dakar',       14.6690, -17.4300, 10),
  ('medina',      'Médina · Gueule Tapée',               'Dakar',       14.6800, -17.4480, 20),
  ('point-e',     'Fann · Point E · Amitié',             'Dakar',       14.6900, -17.4640, 30),
  ('mermoz',      'Mermoz · Sacré-Cœur · Sipres',        'Dakar',       14.7060, -17.4720, 40),
  ('liberte',     'Liberté · Grand Dakar · HLM',         'Dakar',       14.7080, -17.4520, 50),
  ('ouakam',      'Ouakam · Mamelles',                   'Dakar',       14.7200, -17.4900, 60),
  ('almadies',    'Almadies · Ngor',                     'Dakar',       14.7440, -17.5140, 70),
  ('yoff',        'Yoff · Aéroport · Foire',             'Dakar',       14.7480, -17.4750, 80),
  ('parcelles',   'Parcelles Assainies · Cambérène',     'Dakar',       14.7650, -17.4400, 90),
  ('hann',        'Hann · Bel-Air · Port · Patte d''Oie', 'Dakar',      14.7100, -17.4270, 100),
  ('pikine',      'Pikine · Guédiawaye · Thiaroye',      'Dakar',       14.7550, -17.3950, 110),
  ('keur-massar', 'Keur Massar · Malika · Mbao',         'Dakar',       14.7800, -17.3200, 120),
  ('rufisque',    'Rufisque · Bargny',                   'Dakar',       14.7150, -17.2700, 130),
  ('diamniadio',  'Diamniadio',                          'Diamniadio',  14.7280, -17.1830, 200),
  ('thies',       'Thiès',                               'Thiès',       14.7910, -16.9260, 210),
  ('mbour',       'Mbour · Saly',                        'Mbour',       14.4200, -16.9600, 220),
  ('diass',       'Diass',                               'Diass',       14.6400, -17.0700, 230),
  ('touba',       'Touba',                               'Touba',       14.8500, -15.8800, 240),
  ('kaolack',     'Kaolack',                             'Kaolack',     14.1500, -16.0700, 250),
  ('saint-louis', 'Saint-Louis',                         'Saint-Louis', 16.0300, -16.5000, 260),
  ('ziguinchor',  'Ziguinchor',                          'Ziguinchor',  12.5800, -16.2700, 270);

-- ── Ubicación del cliente y (opcional) de la máquina ──
ALTER TABLE public.clients
  ADD COLUMN quartier_code text REFERENCES public.quartiers(code);
ALTER TABLE public.machines
  ADD COLUMN quartier_code text REFERENCES public.quartiers(code);

COMMENT ON COLUMN public.clients.quartier_code IS
  'Barrio del cliente. Fuente por defecto de la ubicación de sus avisos en /atelier.';
COMMENT ON COLUMN public.machines.quartier_code IS
  'Barrio de ESTA máquina; solo se rellena si está en una sede distinta a la del cliente.';

CREATE INDEX idx_clients_quartier  ON public.clients(quartier_code);
CREATE INDEX idx_machines_quartier ON public.machines(quartier_code);

-- ── RLS: catálogo legible por cualquier usuario autenticado, escritura solo admin ──
ALTER TABLE public.quartiers ENABLE ROW LEVEL SECURITY;

-- En prod los default privileges ya dan los GRANT a `authenticated`; en la BD local efímera
-- (tests RLS) hay que darlos explícitamente. RLS sigue gobernando qué filas se ven.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quartiers TO authenticated;

CREATE POLICY quartiers_select_authenticated ON public.quartiers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY quartiers_admin_all ON public.quartiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
