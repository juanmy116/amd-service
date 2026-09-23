# App de técnicos como PWA (iPhone) — Diseño

> **Fecha:** 2026-09-22 · **Estado:** diseño validado con el usuario, pendiente de plan por fase.
> **Por qué:** si la app de los técnicos (`/tech`) es incómoda, no la usarán y volverán al
> WhatsApp. Casi todos tienen iPhone. Queremos que se sienta como una app profesional **sin
> publicar en la App Store**: una PWA instalada desde Safari.

---

## 1. Punto de partida (verificado en el código)

- `/tech` **no es una PWA**: no hay `manifest`, ni icono de app, ni service worker. En el iPhone es
  una página web más.
- Logo disponible: `public/images/logos/logo-amd.png` y `logo-amd-blanco.svg`.
- **Nadie avisa al técnico** cuando se le asigna algo. Se asigna desde 4 sitios
  (`src/app/atelier/actions.ts` — kiosko —, ficha de avería, kanban, alta de avería) y ninguno
  notifica. La plantilla `ticket_assigned` de `send-email` existe pero no se usa y va dirigida al
  cliente.
- Ubicaciones: `clients` tiene `adresse` + `quartier_code`; `quartiers` tiene `lat/lng` (mapa del
  kiosko). **Ninguna máquina ni cliente tiene coordenadas exactas.**
- CSP (`next.config.ts`): `default-src 'self'` ⇒ cubre `worker-src` y `manifest-src` sin tocarla.
- `src/proxy.ts` solo exige sesión en `/admin`, `/portal`, `/tech`, `/atelier`: `manifest.webmanifest`
  y `sw.js` viven en `/` y se sirven sin login (necesario: iOS los descarga sin cookies).
- Sesión: cookies de `@supabase/ssr` con caducidad larga; el técnico ya no sale salvo si cierra
  sesión. **Gotcha iOS:** la app instalada no comparte cookies con Safari ⇒ tras instalar hay que
  iniciar sesión **una vez** más.

## 2. Decisiones del usuario

| Tema | Decisión |
|---|---|
| Nombre bajo el icono | **AMD SAV** |
| Icono | Logo AMD **blanco sobre rojo `#BF0D0D`** |
| Instalación | **El usuario, en persona**, con cada técnico (5 min: instalar + activar avisos) |
| Destinatarios de avisos | **Solo técnicos** (la oficina ya tiene kiosko + panel) |
| Eventos que avisan | Avería asignada · Mantenimiento asignado · Tarea retirada (al técnico que la pierde) |
| Horario | **Siempre, al instante** (sin franja silenciosa) |
| Contenido en pantalla bloqueada | Cliente + barrio + problema |
| Sin permiso de ubicación / sin GPS | **Deja seguir, marca 🟡** (mismo criterio que el QR del verrou) |
| Ubicación exacta | **Por máquina** (un cliente puede tener varias sedes) |
| Captura de la ubicación | **Automática al primer escaneo** del QR; el admin puede corregirla |
| Botón «Itinéraire» | Menú: Google Maps / Waze / Plans |
| Orden de la lista | **Urgencia** por defecto + botón «Plus proche» |
| Sin cobertura | **Solo lectura**: ver lista y fichas ya descargadas |
| Sesión | Sin caducidad salvo cierre de sesión |

**Fuera de alcance (YAGNI):** seguimiento en tiempo real, informes sin conexión, avisos a la
oficina, resumen matinal, franja horaria silenciosa, App Store. Todo se puede añadir después sin
rehacer lo anterior.

## 3. Fases

Cada fase = su propio PR, probado en un iPhone real antes de empezar la siguiente.

### Fase 1 — App instalable

- `src/app/manifest.ts` (convención de Next): `name: "AMD SAV"`, `short_name: "AMD SAV"`,
  `start_url: "/tech"`, `scope: "/"`, `display: "standalone"`, `theme_color` y
  `background_color` rojo corporativo, iconos 192/512 + `maskable`.
