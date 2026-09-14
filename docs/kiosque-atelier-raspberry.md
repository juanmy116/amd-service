# Kiosko del taller — Raspberry Pi 3 con DietPi

> Cómo dejar la Raspberry mostrando `/atelier` a pantalla completa, arrancando sola y con el
> aviso sonoro funcionando. Escrito el 2026-09-14, tras formatear la Raspberry.
>
> ⚠️ **Estos pasos no se han ejecutado todavía en la Raspberry de AMD.** Están verificados contra
> la documentación oficial de DietPi, pero la primera instalación conviene hacerla con calma y
> corregir aquí lo que no cuadre. Si algo falla, anótalo en este mismo fichero.

---

## Por qué DietPi y no otra cosa

La Pi 3 tiene **1 GB de memoria** y Chromium se la come. DietPi instala solo lo imprescindible
—sin escritorio, sin menús, sin programas de más—, así que esa memoria se la queda el navegador.
Con Raspberry Pi OS con escritorio también funciona, pero se pierden 250-300 MB para nada.

Descartado **Anthias/Screenly**: están pensadas para carteles que pasan imágenes solos, y este
kiosko es **interactivo** (el despachador hace clic en burbujas y tarjetas).

---

## 1. Grabar la tarjeta

> **DietPi ES el sistema operativo, no un programa que se instala encima.** No hay que poner
> primero Raspberry Pi OS: se graba la imagen de DietPi en la microSD y sustituye a todo lo que
> hubiera. Comparte los cimientos de Raspberry Pi OS, pero viene sin escritorio ni extras, que es
> justo lo que buscamos en una Pi 3 de 1 GB.


1. Descargar la imagen de DietPi para **Raspberry Pi (ARMv8, 64 bits)**: https://dietpi.com/#download
2. Grabarla con Raspberry Pi Imager o balenaEtcher en una microSD (clase 10, 16 GB o más).
3. **Si va por wifi**, antes de sacar la tarjeta del ordenador, editar en la partición `boot`:
   - `dietpi-wifi.txt` → `aWIFI_SSID[0]='NombreDeLaRed'` y `aWIFI_KEY[0]='contraseña'`
   - `dietpi.txt` → `AUTO_SETUP_NET_WIFI_ENABLED=1`

   Por cable no hace falta tocar nada. **El cable es más fiable para un kiosko**: si el wifi del
   taller se cae, la pantalla se queda en blanco.

---

## 2. Primer arranque

Conectar la Raspberry a la TV, teclado y red, y encender. Entrar con el usuario `root` y la
contraseña inicial `dietpi`.

El sistema se actualiza solo la primera vez (tarda). Después:

```bash
dietpi-config
```

Dejar configurado:

- **Security Options** → cambiar la contraseña de `root` y de `dietpi` (la de fábrica la conoce
  todo el mundo, y esta máquina va a tener la sesión de AMD abierta).
- **Display Options** → **Screen blanking: off**. Sin esto la TV se queda negra a los 10 minutos.
- **Language/Regional Options** → zona horaria **Africa/Dakar**. Importa: el kiosko marca
  «il y a 3 j» y agrupa los mantenimientos por día.
- **Network Options** → si es wifi, marcar que no se apague por ahorro de energía.

---

## 3. Instalar el navegador en modo kiosko

```bash
dietpi-software install 113      # Chromium
dietpi-autostart                 # elegir: 11 : Chromium - Dedicated use without desktop
```

Al elegir la opción 11 pide la **dirección web**. Poner la del kiosko:

```
https://amd-service.vercel.app/atelier
```

Reiniciar (`reboot`) y debería arrancar solo en el navegador, a pantalla completa.

---

## 4. Ajustes propios de este kiosko

Toda la configuración vive en un único archivo:

```bash
nano /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
```

Buscar la línea que define `CHROMIUM_OPTS` y **añadir**:

