# Plan — poner la web pública en `amd-service.com`

> Escrito el 2026-11-16. Objetivo: que la web pública de este proyecto (hoy solo visible en
> `amd-service.vercel.app`) sustituya al WordPress antiguo que sigue sirviendo `amd-service.com`.
> La web pública no se tocaba desde el 2026-05-12; todo el trabajo intermedio fue del SAV.

Dos frentes: **contenido y puesta a punto** (qué dice la web y si está completa) y **estilo
visual / UX** (cómo se ve y cómo se usa). El orden de las tandas evita trabajar dos veces: no se
pule el diseño de una sección cuyo texto o foto va a cambiar.

---

## Decisiones del usuario (2026-11-16)

| Tema | Decisión |
|---|---|
| Alcance del diseño | **Rediseño de la portada**; el resto de páginas se corrigen y unifican, sin rediseño |
| Cabecera de la portada | Se mantiene el **vídeo, con velo oscuro** detrás del texto e imagen fija mientras carga |
| Fotos | Usar **las fotos propias de AMD que ya hay** (`public/images/Photos/`); donde ninguna encaje, sin foto |
| «Cas d'usage» | **Ocultarla** (fuera del menú) hasta tener casos y cifras reales |
| Cobertura | **El servicio y los contratos son para todo Senegal, no solo Dakar.** Ningún texto debe limitar el servicio técnico a Dakar; Dakar queda solo como sede y dirección. Hecho el 2026-11-16 en todas las páginas incluida `/location`, que por decisión del usuario dice «à Dakar et partout au Sénégal» para no perder la búsqueda por «Dakar»; `/cases` no se toca (se oculta) |

---

## Tandas

| # | Tanda | Qué incluye | Depende de | Estado |
|---|---|---|---|---|
| 1 | **Arreglar lo roto** en las páginas interiores | Tabla de `/why` en móvil, menú en tabletas, formulario (nombres de campo visibles, foco), textos grises con poco contraste, casillas vacías de `/services` | Nadie | PR abierto (2026-11-16) |
| 2 | **Fotos y Cas d'usage** | Cambiar las fotos de banco (Unsplash) por las de AMD; quitar Cas d'usage del menú y del pie | Nadie | Pendiente |
| 3 | **Rediseño de la portada** | Primero una propuesta de estructura (secciones, orden, mensaje) con maqueta; se construye solo tras aprobarla. Incluye el vídeo con velo y el arreglo de la portada en blanco | Aprobación de la maqueta | Pendiente |
| 4 | **Mejoras comerciales** | WhatsApp y teléfono visibles arriba, un solo nombre para la acción principal, que el plan elegido llegue al formulario, menú más corto | Número de WhatsApp de AMD | Pendiente |
| 5 | **Textos coherentes** | Un único plazo de intervención, la frase del tóner, el precio de 25.000 FCFA, «Six services» | Datos confirmados por AMD | Pendiente |
| 6 | **Puesta a punto técnica** | Páginas legales, `sitemap.xml` y `robots.txt`, medición (GTM/GA4), títulos, imagen para compartir (`og.png`), redirecciones de las URL del WordPress, aligerar el vídeo | Textos legales e identificador de Google | Pendiente |
| 7 | **Cambio de dominio** | Apuntar `amd-service.com` a Vercel | Todo lo anterior | Pendiente |

Cada tanda va en su rama y su PR, siguiendo `docs/cambios-en-produccion.md` (son cambios de
tipo A: solo app, se deshacen con *Instant Rollback*). Los QR de las máquinas apuntan a
`amd-service.vercel.app`, que seguirá funcionando tras el cambio de dominio.

### Datos que hay que pedir a AMD

1. Plazo de intervención real (uno solo) y si se garantiza por contrato.
2. Si el tóner se incluye siempre o según contrato.
3. Si el precio «25.000 FCFA /mois» del Pantum se puede publicar.
4. Número de WhatsApp comercial, dirección exacta y horarios.
5. Datos para las menciones legales (razón social, NINEA, registro de comercio).
6. Una foto real del Ricoh MP C3003 (hoy usa la misma imagen que el C2003: `copiers-2.png` y
   `copiers-3.png` son el mismo archivo).
7. Identificador de Google Tag Manager / GA4.

---

## Auditoría del 2026-11-16 (resumen)

Dos revisiones independientes sobre las 7 páginas en escritorio y móvil, más una lectura
comercial. Notas: diseño y experiencia de uso **20/32**; calidad técnica **9/20**.

**Lo que funciona:** el vídeo propio de la portada; `/location` (fotos propias, argumento
ordenado); el estilo de rejilla con línea fina y esquinas rectas, que `/services`, `/why`,
`/cases`, `/faq` y `/contact` cumplen sin desviaciones; el bloque «Ce qui se passe ensuite» de
`/contact`; sin desbordes laterales en móvil y sin errores de consola.

### Fallos graves

