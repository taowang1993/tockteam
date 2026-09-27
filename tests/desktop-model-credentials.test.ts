import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readSavedDesktopModelKey } from '../src/desktop-model-credentials.ts'

const parse = (source: string): { refs: Map<string, string> } => ({ refs: new Map(Object.entries(JSON.parse(source) as Record<string, string>)) })

function fixture(run: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), 'tockteam-model-key-'))
  try { run(home) } finally { rmSync(home, { recursive: true, force: true }) }
}

test('only a saved Models API key is returned; absent keys never become a value', () => fixture(home => {
  const file = join(home, '.credentials.yaml')
  assert.equal(readSavedDesktopModelKey(home, 'OPENROUTER_API_KEY', parse), null)
  writeFileSync(file, JSON.stringify({ OPENROUTER_API_KEY: 'fake-saved-key', OTHER_SECRET: 'not-an-api-key' }), { mode: 0o600 })
  assert.equal(readSavedDesktopModelKey(home, 'OPENROUTER_API_KEY', parse), 'fake-saved-key')
  assert.equal(readSavedDesktopModelKey(home, 'DEEPSEEK_API_KEY', parse), null)
  for (const ref of ['OTHER_SECRET', '../.env', 'OPENROUTER_API_KEY\n', '', '_API_KEY', 'A'.repeat(130) + '_API_KEY']) {
    assert.throws(() => readSavedDesktopModelKey(home, ref, parse), /Invalid Models API key reference/u)
  }
}))

test('refuses symlinks, public permissions, and oversized credential files', () => fixture(home => {
  const file = join(home, '.credentials.yaml')
  const elsewhere = join(home, 'elsewhere')
  writeFileSync(elsewhere, JSON.stringify({ OPENROUTER_API_KEY: 'fake-saved-key' }), { mode: 0o600 })
  symlinkSync(elsewhere, file)
  assert.throws(() => readSavedDesktopModelKey(home, 'OPENROUTER_API_KEY', parse), /private regular file/u)
  rmSync(file)
  writeFileSync(file, '{}', { mode: 0o644 })
  if (process.platform !== 'win32') assert.throws(() => readSavedDesktopModelKey(home, 'OPENROUTER_API_KEY', parse), /private/u)
  chmodSync(file, 0o600)
  writeFileSync(file, 'x'.repeat(1024 * 1024 + 1))
  assert.throws(() => readSavedDesktopModelKey(home, 'OPENROUTER_API_KEY', parse), /invalid|size limit/u)
}))
