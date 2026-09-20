#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile as execCallback, spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build, stop } from 'esbuild'
import { buildTailwindCss } from './tailwind.mjs'
import { ensureElectronInstalled } from './electron-runtime.mjs'
import { stopChildProcess } from './process-cleanup.mjs'

// Actual React components and pinned theme in an isolated, hidden Electron renderer.
// No Web launcher, standalone browser, user profile, credentials, or host mutations.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidence = await mkdtemp(join(tmpdir(), 'settings-electron-proof-'))
const session = `settings-electron-${process.pid}`
const execFile = promisify(execCallback)
const cli = async (...args) => {
  const { stdout } = await execFile('playwright-cli', [`-s=${session}`, ...args], { cwd: evidence, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  await writeFile(join(evidence, 'interactions.txt'), stdout, { flag: 'a' })
  if (stdout.includes('### Error')) throw new Error(stdout)
  return stdout
}
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
let child, attached = false
try {
  const theme = await readFile(join(root, '.stage/dsh-runtime/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'), 'utf8')
  const sheets = [...theme.matchAll(/^\s*var \w+_css_default = (".*");$/gm)].map(([, literal]) => JSON.parse(literal))
  assert.equal(sheets.length, 6, 'all pinned theme sheets are present')
  const presets = await readFile(join(root, '.stage/dsh-runtime/node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js'), 'utf8')
  const presetCss = JSON.parse(presets.match(/const css = (".*");/)?.[1] ?? 'null')
  assert.ok(presetCss?.includes('.rtSEdW_cards{'), 'update the revision-bound preset layout seam when the DSH pin changes')
  await writeFile(join(evidence, 'theme.css'), [...sheets, presetCss, await buildTailwindCss(root)].join('\n'))
  const source = await readFile(join(root, 'plugins/sidebar/src/client/plugin.tsx'), 'utf8')
  const component = source.slice(source.indexOf('function sidebarLabel('), source.indexOf('\nfunction syncSidebarSettings('))
  assert.ok(component.includes('function SidebarSettingsRow('))
  const fixture = await readFile(join(root, 'tests/fixtures/settings-design.tsx'), 'utf8')
  await build({ stdin: { contents: fixture + '\n' + component, resolveDir: join(root, 'tests/fixtures'), loader: 'tsx' }, outfile: join(evidence, 'fixture.js'), bundle: true, format: 'iife', platform: 'browser', nodePaths: [join(root, 'plugins/ui/node_modules')] })
  stop()
  await writeFile(join(evidence, 'fixture.html'), '<!doctype html><html style="color-scheme:dark"><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><style>body{margin:0;font:var(--dsw-font-s-14);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}main{max-width:1120px;margin:32px auto;padding:0 24px}</style></head><body data-ds-dark-theme><main></main><script src="fixture.js"></script></body></html>')
  await writeFile(join(evidence, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1512,height:949,useContentSize:true,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.loadFile(${JSON.stringify(join(evidence, 'fixture.html'))});});app.on('window-all-closed',()=>app.quit());`)
  child = spawn(ensureElectronInstalled(root), ['--use-mock-keychain', `--user-data-dir=${join(evidence, 'user-data')}`, `--remote-debugging-port=${port}`, '--force-device-scale-factor=2', join(evidence, 'main.cjs')], { cwd: root, detached: true, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => { void writeFile(join(evidence, 'electron.log'), chunk, { flag: 'a' }) })
  child.stderr.on('data', chunk => { void writeFile(join(evidence, 'electron.log'), chunk, { flag: 'a' }) })
  const deadline = Date.now() + 30000
  let ready = false
  while (Date.now() < deadline) {
    ready = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).then(pages => pages.some(p => p.type === 'page' && p.url.endsWith('fixture.html'))).catch(() => false)
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Electron renderer started')
  await cli('attach', `--cdp=http://127.0.0.1:${port}`); attached = true
  const output = await cli('run-code', (await readFile(join(root, 'scripts/settings-design-electron-checks.js'), 'utf8')).replaceAll('EVIDENCE_DIRECTORY', evidence))
  await writeFile(join(evidence, 'result.txt'), output)
  for (const name of ['launcher-dark.png', 'assistant-dark.png']) {
    const png = await readFile(join(evidence, name))
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [3024, 1898])
  }
  console.log(output)
} finally {
  if (attached) await cli('detach').catch(() => {})
  if (child) await stopChildProcess(child)
  stop()
  await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ rootPid: process.pid, electronPid: child?.pid, processTreeStopped: true }))
  console.log(JSON.stringify({ evidence }))
}
