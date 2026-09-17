# Encuesta de satisfacción para las averías del QR + pantalla de opiniones

> Fecha: 2026-09-17 · Estado: diseño validado, pendiente de plan de implementación
> Afecta a: `/signaler/[serie]` (formulario público del QR), `src/lib/csat.ts`, Edge Function
> `send-email`, `/admin` (dashboard), `/admin/incidents/[id]`, `/admin/avis` (nueva),
> tabla `csat_responses`

---

## 1. Qué se quiere

Que **el cliente que abre una avería escaneando el QR reciba la encuesta de satisfacción** cuando el
técnico da la reparación por terminada, y que **AMD pueda leer lo que responde**.

Hoy no ocurre ninguna de las dos cosas, y no por un fallo: el sistema se diseñó para un portal de
clientes que todavía no existe.

### Punto de partida real (producción, 2026-09-17)

| Dato | Valor |
|---|---|
| Incidencias registradas | **4, todas del QR público** (3 dejaron email) |
| Encuestas enviadas, alguna vez | **0** |
| Clientes con cuenta de portal | **0** (de 68 activos) |

`sendCsatForIncident` (`src/lib/csat.ts`) se dispara bien —al pasar una incidencia a `résolu` desde
la PWA del técnico, el kanban de admin o el kiosko del taller— pero para llegar al envío tiene que
pasar tres puertas, y si falla una se calla sin dejar rastro:

1. la incidencia debe tener `contract_machine_id` → **las del QR nunca lo tienen** (van por
   `machine_id`), así que se descartan siempre;
2. ese cliente debe tener cuenta de portal (`client_profiles`) → **no hay ninguna**;
3. esa cuenta debe tener email.

El `contact_email` que el cliente deja en el formulario del QR **no se usa para nada**: se guarda en
`incidents.contact_email` y ahí muere.

Y hay un segundo agujero, independiente del primero: **el comentario de la encuesta no se muestra en
ningún sitio**. El dashboard usa solo `rating` (media + tendencia a 6 meses). Si un cliente escribe
«el técnico llegó tarde y no resolvió nada», hoy nadie lo lee jamás.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Email en el formulario del QR | **Obligatorio** (hoy opcional). Riesgo asumido y explícito: quien no tenga email a mano no puede avisar de la avería. Revertirlo es cambiar una línea |
| Validación | En el navegador **y en el servidor**: `required` se esquiva en dos clics |
| Destinatario de la encuesta | Cascada: `contact_email` → cuenta del portal → nadie (y se anota) |
| Prioridad del `contact_email` | Va **primero**, por delante de la cuenta del portal: es quien reportó la avería y quien vivió la intervención |
| Plantilla del email | Se mejora con los datos que ya hay: saludo por su nombre, referencia `SAV-AAAA-NNNN` y equipo en limpio. Fuera la jerga «Incident QR» |
| Una sola plantilla | La misma sirve para los dos caminos; si no hay nombre, se salta el saludo |
| Lectura del feedback | Página `/admin/avis` + nota en la ficha de la avería + franja de avisos negativos en el dashboard |
| Umbral de «aviso negativo» | **1 o 2 estrellas, últimos 7 días** |
| Estado «visto» de la franja | **No se crea.** La franja se va sola al cumplir 7 días esas opiniones. Un botón de «ya lo he visto» se acaba pulsando sin mirar (misma decisión que en el kiosko del taller, PR #137) |
| Trazabilidad del envío | Columnas nuevas `sent_to` y `sent_at` en `csat_responses` |
| Cierre automático | Se mantiene tal cual: si la encuesta sale, la incidencia pasa de `résolu` a `fermé` con entrada en el historial |

---

## 3. Las cinco piezas

### 3.1 Formulario del QR — el email pasa a obligatorio

`src/app/signaler/[serie]/form.tsx`: el campo `contact_email` pierde el `(optionnel)`, gana el
asterisco rojo y el atributo `required`, quedando como los otros dos obligatorios.

`src/app/signaler/[serie]/actions.ts` (`submitPublicIncident`): si `contact_email` llega vacío, se
devuelve error **antes** de insertar nada, con mensaje en francés («L'adresse email est
obligatoire.»). La validación de servidor no es decorativa: el `required` del navegador solo protege
del despiste, no de una petición hecha a mano.

El insert deja de tener el `contactEmail || null`: a partir de aquí una incidencia pública siempre
trae email.

> Las 4 incidencias públicas que ya existen **no se tocan**. La que no tiene email entra por la rama
> «sin destinatario» descrita abajo.

### 3.2 A quién se manda — cascada de destinatario

En `src/lib/csat.ts`, `sendCsatForIncident` se reordena así:

1. Lee la incidencia (ahora también `numero_incident`, `contact_name`, `contact_email`,
   `machine_id`).
2. **Destinatario:**
   - `contact_email` si lo hay → se usa;
   - si no, la cuenta del portal del cliente (`contract_machine_id` → `contracts.client_id` →
     `client_profiles.profile_id` → `auth.users.email`), exactamente como hoy;
   - si no hay ninguno → **no se envía**, y se deja constancia (§3.5).
3. **Se elimina el corte por `contract_machine_id`**: hoy ese `return` temprano mata todas las
   incidencias del QR, que son justo las que queremos cubrir.

La cascada vive en una función propia y exportada (`resolveCsatRecipient`), separada del envío, para
poder probarla sin tocar red ni base de datos.

### 3.3 El email

Plantilla `csat` de la Edge Function `supabase/functions/send-email/index.ts`. Mismo marco visual que
las otras tres plantillas (cabecera roja `#BF0D0D`, botón, pie). Datos nuevos: `contact_name`
(opcional), `numero_incident`, `machine_label`.

```
Asunto: Votre avis sur notre intervention — SAV-2026-0042

███ AMD Service ███

Bonjour Fatou Ndiaye,

Votre demande a été résolue.

  Référence    SAV-2026-0042
  Équipement   Ricoh MP-C3004 · V9314505033

Comment s'est passée notre intervention ?
Prenez 30 secondes pour évaluer notre service :

        [  Donner mon avis  ]

Ce lien est valable 7 jours.
```

Sin `contact_name`, el saludo desaparece y el resto queda igual. El equipo se compone de
`machines.marque`, `machines.modele` y `numero_serie`; si no se pudiera resolver, la línea
`Équipement` se omite en vez de imprimirse a medias.

⚠️ La Edge Function hay que **redesplegarla** (`supabase functions deploy send-email`): no viaja en
el despliegue de Vercel.

### 3.4 Dónde se lee el feedback

**a) Página nueva `/admin/avis`** — admin-only, patrón de los otros listados admin. Una fila por
opinión: estrellas, comentario, quién la dejó (`contact_name` + email, o el cliente del contrato),
la avería con enlace a su ficha, y la fecha en relativo. Filtro por nota (todas / ★≤2). Orden: la más
reciente arriba. Las que se enviaron pero nadie respondió **no salen** en la lista (son ruido); su
rastro está en `sent_at`.

