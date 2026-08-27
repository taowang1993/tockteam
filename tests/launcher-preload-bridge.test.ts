import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_IPC_CHANNELS } from '../src/launcher-contract.ts'
import { createLauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import { LAUNCHER_WINDOW_IPC_CHANNELS } from '../src/launcher-window-contract.ts'

test('launcher preload exposes only typed search, invoke, rescan, and dismiss methods', async () => {
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
      return { ok: true }
    },
  })
  assert.deepEqual(Object.keys(bridge).sort(), ['dismiss', 'invokeAction', 'rescan', 'search'])
  await bridge.search('coder', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
  await bridge.rescan()
  await bridge.invokeAction('launcher-action:one')
  await bridge.dismiss()
  assert.deepEqual(calls, [
    {
      channel: LAUNCHER_IPC_CHANNELS.search,
      input: { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: 'coder' },
    },
    { channel: LAUNCHER_IPC_CHANNELS.rescan },
    { channel: LAUNCHER_IPC_CHANNELS.invokeAction, input: { actionId: 'launcher-action:one' } },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.dismiss },
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