- Iconos generados a partir de `logo-amd-blanco.svg` sobre fondo `#BF0D0D` (script con `sharp`,
  ya es dependencia): `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` (180×180, **sin transparencia**: iOS pinta el fondo de negro).
- Metadatos iOS en el layout raíz: `appleWebApp: { capable, title: "AMD SAV",
  statusBarStyle }`, `themeColor` vía `viewport`.
- Respeto de las zonas seguras del iPhone (`env(safe-area-inset-*)`) en la barra inferior
  (`tech-nav`) y en el botón flotante de escaneo, que hoy asumen un navegador con barra propia.
- **Tarjeta «Installer l'application»** en `/tech`: se muestra solo si el iPhone NO está en modo
  instalado (`navigator.standalone` / `display-mode: standalone`), con los 3 pasos ilustrados
  (Partager → Sur l'écran d'accueil → Ajouter). Se puede cerrar (recordado en `localStorage`).
- Service worker **mínimo** (`public/sw.js`) registrado solo en `/tech`: en esta fase no cachea
  nada; existe para que la Fase 2 (push) y la 4 (offline) se apoyen en él.

**Criterio de hecho:** en un iPhone, «Añadir a pantalla de inicio» deja el icono rojo «AMD SAV»,
abre a pantalla completa en `/tech`, sin barras de Safari y sin contenido tapado por la muesca ni
la barra de gestos.

### Fase 2 — Notificaciones push

> **Refinamiento sobre este diseño (implementación, 2026-09-24):** en vez de llamar a `send-push`
> directamente desde el trigger, el trigger **encola** en `push_notifications` (que es a la vez el
> registro de lo enviado) y solo da un «toque» no bloqueante a la Edge Function vía `pg_net`, con
> la URL y el secreto leídos de **Vault** — si no están (CI, local, o antes del runbook en prod) no
> llama a nada y la fila queda `pending`. Un cron de 1 minuto es la red de seguridad: reintenta lo
> pendiente, da por fallido lo que agotó sus 3 intentos, caduca lo que lleva > 1 h sin sentido y
> purga historial viejo. Por qué cola y no llamada directa: (1) nada se pierde si `send-push` falla
> o tarda — la fila queda y el cron reintenta; (2) todo aviso queda registrado con su estado, no
> solo los que salieron bien — lección de Princity/Matrix, que fallaban en silencio; (3) el toque
> exige un secreto de Vault, así que `send-push` no es un endpoint público que alguien pueda usar
> para bombardear a los técnicos; (4) en CI la BD local nunca llama a producción. Detalle completo
> del flujo, tablas, estados y runbook: `docs/architecture.md` §«Notificaciones push (Fase 2)».

**Requisitos iOS:** iOS ≥ 16.4, app **instalada**, y el permiso se pide **tras un toque** del
usuario (botón). No hay sonido propio.

- **Tabla `push_subscriptions`**: `id`, `user_id` → `profiles`, `endpoint` (único), `p256dh`,
  `auth`, `user_agent`, `created_at`, `last_success_at`, `last_error`, `disabled_at`.
  RLS: el técnico gestiona **solo las suyas**; admin lee (para ver quién tiene avisos activos).
- **Botón «Activer les notifications»** en `/tech` (visible si la app está instalada y el permiso no
  está concedido). Suscribe con la clave pública VAPID y guarda la suscripción vía Server Action.
- **Disparo en la base de datos (decisión técnica):** triggers `AFTER UPDATE OF assigned_to` (y
  `AFTER INSERT` con `assigned_to` no nulo) en `incidents` y `maintenance_visits` → `pg_net` →
  Edge Function **`send-push`**. Así cubre los 4 sitios que asignan hoy y cualquiera futuro. La
  alternativa (llamar desde cada Server Action) se descartó: basta olvidar un sitio para que un
  aviso no salga nunca, sin error visible.
  - `NEW.assigned_to` distinto de nulo y de `OLD` ⇒ aviso «asignada» al nuevo.
  - `OLD.assigned_to` distinto de nulo y de `NEW` ⇒ aviso «retirée» al anterior.