Entra en la sidebar, grupo **Service**, junto a `Anomalies`.

**b) Ficha de la avería** (`/admin/incidents/[id]`) — bloque «Avis du client» con las estrellas y el
comentario, colocado junto al bloque «Contact» que ya existe. Solo aparece si hay respuesta.

**c) Dashboard** (`/admin`) — franja de aviso cuando hay opiniones de 1 o 2 estrellas en los últimos
7 días, con enlace a `/admin/avis`. Se replica el patrón exacto de la franja de anomalías que ya
existe en `src/app/admin/page.tsx` (`Link` + `Card` de tono `warning`), en tono `danger`.

### 3.5 Que no vuelva a fallar en silencio

Migración: dos columnas en `csat_responses`.

| Campo | Tipo | Notas |
|---|---|---|
| `sent_to` | text | nullable — dirección a la que se envió la encuesta |
| `sent_at` | timestamptz | nullable — cuándo se envió |

Con eso se puede responder «¿se le mandó la encuesta a este cliente, y a dónde?», que hoy es
imposible. Y cuando **no hay destinatario**, se inserta una línea en `incident_history` (sin cambio
de estado, `changed_by = null`, comentario «Enquête de satisfaction non envoyée — aucune adresse
email»), que es donde ya se registra el cierre automático y es visible en la ficha.

`csat_responses` mantiene su RLS actual: `admin_read_csat` (SELECT para admin). Las dos columnas no
cambian nada, porque las escribe el cliente de servicio.

---

## 4. Pruebas

- **Unitarias (vitest):** `resolveCsatRecipient` con sus cuatro casos — solo `contact_email`; solo
  cuenta de portal; los dos (gana `contact_email`); ninguno.
- **Unitarias:** validación de `submitPublicIncident` sin email → error, y **ninguna fila insertada**.
- **RLS:** no hace falta test nuevo — `tests/rls/admin-only-isolation.test.ts` ya cubre
  `csat_responses` (admin sí; técnico, cliente y anónimo no) y las columnas nuevas no cambian sus
  policies. Basta con que siga en verde.
- **Verificación manual antes de dar por buena la cadena:** abrir una avería de prueba desde el QR
  con un email real, marcarla `résolu`, comprobar que el correo llega, responder, y ver la opinión
  en `/admin/avis`, en la ficha y —si se puntúa con 1 o 2 estrellas— en la franja del dashboard.
  Esta prueba es la única que valida el recorrido completo; los tests no cubren el envío real.

---

## 5. Fuera de alcance (deliberado)

- Recordatorio a quien no responde a la encuesta.
- Aviso por email a AMD cuando entra una opinión negativa (hoy basta la franja del dashboard).
- Encuesta por WhatsApp o SMS, pese a que el teléfono es obligatorio y en Senegal se usa más.
- Crear cuentas de portal para los 68 clientes: es una decisión de fondo, aparte de esto.
- Tocar las 4 incidencias públicas ya existentes.

---

## 6. Alcance técnico

1 migración · 1 Edge Function a redesplegar · ~6 archivos tocados · 2 pantallas nuevas (una página y
un bloque) · 1 entrada de sidebar.
