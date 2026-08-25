import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

test('failed pop-out navigation destroys its hidden window and route state', () => {
  const open = main.match(/async open\(relativePath[\s\S]*?\n      \},\n    \},\n  \}\)/u)?.[0]
  assert.ok(open)
  assert.match(open, /try \{[\s\S]*await window\.loadURL\(target\.href\)[\s\S]*\} catch \(error\) \{[\s\S]*popOutWindows\.delete\(windowId\)[\s\S]*popOutRouteTokens\.delete\(windowId\)[\s\S]*window\.destroy\(\)[\s\S]*throw error/u)
})
