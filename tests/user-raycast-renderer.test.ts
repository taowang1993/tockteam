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

test('a no-view command reports completion without a misleading empty List', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  let listener: ((message: UserRaycastMessage) => void) | undefined
  const bridge = {
    userRaycastState: async () => ({ ...empty, installed: true, enabled: true, digest: candidate.digest, mode: 'no-view' }),
    userRaycastOpen: async () => {
      listener?.({ type: 'ready', extensionId: candidate.extensionId, sessionId: 'session', revision: 0, root: { type: 'root', props: {}, children: [] } })
      listener?.({ type: 'toast', extensionId: candidate.extensionId, sessionId: 'session', revision: 0, title: 'Copied UUID', message: '', style: 'success' })
      listener?.({ type: 'outcome', extensionId: candidate.extensionId, sessionId: 'session', revision: 0, eventId: 'run', succeeded: true, message: '' })
    },
    onUserRaycastView: (callback: (message: UserRaycastMessage) => void) => { listener = callback; return () => { listener = undefined } },
  } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element)
  await flush()
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="open"]')!.click(); await flush()
  assert.equal(document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="open"]')?.textContent, 'Run Command')
  assert.match(view.element.textContent ?? '', /Command Complete/)
  assert.doesNotMatch(view.element.textContent ?? '', /No items yet/)
  view.dispose(); dom.window.close()
})

test('a real List empty view and search input survive a projected patch', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  let listener: ((message: UserRaycastMessage) => void) | undefined
  const events: unknown[] = []
  const bridge = {
    userRaycastState: async () => ({ ...empty, installed: true, enabled: true, digest: candidate.digest }),
    userRaycastOpen: async () => listener?.({ type: 'ready', extensionId: candidate.extensionId, sessionId: 'session', revision: 0, root: { type: 'root', props: { searchable: true }, children: [{ type: 'raycast-list', props: {}, children: [{ type: 'raycast-empty', props: { title: 'Search for a color to see' }, children: [] }] }] } }),
    userRaycastEvent: async (event: unknown) => { events.push(event) },
    onUserRaycastView: (callback: (message: UserRaycastMessage) => void) => { listener = callback; return () => { listener = undefined } },
  } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element)
  await flush()
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="open"]')!.click(); await flush()
  assert.match(view.element.textContent ?? '', /Search for a color to see/)
  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search Extension"]')!
  search.focus(); search.value = '#00ff00'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  listener?.({ type: 'patch', extensionId: candidate.extensionId, sessionId: 'session', revision: 1, root: { type: 'root', props: { searchable: true }, children: [{ type: 'raycast-list', props: {}, children: [{ type: 'raycast-list-item', props: { title: 'lime' }, children: [] }] }] } })
  assert.equal(document.querySelector<HTMLInputElement>('input[aria-label="Search Extension"]')?.value, '#00ff00')
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Search Extension')
  assert.match(view.element.textContent ?? '', /lime/)
  assert.deepEqual(events, [{ revision: 0, eventId: 'search', kind: 'searchChanged', value: '#00ff00' }])
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

test('public source needs a separate build review, built review, and enablement before running', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  const source = { command: 'generate', digest: 'c'.repeat(64), extensionId: 'uuid-generator', title: 'UUID Generator', license: 'MIT', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: 3, bytes: 321, mode: 'no-view' as const, source: `https://github.com/raycast/extensions/tree/${'a'.repeat(40)}/extensions/uuid-generator` }
  const oldDigest = 'e'.repeat(64)
  let state: any = { ...empty, installed: true, enabled: true, digest: oldDigest }
  let builds = 0; let approvals = 0; let runs = 0
  const bridge = {
    userRaycastState: async () => state,
    userRaycastSourcePrepare: async (selection: unknown) => { assert.deepEqual(selection, { extensionId: 'uuid-generator', command: 'generate' }); state = { ...state, sourceCandidate: source }; return source },
    userRaycastSourceBuild: async (digest: string) => { assert.equal(digest, source.digest); builds++; state = { ...state, candidate: { ...candidate, command: 'generate', extensionId: source.extensionId, digest: 'd'.repeat(64) } }; return state },
    userRaycastApprove: async (digest: string) => { assert.equal(digest, state.candidate.digest); approvals++; state = { ...state, digest, installed: true, enabled: false }; return state },
    userRaycastMutate: async () => { state = { ...state, enabled: true }; return state },
    userRaycastOpen: async () => { runs++ }, userRaycastClose: async () => {}, onUserRaycastView: () => () => {},
  } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element); await flush()
  document.querySelector<HTMLInputElement>('input[aria-label="Public Extension"]')!.value = 'uuid-generator'
  document.querySelector<HTMLInputElement>('input[aria-label="Command Name"]')!.value = 'generate'
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="source-prepare"]')!.click(); await flush()
  assert.match(view.element.textContent ?? '', /a{40}/)
  const build = () => document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="source-build"]')!
  assert.equal(build().disabled, true)
  document.querySelector<HTMLInputElement>('input[data-user-raycast-source-review]')!.click()
  assert.equal(build().disabled, false)
  build().click(); await flush()
  assert.equal(builds, 1); assert.equal(approvals, 0); assert.equal(runs, 0)
  assert.match(view.element.textContent ?? '', new RegExp(oldDigest), 'the installed version stays visible during an unapproved update')
  const approve = document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="approve"]')!
  assert.equal(approve.disabled, true)
  document.querySelector<HTMLInputElement>('input[data-user-raycast-built-review]')!.click()
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="approve"]')!.click(); await flush()
  assert.equal(approvals, 1); assert.equal(state.enabled, false); assert.equal(runs, 0)
  view.dispose(); dom.window.close()
})
