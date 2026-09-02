import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { ensureElectronInstalled } from '../scripts/electron-runtime.mjs'

test('development launch refreshes the existing stage instead of redeploying it', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>
  }

  const start = manifest.scripts.start
  const freshStart = manifest.scripts['start:fresh']
  assert.ok(start)
  assert.ok(freshStart)
  assert.match(start, /stage-dsh\.mjs --quick/)
  assert.doesNotMatch(start, /pnpm run stage:dsh/)
  assert.match(freshStart, /pnpm run stage:dsh/)
})

test('desktop launch repairs a partial Electron install', () => {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-electron-'))
  const electron = join(root, 'node_modules', 'electron')
  const executable = process.platform === 'darwin'
    ? 'Electron.app/Contents/MacOS/Electron'
    : process.platform === 'win32'
      ? 'electron.exe'
      : 'electron'

  try {
    const stagedNode = join(
      root,
      '.stage',
      'node-runtime',
      ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']),
    )
    mkdirSync(dirname(stagedNode), { recursive: true })
    if (process.platform === 'win32') copyFileSync(process.execPath, stagedNode)
    else symlinkSync(process.execPath, stagedNode)
    mkdirSync(join(electron, 'dist'), { recursive: true })
    writeFileSync(join(electron, 'package.json'), '{"version":"42.3.0"}')
    writeFileSync(join(electron, 'dist', 'partial-download'), '')
    writeFileSync(join(electron, 'install.js'), `
      const { mkdirSync, writeFileSync } = require('node:fs')
      const { dirname, join } = require('node:path')
      const executable = ${JSON.stringify(executable)}
      const binary = join(__dirname, 'dist', executable)
      mkdirSync(dirname(binary), { recursive: true })
      writeFileSync(binary, '')
      writeFileSync(join(__dirname, 'dist', 'version'), '42.3.0')
      writeFileSync(join(__dirname, 'path.txt'), executable)
      writeFileSync(join(__dirname, 'installer-node.txt'), process.execPath)
    `)

    const binary = ensureElectronInstalled(root)

    assert.equal(readFileSync(join(electron, 'path.txt'), 'utf8'), executable)
    assert.equal(readFileSync(join(electron, 'installer-node.txt'), 'utf8'), realpathSync(stagedNode))
    assert.equal(binary, join(electron, 'dist', executable))
    assert.equal(existsSync(join(electron, 'dist', 'partial-download')), false)

    writeFileSync(join(electron, 'install.js'), 'throw new Error("unexpected reinstall")')
    assert.equal(ensureElectronInstalled(root), binary)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
