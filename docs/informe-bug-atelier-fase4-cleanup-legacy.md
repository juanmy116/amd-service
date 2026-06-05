# Informe para Claude — Bug bloqueante en Atelier tras Fase 4 cleanup legacy

## Resumen

Hay un bug bloqueante en `/atelier` después del cleanup legacy de Fase 4.

La migración `supabase/migrations/20260605000000_cleanup_legacy_contracts.sql` elimina la columna legacy `incidents.contract_id`, pero `src/app/atelier/page.tsx` todavía intenta resolver el cliente de una incidencia usando la relación directa legacy `incidents -> contracts`.

Esto puede romper `/atelier` en runtime aunque `npm run typecheck` pase.

---

## Evidencia

En `supabase/migrations/20260605000000_cleanup_legacy_contracts.sql`:

```sql
ALTER TABLE incidents DROP COLUMN IF EXISTS contract_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS machine_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS lieu_installation;
```

En `src/app/atelier/page.tsx`, el query de incidentes sigue usando:

```ts
admin
  .from('incidents')
  .select(`
    id, numero_incident, title, status, priority, resolved_at, assigned_to,
    contracts ( clients ( nom_client ) ),
    profiles!assigned_to ( full_name )
  `)
```

Pero después del DROP de `incidents.contract_id`, ya no existe la relación directa `incidents -> contracts`.

Los tipos regenerados en `src/lib/supabase/types.ts` confirman que `incidents` ya no tiene `contract_id`. La relación válida para incidencias internas es:

```txt
incidents.contract_machine_id -> contract_machines.id -> contracts.id -> clients.id
```

---

## Impacto

Este fallo afecta a `/atelier`.

Aunque TypeScript compile, PostgREST puede fallar al evaluar el select con una relación inexistente:

```ts
contracts ( clients ( nom_client ) )
```

desde la tabla `incidents`.

Esto no es una deuda visual ni un fallback degradado. Es potencialmente un error runtime en una pantalla operativa.

---

## Fix esperado

Modificar `src/app/atelier/page.tsx`.

### Query actual incorrecto

```ts
admin
  .from('incidents')
  .select(`
    id, numero_incident, title, status, priority, resolved_at, assigned_to,
    contracts ( clients ( nom_client ) ),
    profiles!assigned_to ( full_name )
  `)
```

### Query corregido

```ts
admin
  .from('incidents')
  .select(`
    id, numero_incident, title, status, priority, resolved_at, assigned_to,
    contract_machines (
      contracts ( clients ( nom_client ) )
    ),
    profiles!assigned_to ( full_name )
  `)
```

### Tipo actual incorrecto

```ts
type IncRow = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  resolved_at: string | null
  assigned_to: string | null
  contracts: { clients: { nom_client: string } | null } | null
  profiles: { full_name: string | null } | null
}
```

### Tipo corregido

```ts
type IncRow = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  resolved_at: string | null
  assigned_to: string | null
  contract_machines: {
    contracts: { clients: { nom_client: string } | null } | null
  } | null
  profiles: { full_name: string | null } | null
}
```

### Mapping actual incorrecto

```ts
clientName: i.contracts?.clients?.nom_client ?? null,
```

### Mapping corregido

```ts
clientName: i.contract_machines?.contracts?.clients?.nom_client ?? null,
```

---

## Validación requerida

Ejecutar:

```bash
npm run typecheck
```

Y buscar queries legacy directos desde `incidents` hacia `contracts`:

```bash
rg "from\\('incidents'\\)[\\s\\S]{0,260}contracts \\(" -n src/app src/components src/lib
```

Ese `rg` no debería encontrar ningún query directo:

```txt
incidents -> contracts
```

Si aparecen relaciones `contracts(...)` dentro de `contract_machines(...)`, eso sí es correcto.

---

## Nota importante

La corrección debe hacerse antes de dar Fase 4 por cerrada.

Fase 4 ya eliminó realmente `incidents.contract_id`, por lo que cualquier lectura que siga dependiendo de `incidents -> contracts` queda inválida.

