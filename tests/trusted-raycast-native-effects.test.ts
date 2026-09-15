import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { isDeepStrictEqual, promisify } from 'node:util'
import { captureTrustedRaycastPriorApp, pasteTrustedRaycastText, readTrustedRaycastSelectedText, type TrustedRaycastNativeDeps } from '../src/trusted-raycast-native.ts'
import { isTrustedRaycastNativeRequest, isTrustedRaycastNativeOutcome, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
const exec = promisify(execFile)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
type PersistedState = Readonly<Record<string, unknown>>
const waitForPersistedState = async (path: string, predicate: (state: unknown) => boolean, timeout = 5000): Promise<PersistedState> => {
  const deadline = Date.now() + timeout
  let last: unknown
  while (Date.now() < deadline) {
    try {
      last = JSON.parse(readFileSync(path, 'utf8')) as unknown
      if (predicate(last)) return last as PersistedState
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await wait(25)
  }
  assert.fail(`persisted state predicate unmet: ${JSON.stringify(last)?.slice(0, 512) ?? '<missing>'}`)
}
const prior = Object.freeze({ name: 'Notes', capturedAt: Date.now() })
const defaultClipboardFormats = ['text/plain']
const deps = (overrides: Partial<TrustedRaycastNativeDeps> = {}): TrustedRaycastNativeDeps => ({ execFile: async () => ({ stdout: '' }), readClipboard: () => 'original clipboard', writeClipboard: () => {}, readClipboardFormats: () => defaultClipboardFormats, readClipboardBuffer: (format: string) => Buffer.from(format === 'text/plain' ? 'original clipboard' : 'bytes'), writeClipboardBuffer: () => {}, ownAppNames: ['TockTeam Desktop'], ...overrides })

test('native request admission accepts bounded Paste and selected text and rejects the rest', () => {
  const valid = isTrustedRaycastNativeRequest
  const base = { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', requestId: 'n' }
  assert.equal(valid({ ...base, kind: 'selectedText' }), true)
  assert.equal(valid({ ...base, kind: 'selectedText', revision: 0 }), false)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a', text: 'hello' }), true)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a', text: 'x'.repeat(131073) }), false)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a' }), false)
  assert.equal(valid({ ...base, kind: 'savePreferences', revision: 2, eventId: 'a', preferences: { langFrom: 'auto', lang1: 'en', lang2: 'en', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' } }), true)
  assert.equal(valid({ ...base, kind: 'savePreferences', revision: 2, eventId: 'a', preferences: { lang1: '<script>' } }), false)
  assert.equal(valid({ ...base, kind: 'selectedText', text: 'leak' }), false)
  assert.ok(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', extensionId: 'google-translate', requestId: 'n', succeeded: true, message: '', result: 'selected fixture' }))
  assert.ok(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', extensionId: 'google-translate', requestId: 'n', succeeded: false, message: 'denied' }))
  assert.equal(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', extensionId: 'google-translate', requestId: 'n', succeeded: true, message: '', result: 'x'.repeat(16385) }), false)
  assert.equal(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', extensionId: 'google-translate', requestId: 'n', succeeded: true, message: '', extra: 1 }), false)
})

test('prior-app capture admits only an external frontmost application', async () => {
  const captured = await captureTrustedRaycastPriorApp(deps({ execFile: async () => ({ stdout: 'Notes\n' }) }))
  assert.equal(captured?.name, 'Notes')
  assert.equal(await captureTrustedRaycastPriorApp(deps({ execFile: async () => ({ stdout: 'TockTeam Desktop\n' }) })), undefined)
  assert.equal(await captureTrustedRaycastPriorApp(deps({ execFile: async () => { throw new Error('denied') } })), undefined)
  assert.equal(await captureTrustedRaycastPriorApp(deps({ execFile: async () => ({ stdout: '' }) })), undefined)
})

test('selected text reads honestly: fixture, permission denial, no selection, and manual-input fallback', async () => {
  assert.deepEqual(await readTrustedRaycastSelectedText(undefined, deps({ fixture: 'selection' })), { text: 'TockTeam trusted Raycast selection fixture' })
  const denied = await readTrustedRaycastSelectedText(undefined, deps())
  assert.ok('unavailable' in denied && denied.unavailable.includes('Manual input is available'))
  assert.deepEqual(await readTrustedRaycastSelectedText(prior, deps({ execFile: async () => ({ stdout: 'the selected sentence\n' }) })), { text: 'the selected sentence' })
  const permission = await readTrustedRaycastSelectedText(prior, deps({ execFile: async () => { throw new Error('osascript is not allowed assistive access (-1719)') } }))
  assert.ok('unavailable' in permission && permission.unavailable.includes('Accessibility'))
  const empty = await readTrustedRaycastSelectedText(prior, deps({ execFile: async () => ({ stdout: '\n' }) }))
  assert.ok('unavailable' in empty && empty.unavailable.includes('No selected text'))
  const oversized = await readTrustedRaycastSelectedText(prior, deps({ execFile: async () => ({ stdout: 'x'.repeat(16 * 1024 + 1) }) }))
  assert.ok('unavailable' in oversized && oversized.unavailable.includes('exceeds its bound'))
})

test('fixture paste never synthesizes keystrokes and always restores the prior clipboard', async () => {
  const writes: string[] = []
  let current = 'user clipboard bytes'
  const result = await pasteTrustedRaycastText('fixture paste text', prior, deps({ fixture: 'paste', readClipboard: () => current, readClipboardBuffer: () => Buffer.from('user clipboard bytes'), writeClipboard: text => { current = text; writes.push(text) }, writeClipboardBuffer: (format, data) => { current = data.toString(); writes.push(`buffer:${format}`) } }))
  assert.deepEqual(result, { target: 'Notes', fixture: true, restoration: 'restored' })
  assert.equal(current, 'user clipboard bytes', 'all-format restoration ends with the original clipboard bytes')
  assert.deepEqual(writes, ['fixture paste text', '', 'buffer:text/plain'], 'write, verify, clear, restore')
})

test('real paste restores focus via the target app and restores the clipboard on denial', async () => {
  const writes: string[] = []
  let current = 'user clipboard bytes'
  const keystrokes: string[] = []
  const result = await pasteTrustedRaycastText('pasted translation', prior, deps({
    readClipboard: () => current, readClipboardBuffer: () => Buffer.from('user clipboard bytes'), writeClipboard: text => { current = text; writes.push(text) }, writeClipboardBuffer: (_format, data) => { current = data.toString() },
    execFile: async (_file, args) => { keystrokes.push(args.join(' ')); return { stdout: '' } },
    wait: async () => {},
  }))
  assert.deepEqual(result, { target: 'Notes', fixture: false, restoration: 'restored' })
  assert.equal(current, 'user clipboard bytes')
  assert.ok(keystrokes.some(args => args.includes('keystroke "v" using command down')), 'target app focus is restored before the keystroke')
  let deniedCurrent = 'user clipboard bytes'
  await assert.rejects(pasteTrustedRaycastText('x', prior, deps({
    readClipboard: () => deniedCurrent, writeClipboard: text => { deniedCurrent = text }, readClipboardBuffer: () => Buffer.from('user clipboard bytes'), writeClipboardBuffer: (_format, data) => { deniedCurrent = data.toString() },
    execFile: async () => { throw new Error('osascript is not allowed assistive access (-1719)') },
    wait: async () => {},
  })), /Accessibility permission/)
  assert.equal(deniedCurrent, 'user clipboard bytes', 'denial path restores the prior clipboard')
})

test('paste preserves every clipboard format and denies before mutating an unpreservable clipboard', async () => {
  // Multi-format clipboard: an image item must survive a text paste intact.
  const formats = ['public.png', 'text/plain']
  const buffers = new Map<string, string>([[ 'public.png', '\x89PNG-image-bytes' ], [ 'text/plain', 'user clipboard bytes' ]])
  let currentFormats = [...formats]
  let currentText = 'user clipboard bytes'
  let writes: string[] = []
  const result = await pasteTrustedRaycastText('pasted translation', prior, deps({
    fixture: 'paste',
    readClipboardFormats: () => currentFormats,
    readClipboardBuffer: format => Buffer.from(buffers.get(format) ?? ''),
    writeClipboardBuffer: (format, data) => { buffers.set(format, data.toString()); if (format === 'text/plain') currentText = data.toString(); writes.push(format) },
    readClipboard: () => currentText,
    writeClipboard: text => { currentText = text },
  }))
  assert.equal(result.restoration, 'restored')
  assert.equal(buffers.get('public.png'), '\x89PNG-image-bytes', 'image bytes restored')
  assert.equal(currentText, 'user clipboard bytes')
  // Oversized snapshot: deny BEFORE any write, leaving every format untouched.
  const oversized = new Map<string, Buffer>([['text/plain', Buffer.from('user')], ['big', Buffer.alloc(16 * 1024 * 1024 + 1)]])
  let oversizedText = 'user'
  let mutated = false
  await assert.rejects(pasteTrustedRaycastText('x', prior, deps({
    fixture: 'paste',
    readClipboardFormats: () => [...oversized.keys()],
    readClipboardBuffer: format => oversized.get(format)!,
    writeClipboard: () => { mutated = true },
    writeClipboardBuffer: () => { mutated = true },
    readClipboard: () => oversizedText,
  })), /preservation bound/)
  assert.equal(mutated, false, 'denial happens before any clipboard mutation')
  // User changes the clipboard during the paste: never overwrite the newer content.
  let live = 'pasted translation'
  const liveWrites: string[] = []
  const liveResult = await pasteTrustedRaycastText('pasted translation', prior, deps({
    readClipboard: () => live,
    writeClipboard: text => { live = text; liveWrites.push(text) },
    writeClipboardBuffer: (format) => { liveWrites.push(`buffer:${format}`) },
    execFile: async () => { live = 'user copied something newer'; return { stdout: '' } },
    wait: async () => {},
  }))
  assert.equal(liveResult.restoration, 'external-change-preserved')
  assert.equal(live, 'user copied something newer', 'newer external clipboard content is preserved')
  assert.ok(!liveWrites.some(write => write === ''), 'no restore ran over the newer content')
})

test('paste policy denials: no captured target, clipboard refusal, and oversized text', async () => {
  await assert.rejects(pasteTrustedRaycastText('x', undefined, deps()), /No prior application captured/)
  await assert.rejects(pasteTrustedRaycastText('x'.repeat(128 * 1024 + 1), prior, deps()), /exceeds its bound/)
  const writes: string[] = []
  await assert.rejects(pasteTrustedRaycastText('x', prior, deps({ readClipboard: () => 'original', writeClipboard: text => writes.push(text), fixture: 'paste' })), /Clipboard was not accepted|Clipboard restoration failed/)
  assert.ok(writes.includes('x'), 'the paste write was attempted')
  assert.ok(writes.includes(''), 'the snapshot restore cleared and rewrote the clipboard')
})

test('the child TMPDIR governs os.tmpdir(), keeping translation.mp3 inside the private workspace', async () => {
  const privateTemp = mkdtempSync(join(tmpdir(), 'raycast-tts-tmp-'))
  try {
    const child = spawn(process.execPath, ['-e', `const {tmpdir}=require('node:os'); console.log(tmpdir())`], { env: { ...process.env, TMPDIR: privateTemp, TMP: privateTemp, TEMP: privateTemp } })
    const output = await new Promise<string>((resolve, reject) => { let text = ''; child.stdout.on('data', chunk => { text += chunk }); child.once('error', reject); child.once('close', code => code === 0 ? resolve(text) : reject(new Error(`exit ${code}`))) })
    assert.equal(output.trim(), privateTemp)
  } finally { rmSync(privateTemp, { recursive: true, force: true }) }
})

const configuredArtifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
const artifact = configuredArtifact ?? join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'google-translate.tar')

/** Latest projection-bearing message plus helpers shared by the configured integration tests. */
const projections = (messages: any[]) => {
  const rootMessages = (): any[] => messages.filter((message: any) => message.root)
  const latestRoot = (): any => rootMessages().at(-1)!
  const waitRoot = async (predicate: (root: any) => boolean, timeout = 15000): Promise<any> => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const message = latestRoot()
      if (predicate(message.root)) return message
      await wait(25)
    }
    const message = latestRoot()
    const summary = (root: any) => { const visit = (node: any): any[] => (node.type === 'raycast-form-dropdown' ? [node] : (node.children ?? []).flatMap((child: any) => typeof child === 'string' ? [] : visit(child))); return visit(root).map((field: any) => `${field.props.title}=${field.props.value}`).join(' | ') }
    assert.ok(predicate(message.root), `projection predicate unmet; fields: ${summary(message.root)}; last message: ${JSON.stringify(message).slice(0, 200)}; service messages: ${JSON.stringify(messages.filter(message => !message.root).slice(-5)).slice(0, 2048)}`)
    return message
  }
  // The child and manager converge only when the stream quiesces; send only after a quiet spell.
  const settle = async (quietMs = 400, timeout = 15000): Promise<any> => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const count = rootMessages().length
      await wait(quietMs)
      if (rootMessages().length === count) return latestRoot()
    }
    return latestRoot()
  }
  const dropdown = (root: any): any => { const visit = (node: any): any => { if (node.type === 'raycast-dropdown') return node; for (const child of node.children) { if (typeof child !== 'string') { const hit = visit(child); if (hit) return hit } } }; return visit(root) }
  const action = (root: any, title: string): any => { const visit = (node: any): any => { if (node.type === 'raycast-action' && node.props.title === title) return node; for (const child of node.children) { if (typeof child !== 'string') { const hit = visit(child); if (hit) return hit } } }; return visit(root) }
  const fields = (root: any): any[] => { const visit = (node: any): any[] => node.type === 'raycast-form-dropdown' ? [node] : node.children.flatMap((child: any) => typeof child === 'string' ? [] : visit(child)); return visit(root) }
  return { rootMessages, latestRoot, waitRoot, settle, dropdown, action, fields }
}

test('bundled artifact: first command shows required preferences, saves them in main, then mounts unchanged Translate', { skip: process.platform === 'win32' ? 'POSIX trusted-child integration is unsupported on Windows' : false, timeout: 30000 }, async () => {
  // @ts-expect-error JavaScript helper owns the reviewed artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-preferences-setup-'))
  const artifact = join(resolve('.'), 'plugins', 'trusted-raycast', 'vendor', 'google-translate.tar')
  const messages: any[] = []
  const saved: unknown[] = []
  const manager = new TrustedRaycastManager({
    runtimeDir: join(work, 'trusted-raycast'),
    nodePath: process.execPath,
    onMessage: (_owner, message) => messages.push(message),
    preferencesConfigured: () => false,
    savePreferences: preferences => { saved.push(preferences) },
    readSelectedText: async () => ({ unavailable: 'No selected text' }),
  })
  try {
    await buildTrustedRaycast(work, artifact)
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'setup', generation: '1', command: 'translate', preferences: {} })
    const view = projections(messages)
    const setup = await view.waitRoot(root => root.props.preferenceSetup === true)
    const fields = view.fields(setup.root)
    assert.deepEqual(fields.map(field => field.props.title), ['Translate from', 'Primary Language', 'Secondary Language'])
    assert.equal(fields.every(field => field.children.length >= 249), true, 'the reviewed manifest supplies the complete language menus')
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'setup', generation: '1', revision: setup.revision, eventId: fields[2].props.fieldEventId, kind: 'fieldChanged', value: 'zh-CN' })
    const submit = view.action(setup.root, 'Continue')
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 'setup', generation: '1', revision: setup.revision, eventId: submit.props.actionEventId, kind: 'action' })
    await view.waitRoot(root => root.props.preferenceSetup === false)
    await wait(250)
    assert.equal(manager.active, true, 'an unavailable selected-text lookup must not corrupt the child protocol')
    assert.equal(messages.some(message => message.type === 'error'), false)
    assert.deepEqual(saved, [{ langFrom: 'auto', lang1: 'en', lang2: 'zh-CN', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' }])
  } finally { await manager.close(); rmSync(work, { recursive: true, force: true }) }
})

