-- Teléfono móvil y fijo del cliente (plan de pulido 2026-10-23, punto 9).
--
-- `telephone` era el único teléfono y pasa a ser el MÓVIL: no se renombra, así la app publicada
-- antes de este cambio y `princity-sync` siguen funcionando sin tocar nada. El fijo va en una
-- columna nueva. La regla «al menos uno de los dos» la aplica la app al guardar; no va como CHECK
-- porque hay clientes antiguos (importados) sin ningún teléfono.
--
-- Inversa: docs/rollback-2026-10-23-telefonos-cliente.md

BEGIN;

ALTER TABLE public.clients ADD COLUMN telephone_fixe text;

COMMENT ON COLUMN public.clients.telephone      IS 'Téléphone mobile du client (historiquement le seul téléphone).';
COMMENT ON COLUMN public.clients.telephone_fixe IS 'Téléphone fixe du client.';

-- En Senegal los fijos empiezan por 33 (los móviles por 7x). Los que ya estaban guardados en
-- `telephone` pasan a su columna. Se ignoran espacios, guiones y el prefijo 221 / +221 / 00221.
UPDATE public.clients
SET telephone_fixe = telephone,
    telephone      = NULL
WHERE telephone IS NOT NULL
  AND regexp_replace(regexp_replace(telephone, '\D', '', 'g'), '^(00)?221', '') ~ '^33';

COMMIT;
