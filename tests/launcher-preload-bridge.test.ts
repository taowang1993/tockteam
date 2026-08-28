import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_IPC_CHANNELS, LAUNCHER_SURFACE_IPC_CHANNELS } from '../src/launcher-contract.ts'
import { createLauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import { LAUNCHER_WINDOW_IPC_CHANNELS } from '../src/launcher-window-contract.ts'

test('launcher preload forwards validated theme events and ignores stale revisions', () => {
  let receive: ((event: unknown, value: unknown) => void) | undefined
  const bridge = createLauncherPreloadBridge({
    invoke: async () => ({ ok: true }),
    on: (_channel, listener) => { receive = listener as typeof receive },
  })
  const received: number[] = []
  const remove = bridge.onTheme(theme => { received.push(theme.revision) })
  receive?.({}, { mode: 'dark', revision: 2, skinId: 'tockteam-skin-deep-current' })
  receive?.({}, { mode: 'light', revision: 1, skinId: null })
  assert.deepEqual(received, [2])
  remove()
})

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
      if (channel === LAUNCHER_SURFACE_IPC_CHANNELS.getLocalExtensionSettings) return {
        Base64Conversion: { decodePrefix: 'b64d', encodeDecodePrefix: 'b64', encodePrefix: 'b64e' }, Calculator: { argumentSeparator: ',', decimalSeparator: '.', precision: 8 }, ColorConverter: { formats: ['HEX', 'HSL', 'RGB'] }, PasswordGenerator: { beginWithALetter: false, command: 'pw', includeLowercaseCharacters: true, includeNumbers: true, includeSymbols: true, includeUppercaseCharacters: true, noDuplicateCharacters: false, noSequentialCharacters: false, noSimilarCharacters: false, passwordLength: 24, quantity: 5, symbols: "!?':;.,+-*/_()[]{}#$%&<>=@^`|~" }, QuickFormatter: { command: 'qf', enableDeepFormatting: true, enableJson: true, enableStackTrace: true, enableXml: true }, RowlandTextEditor: { columnSeparator: '\\t', rowSeparator: '\\n' }, UuidGenerator: { braces: false, generatorFormat: { braces: false, hyphens: true, quotes: false, uppercase: false }, hyphens: true, numberOfUuids: 10, quotes: false, searchResultFormats: [], uppercase: false, uuidVersion: 'v4', validateStrictly: true },
      }
      if (channel === 'launcher:surface-settings' || channel === 'launcher:record-search') return { fuzziness: 0.5, history: [], historyEnabled: true, historyLimit: 10, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' }
      return { ok: true }
    },
  })
  assert.deepEqual(Object.keys(bridge).sort(), ['cancelAction', 'dismiss', 'getLocalExtensionSettings', 'getSurfaceSettings', 'getTheme', 'invokeAction', 'onTheme', 'openSettings', 'recordSearch', 'rescan', 'search'])
  assert.equal(bridge.getLocalExtensionSettings.length, 0)
  assert.equal(bridge.getSurfaceSettings.length, 0)
  assert.equal(bridge.getTheme.length, 0)
  assert.equal(bridge.cancelAction.length, 2)
  assert.equal(bridge.invokeAction.length, 1)
  assert.equal(bridge.recordSearch.length, 1)
  assert.equal(bridge.rescan.length, 0)
  assert.equal(bridge.search.length, 2)
  await bridge.getLocalExtensionSettings()
  await bridge.getSurfaceSettings()
  await bridge.recordSearch('coder')
  await bridge.getTheme()
  await bridge.search('coder', { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' })
  await bridge.rescan()
  await bridge.invokeAction('launcher-action:one')
  await bridge.cancelAction('launcher-action:one', 'launcher-results:1')
  await bridge.dismiss()
  await bridge.openSettings()
  assert.deepEqual(calls, [
    { channel: LAUNCHER_SURFACE_IPC_CHANNELS.getLocalExtensionSettings },
    { channel: 'launcher:surface-settings' },
    { channel: 'launcher:record-search', input: 'coder' },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.getTheme },
    {
      channel: LAUNCHER_IPC_CHANNELS.search,
      input: { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort', searchTerm: 'coder' },
    },
    { channel: LAUNCHER_IPC_CHANNELS.rescan },
    { channel: LAUNCHER_IPC_CHANNELS.invokeAction, input: { actionId: 'launcher-action:one' } },
    { channel: LAUNCHER_IPC_CHANNELS.cancelAction, input: { actionId: 'launcher-action:one', resultSetId: 'launcher-results:1' } },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.dismiss },
    { channel: LAUNCHER_WINDOW_IPC_CHANNELS.openSettings },
  ])
  await assert.rejects(() => bridge.invokeAction('launcher-action:../unsafe'), /action ID/u)
  await assert.rejects(() => bridge.cancelAction('launcher-action:../unsafe', 'launcher-results:1'), /cancellation|action ID/u)
  await assert.rejects(() => bridge.cancelAction('launcher-action:one', `launcher-results:${'1'.repeat(64)}`), /cancellation/u)
  await assert.rejects(() => bridge.search('x'.repeat(513), { fuzziness: 0.5, maxSearchResultItems: 50, searchEngineId: 'fuzzysort' }), /search term/u)
  const runtimeBridge = bridge as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
  const callRuntime = (method: string, ...args: unknown[]): Promise<unknown> => {
    const fn = runtimeBridge[method]
    assert.ok(fn)
    return fn(...args)
  }
  await assert.rejects(() => callRuntime('getLocalExtensionSettings', 'extra'), /arguments/u)
  await assert.rejects(() => callRuntime('cancelAction', 'launcher-action:one', 'launcher-results:1', 'extra'), /arguments/u)
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
