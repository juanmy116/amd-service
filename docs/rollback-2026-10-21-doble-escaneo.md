# Cómo deshacer el doble escaneo de técnicos (2026-10-21)

> Runbook de reversión de la función «escanear al empezar y al terminar». Cada migración tiene
> aquí su inversa.

## Migración 1 — tabla `incident_scans`

| Qué | Migración |
|---|---|
| Tabla `public.incident_scans` (escaneos del QR por técnico y avería), su índice, RLS y policy de lectura admin | `20261021100000_incident_scans.sql` |

Solo guarda un registro de escaneos: borrarla no afecta a averías, visitas ni facturación. Se pierde
el historial de escaneos, y el código que la lee/escribe debe retirarse antes (o dejará de compilar
contra los tipos y fallará en runtime).

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
escaneo, pero un técnico con una llamada directa a la API podría saltárselo.

### Reversión

En el **SQL Editor** del dashboard de Supabase, o con una migración nueva y `supabase db push --linked`:

```sql
DROP TRIGGER trg_guard_tech_scan_required ON public.incidents;
DROP FUNCTION public.guard_tech_scan_required();
```
