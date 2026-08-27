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
    cancelDispatch: async () => {},
    completeDispatch: async () => 'handled',
    nextDispatch: async () => null,
  },
}
void bridge

test('isolated preload exposes only bounded TockTutor caller and dispatch methods', () => {
  const contract = contracts.match(/interface TockTutorDesktopCallerBridge[\s\S]*?\n\}/u)?.[0]
  assert.ok(contract)
  assert.match(contract, /authorize\([\s\S]*operation: DesktopCallerOperation,[\s\S]*expectedVault\?/u)
  assert.match(contract, /cancelDispatch\(\)/u)
  assert.match(contract, /nextDispatch\(\)/u)
  assert.match(contract, /completeDispatch\(request: TockTutorDesktopDispatchCompletionRequest\)/u)
  assert.match(contracts, /interface TockTutorDesktopDispatchCompletionRequest[\s\S]*deliveryId: string/u)
  assert.match(contracts, /type TockTutorDesktopDispatchEvent[\s\S]*deliveryId: string/u)
  assert.doesNotMatch(contract, /invokeAny|sendAny|absolutePath|handle:/iu)
  assert.match(preload, /ipcRenderer\.invoke\('desktop:tocktutor-authorize', \{ expectedVault, operation \}\)/u)
  assert.match(preload, /ipcRenderer\.invoke\('desktop:tocktutor-dispatch-cancel'\)/u)
  assert.match(preload, /ipcRenderer\.invoke\('desktop:tocktutor-dispatch-next'\)/u)
  assert.match(preload, /ipcRenderer\.invoke\('desktop:tocktutor-dispatch-complete', request\)/u)
})

test('main issues caller authorization only after the trusted-main IPC guard', () => {
  const handler = main.match(/ipcMain\.handle\('desktop:tocktutor-authorize'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(handler)
  assert.match(handler, /assertTrustedMainIpc\(event\)[\s\S]*resolveDesktopCallerAuthorizationRequest[\s\S]*desktopCallerAuthorizations\.issue/u)
  assert.match(handler, /String\(event\.sender\.id\)/u)
  assert.match(handler, /dispatchConsumerId\(event\.sender, frame\)/u)
  assert.doesNotMatch(handler, /senderFrame\?\.url|sessionId|vaultId|vaultGeneration/u)
  const next = main.match(/ipcMain\.handle\('desktop:tocktutor-dispatch-next'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(next)
  assert.match(next, /assertTrustedMainIpc\(event\)[\s\S]*desktopDispatchChannel\.next/u)
  assert.match(next, /desktopDispatchChannel\.rollback/u)
  assert.match(next, /dispatchConsumerId\(event\.sender, frame\)/u)
  assert.match(next, /mainDispatchLeases\.set\(operationId/u)
  assert.doesNotMatch(next, /vaultId|vaultGeneration|sessionId/u)
  const complete = main.match(/ipcMain\.handle\('desktop:tocktutor-dispatch-complete'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(complete)
  assert.match(complete, /lease === undefined \|\| lease\.deliveryId !== deliveryId/u)
  assert.match(complete, /lease\.sender !== event\.sender \|\| lease\.frame !== event\.senderFrame/u)
  assert.match(main, /sender\.on\('did-start-navigation', navigation\)/u)
  assert.match(main, /sender\.once\('render-process-gone', abort\)/u)
  const cancel = main.match(/ipcMain\.handle\('desktop:tocktutor-dispatch-cancel'[\s\S]*?\n  \}\)/u)?.[0]
  assert.ok(cancel)
  assert.match(cancel, /assertTrustedMainIpc\(event\)/u)
  assert.match(cancel, /abortMainDispatchConsumer/u)
  assert.match(main, /overrides\.preview === undefined \? desktopCallerChannel\.environment : undefined/u)
})

test('runtime and window teardown revoke caller leases on every owned lifecycle', () => {
  const createWindow = main.match(/function createWindow[\s\S]*?\n\}\n\nasync function showSplash/u)?.[0]
  assert.ok(createWindow)
  assert.match(createWindow, /const windowId = String\(window\.webContents\.id\)/u)
  assert.match(createWindow, /window\.on\('closed'[\s\S]*desktopCallerAuthorizations\.revokeWindow\(windowId\)/u)
  assert.ok((createWindow.match(/desktopCallerAuthorizations\.revokeWindow\(windowId\)/g) ?? []).length >= 3)
  assert.match(createWindow, /webContents\.on\('render-process-gone'[\s\S]*desktopCallerAuthorizations\.revokeWindow\(windowId\)/u)
  assert.match(main, /async function stopRuntimeAndChannels\(\)[\s\S]*desktopCallerChannel\.stop\(\)/u)
  assert.equal((main.match(/desktopCallerChannel\.start\(\)/g) ?? []).length, 1)
})
