import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['src/tests/e2e/**', 'node_modules/**'],
    setupFiles: ['src/tests/setup.ts'],
  },
  resolve: {
    conditions: ['browser'],
  },
})
