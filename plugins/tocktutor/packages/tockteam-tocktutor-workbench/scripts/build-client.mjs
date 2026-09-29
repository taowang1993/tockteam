import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageName = '@tockteam/tocktutor-workbench'
const fontDirectory = join(root, 'dist/fonts')
mkdirSync(fontDirectory, { recursive: true })
for (const file of ['FiraCode-VF.woff2', 'LICENSE.txt']) {
  copyFileSync(join(root, 'src/fonts', file), join(fontDirectory, file))
}

// Load Mermaid only when a diagram is encountered; never include it in the privileged client bundle.
await build({
  bundle: true,
  entryPoints: [join(root, 'scripts/mermaid-frame.mjs')],
  format: 'iife',
  logLevel: 'info',
  minify: true,
  outfile: join(root, 'dist/mermaid-frame.js'),
  platform: 'browser',
  target: 'es2022',
})

await build({
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(packageName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  bundle: true,
  entryPoints: [join(root, 'src/client.ts')],
  external: [
    '@tockteam/desktop/client',
    'react',
    'react-dom',
    'react/jsx-runtime',
  ],
  footer: { js: 'return module.exports; } });' },
  format: 'cjs',
  loader: { '.woff2': 'dataurl' },
  logLevel: 'info',
  minifyWhitespace: true,
  outfile: join(root, 'dist/client.js'),
  platform: 'browser',
  sourcemap: true,
  target: 'es2022',
})
