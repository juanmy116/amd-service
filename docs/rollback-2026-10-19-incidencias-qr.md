# Corrección de datos — incidencias QR sin línea de contrato (2026-10-19)

Acompaña al PR #187 (las incidencias nuevas del QR ya se cuelgan de la línea de contrato
abierta). Esto corrige las **5 que ya existían**, guardadas solo con `machine_id`.

Para cada una se usa la línea vigente **en la fecha de la incidencia** (las 5 máquinas tienen
una sola línea, abierta). Ninguna está viva: 4 `fermé` y 1 `résolu`, así que el candado de
resolución las deja pasar sin tocar su rastro. Único efecto secundario: `updated_at` pasa a la
hora de la corrección (trigger).

## Aplicar

```sql
begin;
update incidents i
   set contract_machine_id = v.line_id, machine_id = null
  from (values
    ('20010202-5266-43d7-8bd9-035b7e52bf2e'::uuid, '7970c3c1-a9df-4fa9-8e9c-4ab15359eda5'::uuid), -- SAV-2026-0001 E205R563075
    ('82185842-5f28-4dad-a516-0cece770401d'::uuid, 'fb67c30a-7486-49f2-b700-b91e0992ec2d'::uuid), -- SAV-2026-0003 E155M802144
    ('8e1a77ab-eb6f-4c16-bbde-d8c8f8f60ff6'::uuid, 'c1e13b49-d2b0-4f71-a5c8-f89cbe841b23'::uuid), -- SAV-2026-0004 W543J985036
    ('3f56edb4-a563-4af0-be41-1eaad2033541'::uuid, 'f136a2b2-0a54-4c63-8bb4-703bda5aa56e'::uuid), -- SAV-2026-0005 E155M113118
    ('c1ef4165-3b9f-4abe-abc1-726ed34423c0'::uuid, 'fb67c30a-7486-49f2-b700-b91e0992ec2d'::uuid)  -- SAV-2026-0006 E155M802144
  ) as v(id, line_id)
 where i.id = v.id and i.contract_machine_id is null and i.source = 'public';
-- Debe decir UPDATE 5. Si no, rollback;
commit;
```

## Deshacer

```sql
update incidents i
   set machine_id = v.serie, contract_machine_id = null
  from (values
    ('20010202-5266-43d7-8bd9-035b7e52bf2e'::uuid, 'E205R563075'),
    ('82185842-5f28-4dad-a516-0cece770401d'::uuid, 'E155M802144'),
    ('8e1a77ab-eb6f-4c16-bbde-d8c8f8f60ff6'::uuid, 'W543J985036'),
    ('3f56edb4-a563-4af0-be41-1eaad2033541'::uuid, 'E155M113118'),
    ('c1ef4165-3b9f-4abe-abc1-726ed34423c0'::uuid, 'E155M802144')
  ) as v(id, serie)
 where i.id = v.id;
```
