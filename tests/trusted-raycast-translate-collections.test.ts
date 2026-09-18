import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { MAX_TRANSLATE_STATE_BYTES } from '../src/trusted-raycast-translate-state.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, isTrustedRaycastViewMessage, type TrustedRaycastViewMessage, type TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'
// @ts-expect-error Build helper is JavaScript.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'

const nodes = (root: TrustedRaycastViewNode, type: string): TrustedRaycastViewNode[] => [
  ...(root.type === type ? [root] : []),
  ...root.children.flatMap(child => typeof child === 'string' ? [] : nodes(child, type)),
]

test('reviewed Translate manager admits all 128 sets and supports paging, search, and rejected saves', { timeout: 30000, skip: process.platform === 'win32' }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'translate-collections-'))
  const stateFile = join(work, 'state.json')
  const languages = Array.from({ length: 128 }, (_, index) => ({ langFrom: 'en', langTo: Array.from({ length: index + 1 }, () => index === 127 ? 'de' : 'fr') }))
  const contents = JSON.stringify({ languages, selectedLanguageSet: { langFrom: 'zh-CN', langTo: 'zh-CN' } })
  writeFileSync(stateFile, contents)
  const messages: TrustedRaycastViewMessage[] = []
  const errors: Error[] = []
  const owner = { webContentsId: 1 }
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, stateFile, onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error) })
  const latest = () => messages.findLast(message => message.root)!
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5000
    while (!predicate() && errors.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(errors.map(error => error.message), [])
    assert.ok(predicate(), 'expected manager-admitted projection or outcome')
  }
  const field = (value: string) => {
    const current = latest()
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'collections', generation: '1', revision: current.revision, kind: 'fieldChanged', eventId: String(nodes(current.root!, 'raycast-dropdown')[0]!.props.fieldEventId), value })
  }
  const action = async (title: string) => {
    const current = latest()
    const node = nodes(current.root!, 'raycast-action').find(node => node.props.title === title)!
    assert.ok(node, title)
    const eventId = String(node.props.actionEventId)
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'collections', generation: '1', revision: current.revision, kind: 'action', eventId })
    await wait(() => messages.some(message => message.type === 'outcome' && message.eventId === eventId))
    return messages.findLast(message => message.type === 'outcome' && message.eventId === eventId)!
  }
  let pid: number | undefined
  try {
    await buildTrustedRaycast(work, join(resolve('.'), 'plugins/trusted-raycast/vendor/google-translate.tar'))
    await manager.start(owner, { extensionId: 'google-translate', sessionId: 'collections', generation: '1', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    pid = Reflect.get(manager, 'session')?.child.pid
    await wait(() => !nodes(latest().root!, 'raycast-empty').some(node => node.props.icon === 'Hourglass'))
    field('manage')
    await wait(() => latest().root?.props.navigationDepth === 1)
    assert.equal(latest().root!.props.languageCollection, true)
    assert.ok(nodes(latest().root!, 'raycast-list-item').length < 40)
    assert.equal(latest().root!.props.collectionPage, 1)
    assert.ok(nodes(latest().root!, 'raycast-list-item').some(node => String(node.props.subtitle).includes('Languages')), 'long summaries distinguish their target counts')
    assert.equal((await action('Next Page')).succeeded, true)
    assert.equal(latest().root!.props.collectionPage, 2)
    const current = latest()
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'collections', generation: '1', revision: current.revision, kind: 'searchChanged', eventId: String(current.root!.props.searchEventId), value: 'German' })
    await wait(() => latest().root?.props.collectionCount === 1)
    assert.equal(latest().root!.props.collectionPage, 1)
    assert.ok(nodes(latest().root!, 'raycast-list-item').some(node => String(node.props.subtitle).includes('German')))
    const rejected = await action('Save Current Set')
    assert.equal(rejected.succeeded, false)
    assert.equal(latest().root!.props.navigationDepth, 1)
    assert.equal(messages.some(message => message.type === 'toast' && message.style === 'success'), false)
    assert.equal(readFileSync(stateFile, 'utf8'), contents)
    assert.ok(messages.every(isTrustedRaycastViewMessage))
  } finally {
    await manager.close()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    rmSync(work, { recursive: true, force: true })
  }
})

