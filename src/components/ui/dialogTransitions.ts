// Transición común de las ventanas (Headless UI): fundido + escala. Entrada 200ms ease-out,
// salida 150ms ease-in, por el mismo camino. En Tailwind v4 `transition` ya incluye `scale`.
export const DIALOG_BACKDROP_TRANSITION =
  'transition-opacity duration-200 ease-out data-closed:opacity-0 data-leave:duration-150 data-leave:ease-in'

export const DIALOG_PANEL_TRANSITION =
  'transition duration-200 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:duration-150 data-leave:ease-in'
