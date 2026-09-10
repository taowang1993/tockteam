import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTrustedRaycastDescriptor, TRUSTED_RAYCAST_EXTENSION_IDS } from '../src/trusted-raycast-descriptors.ts'
import { isTrustedRaycastNativeRequest, isTrustedRaycastTrustRequest, isTrustedRaycastViewEvent, isTrustedRaycastViewOpen, type TrustedRaycastViewOpen } from '../src/trusted-raycast-contract.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'

// Exact manifest names at Raycast extensions commit 8a4409d03a593ea0b69b825b525c80753102a379.
const commands = ['system-status', 'clean', 'optimize', 'uninstall', 'purge', 'analyze', 'installer', 'touchid', 'update-mole', 'health-menu-bar']
const scope = { extensionId: 'mole', sessionId: 'denied-session', generation: 'denied-generation' }

test('none of the ten Mole commands can acquire a descriptor, trust state or command channel', () => {
  assert.equal(getTrustedRaycastDescriptor('mole'), undefined)
  for (const command of commands) {
    assert.equal(isTrustedRaycastViewOpen({ ...scope, command, preferences: {} }), false)
    for (const extensionId of TRUSTED_RAYCAST_EXTENSION_IDS) {
      assert.equal(isTrustedRaycastViewOpen({ ...scope, extensionId, command, preferences: {} }), false, `${extensionId}/${command}`)
    }
  }
  for (const action of ['prepare', 'apply', 'enable', 'disable', 'remove', 'recover']) {
    assert.equal(isTrustedRaycastTrustRequest({ extensionId: 'mole', action }), false)
  }
  for (const kind of ['action', 'searchChanged', 'navigation', 'fieldChanged', 'submit']) {
    assert.equal(isTrustedRaycastViewEvent({ ...scope, revision: 0, eventId: 'invented', kind }), false)
  }
})

test('confirmation and dry-run claims cannot grant process, filesystem, installation or elevation authority', () => {
  const denied = ['exec', 'execFile', 'spawn', 'useExec', 'trash', 'delete', 'readFile', 'listDirectory', 'sudo', 'touchid', 'install', 'update', 'openTerminal', 'launchCommand']
  for (const extensionId of ['mole', ...TRUSTED_RAYCAST_EXTENSION_IDS]) {
    for (const kind of denied) {
      for (const claimedConsent of [{}, { confirmed: true }, { dryRun: true }, { elevated: true }]) {
        assert.equal(isTrustedRaycastNativeRequest({ ...scope, extensionId, type: 'native', requestId: 'invented', eventId: 'invented', revision: 0,
          kind, ...claimedConsent }), false, `${extensionId}/${kind}`)
      }
    }
  }
  for (const request of [
    { kind: 'selectedText' }, { kind: 'copy', text: 'mo touchid enable' }, { kind: 'paste', text: 'mo update' },
    { kind: 'openGoogleTranslate', url: 'https://github.com/tw93/Mole' }, { kind: 'savePreferences', preferences: { molePath: '/private-input/mo' } },
  ]) {
    assert.equal(isTrustedRaycastNativeRequest({ ...scope, type: 'native', requestId: 'invented', eventId: 'invented', revision: 0, ...request }), false)
  }
})

test('manager rejects Mole before resolving any runtime or invoking an effect', async () => {
  const effects: string[] = []
  const manager = new TrustedRaycastManager({
    nodePath: '',
    runtimeDir: () => { effects.push('runtime'); throw new Error('Runtime must not be resolved') },
    onMessage: () => { effects.push('message') },
    copyText: () => { effects.push('copy') },
    pasteText: () => { effects.push('paste') },
    readSelectedText: async () => { effects.push('selection'); return { text: '' } },
    openGoogleTranslate: async () => { effects.push('browser') },
    savePreferences: () => { effects.push('preferences') },
  })
  try {
    for (const command of commands) {
      const input = { ...scope, command, preferences: { molePath: '/private-input/mo' } }
      await assert.rejects(manager.start({ webContentsId: 1 }, input as unknown as TrustedRaycastViewOpen), /Invalid Translate session/)
      assert.equal(manager.active, false)
    }
    await assert.rejects(manager.start({ webContentsId: 1 }, { ...scope, extensionId: 'google-translate', command: 'translate', preferences: { molePath: '/private-input/mo' } }), /Unsupported Translate preferences/)
    assert.deepEqual(effects, [])
  } finally { await manager.close() }
})
