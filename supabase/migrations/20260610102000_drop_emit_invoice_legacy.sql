-- WP-3 (P1) — Eliminar la RPC legacy emit_invoice (emisión por cliente/mes).
-- Riesgo cerrado: la vía legacy (emitInvoiceAction + emit_invoice) facturaba por mes natural
-- con tarifas SIN versionar y su unicidad (client_id, year, month WHERE contract_id IS NULL) NO
-- se solapa con la del sistema vigente por ciclo (contract_id, period_start) → se podían emitir
-- DOS facturas que cubrieran el mismo consumo (doble facturación). La emisión vigente es
-- emit_contract_invoice (por contrato y ciclo de aniversario), que permanece intacta.
--
-- En la app ya se han eliminado emitInvoiceAction, FacturationPreview, buildClientInvoiceDraft y
-- listBillableClients (mismo PR WP-3). Esta función queda sin ningún invocador.

DROP FUNCTION IF EXISTS public.emit_invoice(jsonb);
