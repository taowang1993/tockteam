import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Browser-only correction to the pinned DSH 0.1.2-rc.1 Models UI. Never change
// an installed package or user settings: adapt the staged/Nix runtime copy.
const NAME = '@deepseek-ai/dsh-client-ui-settings-models'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '7acf9736edeea519c63791e946a135f5cc854c95c299fd9864e82074fce587e5'
const PREVIOUS_STAGED_SHA256 = new Set([
  'eea643a18add1c5f913e495aaaf1c2ade09dabc9b31a019bb96bbaa2b2d9955e',
  'c726e22891b8589ec2ba8597069a0c0945b40405f00d462f66550673f7185fb8',
  '56cf3f48f01b9d725d78b47f07076e8a05658a9861bb38177b9a8ff5edacef87',
])
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
    'children: t("intro")\n\t\t\t\t\t}),\n\t\t\t\t\t!state.writable',
    'children: t("intro")\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("p", {\n\t\t\t\t\t\tclassName: ModelsSection_module_css_default["intro"],\n\t\t\t\t\t\tchildren: t("defaultModelNotice")\n\t\t\t\t\t}),\n\t\t\t\t\t!state.writable',
    1,
  ],
  [
    'intro: "Enter your API keys to use models from the following providers.",\n\t\t\tedit: "Edit",',
    'intro: "Enter your API keys to use models from the following providers.",\n\t\t\tdefaultModelNotice: "New setups default to OpenRouter · openrouter/free. You do not need a Model ID or display name unless you customize the catalog; saved choices take precedence.",\n\t\t\tedit: "Edit",',
    1,
  ],
  [
    'intro: "填入各提供方的 API 密钥即可使用其模型。",\n\t\t\tedit: "编辑",',
    'intro: "填入各提供方的 API 密钥即可使用其模型。",\n\t\t\tdefaultModelNotice: "新安装默认使用 OpenRouter · openrouter/free。除非自定义模型目录，否则无需填写模型 ID 或显示名称；已保存的模型选择优先。",\n\t\t\tedit: "编辑",',
    1,
  ],
  [
    'const keyPlaceholder = keyLocked ? t("keyEnvLocked") : keyState?.configured === true && props.credentialRequired !== true ? t("keyStored") : family === "pi-ai" ? t("keyPlaceholderNative") : t("keyPlaceholder");',
    'const keyPlaceholder = keyLocked ? t("keyEnvLocked") : keyState?.configured === true && props.credentialRequired !== true ? t("keyStored") : props.credentialRequired === true ? t("keyPlaceholder") : family === "pi-ai" ? t("keyPlaceholderNative") : t("keyPlaceholder");',
    1,
  ],
  [
    '.zGbnIq_addModelButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.zGbnIq_input{',
    '.zGbnIq_addModelButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.zGbnIq_keyField{position:relative}.zGbnIq_keyField .zGbnIq_input{padding-right:42px}.zGbnIq_keyVisibility{position:absolute;top:2px;right:4px}.zGbnIq_input{',
    1,
  ],
  [
    '"iconButtonDanger": "zGbnIq_iconButtonDanger",\n\t\t\t"input": "zGbnIq_input",',
    '"iconButtonDanger": "zGbnIq_iconButtonDanger",\n\t\t\t"keyField": "zGbnIq_keyField",\n\t\t\t"keyVisibility": "zGbnIq_keyVisibility",\n\t\t\t"input": "zGbnIq_input",',
    1,
  ],
  [
    'const [keyDraft, setKeyDraft] = (0, react.useState)("");\n\t\t\tconst [keyState, setKeyState]',
    'const [keyDraft, setKeyDraft] = (0, react.useState)("");\n\t\t\tconst [showKeyDraft, setShowKeyDraft] = (0, react.useState)(false);\n\t\t\tconst [savedKey, setSavedKey] = (0, react.useState)(void 0);\n\t\t\tconst [revealBusy, setRevealBusy] = (0, react.useState)(false);\n\t\t\tconst [keyState, setKeyState]',
    1,
  ],
  [
    'let stale = false;\n\t\t\t\tsetKeyState(void 0);',
    'let stale = false;\n\t\t\t\tsetSavedKey(void 0);\n\t\t\t\tsetShowKeyDraft(false);\n\t\t\t\tsetKeyState(void 0);',
    1,
  ],
  [
    'const keyLocked = keyState?.writable === false;\n\t\t\t/**',
    'const keyLocked = keyState?.writable === false;\n\t\t\tconst canRevealSaved = typeof window.dshDesktop?.revealSavedModelKey === "function";\n\t\t\t/**',
    1,
  ],
  // Lucide Eye and EyeOff v0.473.0 shapes; inline SVG avoids a new DSH browser module.
  [
    String.raw`(0, react_jsx_runtime.jsx)("input", {
							className: ModelsSection_module_css_default["input"],
							type: "password",
							autoComplete: "off",
							value: keyDraft,
							placeholder: keyPlaceholder,
							"aria-label": t("keyInput"),
							"aria-invalid": shownKeyFailure !== void 0,
							required: props.credentialRequired === true,
							autoFocus: props.autoFocusCredential === true,
							disabled: disabled || keyLocked,
							onChange: (event) => {
								setKeyDraft(event.target.value);
							}
						}),`,
    String.raw`(0, react_jsx_runtime.jsxs)("div", {
							className: ModelsSection_module_css_default["keyField"],
							children: [(0, react_jsx_runtime.jsx)("input", {
								className: ModelsSection_module_css_default["input"],
								type: savedKey !== void 0 || showKeyDraft ? "text" : "password",
								autoComplete: "off",
								autoCapitalize: "none",
								spellCheck: false,
								value: savedKey ?? keyDraft,
								readOnly: savedKey !== void 0 || revealBusy,
								placeholder: keyPlaceholder,
								"aria-label": savedKey !== void 0 ? t("savedKeyInput") : t("keyInput"),
								"aria-invalid": shownKeyFailure !== void 0,
								required: props.credentialRequired === true,
								autoFocus: props.autoFocusCredential === true,
								disabled: disabled || keyLocked,
								onChange: (event) => {
									setKeyDraft(event.target.value);
									if (event.target.value.length === 0) setShowKeyDraft(false);
								}
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: ModelsSection_module_css_default["iconButton"] + " " + ModelsSection_module_css_default["keyVisibility"],
								"aria-label": savedKey !== void 0 ? t("hideSavedKey") : keyDraft.length > 0 ? showKeyDraft ? t("hideNewKey") : t("showNewKey") : canRevealSaved && keyState?.configured === true ? t("showSavedKey") : t("showNewKey"),
								"aria-description": keyDraft.length === 0 && keyState?.configured === true && !canRevealSaved ? t("savedKeyPrivate") : void 0,
								title: keyDraft.length === 0 && keyState?.configured === true && !canRevealSaved ? t("savedKeyPrivate") : void 0,
								disabled: disabled || keyLocked || revealBusy || keyDraft.length === 0 && (keyState?.configured !== true || !canRevealSaved),
								onClick: async () => {
									if (savedKey !== void 0) { setSavedKey(void 0); return; }
									if (keyDraft.length > 0) { setShowKeyDraft((shown) => !shown); return; }
									if (!canRevealSaved || keyState?.configured !== true) return;
									setRevealBusy(true);
									setFailure(void 0);
									try {
										const stored = await window.dshDesktop.revealSavedModelKey(keyRef);
										if (stored === null) setFailure(t("savedKeyUnavailable"));
										else setSavedKey(stored);
									} catch {
										setFailure(t("savedKeyUnavailable"));
									} finally { setRevealBusy(false); }
								},
								children: (0, react_jsx_runtime.jsx)("svg", {
									width: 16,
									height: 16,
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: 2,
									strokeLinecap: "round",
									strokeLinejoin: "round",
									"aria-hidden": true,
									children: savedKey !== void 0 || showKeyDraft ? [(0, react_jsx_runtime.jsx)("path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }), (0, react_jsx_runtime.jsx)("path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }), (0, react_jsx_runtime.jsx)("path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }), (0, react_jsx_runtime.jsx)("path", { d: "m2 2 20 20" })] : [(0, react_jsx_runtime.jsx)("path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }), (0, react_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "3" })]
								})
							})]
						}),`,
    1,
  ],
  [
    'keyStored: "Configured — enter a new value to replace",\n\t\t\tkeyEnvLocked: "Provided by the launch environment (read-only)"',
    'keyStored: "••••••••",\n\t\t\tkeyEnvLocked: "Provided by the launch environment (read-only)"',
    1,
  ],
  [
    'keyStored: "已配置——输入新值可替换",\n\t\t\tkeyEnvLocked: "由启动环境提供（只读）"',
    'keyStored: "••••••••",\n\t\t\tkeyEnvLocked: "由启动环境提供（只读）"',
    1,
  ],
  [
    'keyInput: "API key",\n\t\t\tkeyPlaceholder: "Enter your API key",',
    'keyInput: "API key",\n\t\t\tsavedKeyInput: "Saved API Key",\n\t\t\tshowNewKey: "Show New API Key",\n\t\t\thideNewKey: "Hide New API Key",\n\t\t\tshowSavedKey: "Show Saved API Key",\n\t\t\thideSavedKey: "Hide Saved API Key",\n\t\t\tsavedKeyPrivate: "Saved keys can be shown only in Desktop. Enter a new key to replace it.",\n\t\t\tsavedKeyUnavailable: "This key was not saved here. Enter a new key to replace it.",\n\t\t\tkeyPlaceholder: "Enter your API key",',
    1,
  ],
  [
    'keyInput: "API 密钥",\n\t\t\tkeyPlaceholder: "输入 API 密钥",',
    'keyInput: "API 密钥",\n\t\t\tsavedKeyInput: "已保存的 API 密钥",\n\t\t\tshowNewKey: "显示新 API 密钥",\n\t\t\thideNewKey: "隐藏新 API 密钥",\n\t\t\tshowSavedKey: "显示已保存的 API 密钥",\n\t\t\thideSavedKey: "隐藏已保存的 API 密钥",\n\t\t\tsavedKeyPrivate: "只有桌面版可以显示已保存的密钥。输入新密钥可替换。",\n\t\t\tsavedKeyUnavailable: "此密钥未保存在这里。输入新密钥可替换。",\n\t\t\tkeyPlaceholder: "输入 API 密钥",',
    1,
  ],
]

function count(source, fragment) { return source.split(fragment).length - 1 }

function pristineClientForPreviousStage() {
  const store = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.pnpm')
  if (!existsSync(store)) throw new Error(`${NAME}: previous staged copy requires a full restage`)
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith(`@deepseek-ai+dsh-client-ui-settings-models@${VERSION}_`)) continue
    const source = readFileSync(join(store, entry, 'node_modules', NAME, 'lib', 'client.js'), 'utf8')
    if (createHash('sha256').update(source).digest('hex') === ORIGINAL_SHA256) return source
  }
  throw new Error(`${NAME}: previous staged copy requires a full restage`)
}

function adapt(source) {
  // Quick staging may retain the exact previous TockTeam adaptation. Rebuild it
  // from the hash-verified installed original rather than guessing how to undo it.
  if (PREVIOUS_STAGED_SHA256.has(createHash('sha256').update(source).digest('hex'))) source = pristineClientForPreviousStage()
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
