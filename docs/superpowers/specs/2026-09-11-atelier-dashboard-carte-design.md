# Dashboard Atelier — 4 columnas con mapa de Dakar

> Fecha: 2026-09-11 · Estado: diseño validado, pendiente de plan de implementación
> Afecta a: `/atelier` (kiosko TV del taller), `/admin/clients`, `/admin/machines`

---

## 1. Qué se quiere

El kiosko `/atelier` (TV 32" + Raspberry Pi 3, manejado con **ratón**) pasa de ser un kanban a **cuatro columnas**:

| Columna | Ancho | Contenido |
|---|---|---|
| 1 | 1/4 | **Pannes** — lista de incidencias vivas, la más antigua arriba |
| 2-3 | 2/4 | **Carte** — mapa de Dakar con los avisos geolocalizados por barrio |
| 4 | 1/4 | **Maintenances** — visitas de los próximos 7 días + atrasadas |

El kanban con arrastrar y soltar **no se pierde**: se traslada tal cual a `/atelier/kanban`, con un botón en la cabecera para alternar entre las dos vistas.

### Por qué por barrio y no por dirección exacta

De los 68 clientes activos, 63 están en Dakar. No hay coordenadas en la base de datos, y geocodificar direcciones senegalesas ("RUE 3 BIS X BOULEVARD DE L'EST POINT E") es poco fiable. Con la ubicación a nivel de **quartier** se cubre la necesidad real del despachador —saber dónde se acumula el trabajo y qué técnico cae cerca— sin depender de servicios externos.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Cabecera | Título + 4 indicadores en la misma línea, en pequeño y en color (`Sans technicien · En cours · Urgentes · Résolus cette semaine`) + reloj. Se elimina la banda de tarjetas KPI actual |
| Mapa | Dakar como vista principal; el resto de ciudades como *chips* debajo |
| Fondo del mapa | **Foto de satélite apagada** (oscurecida y desaturada), guardada como imagen dentro de la app. Sin Internet en tiempo de ejecución, sin servicios de pago |
| Precisión | Por **quartier** (barrio/zona), con coordenadas del centro de cada zona |
| Burbujas | Interactivas. Tamaño proporcional al número de avisos. Rojas = pannes, azules = maintenances |
| Pannes | Una sola lista, **la más antigua arriba**, con filtros `Toutes · Nouveau · Assigné · En cours`. **Sin las resueltas** |
| Tarjeta | Nº incidencia + tiempo esperando + título + cliente · quartier + técnico o «À assigner» + 📷 si hay foto |
| Detalle | Se abre **en el sitio del mapa**; las dos listas siguen visibles |
| Cambio de estado | Con botones grandes dentro de la ficha (se quita el arrastre en esta vista) |
| Kanban | Se conserva íntegro en `/atelier/kanban` |
| Maintenances | Próximos 7 días + atrasadas destacadas en rojo |
| Quartier del aviso | Del **cliente**, salvo que la **máquina** tenga uno propio (sede distinta) |
| Relleno inicial | **Automático** desde `adresse`, corregible a mano |
| Entregas | **Dos**: (1) datos de quartier, (2) dashboard + mapa |

---

## 3. Modelo de datos

### 3.1 Tabla nueva `quartiers`

Fuente de verdad del catálogo **y** de las coordenadas de pintado.

```sql
create table quartiers (
  code        text primary key,          -- 'plateau', 'point-e', 'mbour'
  label       text not null,             -- 'Plateau', 'Fann · Point E', 'Mbour'
  ville       text not null,             -- 'Dakar', 'Mbour', 'Thiès'
  lat         double precision not null,
  lng         double precision not null,
  sort_order  integer not null default 100,
  active      boolean not null default true
);
```

- **RLS:** lectura para `authenticated`; escritura solo `admin`. Se añaden los tests de aislamiento correspondientes (`npm run test:rls`).
- Añadir un quartier nuevo = un `insert`, sin desplegar código.

**Catálogo inicial (Dakar)** — centroides aproximados:

| code | label | lat | lng |
|---|---|---|---|
| `plateau` | Plateau · Centre-ville | 14.6690 | −17.4300 |
| `medina` | Médina · Gueule Tapée | 14.6800 | −17.4480 |
| `point-e` | Fann · Point E · Amitié | 14.6900 | −17.4640 |
| `mermoz` | Mermoz · Sacré-Cœur · Sipres | 14.7060 | −17.4720 |
| `liberte` | Liberté · Grand Dakar · HLM | 14.7080 | −17.4520 |
| `ouakam` | Ouakam · Mamelles | 14.7200 | −17.4900 |
| `almadies` | Almadies · Ngor | 14.7440 | −17.5140 |
| `yoff` | Yoff · Aéroport · Foire | 14.7480 | −17.4750 |
| `parcelles` | Parcelles Assainies · Cambérène | 14.7650 | −17.4400 |
| `hann` | Hann · Bel-Air · Port · Patte d'Oie | 14.7100 | −17.4270 |
| `pikine` | Pikine · Guédiawaye · Thiaroye | 14.7550 | −17.3950 |
| `keur-massar` | Keur Massar · Malika · Mbao | 14.7800 | −17.3200 |
| `rufisque` | Rufisque · Bargny | 14.7150 | −17.2700 |

**Otras ciudades:** `diamniadio` (14.7280 / −17.1830), `thies` (14.7910 / −16.9260), `mbour` (14.4200 / −16.9600), `diass` (14.6400 / −17.0700), `touba` (14.8500 / −15.8800), `kaolack` (14.1500 / −16.0700), `saint-louis` (16.0300 / −16.5000), `ziguinchor` (12.5800 / −16.2700).

> ⚠️ **A validar con AMD antes de implementar:** esta lista sale de las direcciones reales que hay en la base. Si falta algún barrio donde AMD tenga clientes, se añade aquí.

### 3.2 Columnas nuevas

```sql
alter table clients  add column quartier_code text references quartiers(code);
alter table machines add column quartier_code text references quartiers(code);
```

- `clients.quartier_code` — el normal.
- `machines.quartier_code` — **opcional**; solo se rellena si esa máquina está en una sede distinta a la del cliente.
- Regla de resolución (helper único `resolveQuartier`): `machine.quartier_code ?? client.quartier_code ?? null`.

### 3.3 Relleno automático

Migración con un `UPDATE ... CASE` sobre `adresse` (mismo diccionario probado contra la base real: 51/68 aciertos; ampliado con Plateau por calles —Pasteur, Vicens, Galandou Diouf, Bld de la République, Bld de la Libération, Abdou Karim Bourgi—, Gueule Tapée, Cambérène, Mbao, Grand Moulin/Port y Centenaire, sube a ~90 %).

Los que no encajen quedan a `null` y se ven con el filtro «sans quartier» del listado de clientes.

---

## 4. Interfaz de administración (entrega 1)

- **Ficha de cliente** (`/admin/clients/new` y `/admin/clients/[id]`): desplegable **Quartier** justo después del campo `adresse`, agrupado por ciudad. Obligatorio no; recomendado sí (aviso visual si está vacío).
- **Ficha de máquina**: desplegable **Quartier (si différent du client)**, vacío por defecto.
- **Listado de clientes**: columna `Quartier` + filtro rápido `Sans quartier` para cazar los pendientes.

---

## 5. El dashboard (entrega 2)

### 5.1 Estructura

```
┌──────────────────────────────────────────────────────────────────────┐
│ AMD · Atelier    ●3 sans technicien ●4 en cours ●1 urgente ●9 résolus │
│                                        [Vue carte][Vue kanban] 09:42 │
├────────────┬───────────────────────────────────────┬─────────────────┤
│ PANNES   7 │                                       │ MAINTENANCES  5 │
│ [Toutes]…  │            CARTE DE DAKAR             │                 │
│ ┌────────┐ │        (photo satellite atténuée      │ ┌─────────────┐ │
│ │ tarjeta│ │         + bulles par quartier)        │ │   tarjeta   │ │
│ └────────┘ │                                       │ └─────────────┘ │
│     ⋮      │  [Dakar 11][Mbour 2][Sans quartier 3] │        ⋮        │
└────────────┴───────────────────────────────────────┴─────────────────┘
```

Al abrir una ficha, el bloque central (mapa + chips) se sustituye por el detalle; las columnas 1 y 4 no se mueven.

### 5.2 Columna Pannes

- Incidencias con estado `nouveau`, `assigné`, `en_cours` (las `résolu` y `fermé` no aparecen; las resueltas siguen contando en el indicador de la cabecera).
- Orden: `created_at` **ascendente** (la que más lleva esperando, arriba).
- Filtros: `Toutes · Nouveau · Assigné · En cours`.
- Tarjeta: franja de color por estado a la izquierda; nº de incidencia; antigüedad (`il y a 40 min` / `il y a 3 j`, **en rojo a partir de 24 h**); título (2 líneas máx.); `cliente · quartier`; pie con técnico (iniciales + nombre) o **`À assigner`** en rojo; chip `URGENTE` si la prioridad lo es; 📷 si el cliente adjuntó foto.

### 5.3 Columna Maintenances

- Visitas cuyo `scheduled_date` cae entre hoy y hoy+7 días, **más** las que tienen fecha anterior a hoy y siguen sin hacer (atrasadas).
- Orden por fecha ascendente, con separador por día (`AUJOURD'HUI`, `DEMAIN`, `ven. 19`…) y un bloque **`EN RETARD`** en rojo al principio.
- Tarjeta: cliente · quartier, máquina, día, técnico o `À assigner`.

### 5.4 Mapa

- Imagen estática `public/images/atelier/dakar.jpg` (Esri World Imagery, tratada: brillo 0,72 · saturación 0,30 · velo azul `rgba(10,20,38,.5)`), con la atribución obligatoria en pequeño en una esquina.
- Encuadre: **Dakar + banlieue hasta Rufisque**. El `bbox` exacto se fija pidiendo la imagen con `f=json` y guardando el extent devuelto en `src/lib/atelier/mapFrame.ts` (el servicio ajusta el bbox al aspecto de la imagen, así que **no vale copiar el bbox pedido**).
- Conversión de coordenadas a píxeles con **Web Mercator (EPSG:3857)**, función pura `latLngToPercent(lat, lng, frame)` → `{x%, y%}`, con test unitario contra puntos conocidos.
- Una burbuja **roja** (pannes) y otra **azul** (maintenances) por quartier, ligeramente desplazadas para no solaparse; diámetro entre 44 px y 88 px según el número; el número dentro. Etiqueta del barrio debajo.
- Chips inferiores: una por ciudad con avisos (`Dakar 11`, `Mbour 2`) más **`Sans quartier N`** para los avisos que no se pueden situar. Al pulsar una ciudad que no es Dakar, el mapa cambia a la imagen nacional `senegal.jpg` con las burbujas de esas ciudades.

### 5.5 Interacción

| Acción | Efecto |
|---|---|
| Clic en burbuja | Filtra **ambas** listas a ese quartier; la burbuja queda marcada; aparece un botón `Tout Dakar` para deshacer |
| Clic en chip de ciudad | Cambia el encuadre del mapa y filtra las listas a esa ciudad |
| Clic en tarjeta | Abre la ficha en el espacio del mapa; la tarjeta queda marcada en rojo en su columna |
| Cerrar ficha | Vuelve el mapa, se mantiene el filtro de quartier si lo había |
| 2 minutos sin tocar nada | Se deshacen filtros y ficha abierta: la TV vuelve sola a la vista general |

### 5.6 La ficha

Contenido: nº + antigüedad · título · `cliente · quartier · máquina (marca, modelo, nº serie)` · teléfono de contacto · descripción del cliente · foto adjunta (ampliable) · **asignar técnico** (botones con iniciales, el actual resaltado, `Désassigner` disponible) · **cambiar estado** (`Nouveau · Assigné · En cours · Résolu`).

Reglas ya existentes que se respetan: asignar un técnico a una incidencia `nouveau` la pasa automáticamente a `assigné` y escribe en `incident_history` (`assignIncidentAction`); el cambio de estado manual reutiliza `updateIncidentStatusAction` de `/admin/incidents`.

### 5.7 Refresco

- Se mantiene el `router.refresh()` cada 30 s, **pausado mientras la ficha está abierta o hay un filtro activo** (hoy un refresco a destiempo puede interrumpir al despachador).
- Tras cualquier acción (asignar, cambiar estado) se refresca inmediatamente.

---

## 6. Componentes

Entrega 1 — `src/lib/quartiers.ts` (tipos + `resolveQuartier`), desplegable `QuartierSelect`, migraciones.

Entrega 2 — reorganizar `src/components/atelier/`:

| Fichero | Responsabilidad |
|---|---|
| `AtelierHeader.tsx` | Título, indicadores en línea, reloj, conmutador de vista (se reescribe) |
| `PanneList.tsx` | Columna 1: filtros + lista ordenada |
| `PanneCard.tsx` | Tarjeta compacta de avería |
| `MaintenanceList.tsx` | Columna 4: bloques por día + retrasos |
| `AtelierMap.tsx` | Imagen, burbujas, chips, selección de zona |
| `mapFrame.ts` | `bbox` + `latLngToPercent` (pura, testeable) |
| `IncidentDetail.tsx` | Ficha central (sustituye a `AssignPanel` en esta vista) |
| `AtelierBoard.tsx` | Estado compartido: zona seleccionada, filtro, ficha abierta, auto-reset |
| `AtelierKanban.tsx` | **Sin cambios**, se mueve a `/atelier/kanban`, que hereda cabecera y auto-refresco y ofrece el botón `Vue carte` para volver |

`src/app/atelier/page.tsx` sigue siendo Server Component: consulta incidencias, visitas, técnicos y quartiers, resuelve la zona de cada aviso y agrega los conteos por zona antes de pintar.

> Detalle a cubrir en la consulta: una incidencia creada desde el QR público puede tener `contract_machine_id` nulo y `machine_id` directo. La resolución de cliente/quartier debe cubrir **las dos rutas**, o esos avisos caerán siempre en «Sans quartier».

---

## 7. Pruebas

- **Unitarias (vitest):** `latLngToPercent` con puntos conocidos; `resolveQuartier` (máquina > cliente > null); orden y filtrado de la lista de pannes; ventana de maintenances (atrasadas, hoy, +7 días, fuera de rango); diccionario de autorrelleno sobre una muestra de direcciones reales.
- **RLS:** tabla `quartiers` (lectura authenticated / escritura admin) y las columnas nuevas en `clients` y `machines`.
- **Manual en la TV real:** legibilidad a 4 metros, que el ratón acierte en las burbujas, y comportamiento del auto-reset a los 2 minutos.

---

## 8. Riesgos y decisiones abiertas

1. **Catálogo de quartiers** — pendiente de validación por AMD (§3.1).
2. **Licencia de la imagen** — Esri/Maxar exige atribución visible; se incluye. Si AMD prefiere evitar cualquier duda, la alternativa es una imagen de OpenStreetMap con su atribución.
3. **Zonas fuera del encuadre** — Diamniadio y el resto de ciudades no caben en el mapa de Dakar; se resuelven con los chips y la imagen nacional.
4. **Rendimiento en Raspberry Pi 3** — todo es imagen estática + CSS; sin librería de mapas ni tiles. Si aun así fuera justo, la palanca es bajar la resolución de la imagen.
5. **Sin datos no hay mapa** — hasta que la entrega 1 esté desplegada y las zonas rellenas, el mapa mostraría todo en «Sans quartier». Por eso van en este orden.
