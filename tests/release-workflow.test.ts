import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('runtime CI verifies the nested TockTutor workspace before staging', () => {
  const workflow = readFileSync(
    join(root, '.github', 'workflows', 'ci.yml'),
    'utf8',
  ).replace(/\r\n?/g, '\n')

  assert.match(workflow, /plugins\/tocktutor\/pnpm-lock\.yaml/u)
  assert.match(workflow, /pnpm -C plugins\/tocktutor install --frozen-lockfile/u)
  assert.match(workflow, /pnpm run typecheck:tocktutor/u)
  assert.match(workflow, /pnpm run test:tocktutor/u)
  assert.match(workflow, /pnpm run build:tocktutor/u)
  assert.ok(workflow.indexOf('pnpm run build:tocktutor') < workflow.indexOf('pnpm run stage:dsh'))
})

test('tagged releases build and upload both TUI archive formats', () => {
  const workflow = readFileSync(
    join(root, '.github', 'workflows', 'release.yml'),
    'utf8',
  ).replace(/\r\n?/g, '\n')

  assert.match(workflow, /run: node scripts\/build-tui\.mjs/)
  assert.match(workflow, /release\/tockteam-tui-\*\.tar\.gz/)
  assert.match(workflow, /release\/tockteam-tui-\*\.zip/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /fetch-tags: true/)
})
