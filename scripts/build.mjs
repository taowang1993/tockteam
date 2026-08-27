import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { resolveProductVersion } from '../src/version.ts'
import { adaptBetterSidebarHost } from './better-sidebar-upstream-adapter.mjs'
import { buildTailwindCss } from './tailwind.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const productVersion = resolveProductVersion(root)
const versionDefine = {
  __TOCKTEAM_BUILD_VERSION__: JSON.stringify(productVersion),
}
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
const tailwindCss = await buildTailwindCss(root)
const splashTailwindCss = await buildTailwindCss(root, [{
  base: root,
  negated: false,
  pattern: 'src/splash.html',
}])
const launcherTailwindCss = await buildTailwindCss(root, [
  {
    base: root,
    negated: false,
    pattern: 'src/launcher.html',
  },
  {
    base: root,
    negated: false,
    pattern: 'src/launcher.ts',
  },
])
const tailwindDefine = {
  ...versionDefine,
  __TOCKTEAM_TAILWIND_CSS__: JSON.stringify(tailwindCss),
}

const pluginPackages = [
  { directory: 'better-sidebar-runtime', hostOnly: true },
  { directory: 'tui', hostOnly: true },
  { directory: 'skins', id: '@tockteam/skins' },
  { directory: 'sidebar', id: '@tockteam/sidebar' },
  { directory: 'panel-controls', id: '@tockteam/panel-controls' },
  { directory: 'pinned-summary', id: '@tockteam/pinned-summary' },
  { directory: 'plugin-marketplace', id: '@tockteam/plugin-marketplace' },
]

const shared = {
  bundle: true,
  define: versionDefine,
  logLevel: 'info',
  sourcemap: true,
  target: 'node24',
}

