import type { NextConfig } from "next";

const SUPABASE_HOST = 'myyejbviunyvywfukysj.supabase.co';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://images.unsplash.com`,
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
  // bodySizeLimit es GLOBAL a todas las Server Actions. El suelo lo marca la subida manual de
  // contadores (/admin/contadores/pendientes): el PDF/imagen va entero a la acción, hasta 10 MB
  // (valida MAX_UPLOAD_BYTES=10MB; +overhead multipart → 12 MB de margen). El CSV importer cabe
  // de sobra. El default de 1 MB rechazaría estas peticiones legítimas.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
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
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