- **Edge Function `send-push`**: firma VAPID, envía a todas las suscripciones activas del técnico.
  Respuesta `404/410` del servicio de Apple ⇒ `disabled_at` (el iPhone la dio de baja). Claves VAPID
  en secrets de Supabase.
- **Registro de envíos**: tabla `push_log` (destinatario, tipo, entidad, resultado, error). Un
  aviso que no sale **debe verse** — lección de Princity y Matrix (fallan en silencio).
- **Texto** (francés):
  - `Nouvelle panne — {client}, {quartier}` / cuerpo: `{title}`
  - `Maintenance assignée — {client}, {quartier}` / cuerpo: fecha prevista
  - `Tâche retirée — {client}` / cuerpo: `Réassignée à un autre technicien`
  - Al tocar ⇒ abre `/tech/incidents/{id}` o la visita correspondiente.
- **En el admin**: en `/admin/team`, indicador «🔔 avisos activos / ⚪ sin activar» por
  técnico.

### Fase 3 — Geolocalización

> **Implementada el 2026-09-25** (plan `docs/superpowers/plans/2026-09-23-pwa-tecnicos-fase3-geo.md`,
> migración `20260925100000`). Detalle real en `docs/architecture.md` §3d. Decisiones del usuario
> del 23/09, al planear el detalle de esta fase:
> - Arreglar de paso el falso «QR vérifié» de los mantenimientos (`close_maintenance_visit` ponía
>   `qr_verified = true` a ciegas en todo cierre — ver histórico en `docs/pendientes.md`).
> - Si el técnico aparece lejos de la máquina al resolver/cerrar, **no se le avisa** — solo queda
>   registrado para que la oficina lo vea si quiere.
> - **«Plus proche»** se pidió tanto en la lista de averías (`/tech/incidents`) como en
>   `/tech/planning`, no solo en una de las dos.
>
> Dos refinamientos sobre lo descrito abajo, hechos durante la implementación:
> - **Veredicto `imprecise`.** El diseño original solo preveía 🟢 `near` / 🟡 `far` por el umbral de
>   200 m. En la práctica un GPS impreciso (habitual en interiores en Dakar) puede decir «cerca» o
>   «lejos» sin que sea cierto. Se añadió un tercer veredicto: `near` exige además que la precisión
>   del GPS sea ≤ 150 m; `far` exige que la distancia siga siendo mayor que el umbral incluso
>   restando ese margen de error; lo que queda en medio es `imprecise` — igual de informativo que
>   `far` para la oficina (🟡), pero sin acusar de «lejos» a alguien que probablemente esté cerca.
> - **Trigger `guard_field_evidence`.** El diseño original no especificaba quién podía escribir la
>   posición del técnico ni el sello QR más allá de «lo guarda el servidor». Al implementarlo se vio
>   que, sin más, un técnico con su propia sesión podía hacer un `PATCH` a PostgREST y ponerse un
>   🟢 «sur place» él mismo (la RLS ya le permite actualizar sus propias averías/visitas). El
>   trigger fuerza que esas columnas —posición, distancia, veredicto y `qr_verified`/`qr_scanned_by`
>   — solo las escriba `service_role`; un usuario puede vaciarlas (lo que hace `clearResolution()`
>   al reabrir) pero nunca ponerlas, y reabrir una avería las vacía para cualquiera. Ver
>   `docs/architecture.md` §3d para el detalle completo.

- **Prerrequisito**: cambiar `Permissions-Policy` de `geolocation=()` a `geolocation=(self)` en
  `next.config.ts` — hoy bloquea la geolocalización en todo el sitio (trampa nº 2 detectada al
  planear la Fase 1).
- **Columnas en `machines`**: `lat`, `lng`, `location_accuracy_m`, `location_source`
  (`first_scan` | `admin`), `location_set_at`, `location_set_by`.