const builds = [
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'main.ts')],
    outfile: join(dist, 'main.js'),
    platform: 'node',
    format: 'esm',
    external: ['electron'],
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'preload.ts')],
    outfile: join(dist, 'preload.cjs'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'launcher-preload.ts')],
    outfile: join(dist, 'launcher-preload.cjs'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    bundle: true,
    entryPoints: [join(root, 'src', 'launcher.ts')],
    outfile: join(dist, 'launcher.js'),
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'plugin.ts')],
    outfile: join(dist, 'plugin.js'),
    platform: 'node',
    format: 'esm',
    external: ['tockbot-note-runtime'],
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'client-contract.ts')],
    outfile: join(dist, 'client-api.js'),
    platform: 'node',
    format: 'esm',
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'host-contract.ts')],
    outfile: join(dist, 'host.js'),
    platform: 'node',
    format: 'esm',
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'web-entry.ts')],
    outfile: join(dist, 'web.js'),
    platform: 'node',
    format: 'esm',
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'src', 'cli.ts')],
    outfile: join(dist, 'tockteam.js'),
    platform: 'node',
    format: 'esm',
  }),
  build({
    ...shared,
    entryPoints: [join(root, 'web', 'src', 'index.ts')],
    outfile: join(dist, 'web', 'index.js'),
    platform: 'node',
    format: 'esm',
  }),
  build({
    bundle: true,
    define: versionDefine,
    entryPoints: [join(root, 'web', 'src', 'client.ts')],
    outfile: join(dist, 'web', 'client.js'),
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
    banner: {
      js: 'window.__ModuleLoader__.load({ id: "@tockteam/web", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    },
    footer: { js: 'return module.exports; } });' },
  }),
  build({
    bundle: true,
    define: versionDefine,
    entryPoints: [join(root, 'src', 'client.ts')],
    outfile: join(dist, 'client.js'),
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
    banner: {
      js: 'window.__ModuleLoader__.load({ id: "@tockteam/desktop", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    },
    footer: { js: 'return module.exports; } });' },
  }),
]

for (const plugin of pluginPackages) {
  const source = join(root, 'plugins', plugin.directory, 'src')
  const output = join(dist, 'plugins', plugin.directory)
  const hostEntry = plugin.directory === 'better-sidebar-runtime'
    ? join(root, 'upstream', 'DSH-better-sidebar', 'src', 'index.ts')
    : join(source, 'index.ts')
  builds.push(build({
    ...shared,
    entryPoints: [hostEntry],
    outfile: join(output, 'index.js'),
    platform: 'node',
    format: 'esm',
    plugins: plugin.directory === 'better-sidebar-runtime'
      ? [{
          name: 'tockteam-better-sidebar-adapter',
          setup(esbuild) {
            esbuild.onLoad({ filter: /index\.ts$/ }, args => args.path === hostEntry
              ? {
                  contents: adaptBetterSidebarHost(readFileSync(hostEntry, 'utf8')),
                  loader: 'ts',
                  resolveDir: dirname(hostEntry),
                  watchFiles: [hostEntry],
                }
              : null)
          },
        }]
      : [],
    external: plugin.directory === 'better-sidebar-runtime'
      ? ['@deepseek-ai/*', 'cordis', 'node-pty', 'schemastery', 'ws']
      : [],
  }))
  if (plugin.hostOnly !== true) {
    builds.push(build({
      bundle: true,
      define: plugin.directory === 'skins' ? tailwindDefine : versionDefine,
      entryPoints: [join(source, 'client.ts')],
      outfile: join(output, 'client.js'),
      platform: 'browser',
      format: 'cjs',
      target: 'es2022',
      sourcemap: true,
      logLevel: 'info',
      loader: { '.css': 'text' },
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        ...(['skins', 'sidebar'].includes(plugin.directory)
          ? ['@deepseek-ai/dsh-client-runtime/client']
          : []),
      ],
      banner: {
        js: `window.__ModuleLoader__.load({ id: "${plugin.id}", factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
      },
      footer: { js: 'return module.exports; } });' },
    }))
  }
}

await Promise.all(builds)
writeFileSync(join(dist, 'launcher.css'), launcherTailwindCss)
copyFileSync(join(root, 'src', 'launcher.html'), join(dist, 'launcher.html'))

const declarationRoot = mkdtempSync(join(tmpdir(), 'tockteam-host-declarations-'))
try {
  execFileSync(process.execPath, [
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--ignoreConfig',
    '--target', 'ES2024',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--strict',
    '--skipLibCheck',
    '--types', 'node',
    '--declaration',
    '--emitDeclarationOnly',
    '--outDir', declarationRoot,
    join(root, 'src', 'host-contract.ts'),
  ], { cwd: root, stdio: 'inherit' })
  copyFileSync(join(declarationRoot, 'host-contract.d.ts'), join(root, 'host.d.ts'))
} finally {
  rmSync(declarationRoot, { recursive: true, force: true })
}

const splashMarker = '/* __TOCKTEAM_TAILWIND_CSS__ */'
const splashSource = readFileSync(join(root, 'src', 'splash.html'), 'utf8')
if (!splashSource.includes(splashMarker)) {
  throw new Error('src/splash.html is missing its Tailwind CSS marker')
}
writeFileSync(
  join(dist, 'splash.html'),
  splashSource.replace(splashMarker, splashTailwindCss),
)
copyFileSync(join(root, 'cordis.patch.yml'), join(dist, 'cordis.patch.yml'))
const releaseManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
releaseManifest.version = productVersion
// Runtime/vault pins are app-staging inputs, not dependencies of an
// independently installable release package.
delete releaseManifest.dependencies
delete releaseManifest.devDependencies
delete releaseManifest.peerDependencies
writeFileSync(
  join(dist, 'release-package.json'),
  `${JSON.stringify(releaseManifest, undefined, 2)}\n`,
)
mkdirSync(join(dist, 'web'), { recursive: true })
copyFileSync(join(root, 'web', 'cordis.patch.yml'), join(dist, 'web', 'cordis.patch.yml'))
mkdirSync(join(dist, 'plugins', 'tui'), { recursive: true })
copyFileSync(
  join(root, 'plugins', 'tui', 'cordis.patch.yml'),
  join(dist, 'plugins', 'tui', 'cordis.patch.yml'),
)
