@AGENTS.md

# AMD Service — SAV App · Instrucciones de Desarrollo

## Contexto del proyecto

Aplicación web para la gestión de incidencias (SAV) de AMD Service, empresa de alquiler de equipos de impresión en Dakar, Senegal. Este repositorio contiene tanto el sitio web público de AMD como la aplicación SAV completa.

**Documentación completa de arquitectura:** `./docs/architecture.md`  
**Guía comercial AMD:** `../docs/amd-service-guide.md`

---

## Estado actual del desarrollo

### ✅ Completado
- Schema de base de datos en Supabase (12 tablas, RLS activado)
- Arquitectura y decisiones técnicas documentadas
- Sitio web público AMD (páginas: home, services, cases, faq, contact, why)

### 🔄 En curso — Fase 1: SAV
- [ ] Paso 1: Instalar Supabase + configurar cliente (browser + server)
- [ ] Paso 2: Auth (email/password + Google OAuth, redirección por rol)
- [ ] Paso 3: Back-office AMD (clientes, máquinas, contratos, incidencias)
- [ ] Paso 4: Portal cliente
- [ ] Paso 5: PWA técnico + escáner QR
- [ ] Paso 6: Integraciones (Mailjet CSAT, agente Princity, Matrix)

### ⏳ Pendiente — Fase 2 y 3
Ver roadmap completo en `../docs/architecture.md`

---

## Entorno de desarrollo

**Estamos en LOCAL.** Al terminar, la app se desplegará en un VPS (Hostinger) con Docker + Traefik.

### Variables de entorno
Crear archivo `.env.local` en la raíz del proyecto `web-amd` con:

```
NEXT_PUBLIC_SUPABASE_URL=https://myyejbviunyvywfukysj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto AMD en Supabase>
SUPABASE_SERVICE_ROLE_KEY=<service role key — NUNCA exponer al cliente>
```

> Las claves se encuentran en el panel de Supabase → proyecto AMD → Settings → API.
> El archivo `.env.local` nunca se sube a git (está en .gitignore por defecto en Next.js).

### Para el VPS (producción)
Las mismas variables van en `docker-compose.yml` como variables de entorno del contenedor.
Google OAuth necesitará la URL de producción añadida en el panel de Google Cloud Console.

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

## Decisiones de diseño importantes

- **Variables de entorno siempre**, nunca hardcodear URLs ni claves
- **`send-email` Edge Function** encapsula el proveedor de email (Mailjet ahora, intercambiable después)
- **`service_role`** solo en servidor (Edge Functions, Server Actions) — nunca en el cliente
- **QR por máquina** codifica la URL `/tech/maquina/[numero_serie]`
- **Matrix/Synapse** para mensajería interna de técnicos y admins (se despliega en Docker en el VPS)
- **RLS** bloqueado hasta que se añadan políticas módulo a módulo