test('reviewed artifact: language sets, nested AddLanguageForm, and restart persistence', { skip: process.platform === 'win32' ? 'POSIX trusted-child integration is unsupported on Windows' : false }, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-language-'))
  const stateFile = join(work, 'state.json')
  let messages: any[] = []
  const start = async (): Promise<TrustedRaycastManager> => {
    await buildTrustedRaycast(work, artifact)
    messages = []
    const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, stateFile, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, lang1: 'zh-CN', autoInput: false } })
    return manager
  }
  let manager: TrustedRaycastManager | undefined
  try {
    manager = await start()
    let { latestRoot, waitRoot, settle, dropdown, action, fields } = projections(messages)
    const ready = await waitRoot(root => dropdown(root) !== undefined && typeof root.props.searchEventId === 'string')
    // The latest matching projection may already be a patch after the initial ready message.
    assert.ok(messages.some(message => message.type === 'ready'), 'the child emitted its ready handshake')
    assert.equal(ready.root.props.searchable, true)
    const accessor = dropdown(ready.root)
    assert.equal(accessor.props.value, JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }), 'selected set initializes from preferences.lang1')
    assert.ok(accessor.children.some((item: any) => item.props.value === 'manage'))
    // Select the full preferences set (auto -> zh-CN + en).
    const settled = await settle()
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settled.revision, eventId: dropdown(settled.root).props.fieldEventId, kind: 'fieldChanged', value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }) })
    const selected = await waitRoot(root => dropdown(root)?.props.value === JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    assert.equal(dropdown(selected.root).props.value, JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    const persistedSet = await waitForPersistedState(stateFile, state => state !== null && typeof state === 'object' && isDeepStrictEqual((state as { selectedLanguageSet?: unknown }).selectedLanguageSet, { langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    assert.deepEqual(persistedSet.selectedLanguageSet, { langFrom: 'auto', langTo: ['zh-CN', 'en'] }, 'cached set persisted to the main-owned state file')
    await manager.stop()
    // Restart persistence: a fresh child reads the persisted set.
    manager = await start()
    ;({ latestRoot, waitRoot, settle, dropdown, action, fields } = projections(messages))
    const restarted = await waitRoot(root => dropdown(root)?.props.value === JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    assert.equal(dropdown(restarted.root).props.value, JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }), 'restarted child restores the cached language set')
    // Legacy migration: a legacy single-target shape is unified to an array by the unchanged source hooks.
    await manager.stop()
    writeFileSync(stateFile, JSON.stringify({ selectedLanguageSet: { langFrom: 'en', langTo: 'zh-CN' } }), { mode: 0o600 })
    manager = await start()
    ;({ latestRoot, waitRoot, settle, dropdown, action, fields } = projections(messages))
    const migrated = await waitRoot(root => dropdown(root)?.props.value === JSON.stringify({ langFrom: 'en', langTo: ['zh-CN'] }))
    assert.equal(dropdown(migrated.root).props.value, JSON.stringify({ langFrom: 'en', langTo: ['zh-CN'] }), 'legacy stored set migrates to the array shape')
    // Nested navigation: the manage option pushes LanguagesManagerList.
    const settledManage = await settle()
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledManage.revision, eventId: dropdown(settledManage.root).props.fieldEventId, kind: 'fieldChanged', value: 'manage' })
    const managerList = await waitRoot(root => !('searchEventId' in root.props) && JSON.stringify(root).includes('Add new language set...'))
    assert.ok(JSON.stringify(managerList.root).includes('Save current set'), 'an unsaved selected set offers Save Current Set')
    // Push AddLanguageForm.
    const settledPush = await settle()
    const push = action(settledPush.root, 'Add New Language Set…')
    assert.ok(push?.props.actionEventId)
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledPush.revision, eventId: push.props.actionEventId, kind: 'action' })
    const formMessage = await waitRoot(root => fields(root).length > 0)
    const formFields = fields(formMessage.root)
    assert.equal(formFields.length, 3, 'source language plus one target plus the empty next target')
    assert.equal(formFields[0]!.props.title, 'Source Language')
    assert.ok(formFields[0]!.children.some((item: any) => item.props.value === 'en'), 'reviewed language catalog is bounded but complete')
    // Choose English source and French target, then submit.
    const settledForm = await settle()
    const settledFormFields = fields(settledForm.root)
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledForm.revision, eventId: settledFormFields[0]!.props.fieldEventId, kind: 'fieldChanged', value: 'en' })
    const targetMessage = await waitRoot(root => fields(root).find(field => field.props.title === 'Target Language 1')?.props.value === 'en')
    const target = fields(targetMessage.root).find(field => field.props.title === 'Target Language 1')!
    const settledTarget = await settle()
    const settledTargetField = fields(settledTarget.root).find(field => field.props.title === 'Target Language 1')!
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledTarget.revision, eventId: settledTargetField.props.fieldEventId, kind: 'fieldChanged', value: 'fr' })
    const frMessage = await waitRoot(root => fields(root).find(field => field.props.title === 'Target Language 1')?.props.value === 'fr')
    assert.equal(fields(frMessage.root).find(field => field.props.title === 'Target Language 1')!.props.value, 'fr')
    const settledSubmit = await settle()
    const submit = action(settledSubmit.root, 'Add Language Set')
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledSubmit.revision, eventId: submit.props.actionEventId, kind: 'action' })
    await waitRoot(root => JSON.stringify(root).includes('English') && JSON.stringify(root).includes('French') && !JSON.stringify(root).includes('raycast-form'))
    assert.ok(messages.some((message: any) => message.type === 'toast' && message.title === 'Language set was saved!'), 'success toast from the unchanged source')
    const persisted = await waitForPersistedState(stateFile, state => state !== null && typeof state === 'object' && isDeepStrictEqual((state as { languages?: unknown }).languages, [{ langFrom: 'en', langTo: ['fr'] }]))
    assert.deepEqual(persisted.languages, [{ langFrom: 'en', langTo: ['fr'] }])
    // Pop back to the translate root.
    const settledBack = await settle()
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: settledBack.revision, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' })
    const backMessage = await waitRoot(root => typeof root.props.searchEventId === 'string')
    assert.ok(backMessage, 'popping restores the searchable translate root')
  } finally {
    await manager?.stop().catch(() => {})
    await manager?.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
})

