#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import electron from 'electron'
import { stopChildProcess } from './process-cleanup.mjs'

if (process.platform !== 'darwin') {
  console.log('macOS tray smoke skipped on this platform')
  process.exit(0)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const main = await readFile(join(root, 'src/main.ts'), 'utf8')
// Exercise the production factory without launching the workbench or touching user data.
const start = main.indexOf('function initializeLauncherTray(): void {')
const end = main.indexOf('\nfunction requestSecureQuit(', start)
assert.ok(start >= 0 && end > start, 'production tray factory is available')
const directory = await mkdtemp(join(tmpdir(), 'tockteam-tray-smoke-'))
let child
let timer
try {
  const result = await build({
    stdin: {
      contents: `
        import assert from 'node:assert/strict'
        import { app, Menu, nativeImage, Tray as NativeTray } from 'electron'
        import { SingleOwnedTray } from './src/launcher-lifecycle.ts'
        let observedTray
        class Tray extends NativeTray {
          constructor(image) { super(image); observedTray = this }
        }
        let launcherTrayOwner
        const PRODUCT_NAME = 'TockTeam Tray Smoke'
        const windowIconPath = () => ${JSON.stringify(join(root, 'assets/icons/512x512.png'))}
        ${main.slice(start, end)}
        app.setActivationPolicy('accessory')
        app.whenReady().then(async () => {
          try {
            assert.deepEqual(nativeImage.createFromPath(windowIconPath()).getSize(), { width: 512, height: 512 })
            initializeLauncherTray()
            for (let attempt = 0; attempt < 2; attempt++) {
              launcherTrayOwner.setVisible(true)
              await new Promise(resolve => setTimeout(resolve, 200))
              const bounds = observedTray.getBounds()
              console.log(JSON.stringify({ attempt, bounds }))
              assert.ok(bounds.width > 0 && bounds.width <= 40, 'tray must occupy one small menu-bar slot')
              assert.ok(bounds.height > 0 && bounds.height <= 40, 'tray must fit the menu bar')
              launcherTrayOwner.setVisible(false)
              assert.equal(observedTray.isDestroyed(), true)
            }
            app.exit(0)
          } catch (error) {
            console.error(error)
            launcherTrayOwner?.dispose()
            app.exit(1)
          }
        })
      `,
      loader: 'ts',
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    write: false,
  })
  const entry = join(directory, 'tray.cjs')
  await writeFile(entry, result.outputFiles[0].text)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(electron, ['--use-mock-keychain', `--user-data-dir=${join(directory, 'data')}`, entry], {
    detached: true,
    env,
    stdio: 'inherit',
  })
  console.log(`Tray smoke root PID: ${child.pid}`)
  const exitCode = await Promise.race([
    new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tray smoke timed out')), 15_000) }),
  ])
  assert.equal(exitCode, 0, 'native tray smoke passed')
} finally {
  clearTimeout(timer)
  if (child) {
    await stopChildProcess(child, 1_000, 1_000)
    console.log(`Tray smoke process tree stopped: ${child.pid}`)
  }
  await rm(directory, { recursive: true, force: true })
}
