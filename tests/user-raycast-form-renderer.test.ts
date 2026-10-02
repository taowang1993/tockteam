import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createUserRaycastView } from '../src/user-raycast-renderer.ts'
import type { LauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'
import type { UserRaycastMessage } from '../src/user-raycast-manager.ts'

const { JSDOM } = createRequire(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url))('jsdom')
const flush = () => new Promise(resolve => setImmediate(resolve))
const field = (id: string, kind: string, value: string | boolean | readonly string[], extra = {}) => ({ type: 'raycast-text-field', props: { id, title: id === 'name' ? 'Name' : id === 'password' ? 'Password' : id === 'notes' ? 'Notes' : 'Enabled', fieldKind: kind, value, fieldEventId: `field-${id}`, focusRequest: 0, ...extra }, children: [] })
const root = (name = 'First', extra = {}) => ({ type: 'root', props: { searchable: false }, children: [{ type: 'raycast-form', props: { formId: 'form-1' }, children: [
  field('name', 'text', name, { info: 'Your display name.', ...extra }), field('password', 'password', 'fake-only'), field('notes', 'textarea', 'Two\nLines'), field('enabled', 'checkbox', false, { label: 'Enable Notifications' }),
  { type: 'raycast-action-panel', props: {}, children: [{ type: 'raycast-action', props: { title: 'Submit Form', actionEventId: 'action-0' }, children: [] }] },
] }] })

type ChoiceNode = { type: string; props: Record<string, unknown>; children: ChoiceNode[] }
const choices = (locale = 'en', tags: string[] = ['red'], french = 'French', extra = {}, tagExtra = {}): ChoiceNode => {
  const item = (value: string, title: string) => ({ type: 'raycast-form-dropdown-item', props: { value, title }, children: [] })
  const dropdown = { ...field('locale', 'dropdown', locale, { title: 'Language', info: 'Choose a language.', ...extra }), children: [{ type: 'raycast-section', props: { title: 'Languages' }, children: [item('en', 'English'), item('fr', french)] }] }
  const tagpicker = { ...field('tags', 'tagpicker', tags, { title: 'Colors', ...tagExtra }), children: [item('red', 'Red'), item('blue', 'Blue')] }
  return { type: 'root', props: { searchable: false }, children: [{ type: 'raycast-form', props: { formId: 'form-1' }, children: [dropdown, tagpicker, { type: 'raycast-action', props: { title: 'Submit Form', actionEventId: 'action-0' }, children: [] }] }] }
}

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

test('native sectioned dropdown preserves a pending selection and focus across option updates before submitting', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    f.emit(1, choices())
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')
    assert.ok(select, 'Render the owned dropdown as a native select')
    assert.equal(select.value, 'en'); assert.equal(select.querySelector('optgroup')?.label, 'Languages')
    select.focus(); await flush()
    select.value = 'fr'; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    f.emit(2, choices('en', ['red'], 'Français', { error: 'Language needs review.' }))
    assert.equal(f.document.querySelector('select[aria-label="Language"]'), select)
    assert.equal(select.value, 'fr'); assert.equal(f.document.activeElement, select)
    assert.equal(select.options[1]!.textContent, 'Français'); assert.equal(select.getAttribute('aria-invalid'), 'true')
    f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); await flush()
    assert.equal(f.events.filter(event => event.kind === 'action').length, 0)
    f.emit(3, choices('fr')); finish(); await flush(); await flush()
    assert.equal(f.events.find(event => event.kind === 'fieldChanged').value, 'fr')
    assert.equal(f.events.find(event => event.kind === 'action').revision, 3)
  } finally { finish(); f.close() }
})

