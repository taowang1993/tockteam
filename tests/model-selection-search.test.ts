import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { Script } from 'node:vm'
import { addModelSelectionSearch } from '../scripts/model-selection-search.mjs'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const store = join(repository, 'node_modules', '.pnpm')
const installed = join(store, readdirSync(store).find(name => name.startsWith('@deepseek-ai+dsh-client-ui-model-selection@0.1.2-rc.1_'))!, 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection')
const manifest = readFileSync(join(installed, 'package.json'), 'utf8')
const original = readFileSync(join(installed, 'lib', 'client.js'), 'utf8')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-model-search-'))
  const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection')
  mkdirSync(join(packageRoot, 'lib'), { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), manifest)
  writeFileSync(join(packageRoot, 'lib', 'client.js'), original)
  return { root, packageRoot, client: join(packageRoot, 'lib', 'client.js') }
}

test('composer model menu searches names, providers and IDs without changing selection', () => {
  const { root, client } = fixture()
  try {
    addModelSelectionSearch(root)
    const adapted = readFileSync(client, 'utf8')
    assert.match(adapted, /type: "search"/u)
    assert.match(adapted, /"aria-label": t\("menu\.search"\)/u)
    assert.match(adapted, /const normalizedQuery = modelQuery\.trim\(\)\.toLowerCase\(\)/u)
    assert.match(adapted, /group\.name, group\.id, model\.name, model\.id/u)
    assert.match(adapted, /state\.groups\.map\(\(group\) =>/u)
    assert.match(adapted, /state\.status === "ready" && visibleChoices\.length === 0/u)
    assert.match(adapted, /"empty\.search": "No matching models\."/u)
    assert.match(adapted, /"empty\.search": "没有匹配的模型。"/u)
    assert.match(adapted, /"menu\.search": "Search Models"/u)
    assert.match(adapted, /"menu\.search": "搜索模型"/u)
    assert.match(adapted, /setModelQuery\(""\);\s+setOpen\(true\)/u)
    assert.match(adapted, /active < 0 \? offset > 0 \? 0 : items\.length - 1/u)
    assert.match(adapted, /event\.key === "Escape".*close\(true\)/u, 'Escape closes the picker and restores trigger focus')
    assert.equal(readFileSync(join(installed, 'lib', 'client.js'), 'utf8'), original)
    new Script(adapted)
    addModelSelectionSearch(root)
    assert.equal(readFileSync(client, 'utf8'), adapted)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('composer opens a single Synara-style picker with provider tabs, stars and Host-backed effort', () => {
  const { root, client } = fixture()
  try {
    addModelSelectionSearch(root)
    const adapted = readFileSync(client, 'utf8')
    assert.match(adapted, /"tockteam-model-picker"/u)
    const styles = readFileSync(join(repository, 'plugins', 'skins', 'src', 'client', 'tailwind.css'), 'utf8')
    assert.match(styles, /@utility tockteam-model-picker/u)
    assert.match(styles, /& \._7KE1Ra_sliderWrap/u)
    assert.match(adapted, /\.tockteam-app-rail button\[aria-label=/u)
    assert.match(adapted, /role: "tablist"/u)
    assert.match(adapted, /role: "tab"/u)
    assert.match(adapted, /role: "dialog"/u)
    assert.match(adapted, /tockteam\.model-favorites\.v1/u)
    assert.match(adapted, /"aria-label": t\(starred \? "action\.unstar" : "action\.star"/u)
    assert.doesNotMatch(adapted, /group\.name\.slice\(0, 1\)/u, 'provider tabs must identify DeepSeek and OpenRouter in text')
    assert.match(adapted, /"effort\.unavailable"/u, 'models without an effort ladder explain the disabled slider')
    assert.match(adapted, /type: "range"/u)
    assert.match(adapted, /aria-label": t\("menu\.effort"\)/u)
    assert.match(adapted, /chooseEffort\(effortChoices\[Number\(event\.currentTarget\.value\)\]\?\.effort\)/u)
    assert.doesNotMatch(adapted, /pane === "root"/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('model search rejects drift and staged aliases outside the runtime', () => {
  const { root, client } = fixture()
  try {
    const changed = original + '\n// unexpected upstream change\n'
    writeFileSync(client, changed)
    assert.throws(() => addModelSelectionSearch(root), /pinned|shape|hash/u)
    assert.equal(readFileSync(client, 'utf8'), changed)
  } finally { rmSync(root, { recursive: true, force: true }) }

  const other = fixture()
  try {
    rmSync(other.packageRoot, { recursive: true })
    symlinkSync(installed, other.packageRoot, 'dir')
    assert.throws(() => addModelSelectionSearch(other.root), /outside/u)
    assert.equal(createHash('sha256').update(readFileSync(join(installed, 'lib', 'client.js'))).digest('hex'), createHash('sha256').update(original).digest('hex'))
  } finally { rmSync(other.root, { recursive: true, force: true }) }
})

test('full, quick and Nix staging include composer model search', () => {
  const stage = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')
  assert.equal(stage.split('addModelSelectionSearch(runtime)').length - 1, 2)
  assert.ok(nix.includes('node ${../scripts/model-selection-search.mjs} "$PWD"'))
})
