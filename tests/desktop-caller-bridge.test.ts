import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { DesktopBridge } from '../src/contracts.ts'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8')
const contracts = readFileSync(new URL('../src/contracts.ts', import.meta.url), 'utf8')

const bridge: Pick<DesktopBridge, 'tockTutor'> = {
  tockTutor: {
    authorize: async () => ({ authorization: 'opaque' }),
  },
}
void bridge

test('isolated preload exposes only one bounded TockTutor caller authorization method', () => {
  const contract = contracts.match(/interface TockTutorDesktopCallerBridge[\s\S]*?\n\}/u)?.[0]
  assert.ok(contract)
  assert.match(contract, /authorize\(operation: DesktopCallerOperation\)/u)
  assert.doesNotMatch(contract, /invoke|send|path|handle/iu)
  assert.match(preload, /ipcRenderer\.invoke\('desktop:tocktutor-authorize', operation\)/u)
  assert.equal((preload.match(/desktop:tocktutor-authorize/g) ?? []).length, 1)
})

test('main issues caller authorization only after the trusted-main IPC guard', () => {
  const handler = main.match(/ipcMain\.handle\('desktop:tocktutor-authorize'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(handler)
  assert.match(handler, /assertTrustedMainIpc\(event\)[\s\S]*desktopCallerAuthorizations\.issue/u)
  assert.match(handler, /String\(event\.sender\.id\)/u)
  assert.doesNotMatch(handler, /senderFrame\?\.url|sessionId|vaultId|vaultGeneration/u)
  assert.match(main, /overrides\.preview === undefined \? desktopCallerChannel\.environment : undefined/u)
})

test('runtime and window teardown revoke caller leases on every owned lifecycle', () => {
  assert.match(main, /desktopCallerAuthorizations\.revokeWindow\(String\(window\.webContents\.id\)\)/u)
  assert.ok((main.match(/desktopCallerChannel\.stop\(\)/g) ?? []).length >= 6)
  assert.equal((main.match(/desktopCallerChannel\.start\(\)/g) ?? []).length, 1)
})
