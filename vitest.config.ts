import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Tests unitarios de lógica pura (lib/). Resolvemos el alias `@/` igual que tsconfig
// para poder importar los módulos reales sin pasar por el bundler de Next.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
