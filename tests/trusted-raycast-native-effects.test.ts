import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { captureTrustedRaycastPriorApp, pasteTrustedRaycastText, readTrustedRaycastSelectedText, type TrustedRaycastNativeDeps } from '../src/trusted-raycast-native.ts'
import { isTrustedRaycastNativeRequest, isTrustedRaycastNativeOutcome } from '../src/trusted-raycast-contract.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
const exec = promisify(execFile)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const prior = Object.freeze({ name: 'Notes', capturedAt: Date.now() })
const deps = (overrides: Partial<TrustedRaycastNativeDeps> = {}): TrustedRaycastNativeDeps => ({ execFile: async () => ({ stdout: '' }), readClipboard: () => 'original clipboard', writeClipboard: () => {}, ownAppNames: ['TockTeam Desktop'], ...overrides })

test('native request admission accepts bounded Paste and selected text and rejects the rest', () => {
  const valid = isTrustedRaycastNativeRequest
  const base = { type: 'native', sessionId: 's', generation: 'g', requestId: 'n' }
  assert.equal(valid({ ...base, kind: 'selectedText' }), true)
  assert.equal(valid({ ...base, kind: 'selectedText', revision: 0 }), false)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a', text: 'hello' }), true)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a', text: 'x'.repeat(131073) }), false)
  assert.equal(valid({ ...base, kind: 'paste', revision: 2, eventId: 'a' }), false)
  assert.equal(valid({ ...base, kind: 'selectedText', text: 'leak' }), false)
  assert.ok(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', requestId: 'n', succeeded: true, message: '', result: 'selected fixture' }))
  assert.ok(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', requestId: 'n', succeeded: false, message: 'denied' }))
  assert.equal(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', requestId: 'n', succeeded: true, message: '', result: 'x'.repeat(16385) }), false)
  assert.equal(isTrustedRaycastNativeOutcome({ type: 'nativeOutcome', requestId: 'n', succeeded: true, message: '', extra: 1 }), false)
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
  const result = await pasteTrustedRaycastText('fixture paste text', prior, deps({ fixture: 'paste', readClipboard: () => current, writeClipboard: text => { current = text; writes.push(text) } }))
  assert.deepEqual(result, { target: 'Notes', fixture: true })
  assert.deepEqual(writes, ['fixture paste text', 'user clipboard bytes'], 'write, verify, restore: original bytes are the final clipboard state')
})

test('real paste restores focus via the target app and restores the clipboard on denial', async () => {
  const writes: string[] = []
  let current = 'user clipboard bytes'
  const keystrokes: string[] = []
  const result = await pasteTrustedRaycastText('pasted translation', prior, deps({
    readClipboard: () => current, writeClipboard: text => { current = text; writes.push(text) },
    execFile: async (_file, args) => { keystrokes.push(args.join(' ')); return { stdout: '' } },
    wait: async () => {},
  }))
  assert.deepEqual(result, { target: 'Notes', fixture: false })
  assert.equal(writes.at(-1), 'user clipboard bytes')
  assert.ok(keystrokes.some(args => args.includes('keystroke "v" using command down')), 'target app focus is restored before the keystroke')
  const deniedWrites: string[] = []
  let deniedCurrent = 'user clipboard bytes'
  await assert.rejects(pasteTrustedRaycastText('x', prior, deps({
    readClipboard: () => deniedCurrent, writeClipboard: text => { deniedCurrent = text; deniedWrites.push(text) },
    execFile: async () => { throw new Error('osascript is not allowed assistive access (-1719)') },
    wait: async () => {},
  })), /Accessibility permission/)
  assert.equal(deniedWrites.at(-1), 'user clipboard bytes', 'denial path restores the prior clipboard')
})

test('paste policy denials: no captured target, clipboard refusal, and oversized text', async () => {
  await assert.rejects(pasteTrustedRaycastText('x', undefined, deps()), /No prior application captured/)
  await assert.rejects(pasteTrustedRaycastText('x'.repeat(128 * 1024 + 1), prior, deps()), /exceeds its bound/)
  const writes: string[] = []
  await assert.rejects(pasteTrustedRaycastText('x', prior, deps({ readClipboard: () => 'original', writeClipboard: text => writes.push(text), fixture: 'paste' })), /Clipboard was not accepted|Clipboard restoration failed/)
  assert.equal(writes.at(-1), 'original', 'refusal restores the original clipboard')
})

test('the child TMPDIR governs os.tmpdir(), keeping translation.mp3 inside the private workspace', async () => {
  const privateTemp = mkdtempSync(join(tmpdir(), 'raycast-tts-tmp-'))
  try {
    const child = spawn(process.execPath, ['-e', `const {tmpdir}=require('node:os'); console.log(tmpdir())`], { env: { ...process.env, TMPDIR: privateTemp } })
    const output = await new Promise<string>((resolve, reject) => { let text = ''; child.stdout.on('data', chunk => { text += chunk }); child.once('error', reject); child.once('close', code => code === 0 ? resolve(text) : reject(new Error(`exit ${code}`))) })
    assert.equal(output.trim(), privateTemp)
  } finally { rmSync(privateTemp, { recursive: true, force: true }) }
})

const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
const configured = artifact !== undefined ? { skip: false } : { skip: 'TRUSTED_RAYCAST_ARTIFACT_TAR is not configured' }

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
    assert.ok(predicate(message.root), `projection predicate unmet; fields: ${summary(message.root)}; last message: ${JSON.stringify(message).slice(0, 200)}`)
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

test('configured artifact: language sets, nested AddLanguageForm, and restart persistence', configured, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-language-'))
  const stateFile = join(work, 'state.json')
  let messages: any[] = []
  const start = async (): Promise<TrustedRaycastManager> => {
    await buildTrustedRaycast(work, artifact)
    messages = []
    const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, stateFile, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { sessionId: 's', generation: 'g', command: 'translate', preferences: {} })
    return manager
  }
  let manager: TrustedRaycastManager | undefined
  try {
    manager = await start()
    let { latestRoot, waitRoot, settle, dropdown, action, fields } = projections(messages)
    const ready = await waitRoot(root => dropdown(root) !== undefined && typeof root.props.searchEventId === 'string')
    assert.equal(ready.type, 'ready')
    assert.equal(ready.root.props.searchable, true)
    const accessor = dropdown(ready.root)
    assert.equal(accessor.props.value, JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN'] }), 'selected set initializes from preferences.lang1')
    assert.ok(accessor.children.some((item: any) => item.props.value === 'manage'))
    // Select the full preferences set (auto -> zh-CN + en).
    const settled = await settle()
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settled.revision, eventId: dropdown(settled.root).props.fieldEventId, kind: 'fieldChanged', value: JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }) })
    const selected = await waitRoot(root => dropdown(root)?.props.value === JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    assert.equal(dropdown(selected.root).props.value, JSON.stringify({ langFrom: 'auto', langTo: ['zh-CN', 'en'] }))
    assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).selectedLanguageSet.langTo.length, 2, 'cached set persisted to the main-owned state file')
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
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledManage.revision, eventId: dropdown(settledManage.root).props.fieldEventId, kind: 'fieldChanged', value: 'manage' })
    const managerList = await waitRoot(root => !('searchEventId' in root.props) && JSON.stringify(root).includes('Add new language set...'))
    assert.ok(JSON.stringify(managerList.root).includes('Save current set'), 'an unsaved selected set offers Save Current Set')
    // Push AddLanguageForm.
    const settledPush = await settle()
    const push = action(settledPush.root, 'Add New Language Set…')
    assert.ok(push?.props.actionEventId)
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledPush.revision, eventId: push.props.actionEventId, kind: 'action' })
    const formMessage = await waitRoot(root => fields(root).length > 0)
    const formFields = fields(formMessage.root)
    assert.equal(formFields.length, 3, 'source language plus one target plus the empty next target')
    assert.equal(formFields[0]!.props.title, 'Source Language')
    assert.ok(formFields[0]!.children.some((item: any) => item.props.value === 'en'), 'reviewed language catalog is bounded but complete')
    // Choose English source and French target, then submit.
    const settledForm = await settle()
    const settledFormFields = fields(settledForm.root)
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledForm.revision, eventId: settledFormFields[0]!.props.fieldEventId, kind: 'fieldChanged', value: 'en' })
    const targetMessage = await waitRoot(root => fields(root).find(field => field.props.title === 'Target Language 1')?.props.value === 'en')
    const target = fields(targetMessage.root).find(field => field.props.title === 'Target Language 1')!
    const settledTarget = await settle()
    const settledTargetField = fields(settledTarget.root).find(field => field.props.title === 'Target Language 1')!
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledTarget.revision, eventId: settledTargetField.props.fieldEventId, kind: 'fieldChanged', value: 'fr' })
    const frMessage = await waitRoot(root => fields(root).find(field => field.props.title === 'Target Language 1')?.props.value === 'fr')
    assert.equal(fields(frMessage.root).find(field => field.props.title === 'Target Language 1')!.props.value, 'fr')
    const settledSubmit = await settle()
    const submit = action(settledSubmit.root, 'Add Language Set')
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledSubmit.revision, eventId: submit.props.actionEventId, kind: 'action' })
    await waitRoot(root => JSON.stringify(root).includes('English') && JSON.stringify(root).includes('French') && !JSON.stringify(root).includes('raycast-form'))
    assert.ok(messages.some((message: any) => message.type === 'toast' && message.title === 'Language set was saved!'), 'success toast from the unchanged source')
    const persisted = JSON.parse(readFileSync(stateFile, 'utf8'))
    assert.deepEqual(persisted.languages, [{ langFrom: 'en', langTo: ['fr'] }])
    // Pop back to the translate root.
    const settledBack = await settle()
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: settledBack.revision, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' })
    const backMessage = await waitRoot(root => typeof root.props.searchEventId === 'string')
    assert.ok(backMessage, 'popping restores the searchable translate root')
  } finally {
    await manager?.stop().catch(() => {})
    await manager?.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
})

