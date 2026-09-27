import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { prioritizeOpenRouterModelsSettings } from '../scripts/models-settings-default.mjs'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const store = join(repository, 'node_modules', '.pnpm')
const installed = join(store, readdirSync(store).find(name => name.startsWith('@deepseek-ai+dsh-client-ui-settings-models@0.1.2-rc.1_'))!, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models')
const manifest = readFileSync(join(installed, 'package.json'), 'utf8')
const original = readFileSync(join(installed, 'lib', 'client.js'), 'utf8')
const originalDigest = createHash('sha256').update(original).digest('hex')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-openrouter-models-'))
  const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models')
  mkdirSync(join(packageRoot, 'lib'), { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), manifest)
  writeFileSync(join(packageRoot, 'lib', 'client.js'), original)
  return { root, packageRoot, client: join(packageRoot, 'lib', 'client.js') }
}

test('fresh Models settings foreground OpenRouter and request its key without losing DeepSeek', () => {
  const { root, client } = fixture()
  try {
    prioritizeOpenRouterModelsSettings(root)
    const adapted = readFileSync(client, 'utf8')
    assert.match(adapted, /const configured = state\.rows\.filter\(\(row\) => row\.configured\)\.sort\(\(left, right\) => Number\(right\.entry\.provider === "openrouter"\) - Number\(left\.entry\.provider === "openrouter"\)\)/u)
    assert.match(adapted, /function needsSetup\(row, anyUsable\) \{\s+if \(anyUsable \|\| row\.entry\.provider !== "openrouter"\) return false;/u)
    assert.equal(adapted.split('candidate.entry.provider === "openrouter" && candidate.entry.settingsNs === "llm-pi-ai"').length - 1, 2)
    assert.match(adapted, /const namespace = state\.namespaces\.get\("llm-pi-ai"\);/u)
    assert.match(adapted, /id: "openrouter",\s+order: 0,/u)
    assert.match(adapted, /onboardingDescription: "Configure OpenRouter to start building\."/u)
    assert.match(adapted, /onboardingDescription: "配置 OpenRouter 模型，即可开始使用。"/u)
    assert.match(adapted, /props\.credentialRequired === true \? t\("keyPlaceholder"\) : family === "pi-ai" \? t\("keyPlaceholderNative"\)/u)
    assert.match(adapted, /if \(ns === "llm-deepseek"\) return "deepseek";/u)
    assert.equal(readFileSync(join(installed, 'lib', 'client.js'), 'utf8'), original)
    prioritizeOpenRouterModelsSettings(root)
    assert.equal(readFileSync(client, 'utf8'), adapted)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a changed pinned client or an alias outside the staged runtime fails without touching either', () => {
  const { root, client } = fixture()
  try {
    const changed = original + '\n// unexpected upstream change\n'
    writeFileSync(client, changed)
    assert.throws(() => prioritizeOpenRouterModelsSettings(root), /pinned|shape|hash/u)
    assert.equal(readFileSync(client, 'utf8'), changed)
  } finally { rmSync(root, { recursive: true, force: true }) }

  const other = fixture()
  try {
    rmSync(other.packageRoot, { recursive: true })
    symlinkSync(installed, other.packageRoot, 'dir')
    assert.throws(() => prioritizeOpenRouterModelsSettings(other.root), /outside/u)
    assert.equal(createHash('sha256').update(readFileSync(join(installed, 'lib', 'client.js'))).digest('hex'), originalDigest)
  } finally { rmSync(other.root, { recursive: true, force: true }) }
})

test('saved key stays masked until explicitly revealed in Desktop; Web keeps the old behavior', () => {
  const { root, client } = fixture()
  try {
    prioritizeOpenRouterModelsSettings(root)
    const adapted = readFileSync(client, 'utf8')
    for (const [fragment, behavior] of [
      ['keyStored: "••••••••"', 'masked saved-key placeholder'],
      ['const [showKeyDraft, setShowKeyDraft] = (0, react.useState)(false);', 'visibility starts hidden'],
      ['type: savedKey !== void 0 || showKeyDraft ? "text" : "password"', 'password field reveals only on click'],
      ['disabled: disabled || keyLocked || keyDraft.length === 0 && (keyState?.configured !== true || !canRevealSaved)', 'Web requires a typed key'],
      ['window.dshDesktop?.revealSavedModelKey', 'Desktop-only reveal capability'],
      ['setSavedKey(stored)', 'saved key becomes visible only after explicit reveal'],
      ['readOnly: savedKey !== void 0', 'revealed key cannot be edited or resaved accidentally'],
      ['spellCheck: false', 'a revealed key is never spellchecked'],
      ['setSavedKey(void 0)', 'eye hides the saved value again'],
      ['if (keyDraft.length > 0) { setShowKeyDraft((shown) => !shown); return; }', 'typed replacement still toggles'],
      ['if (event.target.value.length === 0) setShowKeyDraft(false);', 'clearing the draft hides it again'],
      ['t("hideSavedKey")', 'accessible saved-key hide label'],
      ['t("showSavedKey")', 'accessible saved-key show label'],
      ['M2.062 12.348', 'Lucide Eye icon'],
      ['M10.733 5.076', 'Lucide EyeOff icon'],
    ] as const) assert.ok(adapted.includes(fragment), behavior)
    assert.doesNotMatch(adapted, /remote\.credentials\.resolve/u)
    assert.equal(readFileSync(join(installed, 'lib', 'client.js'), 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('breaks a staged hardlink without modifying its original source', () => {
  const { root, client } = fixture()
  try {
    const source = join(root, 'original-client.js')
    writeFileSync(source, original)
    rmSync(client)
    linkSync(source, client)
    prioritizeOpenRouterModelsSettings(root)
    assert.equal(readFileSync(source, 'utf8'), original)
    assert.notEqual(readFileSync(client, 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('validates every staged copy before modifying any', () => {
  const { root, client } = fixture()
  try {
    const second = join(root, 'node_modules', '.pnpm', '@deepseek-ai+dsh-client-ui-settings-models@0.1.2-rc.1', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-models')
    mkdirSync(join(second, 'lib'), { recursive: true })
    writeFileSync(join(second, 'package.json'), manifest)
    writeFileSync(join(second, 'lib', 'client.js'), original + '\n// drift')
    assert.throws(() => prioritizeOpenRouterModelsSettings(root), /pinned Models UI hash changed/u)
    assert.equal(readFileSync(client, 'utf8'), original)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('full, quick, and Nix staging install the OpenRouter Models setting', () => {
  const stage = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')
  assert.equal(stage.split('prioritizeOpenRouterModelsSettings(runtime)').length - 1, 2)
  assert.ok(nix.includes('node ${../scripts/models-settings-default.mjs} "$PWD"'))
})
