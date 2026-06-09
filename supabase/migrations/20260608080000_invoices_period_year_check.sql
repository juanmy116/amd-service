-- P2-3: rango de año en invoices.period_year.
-- La BD ya valida period_month (1-12) pero no el año, permitiendo periodos absurdos
-- (p. ej. año 0 o 999999) vía solicitudes manipuladas. Fix-forward: añadir CHECK de rango.
-- Las facturas reales tienen años recientes (dentro del rango), así que no rompe datos existentes.

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_period_year_range
  CHECK (period_year BETWEEN 2020 AND 2100);
