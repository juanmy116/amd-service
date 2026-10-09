# Cómo hacemos cambios en producción

> Escrito el 2026-10-01, el día en que la app empieza a usarse de verdad (piloto con 2AS: etiquetas
> QR en las máquinas y la app en los iPhone de los técnicos). Desde hoy, un fallo ya no es un fallo
> de prueba: es un técnico parado delante de una máquina o un cliente cuya avería no llega.
>
> **Leer antes de cualquier cambio** — de código, de base de datos o de funciones de Supabase.
> Vale igual para una persona que para una sesión de Claude.

La idea en una frase: **cada cambio, pequeño, ensayado antes, fácil de deshacer y comprobado
después.**

---

## 1. Preparativos (una sola vez, antes del primer cambio con la app en uso)

| Hecho | Qué | Por qué |
|---|---|---|
| ☐ | **Supabase Free → Pro** | El plan gratuito **no hace copias de seguridad**. Sin copia, un cambio que estropee datos no tiene vuelta atrás. Pro guarda una copia diaria (7 días). |
| ✅ | **Arreglar que los tests E2E en local apuntan a producción** (`docs/pendientes.md`, fila 8) | HECHO (2026-10-09): `playwright.config.ts` se niega a arrancar si los tests no apuntan a un Supabase local (`tests/e2e/local-only.ts`), y la app que arranca para los tests usa esa misma base local en vez del `.env.local`. Para correrlos en el Mac: `supabase start` + `eval "$(supabase status -o env)"` + `npm run test:e2e`. |
| ☐ | **Decidir la «máquina de prueba» y la «cuenta de técnico de prueba»** | La comprobación del §5 necesita probar en prod sin ensuciar estadísticas ni molestar a un técnico real. La cuenta `testsav` se borró el 2026-10-01 porque tenía contraseña conocida: la nueva, con contraseña fuerte que solo conozca el responsable, y la máquina fuera de cualquier contrato. |
| ☐ | **Avisar a los técnicos**: «si veis algo raro en la app, WhatsApp a …» | En las primeras semanas ellos son el mejor sistema de alarma. |

---

## 2. Los tres tipos de cambio (no todos arriesgan lo mismo)

| Tipo | Ejemplos | Cómo llega a producción | Cómo se deshace | Riesgo |
|---|---|---|---|---|
| **A. App** (Next.js, Vercel) | pantallas, formularios, textos, lógica de servidor | PR → CI `typecheck · test · build` → merge a `main` → Vercel publica solo | **En un minuto:** Vercel → Deployments → versión anterior → *Instant Rollback* (en el plan gratuito, solo a la inmediatamente anterior) | 🟢 Bajo |
| **B. Base de datos** | migraciones, tablas, **reglas RLS**, funciones SQL, triggers, crons | `supabase db push` (lo lanza el usuario) | **No hay botón.** Hay que aplicar otra migración que haga lo contrario, o restaurar la copia diaria (que se lleva también todo lo ocurrido después) | 🔴 Alto |
| **C. Funciones de Supabase** (`supabase/functions/`) | `send-email`, `send-push`, Princity, `maintenance-cron` | `supabase functions deploy <nombre>` — **no** viaja con Vercel | Volver a publicar la versión anterior desde git | 🟠 Medio |

### ⚠️ Solo hay UNA base de datos

El único proyecto Supabase de AMD es `myyejbviunyvywfukysj`, y es **producción**. No hay base de
ensayo en la nube. Consecuencias:

- **El único sitio seguro para ensayar cambios de tipo B es la base local del Mac**
  (OrbStack + `supabase start`; ver memoria/README de tests RLS).
- **Las previews de Vercel no son un entorno de pruebas**: si se conectan a Supabase, es a la de
  producción. Lo que se haga en una preview (crear una avería, borrar algo) pasa en la base real.
  Además, la Deployment Protection de las previews impide probar la PWA en ellas.

---

## 3. Reglas para cualquier cambio

1. **Un cambio a la vez.** Si algo se rompe, se sabe exactamente qué fue. No juntar «ya que estoy».
2. **Rama + PR siempre.** `main` está protegida; nadie publica sin pasar el CI.
3. **El botón final lo pulsa el usuario** (merge, `db push`, deploy de funciones). Es una red de
   seguridad, no un trámite: es el momento de preguntarse «¿es buena hora?».
4. **Publicar cuando los técnicos no están en la calle**: tarde-noche o fin de semana. Nunca a
   media mañana, y **nunca justo antes de irse**: después de publicar hay que quedarse un rato
   mirando.
5. **Si toca base de datos Y app, la base de datos va primero, y en versión compatible.** Como
   cambiar una cerradura: primero una que abra con la llave vieja y con la nueva, luego se
   reparten las llaves nuevas (la app), y al final se retira la vieja. Nunca hay un momento en que
   nadie pueda entrar. En la práctica: añadir columnas/reglas que la app actual tolere → publicar
   la app nueva → en otro PR posterior, quitar lo viejo.