test('near-limit legacy collections stay readable and selectable through normal manager admission', { timeout: 30000, skip: process.platform === 'win32' }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'translate-large-collections-'))
  const stateFile = join(work, 'state.json')
  const selectedLanguageSet = { langFrom: 'zh-CN', langTo: 'zh-CN' }
  const rejected = { langFrom: 'auto', langTo: ['zh-CN', 'en'] }
  const languages = [...Array.from({ length: 127 }, (_, index) => ({ langFrom: 'en', langTo: Array.from({ length: 340 + index + (index === 126 ? 867 : 0) }, () => 'bm-Nkoo') })), rejected]
  const contents = `${JSON.stringify({ selectedLanguageSet, languages })}\n`
  assert.ok(Buffer.byteLength(contents) <= MAX_TRANSLATE_STATE_BYTES)
  assert.ok(Buffer.byteLength(`${JSON.stringify({ selectedLanguageSet: rejected, languages })}\n`) > MAX_TRANSLATE_STATE_BYTES)
  writeFileSync(stateFile, contents)
  const messages: TrustedRaycastViewMessage[] = []; const errors: Error[] = []
  const owner = { webContentsId: 1 }
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath, stateFile, onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error) })
  const latest = () => messages.findLast(message => message.root)!
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5000
    while (!predicate() && errors.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(errors.map(error => error.message), [])
    assert.ok(predicate(), 'expected bounded collection response')
  }
  const field = (value: string) => {
    const current = latest()
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'large', generation: '1', revision: current.revision, kind: 'fieldChanged', eventId: String(nodes(current.root!, 'raycast-dropdown')[0]!.props.fieldEventId), value })
  }
  const act = async (action: TrustedRaycastViewNode) => {
    const eventId = String(action.props.actionEventId)
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'large', generation: '1', revision: latest().revision, kind: 'action', eventId })
    await wait(() => messages.some(message => message.type === 'outcome' && message.eventId === eventId))
    assert.equal(messages.findLast(message => message.type === 'outcome' && message.eventId === eventId)?.succeeded, true)
  }
  let pid: number | undefined
  try {
    await buildTrustedRaycast(work, join(resolve('.'), 'plugins/trusted-raycast/vendor/google-translate.tar'))
    await manager.start(owner, { extensionId: 'google-translate', sessionId: 'large', generation: '1', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    pid = Reflect.get(manager, 'session')?.child.pid
    await wait(() => !nodes(latest().root!, 'raycast-empty').some(node => node.props.icon === 'Hourglass'))
    const original = latest()
    const select = nodes(original.root!, 'raycast-dropdown')[0]!
    const saved = select.children.filter((child): child is TrustedRaycastViewNode => typeof child !== 'string')
    assert.ok(saved.every(option => String(option.props.value).length <= 128))
    field(String(saved[129]!.props.value))
    await wait(() => messages.some(message => message.type === 'toast' && message.style === 'failure') && latest().revision > original.revision)
    assert.equal(nodes(latest().root!, 'raycast-dropdown')[0]!.props.value, select.props.value)
    assert.equal(readFileSync(stateFile, 'utf8'), contents)

    field('manage')
    await wait(() => latest().root!.props.languageCollection === true)
    for (let index = 1; index < 6; index++) await act(nodes(latest().root!, 'raycast-action').find(action => action.props.title === 'Next Page')!)
    const largest = nodes(latest().root!, 'raycast-list-item').find(item => String(item.props.subtitle).includes('1333 Languages'))!
    assert.ok(largest)
    await act(nodes(largest, 'raycast-action').find(action => action.props.title === 'View All Languages')!)
    assert.equal(latest().root!.props.navigationDepth, 2)
    let full = ''
    for (let index = 0; index < 10; index++) {
      full += nodes(latest().root!, 'raycast-detail')[0]!.props.markdown
      const next = nodes(latest().root!, 'raycast-action').find(action => action.props.title === 'Next Page')
      if (!next) break
      await act(next)
    }
    assert.equal(full, ` ${Array.from({ length: 1333 }, () => 'NKo').join(', ')}`, 'expansion preserves every duplicate and its order across pages')
    const navigate = () => manager.send(owner, { extensionId: 'google-translate', sessionId: 'large', generation: '1', revision: latest().revision, kind: 'navigation', eventId: 'language-nav', value: 'language:pop' })
    navigate(); await wait(() => latest().root!.props.navigationDepth === 1)
    assert.equal(latest().root!.props.collectionPage, 6)
    navigate(); await wait(() => latest().root!.props.navigationDepth === 0)
    await wait(() => !nodes(latest().root!, 'raycast-empty').some(node => node.props.icon === 'Hourglass'))
    field(String(saved[1]!.props.value))
    await wait(() => JSON.stringify(JSON.parse(readFileSync(stateFile, 'utf8')).selectedLanguageSet) === JSON.stringify({ langFrom: 'auto', langTo: ['en', 'en'] }))
    assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).languages, languages)
    assert.ok(messages.every(isTrustedRaycastViewMessage))
    assert.deepEqual(errors, [])
  } finally {
    await manager.close()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    rmSync(work, { recursive: true, force: true })
  }
})

