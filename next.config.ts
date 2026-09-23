import type { NextConfig } from "next";

const SUPABASE_HOST = 'myyejbviunyvywfukysj.supabase.co';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // El host de Supabase es obligatorio: las fotos que el cliente adjunta a una incidencia viven
  // en un bucket PRIVADO y se sirven con URL firmada desde ese dominio. Sin él, el navegador
  // bloquea la imagen incrustada (se ve un hueco) aunque abrir la URL a pelo funcione, porque
  // navegar a la foto ya no pasa por `img-src`. Afecta a /atelier, /admin y /portal por igual.
  `img-src 'self' data: blob: https://${SUPABASE_HOST} https://images.unsplash.com`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

// Headers aplicados a todas las rutas
const globalHeaders = [
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy',   value: csp },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // El generador de etiquetas QR (/admin/contracts/[id]/etiquettes) lee el logo
  // blanco desde public/ con fs (y lo rasteriza con sharp). En el build
  // standalone public/ no se traza solo: hay que incluir el asset explícitamente
  // para que viaje a la función serverless.
  outputFileTracingIncludes: {
    '/admin/contracts/[id]/etiquettes': ['./public/images/logos/logo-amd-blanco.svg'],
  },
  // bodySizeLimit es GLOBAL a todas las Server Actions. El suelo lo marca el CSV importer
  // (/admin/machines/import): hasta ~1.1 MB con overhead multipart. La subida manual de contadores
  // NO pasa por una Server Action (el navegador sube el PDF directo a Supabase con URL firmada,
  // para esquivar el tope de 4,5 MB de Vercel), así que no influye aquí.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          ...globalHeaders,
          // camera=(self): permite acceso solo desde el mismo origen (necesario para el
          // scanner QR en /tech/scan). Bloquea cámara desde iframes de terceros.
          // geolocation=(self): la PWA de técnicos pide la posición solo al escanear, resolver
          // una avería o cerrar un mantenimiento; sigue prohibida para iframes de terceros.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
        ],
      },
      {
        // El navegador debe pedir siempre la última versión del service worker; si se cachea,
        // un arreglo tardaría días en llegar a los móviles.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type',  value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
