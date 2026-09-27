import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Adapt only the pinned browser client in the staged/Nix runtime, never an
// installed package, model catalog, Session selection, or user settings.
const NAME = '@deepseek-ai/dsh-client-ui-model-selection'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '4e6bd5d556836d086a329413967ad0a9dfb3a0a0bebe2863a9b073ab09db686d'
const CHANGES = [
  [
    'padding:0;font-weight:600}._7KE1Ra_groups{min-height:0;overflow-y:auto}',
    'padding:0;font-weight:600}._7KE1Ra_search{box-sizing:border-box;flex:none;min-width:0;width:100%;height:34px;padding:0 10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;outline:none}._7KE1Ra_search::placeholder{color:var(--dsw-alias-label-tertiary)}._7KE1Ra_search:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._7KE1Ra_groups{min-height:0;overflow-y:auto}',
  ],
  [
    '"retry": "_7KE1Ra_retry",\n\t\t\t"root": "_7KE1Ra_root",',
    '"retry": "_7KE1Ra_retry",\n\t\t\t"search": "_7KE1Ra_search",\n\t\t\t"root": "_7KE1Ra_root",',
  ],
  [
    'const [pane, setPane] = (0, react.useState)("root");\n\t\t\tconst lastActionRef',
    'const [pane, setPane] = (0, react.useState)("root");\n\t\t\tconst [modelQuery, setModelQuery] = (0, react.useState)("");\n\t\t\tconst lastActionRef',
  ],
  [
    'const currentChoice = choices[state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)];\n\t\t\tconst reasoning = currentChoice?.model.reasoning;',
    'const currentChoice = choices[state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)];\n\t\t\tconst normalizedQuery = modelQuery.trim().toLowerCase();\n\t\t\tconst visibleGroups = normalizedQuery === "" ? state.groups : state.groups.map((group) => ({\n\t\t\t\t...group,\n\t\t\t\tmodels: group.models.filter((model) => [group.name, group.id, model.name, model.id].some((value) => value.toLowerCase().includes(normalizedQuery)))\n\t\t\t})).filter((group) => group.models.length > 0);\n\t\t\tconst reasoning = currentChoice?.model.reasoning;',
  ],
  [
    'const active = items.findIndex((item) => item === document.activeElement);\n\t\t\t\titems[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();',
    'const active = items.findIndex((item) => item === document.activeElement);\n\t\t\t\tconst next = active < 0 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length;\n\t\t\t\titems[next]?.focus();',
  ],
  [
    'if (pane !== "root") setPane("root");\n\t\t\t\t\telse close(true);',
    'if (pane !== "root") {\n\t\t\t\t\t\tsetPane("root");\n\t\t\t\t\t\ttriggerRef.current?.focus();\n\t\t\t\t\t} else close(true);',
  ],
  [
    'onClick: () => {\n\t\t\t\t\t\t\t\t\tsetPane("model");',
    'onClick: () => {\n\t\t\t\t\t\t\t\t\tsetModelQuery("");\n\t\t\t\t\t\t\t\t\tsetPane("model");',
  ],
  [
    'pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [\n\t\t\t\t\t\t\t\tstate.status === "loading"',
    'pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [\n\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("input", {\n\t\t\t\t\t\t\t\t\ttype: "search",\n\t\t\t\t\t\t\t\t\tclassName: ModelSelect_module_css_default.search,\n\t\t\t\t\t\t\t\t\t"aria-label": t("menu.search"),\n\t\t\t\t\t\t\t\t\tplaceholder: t("menu.searchPlaceholder"),\n\t\t\t\t\t\t\t\t\tvalue: modelQuery,\n\t\t\t\t\t\t\t\t\tautoComplete: "off",\n\t\t\t\t\t\t\t\t\tspellCheck: false,\n\t\t\t\t\t\t\t\t\tautoFocus: true,\n\t\t\t\t\t\t\t\t\tonChange: (event) => { setModelQuery(event.currentTarget.value); }\n\t\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\t\tstate.status === "loading"',
  ],
  [
    'children: state.groups.map((group) => {',
    'children: visibleGroups.map((group) => {',
  ],
  [
    '\t\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\t\tstate.status === "ready" && choices.length === 0',
    '\t\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\t\tstate.status === "ready" && visibleGroups.length === 0 && choices.length > 0 && (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\t\t\t\tclassName: ModelSelect_module_css_default.empty,\n\t\t\t\t\t\t\t\t\trole: "status",\n\t\t\t\t\t\t\t\t\tchildren: t("empty.search")\n\t\t\t\t\t\t\t\t}),\n\t\t\t\t\t\t\t\tstate.status === "ready" && choices.length === 0',
  ],
  [
    '"menu.model": "模型",\n\t\t\t"menu.effort": "推理等级",',
    '"menu.model": "模型",\n\t\t\t"menu.search": "搜索模型",\n\t\t\t"menu.searchPlaceholder": "搜索模型…",\n\t\t\t"menu.effort": "推理等级",',
  ],
  [
    '"menu.model": "Model",\n\t\t\t"menu.effort": "Effort",',
    '"menu.model": "Model",\n\t\t\t"menu.search": "Search Models",\n\t\t\t"menu.searchPlaceholder": "Search models…",\n\t\t\t"menu.effort": "Effort",',
  ],
  [
    '"empty.models": "没有可用的模型。",\n\t\t\t"blocked.composer"',
    '"empty.models": "没有可用的模型。",\n\t\t\t"empty.search": "没有匹配的模型。",\n\t\t\t"blocked.composer"',
  ],
  [
    '"empty.models": "No models available.",\n\t\t\t"blocked.composer"',
    '"empty.models": "No models available.",\n\t\t\t"empty.search": "No matching models.",\n\t\t\t"blocked.composer"',
  ],
]

function count(source, fragment) { return source.split(fragment).length - 1 }

function adapt(source) {
  let normalized = source
  for (const [before, after] of CHANGES) {
    const original = count(normalized, before)
    const changed = count(normalized, after)
    if (changed === 1) normalized = normalized.replace(after, before)
    else if (original !== 1 || changed !== 0) throw new Error(`${NAME}: pinned model selector shape changed at ${before.slice(0, 64)} (original=${original}, adapted=${changed}); review required`)
  }
  if (createHash('sha256').update(normalized).digest('hex') !== ORIGINAL_SHA256) {
    throw new Error(`${NAME}: pinned model selector hash changed; review required`)
  }
  let result = normalized
  for (const [before, after] of CHANGES) result = result.replace(before, after)
  return result
}

export function addModelSelectionSearch(runtimeRoot) {
  const root = realpathSync(runtimeRoot)
  const candidates = [join(root, 'node_modules', NAME)]
  const store = join(root, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@deepseek-ai+dsh-client-ui-model-selection@')) {
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
  // Validate all copies before replacing any; an atomic rename breaks staged hardlinks.
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
  if (process.argv.length !== 3) throw new Error('usage: node scripts/model-selection-search.mjs <runtime-root>')
  addModelSelectionSearch(resolve(process.argv[2]))
}
