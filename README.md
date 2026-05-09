# Web AMD

Proyecto web en Next.js para AMD.

## Estructura

```txt
web-amd/
  public/              Assets estaticos servidos por Next
  src/app/             Paginas y layout de la App Router
  src/components/      Componentes reutilizables
  src/lib/             Datos y utilidades compartidas
  next.config.ts       Configuracion de Next para dev y VPS
  postcss.config.mjs   Pipeline CSS/Tailwind
```

La carpeta desplegable es esta: `web-amd`. La carpeta superior `Web AMD Codex` solo agrupa documentacion y herramientas; no debe usarse como raiz de `npm`.

## Desarrollo local

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
npm install
npm run dev -- -p 3001
```

El script `dev` usa Webpack para evitar que Turbopack tome la carpeta padre como raiz en este entorno copiado. Si quieres probar Turbopack:

```bash
npm run dev:turbo -- -p 3001
```

## Verificacion

```bash
npm run typecheck
npm run build
```

## Despliegue en VPS

El proyecto genera salida `standalone`, pensada para servidores propios.

```bash
cd web-amd
npm ci
npm run build
```

Despues del build, sube o conserva en el VPS:

```txt
.next/standalone/
.next/static/
public/
package.json
```

Arranque recomendado:

```bash
cd web-amd
NODE_ENV=production PORT=3000 node .next/standalone/server.js
```

En un VPS real conviene gestionarlo con `pm2` o `systemd`, y poner Nginx como reverse proxy hacia el puerto interno.

## Nota sobre imagenes

Hay imagenes locales en `public/images` y algunas imagenes remotas temporales centralizadas en `src/lib/visuals.ts`. Antes de publicar la version definitiva, conviene sustituir las remotas por fotografias propias o descargadas con licencia adecuada dentro de `public/images`.
