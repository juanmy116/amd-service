# Rollbacks manuales (NO se ejecutan automáticamente)

Esta carpeta está **fuera** de `supabase/migrations/`, por lo que su contenido
**nunca** lo aplica `supabase db reset`, `supabase db push` ni un despliegue limpio.

## Por qué existe (P0-1)

El archivo `20260603120856_contracts_n_machines_rollback.sql` vivía antes dentro de
`supabase/migrations/` con un timestamp normal. Eso lo convertía en un paso más del
historial: una reconstrucción limpia lo ejecutaba justo después de
`20260603120559_contracts_n_machines.sql`, destruyendo objetos (`contract_machines`,
`contract_machine_id`, funciones y políticas) de los que dependen las migraciones
posteriores → la reconstrucción abortaba y el esquema dejaba de ser reproducible.

Al moverlo aquí, el camino automático de migraciones ya no lo toca.

## Cómo aplicar un rollback (solo emergencias, a mano)

1. Confirmar con el dueño del proyecto que es una emergencia real post-merge.
2. Revisar el archivo: el rollback de N-máquinas **pierde rotaciones** (solo preserva
   la línea activa de cada contrato). No es reversible sin pérdida de datos.
3. Aplicarlo manualmente, nunca como parte del historial de migraciones:
   - vía MCP `execute_sql`, o
   - `psql` contra la base de datos, o
   - copiándolo temporalmente y ejecutándolo con cuidado.
4. Documentar la incidencia y registrar fix-forward para volver al estado correcto.