test('configured artifact: TTS runs the upstream https.get + afplay flow in private temp and cleans up', { skip: process.platform !== 'darwin' ? 'macOS afplay proof' : configuredArtifact === undefined ? 'set TRUSTED_RAYCAST_ARTIFACT_TAR for live TTS proof' : false, timeout: 90000 }, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-tts-'))
  const messages: any[] = []
  let manager: TrustedRaycastManager | undefined
  try {
    await buildTrustedRaycast(work, artifact)
    manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    const session = Reflect.get(manager, 'session')!
    const mp3 = join(session.workspace, 'tmp', 'translation.mp3')
    const { latestRoot, waitRoot, action } = projections(messages)
    const ready = latestRoot()
    manager.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: ready.revision, eventId: ready.root.props.searchEventId, kind: 'searchChanged', value: 'TockTeam trusted Raycast TTS fixture' })
    const play = async (): Promise<void> => {
      const rows = await waitRoot(root => JSON.stringify(root).includes('raycast-list-item'))
      const tts = action(rows.root, 'Play Text-To-Speech')
      assert.ok(tts?.props.actionEventId, 'Play Text-To-Speech is available')
      manager!.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: rows.revision, eventId: tts.props.actionEventId, kind: 'action' })
    }
    const afplayFor = async (): Promise<string[]> => {
      const { stdout } = await exec('/bin/ps', ['-axo', 'pid=,command='], { timeout: 5000 })
      return stdout.split('\n').filter(line => line.includes('afplay') && line.includes(session.workspace))
    }
    await play()
    const firstDeadline = Date.now() + 20000
    while (Date.now() < firstDeadline && !existsSync(mp3)) await wait(50)
    assert.equal(existsSync(mp3), true, 'translation.mp3 lands only in the private workspace temp')
    const audioDeadline = Date.now() + 10000
    while (Date.now() < audioDeadline && (await afplayFor()).length === 0) await wait(50)
    assert.ok((await afplayFor()).length > 0, 'upstream afplay spawn is observable')
    // Repeated TTS: the second invocation reuses the shared upstream filename.
    await play()
    const repeatDeadline = Date.now() + 10000
    while (Date.now() < repeatDeadline && (await afplayFor()).length === 0) await wait(50)
    assert.ok((await afplayFor()).length > 0, 'repeated TTS remains reachable')
    assert.equal(existsSync(mp3), true)
    // Close during playback: the owned group stops and the private workspace is removed.
    await manager.stop('test-close')
    assert.equal(existsSync(join(session.workspace, 'tmp', 'translation.mp3')), false)
    assert.equal(existsSync(session.workspace), false, 'private workspace removed with its temp audio')
    const leakDeadline = Date.now() + 5000
    while (Date.now() < leakDeadline && (await afplayFor()).length > 0) await wait(50)
    assert.equal((await afplayFor()).length, 0, 'no afplay descendant survives the close')
  } finally {
    await manager?.stop().catch(() => {})
    await manager?.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
})

