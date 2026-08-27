import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_IPC_CHANNELS } from '../src/launcher-contract.ts'
import { createLauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import { LAUNCHER_WINDOW_IPC_CHANNELS } from '../src/launcher-window-contract.ts'

test('launcher preload exposes only typed search, theme, settings, invoke, rescan, and dismiss methods', async () => {
  const calls: Array<{ channel: string; input?: unknown }> = []
  const bridge = createLauncherPreloadBridge({
    invoke: async (channel, input) => {
      calls.push(input === undefined ? { channel } : { channel, input })
      if (channel === LAUNCHER_IPC_CHANNELS.search) {
        return {
          after: [],
          before: [],
          resultSetId: 'launcher-results:1',
          status: { indexedItemCount: 1, rescanStatus: 'idle' },
        }
      }
      if (channel === LAUNCHER_IPC_CHANNELS.rescan) return { indexedItemCount: 1, rescanStatus: 'idle' }
      if (channel === LAUNCHER_WINDOW_IPC_CHANNELS.dismiss) return { ok: true }
      if (channel === LAUNCHER_WINDOW_IPC_CHANNELS.openSettings) return { ok: true }
      if (channel === LAUNCHER_WINDOW_IPC_CHANNELS.getTheme) return { mode: 'light', skinId: null, revision: 0 }
      return { ok: true }
    },
  })
  assert.deepEqual(Object.keys(bridge).sort(), ['dismiss', 'getTheme', 'invokeAction', 'onTheme', 'openSettings', 'rescan', 'search'])
  assert.equal(bridge.getTheme.length, 0)
  assert.equal(bridge.invokeAction.length, 1)
  assert.equal(bridge.rescan.length, 0)
  assert.equal(bridge.search.length, 2)
  await bridge.getTheme()
  await bridge.search('coder', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
  await bridge.rescan()
  await bridge.invokeAction('launcher-action:one')
  await bridge.dismiss()
  await bridge.openSettings()
  assert.deepEqual(calls, [
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.getTheme },
    {
      channel: LAUNCHER_IPC_CHANNELS.search,
      input: { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: 'coder' },
    },
    { channel: LAUNCHER_IPC_CHANNELS.rescan },
    { channel: LAUNCHER_IPC_CHANNELS.invokeAction, input: { actionId: 'launcher-action:one' } },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.dismiss },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.openSettings },
  ])
  await assert.rejects(() => bridge.invokeAction('launcher-action:../unsafe'), /action ID/u)
  await assert.rejects(() => bridge.search('x'.repeat(513), { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' }), /search term/u)
  const runtimeBridge = bridge as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
  const callRuntime = (method: string, ...args: unknown[]): Promise<unknown> => {
    const fn = runtimeBridge[method]
    assert.ok(fn)
    return fn(...args)
  }
  await assert.rejects(() => callRuntime('invokeAction', 'launcher-action:one', 'extra'), /arguments/u)
  await assert.rejects(() => callRuntime('rescan', 'extra'), /arguments/u)
  await assert.rejects(() => callRuntime('search', 'coder', {
    fuzziness: 0.5,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
    searchTerm: 'override',
  }), /search/u)
  await assert.rejects(() => callRuntime('search', 'coder', {
    fuzziness: 0.5,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
    extra: true,
  }), /search/u)
  await assert.rejects(() => callRuntime('search', 'coder', {
    fuzziness: 0.5,
    maxSearchResultItems: 50,
    searchEngineId: 'fuzzysort',
  }, 'extra'), /arguments/u)
})
