import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@radix-ui/react-dialog': fileURLToPath(new URL('./node_modules/@radix-ui/react-dialog/dist/index.mjs', import.meta.url)),
      '@tockteam/ui/dialog': fileURLToPath(new URL('../../../ui/src/dialog.tsx', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  ssr: { noExternal: true },
})