test(`reviewed artifact: debounce coalesces keystrokes into one final translation (${configuredArtifact ? 'live' : 'offline'} network)`, { skip: process.platform === 'win32' ? 'POSIX trusted-child integration is unsupported on Windows' : false, timeout: 60000 }, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-debounce-'))
  const messages: any[] = []
  const requestsFile = join(work, 'requests.json')
  let manager: TrustedRaycastManager | undefined
  try {
    await buildTrustedRaycast(work, artifact)
    let nodePath = process.execPath
    if (!configuredArtifact) {
      // Mock only HTTP, using the admitted artifact's own undici; source and manager stay unchanged.
      // Setting TRUSTED_RAYCAST_ARTIFACT_TAR retains the explicit live-network proof.
      const preload = join(work, 'network.mjs')
      writeFileSync(preload, `import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { MockAgent, setGlobalDispatcher } = createRequire(join(process.cwd(), 'child.mjs'))('undici');
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
const requests = [];
agent.get('https://translate.google.com').intercept({ path: /^\\/translate_a\\/single\\?/, method: 'GET' }).reply(options => {
  const query = new URL(options.path, 'https://translate.google.com').searchParams.get('q');
  requests.push(query);
  writeFileSync(${JSON.stringify(requestsFile)}, JSON.stringify(requests));
  return { statusCode: 200, data: JSON.stringify([[['translated ' + query, query]], null, 'en', null, null, null, null, null, [['en']]]) };
}).persist();
`)
      nodePath = join(work, 'node-with-network-fixture')
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
      writeFileSync(nodePath, `#!/bin/sh\nexec ${quote(process.execPath)} --import ${quote(pathToFileURL(preload).href)} "$@"\n`, { mode: 0o700 })
    }
    manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    const { latestRoot, waitRoot, settle } = projections(messages)
    // Drain startup patches so a stale initial projection cannot satisfy loading checks.
    await settle()
    const send = (value: string) => {
      const view = latestRoot()
      manager!.send({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: view.revision, eventId: view.root.props.searchEventId, kind: 'searchChanged', value })
    }
    send('ab')
    const pending = await waitRoot(root => root.children.some((child: any) => child.type === 'raycast-list' && child.props.searchText === 'ab'))
    // Query freshness is not completion: the current input still renders the source's loading view.
    assert.equal(pending.root.props.queryCurrent, true)
    const pendingList = pending.root.children.find((child: any) => child.type === 'raycast-list')
    assert.ok(pendingList.children.some((child: any) => child.type === 'raycast-empty' && child.props.title === 'Translating...'), 'the current debounced query shows its loading view')
    await wait(60)
    if (!configuredArtifact) assert.equal(existsSync(requestsFile), false, 'no HTTP request starts before the debounce interval')
    send('abc')
    const finalRoot = await waitRoot(root => root.props.queryCurrent === true && JSON.stringify(root).includes('raycast-list-item') && root.children.some((child: any) => child.type === 'raycast-list' && child.props.searchText === 'abc'), 25000)
    assert.equal(finalRoot.root.props.queryCurrent, true)
    assert.ok(finalRoot.root.children.some((child: any) => child.type === 'raycast-list' && child.props.searchText === 'abc'), 'the debounced final query, not each keystroke, produces results')
    if (!configuredArtifact) {
      assert.ok(JSON.stringify(finalRoot.root).includes('translated abc'), 'the HTTP response reaches the unchanged rendered source')
      assert.deepEqual(JSON.parse(readFileSync(requestsFile, 'utf8')), ['abc', 'translated abc'], 'only the final query and its upstream reverse translation reach HTTP')
    }
    assert.equal(messages.some(message => message.type === 'toast' && message.style === 'failure'), false)
  } finally {
    await manager?.stop().catch(() => {})
    await manager?.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
})
