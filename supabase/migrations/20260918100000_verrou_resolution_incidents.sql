-- ============================================================================
-- Verrou de résolution (PR-1 de 4) — plan: docs/plan-cierre-averias-2026-09-18.md
--
-- Hasta hoy una avería podía darse por RESUELTA sin informe del técnico y sin que
-- nadie hubiese escaneado el QR de la máquina: cinco puntos del código escribían
-- `status = 'résolu'` y ninguno exigía nada. Estas columnas son el rastro que
-- permite distinguir «un técnico fue y lo arregló» de «alguien limpió el tablero».
--
-- Este PR solo añade las columnas y su coherencia. El trigger que hace imposible
-- resolver sin rastro llega en el PR-4: antes de eso las cuatro puertas de oficina
-- todavía no rellenan estos campos y el trigger tumbaría producción.
-- ============================================================================

ALTER TABLE public.incidents
  ADD COLUMN resolved_via      text,
  ADD COLUMN resolution_reason text,
  ADD COLUMN resolution_note   text,
  ADD COLUMN qr_verified       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.incidents.resolved_via IS
  'Vía por la que se resolvió: intervention (técnico, con informe) / bureau (oficina, con motivo). NULL = sin resolver o histórico anterior al verrou.';
COMMENT ON COLUMN public.incidents.resolution_reason IS
  'Solo para resolved_via = bureau: por qué se cerró sin intervención registrada.';
COMMENT ON COLUMN public.incidents.resolution_note IS
  'Explicación libre de quien resolvió: informe del técnico resumido o justificación de oficina.';
COMMENT ON COLUMN public.incidents.qr_verified IS
  'true si el técnico escaneó el QR de la máquina. Semáforo, nunca un bloqueo: una etiqueta despegada no puede impedir cerrar una avería.';

-- Los valores viven también en src/lib/enums.ts (parseEnum). text + CHECK en lugar
-- de un enum de Postgres porque `resolution_reason` va a crecer con el uso y
-- ALTER TYPE ... ADD VALUE es incómodo de encadenar en migraciones.
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_resolved_via_chk
    CHECK (resolved_via IS NULL OR resolved_via IN ('intervention', 'bureau')),
  ADD CONSTRAINT incidents_resolution_reason_chk
    CHECK (resolution_reason IS NULL OR resolution_reason IN (
      'fausse_alerte', 'telephone', 'client', 'technicien_non_enregistre', 'doublon', 'autre'
    )),
  -- El motivo es exclusivo de la vía «bureau»: un técnico que interviene no elige
  -- motivo, describe lo que hizo.
  ADD CONSTRAINT incidents_resolution_coherence_chk
    CHECK (resolved_via IS DISTINCT FROM 'intervention' OR resolution_reason IS NULL);

-- Las averías resueltas antes de este cambio quedan con resolved_via = NULL a
-- propósito: se muestran como «sin informar», no se inventa un rastro que no hubo.
