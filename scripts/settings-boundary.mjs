import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ALLOWLIST = [
  'agent-loop',
  'shell',
  'locale',
  'permission',
  'ui-conversation',
  'ui-theme',
  'web-search-deepseek',
  'ui-onboarding',
  'agent-presets',
  'settings',
]

const CONSTANT = [
  '\n/**',
  ' * TockTeam configuration-client boundary for the pinned DSH 0.1.2 runtime:',
  ' * settings.describe filters and every settings write refuses namespaces',
  ' * outside this allowlist with `settings-not-exposed`.',
  ' * Configurable model-provider namespaces remain exposed.',
  ' */',
  'const WEB_SETTINGS_NAMESPACES = new Set([',
  ...ALLOWLIST.map(namespace => `\t"${namespace}",`),
  ']);\n',
].join('\n')
const CONSTANT_ANCHOR = 'const MAX_DESCRIBE_REFS = 64;'
const DESCRIBE_ANCHOR =
  'namespaces: settings.describe({ redactSecrets: true }).map(namespaceView)'
const DESCRIBE_REPLACEMENT = [
  'namespaces: settings.describe({ redactSecrets: true }).filter((descriptor) => {',
  '\t\t\t\t\tif (WEB_SETTINGS_NAMESPACES.has(String(descriptor.ns))) return true',
  '\t\t\t\t\tconst llm = this.ctx.get("llm")',
  '\t\t\t\t\tif (llm === void 0) return false',
  '\t\t\t\t\tfor (const entry of llm.listConfigurableProviders()) {',
  '\t\t\t\t\t\tif (entry.settingsNs === String(descriptor.ns)) return true',
  '\t\t\t\t\t}',
  '\t\t\t\t\treturn false',
  '\t\t\t\t}).map(namespaceView)',
].join('\n')
const WRITE_ANCHOR = 'const namespace = parsed.data.ns;'
const WRITE_GUARD = [
  '\t\tif (WEB_SETTINGS_NAMESPACES.has(namespace) === false) {',
  '\t\t\tconst llm = this.ctx.get("llm")',
  '\t\t\tif (llm === void 0 || llm.listConfigurableProviders().every((entry) => entry.settingsNs !== namespace)) {',
  '\t\t\t\tthrow new RemoteError("settings-not-exposed", `settings namespace "${namespace}" is not exposed to configuration clients`, { ns: namespace });',
  '\t\t\t}',
  '\t\t}',
].join('\n')

function settingsControllerIndex(runtimeRoot) {
  const store = join(runtimeRoot, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    const matches = readdirSync(store, { withFileTypes: true })
      .filter(entry => entry.isDirectory()
        && entry.name.startsWith('@deepseek-ai+dsh-api-settings-controller@'))
      .map(entry => join(
        store,
        entry.name,
        'node_modules',
        '@deepseek-ai',
        'dsh-api-settings-controller',
        'lib',
        'index.js',
      ))
      .filter(existsSync)
    if (matches.length > 1) {
      throw new Error('multiple dsh-api-settings-controller packages found in the staged runtime')
    }
    if (matches[0] !== undefined) return matches[0]
  }

  const hoisted = join(
    runtimeRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-api-settings-controller',
    'lib',
    'index.js',
  )
  if (existsSync(hoisted)) return hoisted
  throw new Error('dsh-api-settings-controller is missing from the staged runtime')
}

function requireSingleAnchor(source, anchor) {
  if (source.indexOf(anchor) < 0) {
    throw new Error(`dsh-api-settings-controller settings boundary anchor missing: ${anchor}`)
  }
  if (source.indexOf(anchor) !== source.lastIndexOf(anchor)) {
    throw new Error(`dsh-host-apiproxy settings boundary anchor is ambiguous: ${anchor}`)
  }
}

/** Restore the browser configuration boundary in an assembled DSH 0.1.2 runtime. */
export function restoreSettingsBoundary(runtimeRoot) {
  const indexPath = settingsControllerIndex(runtimeRoot)
  const source = readFileSync(indexPath, 'utf8')
  if (source.includes('WEB_SETTINGS_NAMESPACES')) {
    if (source.includes(CONSTANT)
      && source.includes(DESCRIBE_REPLACEMENT)
      && source.includes(WRITE_GUARD)) return
    throw new Error('dsh-api-settings-controller settings boundary has an unexpected shape; review needed')
  }
  for (const anchor of [CONSTANT_ANCHOR, DESCRIBE_ANCHOR, WRITE_ANCHOR]) {
    requireSingleAnchor(source, anchor)
  }
  const next = source
    .replace(CONSTANT_ANCHOR, CONSTANT_ANCHOR + CONSTANT)
    .replace(DESCRIBE_ANCHOR, DESCRIBE_REPLACEMENT)
    .replace(WRITE_ANCHOR, WRITE_ANCHOR + '\n' + WRITE_GUARD)
  writeFileSync(indexPath, next)
}

const invokedPath = process.argv[1] === undefined
  ? null
  : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  const runtimeRoot = process.argv[2]
  if (runtimeRoot === undefined || process.argv.length !== 3) {
    throw new Error('usage: node scripts/settings-boundary.mjs <runtime-root>')
  }
  restoreSettingsBoundary(resolve(runtimeRoot))
}