test('native tag selections preserve selection order and pending arrays across patches and keyboard submission', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    f.emit(1, choices('en', []))
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    assert.ok(select); assert.equal(select.multiple, true); assert.equal(select.selectedOptions.length, 0)
    select.focus(); await flush()
    select.options[1]!.selected = true; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    select.options[0]!.selected = true; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    f.emit(2, choices('en', ['red']))
    assert.equal(f.document.querySelector('select[aria-label="Colors"]'), select)
    assert.equal(f.document.activeElement, select); assert.equal(select.selectedOptions.length, 2)
    select.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })); await flush()
    assert.equal(f.events.some(event => event.kind === 'action'), false)
    f.emit(3, choices('en', ['blue', 'red'])); finish(); await flush(); await flush()
    assert.deepEqual(f.events.filter(event => event.kind === 'fieldChanged').map(event => event.value), [['blue'], ['blue', 'red']])
    assert.equal(f.events.find(event => event.kind === 'action').revision, 3)
    f.outcome(false); f.emit(4, choices('en', ['red'], 'French', {}, { focusRequest: 1, error: 'Colors need review.' })); await flush()
    assert.equal(f.document.activeElement, select); assert.deepEqual(Array.from(select.selectedOptions).map(option => option.value), ['red'])
    assert.equal(select.getAttribute('aria-invalid'), 'true'); assert.match(f.document.getElementById(select.getAttribute('aria-describedby')!.split(' ').at(-1)!)!.textContent ?? '', /Colors need review/)
  } finally { finish(); f.close() }
})

test('removing choices during a pending edit does not erase accepted selections or their labels', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    f.emit(1, choices())
    const dropdown = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!, tags = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    dropdown.value = 'fr'; dropdown.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }))
    tags.options[0]!.selected = false; tags.options[1]!.selected = true; tags.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    const changed = choices(); changed.children[0]!.children[0]!.children = []; changed.children[0]!.children[1]!.children = []
    f.emit(2, changed)
    assert.equal(dropdown.value, 'fr'); assert.equal(dropdown.selectedOptions[0]!.textContent, 'French')
    assert.deepEqual(Array.from(tags.selectedOptions).map(option => [option.value, option.textContent]), [['blue', 'Blue']])
    f.emit(3, choices('fr', ['blue'])); finish(); await flush(); await flush()
    assert.deepEqual(f.events.filter(event => event.kind === 'fieldChanged').map(event => event.value), ['fr', ['blue']])
  } finally { finish(); f.close() }
})

test('local picker search matches titles, keywords and default sections without erasing selected values', async () => {
  const f = await setup()
  try {
    const tree = choices('en', ['red']); tree.children[0]!.children[0]!.children[0]!.children[0]!.props.keywords = JSON.stringify(['British'])
    tree.children[0]!.children[1]!.children.push({ type: 'raycast-form-dropdown-item', props: { value: 'green', title: 'Green' }, children: [] })
    f.emit(1, tree)
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]'), tagsSearch = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Colors"]')!
    assert.ok(search, 'Native choices need a labeled search control')
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!, tags = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    const type = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })) }
    search.focus(); await flush(); type(search, 'brtsh'); await flush()
    assert.deepEqual(Array.from(select.options).filter(o => !o.hidden).map(o => o.value), ['en'])
    type(search, 'Languages'); search.setSelectionRange(3, 3); f.emit(2, tree)
    assert.equal(f.document.activeElement, search); assert.equal(search.selectionStart, 3); assert.equal(search.value, 'Languages')
    assert.deepEqual(Array.from(select.options).filter(o => !o.hidden).map(o => o.value), ['fr']); assert.equal(select.value, 'en')
    type(tagsSearch, 'Blue'); assert.deepEqual(Array.from(tags.options).filter(o => !o.hidden).map(o => o.value), ['red', 'blue']); assert.deepEqual(Array.from(tags.selectedOptions).map(o => o.value), ['red'])
    type(search, 'No Such Option'); assert.match(select.closest('[data-slot="field"]')!.textContent ?? '', /No Matching Options/)
    assert.equal(select.value, 'en'); assert.equal(f.events.some(e => e.kind === 'fieldChanged' || e.kind === 'fieldSearchChanged'), false)
    search.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(search.value, ''); assert.equal(select.options[0]!.hidden, false)
  } finally { f.close() }
})

