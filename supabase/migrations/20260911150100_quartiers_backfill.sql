-- BACKFILL de quartier_code en clients a partir del texto de `adresse` (2026-09-11).
--
-- Las direcciones de AMD llevan el barrio escrito dentro ("POINT E, AVENUE BIRAGO DIOP",
-- "ALMADIES ZONE 3", "SICAP BAOBABS ... MERMOZ"). Este UPDATE aprovecha eso.
-- Lo que no encaje queda a NULL y se corrige a mano en /admin/clients (filtro «Sans quartier»).
--
-- Solo toca filas con quartier_code IS NULL: es reejecutable y nunca pisa una corrección manual.
--
-- Medido contra los 68 clientes activos de producción: 62 clasificados, 6 sin deducir
-- (direcciones sin barrio: "DAKAR" a secas, "CITE ADDOHA", "RUE MALAN 11", "RUE DE THANN"...).
-- Preferimos dejar en NULL lo dudoso: una zona equivocada en el mapa engaña más que un hueco.
--
-- ⚠️ Dos cosas gobiernan el resultado:
--
-- (1) ACENTOS. `ILIKE` los distingue, así que «SICAP LIBERTÉ» no casaría con '%SICAP LIBERTE%'
--     y acabaría clasificada como Mermoz — justo el error que esa regla existe para evitar.
--     En vez de duplicar cada patrón, se normaliza una sola vez: mayúsculas + `translate()` de
--     las vocales acentuadas. Los patrones van entonces en mayúsculas y sin acentos, con LIKE.
--     Importa sobre todo para los clientes que se den de alta en el futuro.
--
-- (2) ORDEN de los WHEN. El primero es el aeropuerto a propósito: "AEROPORT" en Senegal hoy es
--     el AIBD, que está en DIASS (no en Yoff, donde estaba el antiguo LSS). Sin esa regla
--     delante, 2AS y 2AS TECHNCS —que están en el AIBD— caerían a 45 km de su sitio.
--     Por lo mismo, «SICAP LIBERTE» va antes que el genérico «SICAP» (que apunta a Mermoz).

BEGIN;

WITH normalized AS (
  SELECT
    id,
    translate(upper(coalesce(adresse, '')),
              'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN') AS a,
    translate(upper(coalesce(ville, '')),
              'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN') AS v
  FROM public.clients
  WHERE quartier_code IS NULL
),
classified AS (
  SELECT id, CASE
    -- Aeropuerto AIBD (Diass). Gana a Yoff y a "Blaise Diagne" (Médina).
    WHEN a LIKE ANY (ARRAY['%AEROPORT%','%AIBD%']) OR v LIKE '%DIASS%'
      THEN 'diass'
    WHEN a LIKE ANY (ARRAY['%ALMADIES%','%NGOR%','%ARC EN CIEL%'])
      THEN 'almadies'
    WHEN a LIKE ANY (ARRAY['%OUAKAM%','%OUKAM%','%MAMELLE%','%RENAISSANCE%'])
      THEN 'ouakam'
    WHEN a LIKE ANY (ARRAY['%YOFF%','%FOIRE%'])
      THEN 'yoff'
    -- «SICAP LIBERTE» es Liberté: antes que %POINT E% (hay direcciones de SICAP Liberté que
    -- mencionan un «ROND POINT ...») y que el genérico %SICAP%, que apunta a Mermoz.
    WHEN a LIKE '%SICAP LIBERTE%'
      THEN 'liberte'
    -- '%POINT E%' excluye «ROND POINT E...»: si no, «ROND POINT ECOLE NORMALE» (CARLCARE,
    -- que está en SICAP Liberté) se clasificaría como Point E.
    WHEN (a LIKE '%POINT E%' AND a NOT LIKE '%ROND POINT E%')
      OR a LIKE ANY (ARRAY['%FANN%','%AMITIE%','%BIRAGO DIOP%','%BOULEVARD DE L%EST%'])
      THEN 'point-e'
    WHEN a LIKE ANY (ARRAY['%MERMOZ%','%SACRE%','%KEUR GORGUI%','%SOTRAC%','%SICAP%','%BAOBAB%','%SIPRES%'])
      THEN 'mermoz'
    WHEN a LIKE ANY (ARRAY['%LIBERTE%','%HLM%','%GRAND DAKAR%','%FRONT DE TERRE%','%SODIDA%','%DIEUPPEUL%','%CASTORS%'])
      THEN 'liberte'
    -- «%PLACE DE L%PENDANCE%» y no «PLACE DE L'INDEPENDANCE»: en los datos reales la plaza
    -- aparece como «L´INDEPENDANCE» y hasta como «LÍNDEPENDANCE» (errata). Las dos contienen
    -- «PENDANCE» una vez normalizado el acento.
    WHEN a LIKE ANY (ARRAY['%PLATEAU%','%PLACE DE L%PENDANCE%','%MOHAMED V%','%DJILY MBAYE%','%PONTY%','%FELIX FAURE%','%CARDINAL%','%THIANDOUM%','%AVENUE PASTEUR%','%RUE VICENS%','%GALANDOU DIOUF%','%BOULEVARD DE LA REPUBLIQUE%','%BLD DE LA LIBERATION%','%RUE DU PORT%','%ABDOU KARIM BOURGI%','%WAGANE DIOUF%'])
      THEN 'plateau'
    WHEN a LIKE ANY (ARRAY['%MEDINA%','%BLAISE DIAGNE%','%ALLEES PAPE%','%MALICK SY%','%GUELE TAPEE%','%GUEULE TAPEE%'])
      THEN 'medina'
    -- %HANN% excluye «THANN»: la Rue de Thann no está en Hann (la subcadena engaña).
    WHEN (a LIKE '%HANN%' AND a NOT LIKE '%THANN%')
      OR a LIKE ANY (ARRAY['%BEL AIR%','%BEL-AIR%','%ZONE INDUSTRIELLE%','%PATTE D%OIE%','%GRAND MOULIN%','%DAKAR PETROLE%','%MOLE 4%','%CENTENAIRE%'])
      THEN 'hann'
    WHEN a LIKE ANY (ARRAY['%PARCELLES%','%CAMBERENE%'])
      THEN 'parcelles'
    WHEN a LIKE ANY (ARRAY['%PIKINE%','%GUEDIAWAYE%','%THIAROYE%'])
      THEN 'pikine'
    WHEN a LIKE ANY (ARRAY['%KEUR MASSAR%','%MALIKA%','%MBAO%'])
      THEN 'keur-massar'
    WHEN a LIKE ANY (ARRAY['%RUFISQUE%','%BARGNY%'])
      THEN 'rufisque'
    WHEN a LIKE '%DIAMNIADIO%' OR v LIKE '%DIAMNIADIO%'
      THEN 'diamniadio'
    -- Fuera de Dakar: manda la ciudad
    WHEN v LIKE '%THIES%'       THEN 'thies'
    WHEN v LIKE '%MBOUR%'       THEN 'mbour'
    WHEN v LIKE '%TOUBA%'       THEN 'touba'
    WHEN v LIKE '%KAOLACK%'     THEN 'kaolack'
    WHEN v LIKE '%SAINT%LOUIS%' THEN 'saint-louis'
    WHEN v LIKE '%ZIGUINCHOR%'  THEN 'ziguinchor'
    ELSE NULL
  END AS code
  FROM normalized
)
UPDATE public.clients c
SET quartier_code = z.code
FROM classified z
WHERE c.id = z.id
  AND z.code IS NOT NULL
  AND c.quartier_code IS NULL;

COMMIT;
