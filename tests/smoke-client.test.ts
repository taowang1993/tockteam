import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../scripts/smoke-client.cjs', import.meta.url), 'utf8')

test('Chromium smoke watchdog starts before navigation and renderer work', () => {
  const watchdog = source.indexOf('watchdog = setTimeout')
  const navigation = source.indexOf('await window.loadURL(runtimeUrl)')
  assert.ok(watchdog > 0)
  assert.ok(navigation > watchdog)
  assert.match(source, /clearTimeout\(watchdog\)/u)
})

test('Chromium smoke rejects the visible TockCoder Preview badge', () => {
  assert.match(source, /state\.previewBadgeVisible === true/u)
})