test('remote dropdown queries keep their draft and selection through loading patches and pending submission', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldSearchChanged') await blocked })
  try {
    const tree = choices('en', ['red'], 'French', { searchable: true, filtering: false })
    f.emit(1, tree)
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!, select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!
    search.focus(); await flush()
    search.value = 'f'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    search.value = 'fr'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); search.setSelectionRange(1, 1)
    f.emit(2, choices('en', ['red'], 'Français', { searchable: true, filtering: false, isLoading: true }))
    assert.equal(search.value, 'fr'); assert.equal(search.selectionStart, 1); assert.equal(f.document.activeElement, search)
    assert.equal(search.getAttribute('aria-busy'), 'true'); assert.match(select.closest('[data-slot="field"]')!.textContent ?? '', /Loading Options/)
    assert.equal(Array.from(select.options).some(o => o.hidden), false, 'Custom callback alone must not locally filter')
    search.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await flush(); assert.equal(f.events.some(e => e.kind === 'action'), false)
    f.emit(3, choices('en', ['red'], 'Français', { searchable: true, filtering: false })); finish(); await flush(); await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['f', 'fr']); assert.equal(f.events.find(e => e.kind === 'action').revision, 3)
    assert.equal(select.value, 'en'); assert.equal(search.value, 'fr'); assert.equal(search.disabled, true)
  } finally { finish(); f.close() }
})

test('throttled picker search coalesces typing, flushes before submit and cancels on teardown', async () => {
  const f = await setup()
  try {
    const tree = choices('en', ['red'], 'French', { searchable: true, filtering: false, throttle: true }); f.emit(1, tree)
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!
    for (const value of ['f', 'fr', 'fre']) { search.value = value; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })) }
    await flush(); assert.equal(f.events.some(e => e.kind === 'fieldSearchChanged'), false, 'A throttled callback must not run for each keystroke')
    search.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await flush(); await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['fre']); assert.equal(f.events.at(-1).kind, 'action')
    f.outcome(); search.value = 'stale'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); f.view.dispose()
    await new Promise(resolve => setTimeout(resolve, 350)); assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['fre'])
  } finally { f.close() }
})

test('a successful search cannot acknowledge a failed selection edit', async () => {
  const f = await setup(async event => { if (event.kind === 'fieldChanged') throw Error('Selection was not accepted') })
  try {
    f.emit(1, choices('en', ['red'], 'French', { searchable: true, filtering: false }))
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!, search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!
    select.value = 'fr'; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    search.value = 'French'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); await flush()
    assert.equal(f.events.some(e => e.kind === 'action'), false, 'Search completion is not selection acceptance')
    assert.match(f.view.element.textContent ?? '', /Selection was not accepted/)
  } finally { f.close() }
})

test('accepted controlled selections remain represented after pending callbacks remove their choices', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    f.emit(1, choices())
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!, tags = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    select.value = 'fr'; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }))
    tags.options[0]!.selected = false; tags.options[1]!.selected = true; tags.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    f.emit(2, choices('new-language', ['new-color'])); finish(); await flush(); await flush()
    assert.equal(select.value, 'new-language'); assert.deepEqual(Array.from(tags.selectedOptions).map(o => o.value), ['new-color'])
  } finally { finish(); f.close() }
})

test('throttled search survives a full callback queue and submission waits for its accepted query', async () => {
  let finish!: () => void
  const blocked = new Promise<void>(resolve => { finish = resolve })
  const f = await setup(async event => { if (event.kind === 'fieldChanged') await blocked })
  try {
    f.emit(1, choices('en', ['red'], 'French', { searchable: true, filtering: true, throttle: true }))
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!, select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!
    search.value = 'French'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }))
    for (let i = 0; i < 32; i++) { select.value = i % 2 ? 'fr' : 'en'; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })) }
    assert.equal(search.disabled, true); await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(f.events.some(e => e.kind === 'fieldSearchChanged'), false)
    f.document.querySelector<HTMLButtonElement>('button[data-user-raycast-action="action-0"]')!.click(); finish()
    for (let i = 0; i < 38; i++) await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['French']); assert.equal(f.events.at(-1).kind, 'action')
  } finally { finish(); f.close() }
})

test('throttled queries run once when idle and unmounted queries never reach the next view', async () => {
  const f = await setup()
  try {
    f.emit(1, choices('en', ['red'], 'French', { searchable: true, filtering: true, throttle: true }))
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!
    search.value = 'French'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 350)); await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['French'])
    search.value = 'stale'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); f.emit(2, root()); await new Promise(resolve => setTimeout(resolve, 350)); await flush()
    search.value = 'detached'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['French'])
  } finally { f.close() }
})

