import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
// Pi owns the extension SDK; keep it out of the application's type/dependency graph.
const { default: rules, isWebUiPath } = await import(new URL('../.pi/extensions/rules.ts', import.meta.url).href) as {
  default: (pi: unknown) => void
  isWebUiPath: (path: string) => boolean
}

test('Web rules cover current and future launcher UI files without matching unrelated paths', () => {
  for (const path of [
    'src/launcher.ts', 'src/launcher-settings-navigation.tsx', 'src/launcher.html',
    'src/launcher-new-menu.tsx', 'src/client.ts', 'web/src/client.ts',
    'plugins/ui/src/collapsible.tsx', 'plugins/sidebar/src/client/new-menu.tsx',
  ]) assert.equal(isWebUiPath(path), true, path)
  for (const path of [
    'src/main.ts', 'src/tui.ts', 'tests/launcher.test.ts', 'src/launcher.json',
    'src/launcher/nested.tsx', 'src/not-launcher.tsx', 'src/launcher.tsx.bak',
  ]) assert.equal(isWebUiPath(path), false, path)
})

test('launcher prompts receive Web rules and discovered edits wait for rule delivery', async () => {
  const sessionId = randomUUID()
  const ctx = {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    sessionManager: { getSessionId: () => sessionId },
  }
  type Hook = (event: Record<string, unknown>, context: typeof ctx) => unknown
  const hooks = new Map<string, Hook>()
  const messages: { content: string; options: unknown }[] = []
  rules({
    on: (event: string, handler: Hook) => hooks.set(event, handler),
    sendMessage: ({ content }: { content: string }, options: unknown) => messages.push({ content, options }),
  })
  const invoke = (name: string, event: Record<string, unknown> = {}) => hooks.get(name)!(event, ctx)
  const edit = { toolName: 'edit', input: { path: 'src/launcher-new-menu.tsx' } }
  const content = await readFile(new URL('../.pi/rules/web.md', import.meta.url), 'utf8')
  const expected = `### TockTeam Web Guidelines (Auto-loaded)\n\n${content}`
  try {
    const result = await invoke('before_agent_start', {
      prompt: 'Update @src/launcher-settings-navigation.tsx', systemPrompt: 'Base instructions',
    }) as { systemPrompt: string } | undefined
    assert.equal(result?.systemPrompt, `Base instructions\n\n${expected}`)
    assert.equal(await invoke('tool_call', edit), undefined)
    assert.equal(messages.length, 0, 'already-loaded rules are not queued again')

    assert.equal(await invoke('before_agent_start', { prompt: 'Continue', systemPrompt: 'Base instructions' }), undefined)
    assert.equal(await invoke('tool_call', { toolName: 'edit', input: { path: 'src/main.ts' } }), undefined)
    assert.equal(await invoke('tool_call', { toolName: 'edit', input: { path: '../src/launcher.ts' } }), undefined)
    assert.equal(messages.length, 0, 'unrelated or outside-project edits do not load the rule')
    const blocked = await invoke('tool_call', edit) as { block: boolean; reason: string } | undefined
    assert.equal(blocked?.block, true, 'first launcher edit must wait for the rules')
    assert.match(blocked?.reason ?? '', /Retry this edit after that turn/)
    assert.deepEqual(messages, [{ content: expected, options: { deliverAs: 'steer', triggerTurn: false } }])
    assert.deepEqual(await invoke('tool_call', edit), blocked, 'same-turn retries cannot bypass delivery')
    assert.equal(messages.length, 1)
    await invoke('turn_start')
    assert.equal(await invoke('tool_call', edit), undefined)
    assert.equal(messages.length, 1)
    await invoke('session_before_compact')
    assert.deepEqual(await invoke('tool_call', edit), blocked, 'reload rules after compaction')
    assert.equal(messages.length, 2)
  } finally {
    await invoke('session_shutdown')
  }
})
