# Cómo deshacer el doble escaneo de técnicos (2026-10-21)

> Runbook de reversión de la función «escanear al empezar y al terminar». Cada migración tiene
> aquí su inversa.

## Orden para deshacerlo todo

El orden importa; es el de la publicación al revés:

1. **Quitar el trigger** (Migración 2, abajo).
2. **Revertir la app** (los PR del doble escaneo).
3. **Borrar la tabla** (Migración 1, abajo).

Por qué:
- Si se revierte la app con el trigger vivo, la app antigua no graba escaneos y guarda el
  formulario del técnico con la sesión del técnico: el trigger lo rechaza y **los técnicos no pueden
  cerrar ninguna avería, ni empezarla desde el formulario** (solo abriendo la ficha de la máquina,
  que la app antigua hacía con `service_role`).
- Si se borra la tabla con el trigger vivo, el trigger consulta `incident_scans` en cada cierre de
  técnico: **todo cierre de técnico falla con «relation does not exist»**.
- La tabla va al final porque la app nueva la lee y la escribe; la antigua no la usa.

Si solo se quiere quitar la red de la BD (la app sigue exigiendo el doble escaneo), basta el paso 1.

## Migración 1 — tabla `incident_scans`

| Qué | Migración |
|---|---|
| Tabla `public.incident_scans` (escaneos del QR por técnico y avería), su índice, RLS y policy de lectura admin | `20261021100000_incident_scans.sql` |

Solo guarda un registro de escaneos: borrarla no afecta a averías, visitas ni facturación. Se pierde
el historial de escaneos. **Antes** hay que quitar el trigger (Migración 2) y revertir la app (ver
«Orden para deshacerlo todo»): el trigger y la app nueva la consultan, y sin ella fallan.

### Reversión

En el **SQL Editor** del dashboard de Supabase (el DDL en producción no va por el MCP), o con una
migración nueva y `supabase db push --linked`:

```sql
DROP TABLE public.incident_scans;
```

## Migración 2 — trigger `guard_tech_scan_required`

| Qué | Migración |
|---|---|
| Función `public.guard_tech_scan_required()` y trigger `trg_guard_tech_scan_required` (BEFORE UPDATE en `incidents`): el técnico de campo no puede pasar a `en_cours` ni cerrar con su sesión sin los escaneos | `20261021110000_guard_tech_scan_required.sql` |

Solo es una red de validación: quitarla no toca datos. Sin ella la app sigue exigiendo el doble
escaneo, pero un técnico con una llamada directa a la API podría saltárselo. Es **lo primero** que se
quita al deshacerlo todo (ver «Orden para deshacerlo todo»).

### Reversión

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push --linked`:

```sql
DROP TRIGGER trg_guard_tech_scan_required ON public.incidents;
DROP FUNCTION public.guard_tech_scan_required();
```
