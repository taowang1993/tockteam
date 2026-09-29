import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { UserRaycastMessage } from '../src/user-raycast-manager.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const flush = () => new Promise(resolve => setImmediate(resolve))
const candidate = { command: 'browse', digest: 'a'.repeat(64), extensionId: 'example-list', title: 'Example List' }
const empty = { digest: '', installed: false, enabled: false, hasPrevious: false }

test('the Desktop launcher exposes the local-extension review without Web or TUI authority', () => {
  assert.match(readFileSync(resolve('src/launcher.html'), 'utf8'), /launcher-local-extensions/)
  assert.match(readFileSync(resolve('src/launcher.ts'), 'utf8'), /createUserRaycastView/)
  assert.match(readFileSync(resolve('scripts/build.mjs'), 'utf8'), /src\/user-raycast-renderer\.ts/)
})

test('an interrupted update exposes recovery even when current bytes are invalid', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  let recovered = false
  const bridge = { userRaycastState: async () => ({ ...empty, hasPrevious: true }), userRaycastMutate: async (action: string) => { assert.equal(action, 'recover'); recovered = true; return { ...empty, installed: true, digest: candidate.digest } }, userRaycastClose: async () => {}, onUserRaycastView: () => () => {} } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element)
  await flush()
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="recover"]')!.click()
  await flush()
  assert.equal(recovered, true)
  view.dispose(); dom.window.close()
})

test('local extension approval shows account authority and does not run before separate enablement', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  let state = { ...empty, candidate }
  let listener: ((message: UserRaycastMessage) => void) | undefined
  const events: unknown[] = []
  let opened = 0
  const bridge = {
    userRaycastState: async () => state,
    userRaycastChoose: async () => candidate,
    userRaycastApprove: async () => { state = { ...state, installed: true, digest: candidate.digest }; return state },
    userRaycastMutate: async (action: string) => { state = { ...state, enabled: action === 'enable' }; return state },
    userRaycastOpen: async () => {
      opened++
      listener?.({ type: 'ready', extensionId: 'example-list', sessionId: 'session', revision: 0, root: { type: 'root', props: { searchable: false }, children: [{ type: 'raycast-list', props: {}, children: [{ type: 'raycast-list-item', props: { title: 'Pinned Item' }, children: [{ type: 'raycast-action-panel', props: {}, children: [{ type: 'raycast-action', props: { title: 'Choose Item', actionEventId: 'action-0' }, children: [] }] }] }] }] } })
    },
    userRaycastEvent: async (event: unknown) => { events.push(event) },
    userRaycastClose: async () => {},
    onUserRaycastView: (callback: (message: UserRaycastMessage) => void) => { listener = callback; return () => { listener = undefined } },
  } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element)
  await flush()
  const choose = () => document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="choose"]')!
  const approve = () => document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="approve"]')!
  const enable = () => document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="enable"]')!
  assert.match(view.element.textContent ?? '', /files.*network.*processes/i)
  assert.equal(approve().disabled, true)
  choose().click(); await flush()
  assert.equal(opened, 0)
  assert.equal(approve().disabled, true)
  document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
  assert.equal(approve().disabled, false)
  approve().click(); await flush()
  assert.equal(opened, 0)
  enable().click(); await flush()
  const open = document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="open"]')!
  open.click(); await flush()
  assert.equal(opened, 1)
  assert.match(view.element.textContent ?? '', /Pinned Item/)
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); await flush()
  assert.deepEqual(events, [{ revision: 0, eventId: 'action-0', kind: 'action' }])
  view.dispose()
  dom.window.close()
})
