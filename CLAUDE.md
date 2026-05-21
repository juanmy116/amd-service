@AGENTS.md

# AMD Service — SAV App · Instrucciones de Desarrollo

## Contexto del proyecto

Aplicación web para la gestión de incidencias (SAV) de AMD Service, empresa de alquiler de equipos de impresión en Dakar, Senegal. Este repositorio contiene tanto el sitio web público de AMD como la aplicación SAV completa.

**Documentación completa de arquitectura:** `./docs/architecture.md`  
**Guía comercial AMD:** `../docs/amd-service-guide.md`

---

## Estado actual del desarrollo

La app SAV está **completa y en producción** (`https://amd-service.vercel.app`). 15 PRs mergeados.

### ✅ Completado
- Sitio web público AMD + página `/location` (SEO Dakar)
- Back-office admin (`/admin`): clientes, máquinas, contratos, incidencias (Kanban), compteurs, maintenance, calendrier, équipe, Princity
- Portal cliente (`/portal`) y PWA técnico (`/tech`) con escáner QR
- Auth por rol, RLS, rate limiting, integraciones (Resend/CSAT, Princity API, Matrix)
- Búsqueda + filtros admin · `numero_incident` (SAV-YYYY-NNNN)

### 🔄 En curso — Rediseño UI "Híbrido"
Refresco visual de la app interna (presentación pura, sin cambios de lógica ni rutas).
- Fase 0 (sistema de diseño) ✅ · `/admin` bloques 1a (chrome) ✅, 1b (Dashboard) ✅, 1c (Listados) ✅
- Pendiente: `/admin` 1d (detalles/formularios), 1e (secundarias) · `/portal` · `/tech`
- Specs y planes en `docs/superpowers/`. Detalle en `docs/architecture.md`.

---

## Entorno de desarrollo

**Producción:** la app está desplegada en **Vercel** (`https://amd-service.vercel.app`), con Supabase cloud para BD y Edge Functions. El desarrollo se hace en local con `npm run dev`.

### Variables de entorno
Crear archivo `.env.local` en la raíz del proyecto `web-amd` con:

```
NEXT_PUBLIC_SUPABASE_URL=https://myyejbviunyvywfukysj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto AMD en Supabase>
SUPABASE_SECRET_KEY=<sb_secret_... — usada por createAdminClient y como Bearer hacia send-email>
```

> Las claves se encuentran en el panel de Supabase → proyecto AMD → Settings → API.
> El archivo `.env.local` nunca se sube a git (está en .gitignore por defecto en Next.js).

### Para producción (Vercel)
Las mismas variables se configuran en Vercel → Settings → Environment Variables (entorno *Production*).
Google OAuth necesita la URL de producción añadida en el panel de Google Cloud Console.

---

## Estructura de rutas

```
/                    → sitio web público AMD (ya existe)
/login               → auth compartida (todos los roles)
/admin/*             → back-office AMD (rol: admin)
/portal/*            → portal cliente (rol: client)
/tech/*              → PWA técnico (rol: technician)
/csat/[token]        → encuesta satisfacción (pública, sin auth)
```

## Protección de rutas
El middleware de Next.js (`src/middleware.ts`) redirige según el rol del usuario:
- Sin sesión → `/login`
- `admin` → `/admin`
- `technician` → `/tech`
- `client` → `/portal`

---

## Stack

- **Next.js 16** con App Router y TypeScript
- **Tailwind CSS v4**
- **Supabase** (auth + base de datos + storage)
- **`@supabase/supabase-js`** + **`@supabase/ssr`** para la integración con Next.js
- **framer-motion** + **lucide-react** (ya instalados)
- **Colores corporativos AMD:** rojo `#BF0D0D`

---

## Supabase — Referencia rápida

| Dato | Valor |
|---|---|
| Project ID | `myyejbviunyvywfukysj` |
| Host | `db.myyejbviunyvywfukysj.supabase.co` |
| Región | us-east-2 |
| URL | `https://myyejbviunyvywfukysj.supabase.co` |

### Tablas principales
`profiles` · `clients` · `machines` · `contracts` · `client_profiles` · `incidents` · `parts` · `incident_parts` · `incident_photos` · `incident_history` · `csat_responses` · `princity_alerts`

### Roles de usuario
- `admin` — administrador AMD, acceso total
- `technician` — técnico AMD, acceso a su PWA de campo
- `client` — cliente externo, acceso solo a su portal

---

## Flujo de trabajo con Git y GitHub

**Regla:** Nunca trabajar directamente en `main`. Siempre usar ramas.

```bash
# 1. Antes de empezar cualquier tarea
git checkout main && git pull

# 2. Crear rama (usar prefijos: feat/, fix/, docs/, refactor/)
git checkout -b feat/nombre-descriptivo

# 3. Commits frecuentes mientras trabajas
git add <archivos>
git commit -m "feat: descripción del cambio"

# 4. Subir y abrir PR
git push origin feat/nombre-descriptivo
gh pr create --title "Título" --body "Qué hace y por qué"

# 5. Revisar con Claude antes de mergear
# /code-review <número-PR>

# 6. Mergear cuando esté aprobado
gh pr merge <número> --merge --delete-branch
```

**Nomenclatura de ramas:**
- `feat/` — nueva funcionalidad
- `fix/` — corrección de bug
- `docs/` — solo documentación
- `refactor/` — cambios sin nueva funcionalidad

---

## Decisiones de diseño importantes

- **Variables de entorno siempre**, nunca hardcodear URLs ni claves
- **`send-email` Edge Function** encapsula el proveedor de email (Mailjet ahora, intercambiable después)
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca en el cliente
- **QR por máquina** codifica la URL `/tech/maquina/[numero_serie]`
- **Matrix/Synapse** para mensajería interna de técnicos y admins (se despliega en Docker en el VPS)
- **RLS** bloqueado hasta que se añadan políticas módulo a módulo