- **Columnas de presencia** en `incidents` (al resolver) y `maintenance_visits` (al cerrar):
  `tech_lat`, `tech_lng`, `tech_accuracy_m`, `tech_distance_m` (a la máquina, si tiene ubicación).
- **Captura**: al escanear el QR (`/tech/scan/[serie]`) y al cerrar, el móvil pide la posición
  (`getCurrentPosition`, alta precisión, timeout corto). Nunca bloquea:
  - Primer escaneo de una máquina sin ubicación ⇒ se guarda como su ubicación (`first_scan`).
  - 🟢 si la distancia ≤ umbral (**200 m**, margen para el GPS en edificios de Dakar).
  - 🟡 si está más lejos, si no dio permiso o si no hubo GPS a tiempo — la oficina ve el motivo.
- **Admin**: ficha de máquina muestra la ubicación en un enlace a mapa y permite
  «Corriger la position» (fijarla a mano con lat/lng o pegando un enlace de Google Maps).
- **«Itinéraire»** en la ficha de avería/visita del técnico: menú Google Maps / Waze / Plans.
  Con coordenadas ⇒ enlace directo; sin ellas ⇒ búsqueda por `adresse` + barrio + «Dakar».
- **«Plus proche»** en la lista del técnico: reordena por distancia a su posición actual. Máquinas
  sin coordenadas usan el centro de su barrio; sin barrio ⇒ al final. El orden por defecto sigue
  siendo por urgencia.
- Privacidad: la posición **se guarda solo** en esos dos momentos (escaneo y cierre). «Plus proche»
  la lee al pulsarlo y **no la guarda**. Nunca en segundo plano (iOS tampoco lo permite a una web).

### Fase 4 — Uso con mala cobertura (solo lectura)

- El service worker guarda la estructura de la app y las **últimas respuestas** de `/tech`, la
  lista y las fichas visitadas (red primero, caché si falla).
- Sin red: se muestra lo guardado con una franja «Hors ligne — données du {hora}».
- Acciones que escriben (informe, cierre, escaneo) se **deshabilitan** con el mensaje «Connexion
  requise». Nada se encola.
- **Nunca** se cachea nada fuera de `/tech` ni respuestas de otros usuarios (clave por usuario;
  se vacía al cerrar sesión).
- **El SW se registra con `scope: '/tech'`** (Fase 1, corregido en revisión de código): no
  controla `/admin`, `/atelier`/kiosko ni `/portal`, solo `/tech`. Aun así, cualquier handler de
  `fetch`/caché que se añada aquí debe seguir sin cachear respuestas de otro usuario (clave por
  usuario, se vacía al cerrar sesión).

## 4. Pruebas

- **Unitarias (vitest)**: armado del texto de cada aviso; decisión asignada/retirada según
  `OLD`/`NEW`; cálculo de distancia y semáforo 🟢/🟡; construcción de enlaces de itinerario;
  orden «Plus proche».
- **RLS (`npm run test:rls`)**: un técnico no ve ni borra las suscripciones de otro; no puede
  escribir la ubicación de una máquina salvo por el camino previsto; admin lee todo.
- **Trigger**: asignar / reasignar / desasignar en `incidents` y `maintenance_visits` genera las
  filas esperadas en `push_log`.
- **Manual en iPhone real**, al final de cada fase, con la checklist del criterio de hecho.

## 5. Riesgos conocidos

- iOS puede **dar de baja** una suscripción sin avisar (reinstalar la app, borrar datos). Mitigado
  con `disabled_at` + indicador en el admin + el técnico puede reactivar con el botón.
- Técnicos con iOS < 16.4 no recibirán avisos: comprobarlo al instalar.
- Android (minoría) funciona igual o mejor; no requiere trabajo aparte.
- La cuenta de pruebas `testsav` sigue existiendo (pendiente nº 5): útil para probar, **borrarla
  al terminar**.
