
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
  INSERT INTO machines (numero_serie, marque, modele, type, localisation, active)
  VALUES (p_numero_serie, p_marque, p_modele, p_type, p_localisation, p_active);

  INSERT INTO contracts (numero_contrat, client_id, machine_id, date_debut, date_renouvellement, lieu_installation, statut)
  VALUES (p_numero_contrat, p_client_id, p_numero_serie, p_date_debut, p_date_renouvellement, p_lieu_installation, 'actif');

  RETURN json_build_object('machine_id', p_numero_serie);
END;
$$;

GRANT EXECUTE ON FUNCTION create_machine_with_contract TO authenticated;
