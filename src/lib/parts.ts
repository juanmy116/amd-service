/**
 * Catálogo fijo de piezas (espejo de la tabla `public.parts`).
 *
 * Fuente única de verdad en el cliente: los formularios del técnico
 * (intervención de incidencias y visita de mantenimiento) y las server
 * actions importan esta lista en lugar de duplicarla. Los `id` deben
 * coincidir EXACTAMENTE con `parts.id` en la base de datos.
 *
 * Al añadir una pieza: insertarla en la tabla `parts` vía migración con su
 * id explícito y reflejarla aquí con el mismo id.
 */
export const PARTS = [
  { id: 1,  name: 'Four'             },
  { id: 2,  name: 'Transfer Belt'    },
  { id: 3,  name: 'Tambour BK'       },
  { id: 4,  name: 'Tambour C'        },
  { id: 5,  name: 'Tambour M'        },
  { id: 6,  name: 'Tambour Y'        },
  { id: 7,  name: 'Toner BK'         },
  { id: 8,  name: 'Toner C'          },
  { id: 9,  name: 'Toner M'          },
  { id: 10, name: 'Toner Y'          },
  { id: 11, name: 'Cassette'         },
  { id: 12, name: 'Rouleau Pression' },
  { id: 13, name: 'ADF'              },
  { id: 14, name: 'Poubelle Transfer' },
] as const
