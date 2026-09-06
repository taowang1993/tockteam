import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  TockTutorNativeActions,
  TockTutorVaultActions,
  type DesktopActionRemote,
  type DesktopCallerBridge,
} from '../dist/client-actions.js'

const bridge = Object.freeze({}) as DesktopCallerBridge
const remote = Object.freeze({}) as DesktopActionRemote
const vault = Object.freeze({ generation: 7, id: `vault:${'a'.repeat(64)}` })

test('renders keyboard-native actions with bounded availability and polite status', () => {
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: class {}, writable: true })
  const active = renderToStaticMarkup(createElement(TockTutorNativeActions, {
    activePath: 'Folder/Note.md',
    bridge,
    handleDispatch: async () => 'handled' as const,
    remote,
    storeAudio: async () => true,
    vault,
  }))
  assert.match(active, /aria-label="Desktop Note Actions"/u)
  assert.match(active, /role="group"/u)
  assert.match(active, /data-slot="alert"[^>]*role="status"[^>]*aria-live="polite">Ready\.<\/div>/u)
  for (const label of [
    'Reveal Entry',
    'Open Pop-Out',
    'Close Pop-Out',
    'Close All Pop-Outs',
    'Request Microphone',
    'Start Recording',
    'Print Note',
    'Export HTML',
    'Export PDF',
  ]) assert.match(active, new RegExp(`>${label}<\\/button>`, 'u'))
  assert.doesNotMatch(active, /<button[^>]* disabled=""/u)

  const inactive = renderToStaticMarkup(createElement(TockTutorNativeActions, {
    activePath: null,
    bridge,
    handleDispatch: async () => 'handled' as const,
    remote,
    vault: null,
  }))
  assert.doesNotMatch(inactive, /Choose Vault/u)
  assert.equal([...inactive.matchAll(/<button[^>]*disabled=""/gu)].length, 9)
})

test('renders the vault folder picker as a dedicated action', () => {
  const html = renderToStaticMarkup(createElement(TockTutorVaultActions, {
    bridge,
    close() {},
    placement: 'actions',
    remote,
    vault,
    vaultName: 'Research Vault',
  }))
  assert.match(html, /<button[^>]*aria-label="Open Folder as Vault"/u)
  assert.match(html, />Open<\/button>/u)
})