| Fallo | Dónde | Tanda |
|---|---|---|
| La portada sale **en blanco** con «reducir movimiento» o mientras carga el vídeo (6,1 MB): la sección del hero no tiene color de fondo y el titular es blanco | `src/app/(public)/page.tsx` (hero), `globals.css` (`.hero-video`) | 3 |
| El titular **no se lee** sobre el vídeo en parte de los fotogramas (sin velo) | Portada | 3 |
| La tabla «Achat direct vs AMD Service» se **corta en móvil** | `/why` | 1 ✅ |
| El menú se **rompe entre 768 y ~1150 px** (logo a 0 px, «Nous contacter» fuera) | `Navigation.tsx` | 1 ✅ |
| El formulario **no muestra el foco** ni tiene nombres de campo visibles | `ContactForm.tsx` | 1 ✅ |

### Credibilidad

- **Fotos de banco** con ejecutivos europeos en `/services`, `/why`, `/faq`, `/cases` y
  `/contact`, y la misma impresora de catálogo 4 veces. De las 10 fotos propias solo se usan 2. → tanda 2
- **«Nos solutions» y «Choisissez votre plan»** de la portada rompen `DESIGN.md` (esquinas
  redondeadas, sombras, gradientes, animaciones permanentes, dos rojos seguidos). → tanda 3
- **Incoherencias de texto:** el plazo de intervención en 4 versiones (<4h, <24h, 24h, «entre
  4h et 24h»); «Six services» con 4 mostrados; tóner «inclus sans limitation» en los planes y
  «selon le contrat» en la FAQ y en `/why`. → tanda 5
- **`/cases`:** casos anónimos con cifras sin validar (−35 %, <4h, −28 %). → tanda 2 (ocultar)
- Enlaces «Confidentialité» y «Mentions légales» del pie apuntan a `#`. → tanda 6

### Comercial

- Sin WhatsApp ni teléfono visibles arriba (el teléfono solo está en el pie).
- El botón del formulario dice «Envoyer mon message», no la acción prometida.
- «Je suis intéressé» en un plan lleva a `/contact` sin recordar qué plan era.
- El menú tiene 9 opciones; «Connexion» compite con «Nous contacter».
- La acción principal tiene 5 nombres (audit, diagnostic, devis, contactez-nous, je suis intéressé).

Todo esto es de la tanda 4.

### Deuda técnica anotada, sin tanda asignada

- **Colores escritos a mano:** 354 hex y 51 `rgba()` en 368 `style={{}}` de la web pública, y
  ningún uso de tokens. Las variables de `:root` en `globals.css` (`--bg-page`, `--red`…) no se
  usan. El azul oscuro del menú y del pie (`#0B1120`) no figura en la paleta de `DESIGN.md`.
- **Botones** definidos de varias formas (3 rellenos, 3 efectos al pasar el ratón), sin
  componente compartido. `RippleButton` navega con `router.push` en vez de ser un enlace.
- `PhotoFrame` recibe `credit` y no lo pinta; `ServiceCard` y los temas `dark` de `HeroStats` y
  `BenefitsList` no se usan.
- `alt` de los logos de clientes generado desde el nombre de archivo («logos%20clientes 02»).
- `PlanCards`: imágenes con `fill` sin `sizes` (se piden a 1920 px para un hueco de ~400).

### Sin comprobar

- El envío real del formulario (crearía un lead en producción).
- La velocidad de carga en una conexión lenta desde Dakar.
- iPhone real con Safari: las pruebas de móvil son en navegador emulado.

---

## Tanda 1 — qué cambió (2026-11-16)

- **Menú** (`Navigation.tsx`): la versión de escritorio entra a partir de `xl` (1280 px); por
  debajo, menú desplegable. Página activa en blanco y negrita con subrayado rojo (antes rojo
  sobre azul oscuro, ~2,9:1). Botón de 44 px con `aria-expanded`, cierre con Escape y
  `aria-current` en el enlace activo.
- **Tabla de `/why`:** en móvil, un bloque por criterio con las dos opciones lado a lado; la
  tabla se mantiene desde 640 px, con `caption` y `scope`.
- **Formulario** (`ContactForm.tsx`): nombres de campo visibles, `autocomplete`, foco visible
  (clase `.field` en `globals.css`), 16 px en móvil para que iOS no amplíe la página, y un
  mensaje de error que ofrece teléfono y correo.
- **Foco de teclado:** blanco dentro de `.focus-on-dark` (secciones rojas, menú, pie) y rojo en
  el resto; antes era rojo sobre rojo.
- **Contraste:** `#9CA3AF` → `#6B7280` en textos de las páginas interiores, etiquetas sobre
  rojo a 0,85 de opacidad, pie en `slate-400` (7,2:1).
- **`/services`:** las dos rejillas ya no dejan casillas vacías.
- **Menores:** «Dakar, Sénégal, Sénégal» corregido en el pie y en `/contact`; las respuestas
  cerradas de la FAQ ya no las lee un lector de pantalla (`inert`); enlace «Aller au contenu».

No se tocó la portada (`/`): va entera en la tanda 3.
