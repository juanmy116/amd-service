-- The N-machines refactor moves the contract↔machine link to contract_machines.
-- contracts.machine_id is kept until the cleanup PR for backward-compat reads,
-- but the new createContractAction does not populate it, so it must be nullable
-- for the new flow to insert.

BEGIN;
ALTER TABLE public.contracts ALTER COLUMN machine_id DROP NOT NULL;
COMMIT;
