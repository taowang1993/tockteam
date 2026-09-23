import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageRequire = createRequire(new URL('../plugins/ui/package.json', import.meta.url))
const react = packageRequire('react') as { createElement: (type: unknown, props: Record<string, unknown>) => unknown }
const renderToStaticMarkup = packageRequire('react-dom/server').renderToStaticMarkup as (node: unknown) => string

const bundle = buildSync({
  stdin: {
    contents: `
      export { LauncherLocalSettings } from ${JSON.stringify(join(root, 'src/launcher-local-settings.tsx'))}
      export { LauncherDiscoverySettings } from ${JSON.stringify(join(root, 'src/launcher-discovery-settings.tsx'))}
      export { LauncherFileSearchSettings } from ${JSON.stringify(join(root, 'src/launcher-file-search-settings.tsx'))}
      export { LauncherNetworkSettings } from ${JSON.stringify(join(root, 'src/launcher-network-settings.tsx'))}
    `,
    resolveDir: root,
    sourcefile: 'launcher-provider-settings-selection-probe.tsx',
  },
  bundle: true,
  external: ['react', 'react/*', 'react-dom/server'],
  format: 'cjs',
  jsx: 'automatic',
  logLevel: 'silent',
  platform: 'node',
  write: false,
}).outputFiles[0]!.text

const probeModule = { exports: {} as Record<string, unknown> }
runInNewContext(bundle, {
  exports: probeModule.exports,
  module: probeModule,
  navigator: { userAgent: 'Linux' },
  process,
  require: (specifier: string) => packageRequire(specifier),
})
const components = probeModule.exports as {
  LauncherDiscoverySettings: unknown
  LauncherFileSearchSettings: unknown
  LauncherLocalSettings: unknown
  LauncherNetworkSettings: unknown
}

const snapshot = {
  externalGrantStatus: 'none',
  missingSensitiveKeys: [],
  recoveredSettings: false,
  settingsSource: 'managed',
  values: {},
}
const save = async (): Promise<boolean> => true

function render(component: unknown, props: Record<string, unknown>): string {
  return renderToStaticMarkup(react.createElement(component, props))
}

test('provider family selection hides sibling groups without unmounting controls', () => {
  const local = render(components.LauncherLocalSettings, { busy: false, extensionId: 'Calculator', save, snapshot })
  assert.match(local, /<div hidden=""><h2[^>]*>Local Transformation Extensions<\/h2>/u)
  assert.match(local, /<details hidden=""><summary[^>]*>Base64 Conversion<\/summary>[\s\S]*Encode\/Decode Prefix/u)
  assert.match(local, /<details open=""><summary[^>]*>Calculator<\/summary>[\s\S]*Calculator Precision/u)
  assert.match(local, /Password Generator/u)

  const discovery = render(components.LauncherDiscoverySettings, { busy: false, extensionId: 'VSCode', save, snapshot })
  assert.match(discovery, /<div hidden=""><h2[^>]*>Application, Bookmark, and IDE Discovery<\/h2>/u)
  assert.match(discovery, /<details hidden=""><summary[\s\S]*?Application Search<\/summary>[\s\S]*Include Windows Store Apps/u)
  assert.match(discovery, /<details open=""><summary[\s\S]*?Visual Studio Code<\/summary>[\s\S]*VS Code Command Template/u)
  assert.match(discovery, /Browser Bookmarks/u)

  const fileSearch = render(components.LauncherFileSearchSettings, {
    busy: false,
    draftFolders: [],
    extensionId: 'SimpleFileSearch',
    onDraftFoldersChange: () => undefined,
    save,
    snapshot,
  })
  assert.match(fileSearch, /<div hidden=""><h2[^>]*>File Search<\/h2>/u)
  assert.match(fileSearch, /<div hidden="">[\s\S]*Indexed File Search[\s\S]*Maximum File Search Results/u)
  assert.match(fileSearch, /Simple File Search Roots/u)

  const network = render(components.LauncherNetworkSettings, { busy: false, extensionId: 'WebSearch', save, snapshot })
  assert.match(network, /<div hidden=""><h2[\s\S]*?Network Extensions<\/h2>/u)
  assert.match(network, /<div hidden="">[\s\S]*Currencies[\s\S]*Default Target Currency/u)
  assert.match(network, /<div hidden="">[\s\S]*Custom Search Engines/u)
  assert.match(network, /<div>[\s\S]*Web Search Provider[\s\S]*Show Instant Web Search Result/u)
  assert.match(network, /Privacy and Destination Policy/u)
})

test('omitting extension selection preserves the family view', () => {
  const local = render(components.LauncherLocalSettings, { busy: false, save, snapshot })
  assert.match(local, /<div><h2[^>]*>Local Transformation Extensions<\/h2>/u)
  assert.match(local, /<details open=""><summary[^>]*>Base64 Conversion<\/summary>/u)
  assert.doesNotMatch(local, /<details hidden="">/u)

  const network = render(components.LauncherNetworkSettings, { busy: false, save, snapshot })
  assert.match(network, /<div><h2[\s\S]*?Network Extensions<\/h2>/u)
  assert.doesNotMatch(network, /<div hidden=""><h2[^>]*>Network Extensions/u)
})