test('configured artifact: TTS runs the upstream https.get + afplay flow in private temp and cleans up', { skip: process.platform !== 'darwin' ? 'macOS afplay proof' : configured.skip, timeout: 90000 }, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-tts-'))
  const messages: any[] = []
  let manager: TrustedRaycastManager | undefined
  try {
    await buildTrustedRaycast(work, artifact)
    manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { sessionId: 's', generation: 'g', command: 'translate', preferences: {} })
    const session = Reflect.get(manager, 'session')!
    const mp3 = join(session.workspace, 'tmp', 'translation.mp3')
    const { latestRoot, waitRoot, action } = projections(messages)
    const ready = latestRoot()
    manager.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: ready.revision, eventId: ready.root.props.searchEventId, kind: 'searchChanged', value: 'TockTeam trusted Raycast TTS fixture' })
    const play = async (): Promise<void> => {
      const rows = await waitRoot(root => JSON.stringify(root).includes('raycast-list-item'))
      const tts = action(rows.root, 'Play Text-To-Speech')
      assert.ok(tts?.props.actionEventId, 'Play Text-To-Speech is available')
      manager!.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: rows.revision, eventId: tts.props.actionEventId, kind: 'action' })
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

test('configured artifact: debounce coalesces keystrokes into one final translation', { ...configured, timeout: 60000 }, async () => {
  // @ts-expect-error JavaScript helper owns the configured artifact build.
  const { buildTrustedRaycast } = await import('../scripts/trusted-raycast-build.mjs')
  const work = mkdtempSync(join(tmpdir(), 'raycast-slice3-debounce-'))
  const messages: any[] = []
  let manager: TrustedRaycastManager | undefined
  try {
    await buildTrustedRaycast(work, artifact)
    manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, onMessage: (_owner, message) => messages.push(message) })
    await manager.start({ webContentsId: 1 }, { sessionId: 's', generation: 'g', command: 'translate', preferences: {} })
    const { latestRoot, waitRoot } = projections(messages)
    const ready = latestRoot()
    const send = (value: string) => {
      const message = latestRoot()
      manager!.send({ webContentsId: 1 }, { sessionId: 's', generation: 'g', revision: message.revision, eventId: message.root.props.searchEventId, kind: 'searchChanged', value })
    }
    send('ab')
    await wait(60)
    send('abc')
    const finalRoot = await waitRoot(root => root.props.queryCurrent === true && JSON.stringify(root).includes('raycast-list-item') && root.children.some((child: any) => child.type === 'raycast-list' && child.props.searchText === 'abc'), 25000)
    assert.equal(finalRoot.root.props.queryCurrent, true)
    assert.ok(finalRoot.root.children.some((child: any) => child.type === 'raycast-list' && child.props.searchText === 'abc'), 'the debounced final query, not each keystroke, produces results')
    assert.ok(messages.some((message: any) => message.root?.props.queryCurrent === false), 'intermediate loading projections remain honest')
  } finally {
    await manager?.stop().catch(() => {})
    await manager?.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
  }
})