```sh
--autoplay-policy=no-user-gesture-required \
--no-first-run \
--disable-session-crashed-bubble \
--disable-infobars \
--password-store=basic \
--check-for-update-interval=604800
```

Qué hace cada una, por orden de importancia:

| Opción | Para qué |
|---|---|
| `--autoplay-policy=no-user-gesture-required` | **La campana de avería nueva.** Sin esto el navegador no deja sonar nada hasta que alguien toca el ratón, y el kiosko arranca solo |
| `--disable-session-crashed-bubble` | Que no salga «Chromium no se cerró correctamente» tapando la pantalla tras un corte de luz |
| `--password-store=basic` | Evita que pida una contraseña de «llavero» al arrancar sin escritorio |
| `--no-first-run` · `--disable-infobars` | Quitan carteles de bienvenida y avisos |
| `--check-for-update-interval` | Que no se ponga a buscar actualizaciones en mitad del día |

> **No usar `-nocursor`.** Se ve en muchos tutoriales, pero esconde el ratón *siempre* y aquí el
> despachador lo necesita. Para que el puntero desaparezca solo cuando nadie lo mueve:
>
> ```bash
> apt install -y unclutter
> ```
> y añadir `unclutter -idle 5 &` dentro del mismo script, antes de la línea que lanza Chromium.

---

## 5. Dejar la sesión iniciada

La primera vez hay que entrar a mano en la TV con la cuenta del kiosko:

- **Usuario:** `savamdservice@gmail.com` (perfil «Atelier»: técnico con permiso de despachador)
- **Contraseña:** la que tenga AMD guardada

Chromium guarda la sesión en su perfil, así que a partir de ahí arranca ya dentro. **No usar
modo incógnito** ni borrar el perfil, o habrá que escribir la contraseña cada mañana.

---

## 6. Reinicio nocturno

Una página abierta semanas, refrescándose cada 30 segundos, acaba comiendo memoria; en una Pi 3
eso termina en pantalla congelada. Reinicio a las 4 de la mañana:

```bash
crontab -e
```

```cron
0 4 * * * /sbin/reboot
```

---

## 7. Comprobar que quedó bien

- [ ] Se enciende la Raspberry y aparece el kiosko **sin tocar nada**.
- [ ] Se ve el mapa de Dakar con sus burbujas (si no, la red o la sesión fallan).
- [ ] Al hacer clic en una burbuja se filtran las dos columnas.
- [ ] **La campana suena**: pedir a alguien que abra una incidencia de prueba desde el portal, o
      escanear el QR de una máquina. Debe sonar y salir el cartel rojo en menos de 30 segundos.
      Si aparece el botón «Activer le son», es que falta la opción del punto 4.
- [ ] A los 10 minutos la pantalla **no** se apaga.
- [ ] Desenchufar y volver a enchufar: arranca solo otra vez.

---

## Problemas típicos

| Síntoma | Causa casi segura |
|---|---|
| Pantalla negra a los minutos | Falta apagar el *screen blanking* (paso 2) |
| Pide la contraseña cada mañana | El perfil de Chromium se borra, o arranca en incógnito (paso 5) |
| No suena la campana, sale «Activer le son» | Falta `--autoplay-policy` (paso 4) |
| Las horas y los días no cuadran | Zona horaria distinta de Africa/Dakar (paso 2) |
| Va lento a los días | Falta el reinicio nocturno (paso 6) |
| Sale «Chromium no se cerró correctamente» | Falta `--disable-session-crashed-bubble` (paso 4) |

---

## Fuentes

- [DietPi — entornos gráficos y modo kiosko](https://dietpi.com/docs/software/desktop/)
- [Lista de opciones de línea de comandos de Chromium](https://peter.sh/experiments/chromium-command-line-switches/)
- [DietPi — mejoras para kioskos en Raspberry (foro)](https://dietpi.com/forum/t/non-interactive-rpi-kiosk-improvements/14886)
