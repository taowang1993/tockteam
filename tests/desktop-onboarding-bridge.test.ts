import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8')
const contracts = readFileSync(new URL('../src/contracts.ts', import.meta.url), 'utf8')

test('Desktop onboarding exposes only trusted completion facts, not model keys', () => {
  for (const [channel, operation] of [
    ['desktop:onboarding:status', 'readDesktopOnboardingComplete'],
    ['desktop:onboarding:complete', 'completeDesktopOnboarding'],
  ] as const) {
    const handler = main.match(new RegExp(`ipcMain\\.handle\\('${channel}'[\\s\\S]*?\\n  \\}\\)`, 'u'))?.[0]
    assert.ok(handler, `${channel} has a handler`)
    assert.match(handler, /assertTrustedMainIpc\(event\)/u)
    assert.match(handler, /assertNoLauncherIpcArguments\(rawArgs\)/u)
    assert.match(handler, new RegExp(`${operation}\\(app\\.getPath\\('userData'\\)\\)`, 'u'))
    assert.doesNotMatch(handler, /credential|apiKey|reveal/u, 'onboarding IPC never transports a key')
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel}'\\)`, 'u'))
  }
  assert.match(contracts, /onboarding: DesktopOnboardingBridge/u)
  assert.match(contracts, /interface DesktopOnboardingBridge \{[\s\S]*?status\(\): Promise<boolean>[\s\S]*?complete\(\): Promise<void>/u)
})
