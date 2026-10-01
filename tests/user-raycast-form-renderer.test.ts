import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { UserRaycastMessage } from '../src/user-raycast-manager.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const flush = () => new Promise(resolve => setImmediate(resolve))
const field = (id: string, kind: string, value: string | boolean, extra = {}) => ({ type: 'raycast-text-field', props: { id, title: id === 'name' ? 'Name' : id === 'password' ? 'Password' : id === 'notes' ? 'Notes' : 'Enabled', fieldKind: kind, value, fieldEventId: `field-${id}`, focusRequest: 0, ...extra }, children: [] })
const root = (name = 'First', extra = {}) => ({ type: 'root', props: { searchable: false }, children: [{ type: 'raycast-form', props: { formId: 'form-1' }, children: [
  field('name', 'text', name, { info: 'Your display name.', ...extra }), field('password', 'password', 'fake-only'), field('notes', 'textarea', 'Two\nLines'), field('enabled', 'checkbox', false, { label: 'Enable Notifications' }),
  { type: 'raycast-action-panel', props: {}, children: [{ type: 'raycast-action', props: { title: 'Submit Form', actionEventId: 'action-0' }, children: [] }] },
] }] })

async function setup(run: (event: any) => Promise<void> = async () => {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const document = dom.window.document as Document
  let listener: ((message: UserRaycastMessage) => void) | undefined
  const events: any[] = []
  const emit = (revision: number, tree: unknown, type: 'ready' | 'patch' = 'patch', sessionId = 'session-1') => listener?.({ type, extensionId: 'form-demo', sessionId, revision, root: tree })
  const outcome = (succeeded = true) => listener?.({ type: 'outcome', extensionId: 'form-demo', sessionId: 'session-1', revision: 0, eventId: 'action-0', succeeded, message: succeeded ? '' : 'Form submission was not accepted' })
  const bridge = {
    userRaycastState: async () => ({ digest: 'a'.repeat(64), enabled: true, installed: true, hasPrevious: false }),
    userRaycastOpen: async () => emit(0, root(), 'ready'), userRaycastClose: async () => {},
    userRaycastEvent: async (event: any) => { events.push(event); await run(event) },
    onUserRaycastView: (callback: (message: UserRaycastMessage) => void) => { listener = callback; return () => { listener = undefined } },
  } as unknown as LauncherPreloadBridge
  const view = createUserRaycastView(document, bridge, () => {})
  document.body.append(view.element); await flush()
  document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="open"]')!.click(); await flush()
  return { dom, document, events, emit, outcome, view, close: () => { view.dispose(); dom.window.close() } }
}

test('native form patches preserve a pending draft, caret and focus and submit only after the edit finishes', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    const input = f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')
    assert.ok(input, 'The Form must render a labeled native field')
    assert.equal(input.value, 'First'); assert.match(f.view.element.textContent ?? '', /Your display name\./)
    input.focus(); await flush()
    input.value = 'Edited'; input.setSelectionRange(3, 3); input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    f.emit(1, root('First', { error: 'Name needs review.' }))
    assert.equal(f.document.querySelector('input[aria-label="Name"]'), input, 'Keep the mounted control')
    assert.equal(input.value, 'Edited', 'Unacknowledged user input wins over an unrelated patch')
    assert.equal(input.selectionStart, 3); assert.equal(f.document.activeElement, input)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.match(f.document.getElementById(input.getAttribute('aria-describedby')!.split(' ').at(-1)!)!.textContent ?? '', /Name needs review/)
    f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); await flush()
    assert.equal(f.events.filter(event => event.kind === 'action').length, 0, 'Submission must wait for edits')
    f.emit(2, root('Edited')); finish(); await flush(); await flush()
    assert.equal(f.events.filter(event => event.kind === 'action').length, 1)
    assert.equal(f.events.find(event => event.kind === 'fieldChanged').value, 'Edited')
    assert.ok(f.events.every(event => event.sessionId === 'session-1'))
    assert.equal(f.events.find(event => event.kind === 'action').revision, 2)
  } finally { finish(); f.close() }
})

test('password, textarea and checkbox use native typed controls and keyboard submission', async () => {
  const f = await setup()
  try {
    const password = f.document.querySelector<HTMLInputElement>('input[aria-label="Password"]')!
    assert.equal(password.type, 'password'); assert.equal(password.value, 'fake-only')
    const area = f.document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Notes"]')!
    assert.equal(area.value, 'Two\nLines'); area.value = 'Edited\nNotes'; area.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }))
    const checkbox = f.document.querySelector<HTMLInputElement>('input[aria-label="Enable Notifications"]')!
    assert.equal(checkbox.type, 'checkbox')
    assert.match(checkbox.closest('[data-slot="field"]')!.textContent ?? '', /Enabled/, 'Keep the SDK title as well as its checkbox label')
    checkbox.click(); await flush()
    assert.equal(f.events.find(event => event.kind === 'fieldChanged' && event.eventId === 'field-enabled').value, true)
    assert.equal(f.events.find(event => event.kind === 'fieldChanged' && event.eventId === 'field-notes').value, 'Edited\nNotes')
    area.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush()
    assert.equal(f.events.some(event => event.kind === 'action'), false, 'Plain Enter remains a textarea newline')
    area.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await flush()
    assert.equal(f.events.filter(event => event.kind === 'action').length, 1)
  } finally { f.close() }
})

test('focus requests wait for action completion and failed submission can be tried again', async () => {
  const f = await setup()
  try {
    const submit = f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!
    submit.click(); await flush()
    f.emit(1, root('First', { focusRequest: 1 }))
    const input = f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!
    assert.equal(input.disabled, true)
    assert.notEqual(f.document.activeElement, input)
    f.outcome(false); await flush()
    assert.equal(input.disabled, false); assert.equal(f.document.activeElement, input)
    assert.equal(f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.disabled, false)
    assert.match(f.view.element.textContent ?? '', /not accepted/)
    f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); await flush()
    assert.equal(f.events.filter(event => event.kind === 'action').length, 2)
  } finally { f.close() }
})

test('slow field callbacks apply bounded native backpressure without losing accepted edits', async () => {
  let finish!: () => void, revision = 0
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') { await blocked; f.emit(++revision, root(event.value)) } })
  try {
    const input = f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!
    let accepted = 0
    for (let index = 0; index < 100 && !input.disabled; index++) {
      input.value = `Draft ${index}`; input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); accepted++
    }
    assert.equal(accepted, 32, 'Stop native input before an unbounded callback backlog grows')
    assert.equal(input.disabled, true)
    finish()
    for (let turn = 0; turn < 40; turn++) await flush()
    assert.equal(input.disabled, false); assert.equal(input.value, 'Draft 31')
    assert.equal(f.events.filter(event => event.kind === 'fieldChanged').length, 32)
    assert.equal(f.events.at(-1).value, 'Draft 31')
  } finally { finish(); f.close() }
})

test('detached controls from an older command cannot send edits or actions to its replacement', async () => {
  const f = await setup()
  try {
    const oldInput = f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!
    const oldAction = f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!
    f.emit(0, root('Replacement'), 'ready', 'session-2')
    oldInput.value = 'Stale'; oldInput.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); oldAction.click(); await flush()
    assert.equal(f.events.length, 0)
    assert.equal(f.document.querySelector<HTMLInputElement>('input[aria-label="Name"]')!.value, 'Replacement')
  } finally { f.close() }
})
