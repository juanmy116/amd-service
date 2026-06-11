-- WP-3b: retira el índice único huérfano de la vía de facturación legacy por cliente/mes.
--
-- `invoices_client_period_emise_unique` imponía unicidad (client_id, period_year, period_month)
-- para facturas con `contract_id IS NULL` — la vía de emisión por cliente/mes que se eliminó en
-- WP-3 (PR #60, DROP emit_invoice). Hoy toda factura se emite por CONTRATO y ciclo de aniversario
-- (índice vivo: `invoices_contract_cycle_emise_unique`, sobre contract_id IS NOT NULL), así que
-- este índice ya nunca aplica. Sin filas afectadas (0 facturas en prod al momento de la migración).
DROP INDEX IF EXISTS public.invoices_client_period_emise_unique;