test('oversized successful translation output stays recoverable without changing source or contacting Google', { timeout: 30000, skip: process.platform === 'win32' }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'translate-result-limit-'))
  const stateFile = join(work, 'state.json')
  const contents = JSON.stringify({ languages: [{ langFrom: 'en', langTo: Array(40000).fill('en') }], selectedLanguageSet: { langFrom: 'en', langTo: Array(37).fill('en') } })
  writeFileSync(stateFile, contents)
  // Substitute only the network boundary; run the real admitted command, hooks, child and manager.
  const shim = join(work, 'network.mjs')
  writeFileSync(shim, `import { registerHooks } from 'node:module'; import { writeFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url'; import { join } from 'node:path';
const file=join(process.cwd(),'network-fixture.mjs');
writeFileSync(file, ${JSON.stringify("export class ProxyAgent {}\nexport async function request(url) { if(new URL(url).hostname !== 'translate.google.com') throw Error('External network denied'); const data=[]; data[0]=[['Successful translation']]; data[2]='en'; data[8]=[['en']]; return {body:{text:async()=>`tkk:'${Math.floor(Date.now()/3600000)}.1'`,json:async()=>data}} }")});
registerHooks({resolve(specifier,context,next){return specifier==='undici'?{url:pathToFileURL(file).href,shortCircuit:true}:next(specifier,context)}});`)
  const executable = join(work, 'node-fixture')
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} --import ${quote(shim)} "$@"\n`); chmodSync(executable, 0o700)
  const messages: TrustedRaycastViewMessage[] = []; const errors: Error[] = []
  const owner = { webContentsId: 1 }
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: executable, stateFile, onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error) })
  const latest = () => messages.findLast(message => message.root)!
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5000
    while (!predicate() && errors.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(errors.map(error => error.message), [])
    assert.ok(predicate(), JSON.stringify({ titles: latest()?.root ? nodes(latest().root!, 'raycast-list-item').map(node => node.props.title) : [], empty: latest()?.root ? nodes(latest().root!, 'raycast-empty').map(node => node.props) : [], selected: JSON.parse(readFileSync(stateFile, 'utf8')).selectedLanguageSet, toasts: messages.filter(message => message.type === 'toast') }))
  }
  let pid: number | undefined
  try {
    await buildTrustedRaycast(work, join(resolve('.'), 'plugins/trusted-raycast/vendor/google-translate.tar'))
    await manager.start(owner, { extensionId: 'google-translate', sessionId: 'results', generation: '1', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    pid = Reflect.get(manager, 'session')?.child.pid
    await wait(() => !nodes(latest().root!, 'raycast-empty').some(node => node.props.icon === 'Hourglass'))
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'results', generation: '1', revision: latest().revision, kind: 'searchChanged', eventId: String(latest().root!.props.searchEventId), value: 'hello' })
    await wait(() => nodes(latest().root!, 'raycast-empty').some(node => node.props.title === 'Translation Results Exceed the Display Limit'))
    assert.equal(readFileSync(stateFile, 'utf8'), contents)
    const field = nodes(latest().root!, 'raycast-dropdown')[0]!
    manager.send(owner, { extensionId: 'google-translate', sessionId: 'results', generation: '1', revision: latest().revision, kind: 'fieldChanged', eventId: String(field.props.fieldEventId), value: String((field.children[1] as TrustedRaycastViewNode).props.value) })
    await wait(() => nodes(latest().root!, 'raycast-list-item').some(node => node.props.title === 'Successful translation'))
    assert.ok(manager.active)
    assert.ok(messages.every(isTrustedRaycastViewMessage))
  } finally {
    await manager.close()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    rmSync(work, { recursive: true, force: true })
  }
})