test('IME composition neither submits nor searches until the completed text is committed once', async () => {
  const f = await setup()
  try {
    f.emit(1, choices('en', [], 'French', { searchable: true, filtering: false }))
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!
    search.value = 'に'; search.dispatchEvent(new f.dom.window.InputEvent('input', { isComposing: true, bubbles: true }))
    search.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true })); await flush()
    assert.equal(f.events.some(e => e.kind === 'fieldSearchChanged' || e.kind === 'action'), false)
    search.value = '日本'; search.dispatchEvent(new f.dom.window.CompositionEvent('compositionend', { bubbles: true })); search.dispatchEvent(new f.dom.window.InputEvent('input', { bubbles: true })); await flush()
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['日本'])
  } finally { f.close() }
})

test('empty remote search results announce absence without erasing the selected language', async () => {
  const f = await setup()
  try {
    const tree = choices('en', [], 'French', { searchable: true, filtering: false }); tree.children[0]!.children[0]!.children = []
    f.emit(1, tree)
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Language"]')!, select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!
    search.value = 'Missing'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    assert.equal(select.value, 'en'); assert.match(select.closest('[data-slot="field"]')!.textContent ?? '', /No Matching Options/)
    assert.deepEqual(f.events.filter(e => e.kind === 'fieldSearchChanged').map(e => e.value), ['Missing'])
  } finally { f.close() }
})

test('undocumented filtering flags cannot disable local tag title search or enable keyword matching', async () => {
  const f = await setup()
  try {
    const tree = choices('en', [], 'French', {}, { filtering: false, searchable: true }); tree.children[0]!.children[1]!.children[0]!.props.keywords = '["Blue"]'
    f.emit(1, tree)
    const search = f.document.querySelector<HTMLInputElement>('input[aria-label="Search Colors"]')!, select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    search.value = 'Blue'; search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); await flush()
    assert.deepEqual(Array.from(select.options).filter(o => !o.hidden).map(o => o.value), ['blue']); assert.equal(f.events.some(e => e.kind === 'fieldSearchChanged'), false)
  } finally { f.close() }
})

test('duplicate section titles remain separate and refresh their labels without replacing controls', async () => {
  const f = await setup()
  try {
    const tree = choices()
    const dropdown = tree.children[0]!.children[0]!
    const first = dropdown.children[0]!
    first.props.title = 'Same Title'
    dropdown.children.push({ type: 'raycast-section', props: { title: 'Same Title' }, children: [{ type: 'raycast-form-dropdown-item', props: { value: 'other', title: 'Other' }, children: [] }] })
    f.emit(1, tree)
    const select = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!
    f.emit(2, tree)
    assert.equal(select.querySelectorAll('optgroup').length, 2)
    assert.deepEqual(Array.from(select.options).map(option => option.value), ['en', 'fr', 'other'])
    first.props.title = 'Renamed'; f.emit(3, tree)
    assert.equal(select.querySelector('optgroup')?.label, 'Renamed')
    assert.equal(f.document.querySelector('select[aria-label="Language"]'), select)
  } finally { f.close() }
})

test('empty choice fields remain typed and detached selectors cannot send after a replacement', async () => {
  const f = await setup()
  try {
    const tree = choices('', [])
    tree.children[0]!.children[0]!.children = []; tree.children[0]!.children[1]!.children = []
    f.emit(1, tree)
    const dropdown = f.document.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!, tags = f.document.querySelector<HTMLSelectElement>('select[aria-label="Colors"]')!
    assert.equal(dropdown.value, ''); assert.equal(dropdown.selectedOptions[0]?.textContent, 'No Options'); assert.equal(tags.selectedOptions.length, 0)
    assert.match(f.document.getElementById(tags.getAttribute('aria-describedby')!)!.textContent ?? '', /No tags are available/)
    tags.focus(); await flush(); assert.deepEqual(f.events.find(event => event.eventId === 'field-tags').value, [])
    f.emit(0, root('Replacement'), 'ready', 'replacement-session')
    const before = f.events.length
    dropdown.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); tags.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })); await flush()
    assert.equal(f.events.length, before)
  } finally { f.close() }
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