6. **Antes de un cambio de tipo B, escribir cómo se deshace** — la migración inversa, en el propio
   PR. Modelo: `docs/rollback-2026-09-11.md`.
7. **Después de publicar, la comprobación del §5.** Si falla algo, se deshace primero y se
   investiga después.

---

## 4. Paso a paso por tipo

### A. Cambio de app

1. Rama (`feat/`, `fix/`, `docs/`…), cambio pequeño, tests.
2. PR → CI en verde → revisión (`/code-review` si toca algo sensible).
3. Merge en buena hora (regla 4). Vercel publica en ~2 min.
4. Comprobación del §5 sobre lo que se tocó.
5. Si falla: *Instant Rollback* en Vercel y después revert del PR.

### B. Cambio de base de datos (migraciones, RLS — aquí van F2/F3/F8)

1. Escribir la migración **y su inversa**.
2. **Ensayar en local:** `supabase db reset --local` (aplica todo el historial desde cero, así se
   ve que la migración encaja) + `npm run test:rls` con las variables locales explícitas.
   Comprobar también que el test **falla** sin la migración (prueba de que el test mira lo
   correcto).
3. Preguntarse: **¿la app que está publicada ahora sigue funcionando con este cambio?** Si no,
   partir el cambio (regla 5).
4. PR → CI → revisión.
5. Antes del `db push`: comprobar en el panel de Supabase que **existe la copia de seguridad del
   día**.
6. `supabase db push` en buena hora (lo lanza el usuario).
7. **Justo después:** verificar en `pg_policies` / `pg_proc` que está lo esperado, y la
   comprobación del §5 **entrando con cada rol que el cambio afecte** (técnico, oficina, taller).
8. Si falla: aplicar la migración inversa ya escrita.

> **El riesgo típico de un parche RLS no es que entre un atacante: es que una regla demasiado
> estricta deje a un técnico sin ver sus propias averías.** Por eso el paso 7 es entrar como
> técnico de verdad, no solo leer la política.

### C. Función de Supabase

1. Cambio + tests (los módulos `_shared/` puros tienen tests en vitest).
2. PR → CI → merge.
3. Antes de publicar, **anotar el commit de la versión que hay ahora** (para poder volver).
4. `supabase functions deploy <nombre>` **con las mismas opciones de siempre** (p. ej. algunas
   llevan `--no-verify-jwt`; suele estar escrito en el comentario de cabecera de su `index.ts`, y
   algunas en `docs/architecture.md`). Una opción olvidada rompe la función sin que nada avise.
5. Probarla una vez de verdad (p. ej. un correo real, un aviso push real).
6. Si falla: `git checkout <commit anotado> -- supabase/functions/<nombre>` y volver a publicar.

---

## 5. Comprobación después de publicar (≈ 5 minutos)

Hacer **lo que toque el cambio**. Si el cambio toca el flujo de averías, la cadena entera:

- [ ] La web abre y se puede entrar como **oficina** (`/admin`).
- [ ] En el iPhone, la app **AMD SAV** abre y la sesión del técnico sigue dentro (`/tech`).
- [ ] Desde la app, **escanear la etiqueta de la máquina de prueba** → se abre su ficha.
- [ ] Desde un móvil **sin sesión**, escanear la misma etiqueta → sale el formulario de avería.
- [ ] Crear una avería de prueba → aparece en `/admin/incidents` y en la TV del taller.
- [ ] Asignarla al técnico de prueba → **llega el aviso push** al iPhone.
- [ ] Borrar la avería de prueba (ojo: si ya tiene encuesta, borrar antes la fila de
      `csat_responses`; el botón «Supprimer» no avisa si el borrado falla).

Si algo no cuadra: **deshacer primero** (§2, columna «cómo se deshace»), avisar a los técnicos si
les afecta, e investigar con calma después.

---

## 6. Si algo se rompe con técnicos trabajando

1. **Deshacer** — no intentar arreglar «en caliente» con un segundo cambio deprisa.
2. Avisar a los técnicos (WhatsApp) de que hay un problema y de cuándo vuelve.
3. Mientras tanto, las averías se pueden tomar por teléfono y meterlas a mano en `/admin`.
4. Investigar, arreglar con el procedimiento normal, y apuntar lo aprendido en
   `docs/pendientes.md` o en la memoria del proyecto.

---

## 7. Lo que vigila poco: fallos silenciosos

Varias veces algo **parecía funcionar y no hacía nada** (los crons de Princity, la encuesta que no
se enviaba nunca, el aviso de mantenimientos atrasados). Con la app en uso, el riesgo no es solo
romper algo al cambiarlo, sino que algo deje de funcionar sin que nadie se entere.

Idea para más adelante (no hecho): una revisión diaria automática del tipo «¿han entrado averías?
¿han salido los avisos push? ¿se han enviado las encuestas? ¿han respondido bien los crons?», que
avise si algo lleva días a cero o en error. Mientras no exista, mirar de vez en cuando
`push_notifications` (`status`, `error`) y `cron.job_run_details`.
