-- Índice compuesto para la query de historial por máquina en /admin/contadores/[serie]
-- Evita sort en memoria cuando hay muchos relevés por máquina
CREATE INDEX IF NOT EXISTS idx_mc_machine_year_month
  ON public.machine_counters (machine_id, year DESC, month DESC);
