// Mapeo de los códigos de error que lanzan las RPCs de contratos a mensajes en francés.
// Las RPCs lanzan RAISE EXCEPTION '<code>'; supabase-js lo expone en error.message.

const RPC_ERROR_MESSAGES: Record<string, string> = {
  numero_contrat_exists:        'Ce numéro de contrat existe déjà.',
  machine_already_assigned:     'Une ou plusieurs machines sont déjà assignées à un autre contrat actif.',
  duplicate_machine_in_payload: 'Une machine apparaît en double dans le contrat.',
  invalid_billing_day:          'Le jour de facturation doit être entre 1 et 31.',
  no_lines:                     'Veuillez ajouter au moins une machine au contrat.',
  machine_id_immutable:         "Impossible de changer la machine d'une ligne existante. Retirez la machine et ajoutez-en une nouvelle.",
  invalid_date_fin:             'La date de fin doit être postérieure ou égale à la date de début.',
  permission_denied:            'Permission refusée.',
  client_change_forbidden_history: "Impossible de changer le client : ce contrat a déjà des factures ou des relevés. Créez un nouveau contrat pour le nouveau client.",
}

export function mapRpcError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  for (const code of Object.keys(RPC_ERROR_MESSAGES)) {
    if (message.includes(code)) return RPC_ERROR_MESSAGES[code]
  }
  return fallback
}
