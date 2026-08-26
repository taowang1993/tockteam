import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('Unix launcher resolves its package root through a bin symlink', {
  skip: process.platform === 'win32',
}, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'tockteam-launcher-'))
  const packageRoot = join(fixture, 'package')
  const linkedBin = join(fixture, 'global', 'bin')
  const output = join(fixture, 'result.txt')
  try {
    mkdirSync(join(packageRoot, 'bin'), { recursive: true })
    mkdirSync(join(packageRoot, 'node-runtime', 'bin'), { recursive: true })
    mkdirSync(join(packageRoot, 'lib', 'tockteam'), { recursive: true })
    mkdirSync(linkedBin, { recursive: true })
    writeFileSync(join(packageRoot, 'bin', 'tockteam'), readFileSync(join(root, 'bin', 'tockteam')))
    writeFileSync(join(packageRoot, 'lib', 'tockteam', 'cli.js'), '')
    writeFileSync(join(packageRoot, 'node-runtime', 'bin', 'node'), [
      '#!/bin/sh',
      `printf '%s\\n' "$TOCKTEAM_WEB_ROOT|$1|$2" > ${JSON.stringify(output)}`,
    ].join('\n'))
    chmodSync(join(packageRoot, 'bin', 'tockteam'), 0o755)
    chmodSync(join(packageRoot, 'node-runtime', 'bin', 'node'), 0o755)
    symlinkSync(join(packageRoot, 'bin', 'tockteam'), join(linkedBin, 'tockteam'))

    const result = spawnSync(join(linkedBin, 'tockteam'), ['desktop'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(output, 'utf8').trim(), `${packageRoot}|${join(packageRoot, 'lib', 'tockteam', 'cli.js')}|desktop`)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
