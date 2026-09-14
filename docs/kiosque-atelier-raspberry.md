# Kiosko del taller — Raspberry Pi 3 con DietPi

> Cómo dejar la Raspberry mostrando `/atelier` a pantalla completa, arrancando sola y con el
> aviso sonoro funcionando. Escrito el 2026-09-14, tras formatear la Raspberry.
>
> ✅ **Ejecutado sobre la Raspberry de AMD el 2026-09-14.** Los pasos son los que funcionaron de
> verdad, incluidos los tropiezos (ver «Lo que no salió a la primera» al final). Si en una
> reinstalación algo cambia, corrígelo aquí.

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
- *(El apagado automático de la pantalla NO se configura aquí: en este punto todavía no hay
  entorno gráfico. Se resuelve en el paso 4, dentro del script del navegador.)*
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

El script que trae DietPi arranca X y lanza Chromium en la misma línea, sin dejar hueco para
ejecutar nada más dentro de la sesión gráfica. Por eso se parte en dos: el autostart prepara las
opciones y un **script de sesión** hace lo que necesita X ya arrancado (que la pantalla no se
apague, ocultar el puntero) antes de abrir el navegador.

Todo el bloque siguiente se copia y pega de una vez por SSH:

```bash
apt install -y unclutter

cat > /var/lib/dietpi/dietpi-software/installed/amd-kiosk-session.sh <<'EOS'
#!/bin/dash
# Sesión gráfica del kiosko de AMD: prepara la pantalla y lanza el navegador.
xset s off
xset s noblank
xset -dpms
command -v unclutter >/dev/null && unclutter -idle 5 &
exec /usr/bin/chromium $CHROMIUM_OPTS "${URL:-https://amd-service.vercel.app/atelier}"
EOS

chmod +x /var/lib/dietpi/dietpi-software/installed/amd-kiosk-session.sh

cp /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh \
   /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh.original

cat > /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh <<'EOS'
#!/bin/dash
# Autostart del kiosko del taller de AMD (basado en el original de DietPi).
# Copia intacta del original en: chromium-autostart.sh.original

RES_X=$(sed -n '/^[[:blank:]]*SOFTWARE_CHROMIUM_RES_X=/{s/^[^=]*=//p;q}' /boot/dietpi.txt)
RES_Y=$(sed -n '/^[[:blank:]]*SOFTWARE_CHROMIUM_RES_Y=/{s/^[^=]*=//p;q}' /boot/dietpi.txt)

CHROMIUM_OPTS="--kiosk --window-size=${RES_X:-1280},${RES_Y:-720} --window-position=0,0"
CHROMIUM_OPTS="$CHROMIUM_OPTS --autoplay-policy=no-user-gesture-required"
CHROMIUM_OPTS="$CHROMIUM_OPTS --no-first-run --disable-infobars --disable-session-crashed-bubble"
CHROMIUM_OPTS="$CHROMIUM_OPTS --password-store=basic"
CHROMIUM_OPTS="$CHROMIUM_OPTS --check-for-update-interval=604800"

URL=$(sed -n '/^[[:blank:]]*SOFTWARE_CHROMIUM_AUTOSTART_URL=/{s/^[^=]*=//p;q}' /boot/dietpi.txt)

export CHROMIUM_OPTS URL

STARTX='xinit'
[ "$USER" = 'root' ] || STARTX='startx'

exec "$STARTX" /var/lib/dietpi/dietpi-software/installed/amd-kiosk-session.sh
EOS
```

Qué hace cada opción del navegador, por orden de importancia:

Qué hace cada una, por orden de importancia:

| Opción | Para qué |
|---|---|
| `--autoplay-policy=no-user-gesture-required` | **La campana de avería nueva.** Sin esto el navegador no deja sonar nada hasta que alguien toca el ratón, y el kiosko arranca solo |
| `--disable-session-crashed-bubble` | Que no salga «Chromium no se cerró correctamente» tapando la pantalla tras un corte de luz |
| `--password-store=basic` | Evita que pida una contraseña de «llavero» al arrancar sin escritorio |
| `--no-first-run` · `--disable-infobars` | Quitan carteles de bienvenida y avisos |
| `--check-for-update-interval` | Que no se ponga a buscar actualizaciones en mitad del día |

> Las tres líneas de `xset` del script de sesión son las que impiden que la TV se quede negra a
> los 10 minutos. En `dietpi-config` **no hay** opción de *screen blanking* mientras no exista
> entorno gráfico: esta es la forma que funciona en un kiosko.

> **No usar `-nocursor`.** Se ve en muchos tutoriales, pero esconde el ratón *siempre* y aquí el
> despachador lo necesita. Para que el puntero desaparezca solo cuando nadie lo mueve:
>
> ```bash
> apt install -y unclutter
> ```
> y añadir `unclutter -idle 5 &` dentro del mismo script, antes de la línea que lanza Chromium.

---

## 4-bis. Resolución

Son **dos cosas distintas** y hay que cuadrar las dos:

1. **La señal que manda la Raspberry**: `dietpi-config` → `Display Options` → resolución. En la
   TV de AMD: **1920×1080**.
2. **El tamaño con el que abre el navegador**, que DietPi guarda aparte y trae en 1280×720. Si no
   se cambia, el tablero sale pequeño con franjas negras alrededor aunque la pantalla esté bien:

```bash
sed -i 's/^[[:blank:]]*SOFTWARE_CHROMIUM_RES_X=.*/SOFTWARE_CHROMIUM_RES_X=1920/' /boot/dietpi.txt
sed -i 's/^[[:blank:]]*SOFTWARE_CHROMIUM_RES_Y=.*/SOFTWARE_CHROMIUM_RES_Y=1080/' /boot/dietpi.txt
grep -E "SOFTWARE_CHROMIUM_RES" /boot/dietpi.txt
reboot
```

Si **aún** quedan franjas negras, el recorte lo hace la propia TV (*overscan*): en su menú de
imagen hay que poner el tamaño en *Just Scan* (LG), *Ajuste a pantalla* (Samsung) o *1:1*. Eso no
se arregla desde la Raspberry. Como último recurso, `disable_overscan=1` en `/boot/config.txt`.

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
- [ ] A los 10 minutos sin tocar nada la pantalla **no** se apaga.
- [ ] Desenchufar y volver a enchufar: arranca solo otra vez.

---

## Lo que no salió a la primera (instalación del 2026-09-14)

- **«Screen blanking» no existe en `dietpi-config`** cuando aún no hay entorno gráfico. Se
  resuelve con `xset` dentro del script de sesión (paso 4).
- **El script de DietPi no deja ejecutar nada dentro de la sesión gráfica**: arranca X y lanza
  Chromium en la misma orden. De ahí el script de sesión aparte.
- **La pantalla salía con franjas negras** aunque la señal ya era 1920×1080: faltaba cambiar el
  tamaño de ventana del navegador en `/boot/dietpi.txt` (paso 4-bis).
- DietPi **no aparece en la lista** del Raspberry Pi Imager: hay que bajar la imagen de
  dietpi.com y usar «imagen personalizada», o balenaEtcher.

---

## Problemas típicos

| Síntoma | Causa casi segura |
|---|---|
| Pantalla negra a los minutos | Faltan las tres líneas de `xset` en el script (paso 4) |
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
