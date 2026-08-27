import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'
import { SKIN_IDS } from '../plugins/skins/src/skin-ids.ts'
import { LAUNCHER_LOCAL_EXTENSION_ASSET_HASHES, LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS } from '../src/launcher-local-extension-assets.ts'

const html = readFileSync(new URL('../src/launcher.html', import.meta.url), 'utf8')
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8')
const launcherSettings = readFileSync(new URL('../src/launcher-settings.tsx', import.meta.url), 'utf8')
const localSettings = readFileSync(new URL('../src/launcher-local-settings.tsx', import.meta.url), 'utf8')
const localTools = readFileSync(new URL('../src/launcher-local-tools.ts', import.meta.url), 'utf8')
const fileSearchTool = readFileSync(new URL('../src/launcher-file-search-tool.ts', import.meta.url), 'utf8')
const fileSearchSettings = readFileSync(new URL('../src/launcher-file-search-settings.tsx', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/launcher-preload.ts', import.meta.url), 'utf8')
const smoke = readFileSync(new URL('../scripts/launcher-electron-smoke.mjs', import.meta.url), 'utf8')
const skinIds = readFileSync(new URL('../plugins/skins/src/skin-ids.ts', import.meta.url), 'utf8')
const tockTutor = readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }

test('launcher document is standalone, strict, external, and accessible', () => {
  assert.match(html, /Content-Security-Policy/u)
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'/u)
  assert.match(html, /<link rel="stylesheet" href="\.\/launcher\.css"/u)
  assert.match(html, /<script type="module" src="\.\/launcher\.js"><\/script>/u)
  assert.match(html, /<main[^>]+id="launcher-root"/u)
  assert.match(html, /<h1[^>]*>TockLauncher<\/h1>/u)
  assert.match(html, /<label[^>]+for="launcher-search"/u)
  assert.match(html, /id="launcher-search"[^>]+role="combobox"/u)
  assert.match(html, /role="listbox"/u)
  assert.match(html, /role="status"/u)
  assert.match(html, /id="launcher-close"/u)
  assert.doesNotMatch(html, /<style[\s>]|<form[\s>]/u)
  assert.doesNotMatch(html, /<script(?! type="module" src=)[\s>]/u)
  assert.doesNotMatch(html, /unsafe-(?:inline|eval)|\*/u)
})

test('launcher renderer stays empty/search-ready and reports bootstrap status', () => {
  assert.match(launcher, /data-launcher-ready/u)
  assert.match(launcher, /\.focus\(\)/u)
  assert.match(launcher, /tockteamLauncher/u)
  assert.match(launcher, /bridge\.search\(/u)
  assert.match(launcher, /launcher-results/u)
  assert.match(launcher, /launcher-history/u)
  assert.match(launcher, /invokeAction/u)
  assert.match(launcher, /surfaceSettings\.fuzziness/u)
  assert.match(launcher, /surfaceSettings\.maxSearchResultItems/u)
  assert.match(launcher, /surfaceSettings\.searchEngineId/u)
  assert.match(launcher, /createLauncherLocalTool/u)
  assert.match(launcher, /getLocalExtensionSettings/u)
  assert.match(launcher, /ueli-local:/u)
  assert.doesNotMatch(launcher, /fuzziness: 0\.5,\s*maxSearchResultItems: 50,\s*searchEngineId: 'fuzzysort'/u)
  assert.doesNotMatch(launcher, /ipcRenderer|handlerKey|argument/u)
  assert.doesNotMatch(launcher, /fetch\s*\(/u)
  assert.doesNotMatch(launcher, /localStorage|sessionStorage|XMLHttpRequest|WebSocket/u)
})

test('local settings controls cover every provider and keep UUID formats bounded', () => {
  for (const label of ['Base64 Conversion', 'Calculator', 'Color Converter', 'Password Generator', 'Quick Formatter', 'Rowland Text Editor', 'UUID / GUID Generator']) assert.match(localSettings, new RegExp(label, 'u'))
  assert.match(localSettings, /searchResultFormats/u)
  assert.match(localSettings, /maxLength.{0,3}4096/u)
})

test('local tools stay finite and browser-safe', () => {
  assert.match(localTools, /Base64 Operation|Rowland Input|Generated UUIDs/u)
  assert.match(localTools, /maxLength/u)
  assert.doesNotMatch(localTools, /node:|ipcRenderer|dshDesktop|fetch\s*\(|localStorage|sessionStorage/u)
  assert.match(fileSearchTool, /LAUNCHER_FILE_SEARCH_QUERY_PREFIX|File Search Input/u)
  assert.match(fileSearchTool, /LAUNCHER_MAX_SEARCH_TERM_LENGTH|maxInputLength/u)
  assert.match(fileSearchTool, /item\.details/u)
  assert.match(fileSearchTool, /focus\(\)/u)
  assert.match(fileSearchTool, /additionalActions/u)
  assert.match(fileSearchTool, /menuitem/u)
  assert.match(fileSearchTool, /ArrowDown|ArrowUp/u)
  assert.doesNotMatch(fileSearchTool, /node:|ipcRenderer|dshDesktop|fetch\s*\(|localStorage|sessionStorage/u)
  assert.match(fileSearchSettings, /tocklauncher-file-search-settings/u)
  assert.match(fileSearchSettings, /maxLength=\{4096\}/u)
})

test('settings renderer never inserts sensitive values and remounts local controls after reload', () => {
  assert.match(launcherSettings, /!LAUNCHER_SENSITIVE_SETTING_KEYS\.includes\(key as never\)[\s\S]+setSnapshot/u)
  assert.match(launcherSettings, /setSnapshotRevision\([\s\S]+<LauncherLocalSettings key=\{snapshotRevision\}/u)
  assert.match(launcherSettings, /simpleFileSearchDraft/u)
  assert.match(launcherSettings, /onDraftFoldersChange/u)
  assert.match(launcherSettings, /<LauncherFileSearchSettings key=\{snapshotRevision\}[\s\S]+draftFolders=\{simpleFileSearchDraft\}/u)
  assert.match(fileSearchSettings, /useEffect/u)
  assert.match(fileSearchSettings, /draftFolders/u)
})

test('launcher renderer uses shared color tokens for primary actions and selection', () => {
  assert.match(launcher, /brand-primary-invert/u)
  assert.match(launcher, /interactive-bg-active/u)
  assert.doesNotMatch(launcher, /text-white|interactive-bg-selected|bg-selected/u)
})

test('TockTutor titlebar and all shared skins use valid TockTeam token contracts', () => {
  assert.match(tockTutor, /--tt-accent:var\(--dsw-alias-brand-primary/u)
  assert.match(tockTutor, /--tt-muted:var\(--dsw-alias-label-secondary/u)
  assert.match(tockTutor, /--tt-panel:var\(--dsw-alias-bg-layer-1/u)
  assert.match(tockTutor, /--tt-text:var\(--dsw-alias-label-primary/u)
  assert.doesNotMatch(tockTutor, /dsw-alias-(?:accent-primary|fg-muted|bg-elevated|fg-primary)/u)
  assert.equal(TOCKTEAM_SKINS.length, 4)
  assert.deepEqual(new Set(TOCKTEAM_SKINS.map(skin => skin.id)), new Set(SKIN_IDS))
  for (const skin of TOCKTEAM_SKINS) {
    for (const token of ['--dsw-alias-brand-primary', '--dsw-alias-brand-primary-invert', '--dsw-alias-label-secondary', '--dsw-alias-interactive-bg-active']) {
      assert.equal(typeof skin.tokens[token], 'string', `${skin.id}:${token}`)
    }
  }
  assert.match(skinIds, /deepCurrent/u)
  assert.match(skinIds, /jadeCircuit/u)
  assert.match(skinIds, /porcelain/u)
  assert.match(skinIds, /emberDusk/u)
})

test('launcher renderer uses shared types, Lucide icons, visible selection, and layered Escape semantics', () => {
  assert.match(launcher, /from 'lucide'/u)
  assert.match(launcher, /from '\.\/launcher-preload-bridge\.ts'/u)
  assert.doesNotMatch(html, /⌕/u)
  assert.match(launcher, /aria-selected:bg-/u)
  assert.match(launcher, /tockteam-launcher-focus-search/u)
  assert.match(preload, /dispatchEvent\(new Event\('tockteam-launcher-focus-search'\)\)/u)
  assert.match(launcher, /No Recent Searches/u)
  assert.match(launcher, /Results Refreshed\. Try Again\./u)
  assert.doesNotMatch(launcher, /event\.metaKey \|\| event\.ctrlKey/u)
  assert.match(launcher, /event\.stopPropagation\(\)/u)
})

test('local extension assets remain pinned to reviewed provenance hashes', () => {
  for (const [extensionId, imageKey] of Object.entries(LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS)) {
    const bytes = readFileSync(new URL(`../vendor/ueli/assets/Extensions/${extensionId}/${imageKey}.png`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), LAUNCHER_LOCAL_EXTENSION_ASSET_HASHES[extensionId as keyof typeof LAUNCHER_LOCAL_EXTENSION_ASSET_HASHES])
  }
  assert.match(build, /LAUNCHER_LOCAL_EXTENSION_ASSET_HASHES/u)
})

test('launcher build emits dedicated browser and preload outputs', () => {
  assert.match(build, /src', 'launcher-preload\.ts[\s\S]*launcher-preload\.cjs/u)
  assert.match(build, /src', 'launcher\.ts[\s\S]*launcher\.js/u)
  assert.match(build, /launcherTailwindCss/u)
  assert.match(build, /launcher\.css/u)
  assert.match(build, /launcher\.html/u)
  assert.match(build, /launcher-file-search-tool\.ts/u)
  assert.match(preload, /exposeInMainWorld\('tockteamLauncher'/u)
  assert.match(preload, /launcher-window:dismiss|LAUNCHER_WINDOW_IPC_CHANNELS/u)
  assert.doesNotMatch(preload, /dshDesktop|electronAPI|require\s*\(/u)
})

test('launcher Electron smoke enforces fresh build and DSH staging', () => {
  assert.match(packageJson.scripts?.['test:launcher:electron'] ?? '', /build:tocktutor/gu)
  assert.match(packageJson.scripts?.['test:launcher:electron'] ?? '', /run build/gu)
  assert.match(packageJson.scripts?.['test:launcher:electron'] ?? '', /stage-dsh\.mjs --quick/gu)
})

test('launcher smoke stops its Electron child on every host platform', () => {
  assert.match(smoke, /process\.platform === 'win32'[\s\S]*stopChildProcess\(child/u)
  assert.match(smoke, /process\.kill\(-child\.pid/u)
})
