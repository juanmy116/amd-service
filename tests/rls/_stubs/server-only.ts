// Stub de `server-only` para los tests RLS/E2E. El paquete real lanza una excepción si
// se carga fuera de un Server Component (su `default` export es un throw). El gate E2E de
// facturación importa el motor real (`@/lib/invoicing` → `@/lib/supabase/admin`, que hace
// `import 'server-only'`), así que en vitest aliasamos `server-only` a este no-op.
export {}
