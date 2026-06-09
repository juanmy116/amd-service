# Decisiones técnicas (ADR ligero)

Registro permanente de decisiones técnicas relevantes y excepciones a las reglas del
proyecto. Cada entrada lleva fecha, contexto, decisión, motivo de seguridad y aprobación.

---

## 2026-06-09 — Excepción: edición de una migración ya aplicada (P1-9)

**Contexto.** La auditoría de preproducción (P1-9) detectó que el INSERT de datos de
`supabase/migrations/20260603120559_contracts_n_machines.sql` (paso 4, "Migrar datos del
contrato existente") copiaba contratos con `statut='terminé'` a `contract_machines` **sin**
`date_fin`, violando el CHECK `contract_machines_termine_has_date_fin`
(`statut <> 'terminé' OR date_fin IS NOT NULL`). En una reconstrucción limpia con cualquier
contrato terminado, la migración **aborta** y el esquema deja de ser reproducible.

**Regla general del proyecto.** Las migraciones ya aplicadas en producción son inmutables;
los errores se corrigen con migraciones *fix-forward*, nunca editando el archivo existente.

**Decisión.** Excepcionalmente, se edita el INSERT **in-situ** dentro de la propia migración
`20260603120559` (Bloque 0, PR #39). El INSERT pasa a derivar `date_fin` para las líneas
`terminé`: `GREATEST(date_debut, COALESCE(date_renouvellement, date_debut))`.

**Por qué un fix-forward NO sirve aquí.** El fallo ocurre **dentro de** esta migración, en el
propio INSERT. En una reconstrucción limpia con datos terminados, la transacción aborta antes
de que el motor de migraciones llegue a ninguna migración posterior. Una migración nueva nunca
se ejecutaría, así que no puede reparar el problema. Editar el INSERT en sitio es la única vía
de hacer la cadena reconstruible desde cero.

**Por qué es seguro.**
- **Efecto byte-idéntico sobre los datos reales de prod.** Prod migró sin contratos `terminé`
  con máquina, así que el `CASE` deja `date_fin = NULL` exactamente como antes. Para los datos
  no-`terminé` el resultado no cambia.
- **Prod no re-ejecuta la migración.** El historial de migraciones ya la marca como aplicada;
  la edición solo afecta a reconstrucciones limpias / nuevos entornos / `db reset`.
- El cambio respeta el otro CHECK (`date_fin >= date_debut`) gracias a `GREATEST`.

**Aprobación.** Aprobada explícitamente por el dueño del proyecto el 2026-06-09, con la
condición de que la excepción quede documentada de forma permanente: (1) comentario de
cabecera dentro de la migración y (2) esta entrada de ADR.

**Trazabilidad.** PR #39 (`fix/bloque-0-arreglos-aislados`). Auditoría:
`docs/auditoria-preproduccion-facturacion-contratos-2026-06-08.md` (P1-9). Plan:
`docs/plan-correccion-core-facturacion-2026-06-08.md` (Bloque 0.1).
