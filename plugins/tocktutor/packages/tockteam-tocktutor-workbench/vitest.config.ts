import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/vitest.setup.ts'],
  },
  resolve: {
    conditions: ['browser'],
    dedupe: ['react', 'react-dom'],
  },
  ssr: { noExternal: true, resolve: { conditions: ['browser'] } },
})
