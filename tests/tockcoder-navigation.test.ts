import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { transformSync } from 'esbuild'

// Exercise the private Desktop callbacks without launching Electron or exporting test APIs.
const { code } = transformSync(
  `${readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8')}\nexport { dispatch, openPaths };`,
  { loader: 'ts', format: 'cjs' },
)
const module = { exports: {} as Record<string, (...args: unknown[]) => unknown> }
// Settings and branding imports are unrelated to these callbacks.
new Function('require', 'module', code)(() => ({ inject: [] }), module)
const callbacks = module.exports

test('Desktop new-session and open-path actions use the pinned uiWorkspace owner', async () => {
  const started: Array<string | undefined> = []
  const created: string[] = []
  const workspaces = {
    create: async ({ path }: { path: string }) => { created.push(path); return { workspaceId: `workspace:${path}` } },
  }
  const uiWorkspace = { startSession: (id?: string) => { started.push(id) } }
  callbacks.dispatch!({ type: 'new-session' }, workspaces, uiWorkspace, {}, {}, {}, {}, () => {})
  await callbacks.openPaths!(workspaces, uiWorkspace, ['/one', '/two'])
  assert.deepEqual(created, ['/one', '/two'])
  assert.deepEqual(started, [undefined, 'workspace:/one', 'workspace:/two'])
})
