
CREATE OR REPLACE FUNCTION create_client_with_contract(
  p_nom_client       text,
  p_ninea            text,
  p_email            text,
  p_telephone        text,
  p_adresse          text,
  p_ville            text,
  p_active           boolean,
  p_numero_contrat   text,
  p_machine_id       text,
  p_date_debut       date,
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
  INSERT INTO clients (nom_client, ninea, email, telephone, adresse, ville, active)
  VALUES (p_nom_client, p_ninea, p_email, p_telephone, p_adresse, p_ville, p_active)
  RETURNING id INTO v_client_id;

  INSERT INTO contracts (numero_contrat, client_id, machine_id, date_debut, date_renouvellement, lieu_installation, statut)
  VALUES (p_numero_contrat, v_client_id, p_machine_id, p_date_debut, p_date_renouvellement, p_lieu_installation, 'actif');

  RETURN json_build_object('client_id', v_client_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_client_with_contract TO authenticated;
