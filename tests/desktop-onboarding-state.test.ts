import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { completeDesktopOnboarding, readDesktopOnboardingComplete } from '../src/desktop-onboarding-state.ts'

test('Desktop onboarding finishes once without changing an existing model key', () => {
  const home = mkdtempSync(join(tmpdir(), 'tockteam-onboarding-state-'))
  try {
    const credential = join(home, '.credentials.yaml')
    writeFileSync(credential, 'example-key-record\n', { mode: 0o600 })
    assert.equal(readDesktopOnboardingComplete(home), false)
    completeDesktopOnboarding(home)
    assert.equal(readDesktopOnboardingComplete(home), true)
    completeDesktopOnboarding(home)
    assert.equal(readFileSync(credential, 'utf8'), 'example-key-record\n')
    const marker = readdirSync(home).find(file => file !== '.credentials.yaml')
    assert.ok(marker)
    assert.equal(lstatSync(join(home, marker)).mode & 0o777, 0o600)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('Desktop onboarding refuses to overwrite a changed completion marker', () => {
  const home = mkdtempSync(join(tmpdir(), 'tockteam-onboarding-state-'))
  try {
    completeDesktopOnboarding(home)
    const marker = join(home, readdirSync(home)[0]!)
    writeFileSync(marker, 'changed\n')
    assert.equal(readDesktopOnboardingComplete(home), false)
    assert.throws(() => completeDesktopOnboarding(home), /marker|already exists|EEXIST/u)
    assert.equal(readFileSync(marker, 'utf8'), 'changed\n')
  } finally { rmSync(home, { recursive: true, force: true }) }
})
