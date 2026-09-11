-- BACKFILL de quartier_code en clients a partir del texto de `adresse` (2026-09-11).
--
-- Las direcciones de AMD llevan el barrio escrito dentro ("POINT E, AVENUE BIRAGO DIOP",
-- "ALMADIES ZONE 3", "SICAP BAOBABS ... MERMOZ"). Este UPDATE aprovecha eso.
-- Lo que no encaje queda a NULL y se corrige a mano en /admin/clients (filtro «Sans quartier»).
--
-- Solo toca filas con quartier_code IS NULL: es reejecutable y nunca pisa una corrección manual.
--
-- Medido contra los 68 clientes activos de producción: 63 clasificados, 5 sin deducir
-- (direcciones sin barrio: "DAKAR" a secas, "CITE ADDOHA", "RUE MALAN 11"...).
--
-- ⚠️ El orden de los WHEN importa. El primero es el aeropuerto a propósito: "AEROPORT" en Senegal
-- hoy es el AIBD, que está en DIASS (no en Yoff, donde estaba el antiguo LSS). Sin esta regla
-- delante, 2AS y 2AS TECHNCS —que están en el AIBD— caerían en Yoff, a 45 km de su sitio.

BEGIN;

UPDATE public.clients SET quartier_code = CASE
  -- Aeropuerto AIBD (Diass). Va primero: gana a Yoff y a "Blaise Diagne" (Médina).
  WHEN adresse ILIKE ANY (ARRAY['%AEROPORT%','%AIBD%']) OR ville ILIKE '%DIASS%'
    THEN 'diass'
  WHEN adresse ILIKE ANY (ARRAY['%ALMADIES%','%NGOR%','%ARC EN CIEL%'])
    THEN 'almadies'
  WHEN adresse ILIKE ANY (ARRAY['%OUAKAM%','%OUKAM%','%MAMELLE%','%RENAISSANCE%'])
    THEN 'ouakam'
  WHEN adresse ILIKE ANY (ARRAY['%YOFF%','%FOIRE%'])
    THEN 'yoff'
  WHEN adresse ILIKE ANY (ARRAY['%POINT E%','%FANN%','%AMITIE%','%BIRAGO DIOP%','%BOULEVARD DE L%EST%'])
    THEN 'point-e'
  WHEN adresse ILIKE ANY (ARRAY['%MERMOZ%','%SACRE%','%KEUR GORGUI%','%SOTRAC%','%SICAP%','%BAOBAB%','%SIPRES%','%VDN%'])
    THEN 'mermoz'
  WHEN adresse ILIKE ANY (ARRAY['%LIBERTE%','%HLM%','%GRAND DAKAR%','%FRONT DE TERRE%','%SODIDA%','%DIEUPPEUL%','%CASTORS%'])
    THEN 'liberte'
  WHEN adresse ILIKE ANY (ARRAY['%PLATEAU%','%PLACE DE L%','%MOHAMED V%','%DJILY MBAYE%','%PONTY%','%FELIX FAURE%','%CARDINAL%','%THIANDOUM%','%AVENUE PASTEUR%','%RUE VICENS%','%GALANDOU DIOUF%','%BOULEVARD DE LA REPUBLIQUE%','%BLD DE LA LIBERATION%','%RUE DU PORT%','%ABDOU KARIM BOURGI%','%WAGANE DIOUF%'])
    THEN 'plateau'
  WHEN adresse ILIKE ANY (ARRAY['%MEDINA%','%BLAISE DIAGNE%','%ALLEES PAPE%','%MALICK SY%','%GUELE TAPEE%','%GUEULE TAPEE%'])
    THEN 'medina'
  WHEN adresse ILIKE ANY (ARRAY['%HANN%','%BEL AIR%','%BEL-AIR%','%ZONE INDUSTRIELLE%','%PATTE D%OIE%','%GRAND MOULIN%','%DAKAR PETROLE%','%MOLE 4%','%CENTENAIRE%'])
    THEN 'hann'
  WHEN adresse ILIKE ANY (ARRAY['%PARCELLES%','%CAMBERENE%'])
    THEN 'parcelles'
  WHEN adresse ILIKE ANY (ARRAY['%PIKINE%','%GUEDIAWAYE%','%THIAROYE%'])
    THEN 'pikine'
  WHEN adresse ILIKE ANY (ARRAY['%KEUR MASSAR%','%MALIKA%','%MBAO%'])
    THEN 'keur-massar'
  WHEN adresse ILIKE ANY (ARRAY['%RUFISQUE%','%BARGNY%'])
    THEN 'rufisque'
  WHEN adresse ILIKE '%DIAMNIADIO%' OR ville ILIKE '%DIAMNIADIO%'
    THEN 'diamniadio'
  -- Fuera de Dakar: manda la ciudad
  WHEN ville ILIKE '%THIES%'       THEN 'thies'
  WHEN ville ILIKE '%MBOUR%'       THEN 'mbour'
  WHEN ville ILIKE '%TOUBA%'       THEN 'touba'
  WHEN ville ILIKE '%KAOLACK%'     THEN 'kaolack'
  WHEN ville ILIKE '%SAINT%LOUIS%' THEN 'saint-louis'
  WHEN ville ILIKE '%ZIGUINCHOR%'  THEN 'ziguinchor'
  ELSE NULL
END
WHERE quartier_code IS NULL;

COMMIT;
