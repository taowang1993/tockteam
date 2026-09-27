import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Browser-only correction to the pinned DSH 0.1.2-rc.1 Models UI. Never change
// an installed package or user settings: adapt the staged/Nix runtime copy.
const NAME = '@deepseek-ai/dsh-client-ui-settings-models'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '7acf9736edeea519c63791e946a135f5cc854c95c299fd9864e82074fce587e5'
const DEEPSEEK_ROUTE = 'candidate.entry.provider === "deepseek-official" && candidate.entry.settingsNs === "llm-deepseek" && candidate.entry.settingsPath.length === 0'
const OPENROUTER_ROUTE = 'candidate.entry.provider === "openrouter" && candidate.entry.settingsNs === "llm-pi-ai" && candidate.entry.settingsPath.join("/") === "providers/openrouter"'
const CHANGES = [
  [
    'function needsSetup(row, anyUsable) {\n\t\t\tif (anyUsable) return false;\n\t\t\tif (row.entry.settingsPath.length > 0) return false;\n\t\t\treturn row.credential?.configured !== true;\n\t\t}',
    'function needsSetup(row, anyUsable) {\n\t\t\tif (anyUsable || row.entry.provider !== "openrouter") return false;\n\t\t\treturn row.credential?.configured !== true;\n\t\t}',
    1,
  ],
  [
    'const configured = state.rows.filter((row) => row.configured);',
    'const configured = state.rows.filter((row) => row.configured).sort((left, right) => Number(right.entry.provider === "openrouter") - Number(left.entry.provider === "openrouter"));',
    1,
  ],
  [DEEPSEEK_ROUTE, OPENROUTER_ROUTE, 2],
  ['const namespace = state.namespaces.get("llm-deepseek");', 'const namespace = state.namespaces.get("llm-pi-ai");', 1],
  ['id: "deepseek-official",\n\t\t\t\torder: 0,', 'id: "openrouter",\n\t\t\t\torder: 0,', 1],
  ['onboardingDescription: "Configure the official DeepSeek provider to start building."', 'onboardingDescription: "Configure OpenRouter to start building."', 1],
  ['onboardingDescription: "配置 DeepSeek 官方模型，即可开始使用。"', 'onboardingDescription: "配置 OpenRouter 模型，即可开始使用。"', 1],
  [
    'const keyPlaceholder = keyLocked ? t("keyEnvLocked") : keyState?.configured === true && props.credentialRequired !== true ? t("keyStored") : family === "pi-ai" ? t("keyPlaceholderNative") : t("keyPlaceholder");',
    'const keyPlaceholder = keyLocked ? t("keyEnvLocked") : keyState?.configured === true && props.credentialRequired !== true ? t("keyStored") : props.credentialRequired === true ? t("keyPlaceholder") : family === "pi-ai" ? t("keyPlaceholderNative") : t("keyPlaceholder");',
    1,
  ],
]

function count(source, fragment) { return source.split(fragment).length - 1 }

function adapt(source) {
  let normalized = source
  for (const [before, after, expected] of CHANGES) {
    const original = count(normalized, before)
    const changed = count(normalized, after)
    if (original === 0 && changed === expected) normalized = normalized.replaceAll(after, before)
    else if (original !== expected || changed !== 0) throw new Error(`${NAME}: pinned Models UI shape changed; review required`)
  }
  if (createHash('sha256').update(normalized).digest('hex') !== ORIGINAL_SHA256) {
    throw new Error(`${NAME}: pinned Models UI hash changed; review required`)
  }
  let result = normalized
  for (const [before, after] of CHANGES) result = result.replaceAll(before, after)
  return result
}

/** Make OpenRouter the first Models row and credential step in the runtime copy. */
export function prioritizeOpenRouterModelsSettings(runtimeRoot) {
  const root = realpathSync(runtimeRoot)
  const candidates = [join(root, 'node_modules', NAME)]
  const store = join(root, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@deepseek-ai+dsh-client-ui-settings-models@')) {
        candidates.push(join(store, entry.name, 'node_modules', NAME))
      }
    }
  }
  const packages = [...new Set(candidates.filter(existsSync).map(path => realpathSync(path)))]
  if (packages.length === 0) throw new Error(`${NAME}: pinned staged package missing`)
  const updates = packages.map(packageRoot => {
    const within = relative(root, packageRoot)
    if (within.startsWith('..') || isAbsolute(within)) throw new Error(`${NAME}: package resolves outside staged runtime`)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.name !== NAME || manifest.version !== VERSION || manifest.exports?.['./client']?.default !== './lib/client.js') {
      throw new Error(`${NAME}: unsupported pinned browser export`)
    }
    const path = realpathSync(join(packageRoot, 'lib', 'client.js'))
    const inside = relative(packageRoot, path)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error(`${NAME}: browser export resolves outside staged package`)
    const original = readFileSync(path, 'utf8')
    return { path, original, source: adapt(original) }
  })
  // Validate all copies before modifying any; an atomic replacement breaks hardlinks.
  for (const { path, original, source } of updates) {
    if (original === source) continue
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, source, { flag: 'wx', mode: statSync(path).mode })
      renameSync(temporary, path)
    } finally { rmSync(temporary, { force: true }) }
  }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('usage: node scripts/models-settings-default.mjs <runtime-root>')
  prioritizeOpenRouterModelsSettings(resolve(process.argv[2]))
}
