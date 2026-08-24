import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { isWebUiPath } from './rules.mjs'

const SCRIPT = fileURLToPath(new URL('./rules.mjs', import.meta.url))

function createProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'tockteam-rules-project-'))
  mkdirSync(path.join(root, '.pi/rules'), { recursive: true })
  writeFileSync(
    path.join(root, '.pi/rules/web.md'),
    '# Web Rules\n\nUse TockTeam Web rules.\n',
  )
  return root
}

function runHook(input, root, stateDirectory) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    input: `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
    env: { ...process.env, TOCKTEAM_CODEX_RULES_STATE_DIR: stateDirectory },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}

test('recognizes TockTeam browser UI owners without matching runtime code', () => {
  assert.equal(isWebUiPath('src/client.ts'), true)
  assert.equal(isWebUiPath('web/cordis.patch.yml'), true)
  assert.equal(isWebUiPath('plugins/sidebar/src/client/sidebar.css'), true)
  assert.equal(
    isWebUiPath('plugins/tocktutor/packages/workbench/src/route.tsx'),
    true,
  )
  assert.equal(isWebUiPath('src/runtime.ts'), false)
  assert.equal(isWebUiPath('src/main.ts'), false)
})

test('UserPromptSubmit injects the Web rule for a matching path', () => {
  const root = createProject()
  const state = mkdtempSync(path.join(tmpdir(), 'tockteam-rules-state-'))
  try {
    const output = runHook(
      {
        session_id: 'prompt-web',
        hook_event_name: 'UserPromptSubmit',
        cwd: root,
        prompt: 'Update web/cordis.patch.yml.',
      },
      root,
      state,
    )
    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
    assert.match(
      output.hookSpecificOutput.additionalContext,
      /TockTeam Web Guidelines \(Auto-loaded\)/u,
    )
    assert.match(
      output.hookSpecificOutput.additionalContext,
      /Use TockTeam Web rules/u,
    )
    assert.equal(
      readFileSync(
        path.join(state, path.basename(requireStateFile(state))),
        'utf8',
      ).includes('"loaded": true'),
      true,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(state, { recursive: true, force: true })
  }
})

function requireStateFile(directory) {
  const files = readdirSync(directory).filter((file) => file.endsWith('.json'))
  assert.equal(files.length, 1)
  return files[0]
}

test('PreToolUse denies the first UI edit, injects on retry, then allows it', () => {
  const root = createProject()
  const state = mkdtempSync(path.join(tmpdir(), 'tockteam-rules-state-'))
  const input = {
    session_id: 'edit-web',
    hook_event_name: 'PreToolUse',
    cwd: root,
    tool_name: 'Write',
    tool_input: { path: 'src/client.ts', content: 'x' },
  }
  try {
    const first = runHook(input, root, state)
    assert.equal(first.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(
      first.hookSpecificOutput.permissionDecisionReason,
      /TockTeam Web guidelines/u,
    )

    const second = runHook(input, root, state)
    assert.equal(second.hookSpecificOutput.permissionDecision, undefined)
    assert.match(
      second.hookSpecificOutput.additionalContext,
      /Use TockTeam Web rules/u,
    )

    assert.equal(runHook(input, root, state), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(state, { recursive: true, force: true })
  }
})

test('plugin client CSS loads Web rules while unrelated runtime work does not', () => {
  const root = createProject()
  const state = mkdtempSync(path.join(tmpdir(), 'tockteam-rules-state-'))
  try {
    const plugin = runHook(
      {
        session_id: 'plugin-css',
        hook_event_name: 'PreToolUse',
        cwd: root,
        tool_name: 'Bash',
        tool_input: {
          command: 'rg color plugins/sidebar/src/client/sidebar.css',
        },
      },
      root,
      state,
    )
    assert.match(
      plugin.hookSpecificOutput.additionalContext,
      /Use TockTeam Web rules/u,
    )

    const unrelated = runHook(
      {
        session_id: 'runtime',
        hook_event_name: 'UserPromptSubmit',
        cwd: root,
        prompt: 'Update src/runtime.ts.',
      },
      root,
      state,
    )
    assert.equal(unrelated, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(state, { recursive: true, force: true })
  }
})
