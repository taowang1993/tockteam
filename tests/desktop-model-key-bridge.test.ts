import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8')
const contracts = readFileSync(new URL('../src/contracts.ts', import.meta.url), 'utf8')

test('Desktop-only credential reveal passes the trusted main frame and validates the read', () => {
  const handler = main.match(/ipcMain\.handle\('desktop:models:reveal-saved-key'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(handler, 'main registers the Desktop-only handler')
  assert.match(handler, /assertTrustedMainIpc\(event\)/u)
  assert.match(handler, /assertNoLauncherIpcArguments\(extra\)/u)
  assert.match(handler, /readSavedDesktopModelKey\(desktopInfo\(\)\.dshHome, raw, parseCredentialsDocument\)/u)
  assert.match(main, /dsh-credentials-local.*lib.*index\.js/u, 'uses the pinned DSH document parser')
  assert.match(preload, /ipcRenderer\.invoke\('desktop:models:reveal-saved-key', ref\)/u)
  assert.match(contracts, /revealSavedModelKey\(ref: string\): Promise<string \| null>/u)
})
