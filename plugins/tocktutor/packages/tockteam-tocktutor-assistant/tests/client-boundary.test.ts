import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const browserFiles = [
  '../src/client.ts',
  '../src/assistant-panel.tsx',
  '../src/remote-types.ts',
  '../lib/typert.remote-client.js',
]

test('browser entry graph imports no vault authority, filesystem, process, or credential surface', async () => {
  const sources = await Promise.all(browserFiles.map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  const browser = sources.join('\n')

  assert.doesNotMatch(browser, /(?:from\s*|import\s*\()\s*['"](?:tockbot-note-runtime|node:|fs(?:\/promises)?|child_process|process)['"]/u)
  assert.doesNotMatch(browser, /(?:process\.(?:env|cwd)|childInstanceId|absolutePath|vaultRoot|credential|apiKey)/u)
  assert.match(sources[0]!, /TOCKTUTOR_ASSISTANT_PANEL_SLOT/u)
  assert.match(sources[0]!, /ctx\.sessions/u)
})
