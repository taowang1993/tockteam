import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageName = 'tockbot-web-clip'

await build({
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(packageName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  bundle: true,
  entryPoints: [join(root, 'src/client.tsx')],
  external: ['react', 'react/jsx-runtime'],
  footer: { js: 'return module.exports; } });' },
  format: 'cjs',
  logLevel: 'info',
  outfile: join(root, 'lib/client.js'),
  platform: 'browser',
  sourcemap: true,
  target: 'es2022',
})
