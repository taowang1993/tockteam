import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deferSettingsOpen } from '../src/desktop-settings-navigation.ts'

test('settings opening waits for the active TockCoder surface and retries boundedly', () => {
  const scheduled: Array<() => void> = []
  let coder = false
  let tutorActive = true
  let button: { disabled?: boolean; click(): void } | undefined
  let clicks = 0
  deferSettingsOpen({
    findButton: () => button,
    isTockCoder: () => coder,
    isTockTutorActive: () => tutorActive,
    schedule: callback => { scheduled.push(callback) },
    maxAttempts: 4,
  })
  assert.equal(scheduled.length, 1)
  scheduled.shift()!()
  assert.equal(scheduled.length, 1)
  coder = true
  tutorActive = false
  button = { click: () => { clicks += 1 } }
  scheduled.shift()!()
  assert.equal(clicks, 1)
  assert.equal(scheduled.length, 0)
})

test('settings selection is idempotent when the shell is already open', () => {
  const scheduled: Array<() => void> = []
  let clicks = 0
  let selected = 0
  deferSettingsOpen({
    findButton: () => ({ click: () => { clicks += 1 } }),
    isOpen: () => true,
    isTockCoder: () => true,
    isTockTutorActive: () => false,
    onOpened: () => { selected += 1 },
    schedule: callback => { scheduled.push(callback) },
  })
  while (scheduled.length > 0) scheduled.shift()!()
  assert.equal(clicks, 0)
  assert.equal(selected, 1)
})

test('settings retry stops at its bounded ceiling without clicking a stale surface', () => {
  const scheduled: Array<() => void> = []
  deferSettingsOpen({
    findButton: () => undefined,
    isTockCoder: () => false,
    isTockTutorActive: () => true,
    schedule: callback => { scheduled.push(callback) },
    maxAttempts: 2,
  })
  while (scheduled.length > 0) scheduled.shift()!()
  assert.equal(scheduled.length, 0)
})
