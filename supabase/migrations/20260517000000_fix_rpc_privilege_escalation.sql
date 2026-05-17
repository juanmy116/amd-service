-- Fix privilege escalation: create_client_with_contract and create_machine_with_contract
-- were SECURITY DEFINER functions granted to 'authenticated' without an internal role check,
-- allowing any logged-in user (client, technician) to call them directly and bypass RLS.
--
-- Two layers of defense:
--   1. REVOKE EXECUTE from authenticated — only service_role (used by Server Actions) may call them.
--   2. Internal is_admin() guard — the function refuses if an authenticated non-admin somehow calls it.

REVOKE EXECUTE ON FUNCTION create_client_with_contract(
  text, text, text, text, text, text, boolean,
  text, text, date, date, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION create_machine_with_contract(
  text, text, text, text, boolean,
  text, bigint, date, text, date, text
) FROM authenticated;

-- Redefine with internal guard (keeps SECURITY DEFINER + SET search_path).

CREATE OR REPLACE FUNCTION create_client_with_contract(
  p_nom_client          text,
  p_ninea               text,
  p_email               text,
  p_telephone           text,
  p_adresse             text,
  p_ville               text,
  p_active              boolean,
  p_numero_contrat      text,
  p_machine_id          text,
  p_date_debut          date,
  p_date_renouvellement date DEFAULT NULL,
  p_lieu_installation   text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id bigint;
BEGIN
  IF auth.role() = 'authenticated' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  INSERT INTO clients (nom_client, ninea, email, telephone, adresse, ville, active)
  VALUES (p_nom_client, p_ninea, p_email, p_telephone, p_adresse, p_ville, p_active)
  RETURNING id INTO v_client_id;

  INSERT INTO contracts (numero_contrat, client_id, machine_id, date_debut, date_renouvellement, lieu_installation, statut)
  VALUES (p_numero_contrat, v_client_id, p_machine_id, p_date_debut, p_date_renouvellement, p_lieu_installation, 'actif');

  RETURN json_build_object('client_id', v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION create_machine_with_contract(
  p_numero_serie         text,
  p_marque               text,
  p_modele               text,
  p_type                 text,
  p_active               boolean,
  p_numero_contrat       text,
  p_client_id            bigint,
  p_date_debut           date,
  p_localisation         text DEFAULT NULL,
  p_date_renouvellement  date DEFAULT NULL,
  p_lieu_installation    text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  INSERT INTO machines (numero_serie, marque, modele, type, localisation, active)
  VALUES (p_numero_serie, p_marque, p_modele, p_type, p_localisation, p_active);

  INSERT INTO contracts (numero_contrat, client_id, machine_id, date_debut, date_renouvellement, lieu_installation, statut)
  VALUES (p_numero_contrat, p_client_id, p_numero_serie, p_date_debut, p_date_renouvellement, p_lieu_installation, 'actif');

  RETURN json_build_object('machine_id', p_numero_serie);
END;
$$;
