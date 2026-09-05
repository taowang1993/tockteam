import assert from 'node:assert/strict'
import test from 'node:test'
import verification, { unsafeVerificationCommand } from '../.pi/extensions/verification.ts'

test('blocks long-lived verification launches but permits bounded checks', () => {
  for (const command of [
    'pnpm start',
    'pnpm run start:fresh',
    'pnpm dev:desktop >/tmp/desktop.log 2>&1 &',
    'cd /tmp && pnpm web',
    'env TOCKTEAM_WEB_OPEN=0 pnpm run web',
    'node scripts/electron-runtime.mjs && electron .',
    './node_modules/.bin/electron . --trace-warnings',
  ]) {
    assert.equal(unsafeVerificationCommand(command), true, command)
  }

  for (const command of [
    'pnpm test:launcher:electron',
    'pnpm smoke:web',
    'node --test tests/process-cleanup.test.ts',
    `rg -n 'pnpm start|electron \\.' AGENTS.md`,
  ]) {
    assert.equal(unsafeVerificationCommand(command), false, command)
  }
})

test('blocks unsafe bash tool calls with a bounded alternative', () => {
  let handler: ((event: { input: unknown; toolName: string }) => unknown) | undefined
  verification({
    on(event: string, candidate: typeof handler) {
      if (event === 'tool_call') handler = candidate
    },
  } as never)

  assert.deepEqual(handler?.({ toolName: 'bash', input: { command: 'pnpm start' } }), {
    block: true,
    reason: 'Long-lived verification command blocked. Use a bounded smoke command that owns cleanup through scripts/process-cleanup.mjs.',
  })
  assert.equal(handler?.({ toolName: 'bash', input: { command: 'pnpm test:launcher:electron' } }), undefined)
  assert.equal(handler?.({ toolName: 'read', input: { command: 'pnpm start' } }), undefined)
})
