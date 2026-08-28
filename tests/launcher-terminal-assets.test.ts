import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { LAUNCHER_TERMINAL_ASSETS, launcherTerminalAssetUrl } from '../src/launcher-terminal-assets.ts'

test('Terminal Launcher packages the seven pinned finite assets under corrected keys', async () => {
  assert.equal(LAUNCHER_TERMINAL_ASSETS.length, 7)
  assert.deepEqual(LAUNCHER_TERMINAL_ASSETS.map(asset => asset.key), [
    'terminal-command-prompt', 'terminal-iterm', 'terminal-powershell-core', 'terminal-powershell', 'terminal-macos', 'terminal-windows', 'terminal-wsl',
  ])
  for (const asset of LAUNCHER_TERMINAL_ASSETS) {
    const bytes = await readFile(new URL(`../${asset.source}`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash, asset.key)
    assert.equal(launcherTerminalAssetUrl(asset.key), `./launcher-assets/${asset.fileName}`)
  }
  assert.equal(launcherTerminalAssetUrl('terminal-launcher'), undefined)
})
