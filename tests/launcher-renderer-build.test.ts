import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const html = readFileSync(new URL('../src/launcher.html', import.meta.url), 'utf8')
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/launcher-preload.ts', import.meta.url), 'utf8')
const smoke = readFileSync(new URL('../scripts/launcher-electron-smoke.mjs', import.meta.url), 'utf8')

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
  assert.doesNotMatch(launcher, /ipcRenderer|handlerKey|argument/u)
  assert.doesNotMatch(launcher, /fetch\s*\(/u)
  assert.doesNotMatch(launcher, /localStorage|sessionStorage|XMLHttpRequest|WebSocket/u)
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

test('launcher build emits dedicated browser and preload outputs', () => {
  assert.match(build, /src', 'launcher-preload\.ts[\s\S]*launcher-preload\.cjs/u)
  assert.match(build, /src', 'launcher\.ts[\s\S]*launcher\.js/u)
  assert.match(build, /launcherTailwindCss/u)
  assert.match(build, /launcher\.css/u)
  assert.match(build, /launcher\.html/u)
  assert.match(preload, /exposeInMainWorld\('tockteamLauncher'/u)
  assert.match(preload, /launcher-window:dismiss|LAUNCHER_WINDOW_IPC_CHANNELS/u)
  assert.doesNotMatch(preload, /dshDesktop|electronAPI|require\s*\(/u)
})

test('launcher smoke stops its Electron child on every host platform', () => {
  assert.match(smoke, /process\.platform === 'win32'[\s\S]*stopChildProcess\(child/u)
  assert.match(smoke, /process\.kill\(-child\.pid/u)
})
