import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTrustedTranslateProofUrl } from '../src/trusted-raycast-catalog.ts'
import { isTrustedRaycastPreferences, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-contract.ts'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { PassThrough } from 'node:stream'

test('bounded private proof browser denies malformed navigation destinations', () => {
  assert.equal(isTrustedTranslateProofUrl('https://translate.google.com/?sl=auto&tl=en&text=x&op=translate'), true)
  assert.equal(isTrustedTranslateProofUrl('not a url'), false)
  assert.equal(isTrustedTranslateProofUrl(''), false)
  assert.equal(isTrustedTranslateProofUrl('https://translate.google.com.evil.example/'), false)
  assert.equal(isTrustedTranslateProofUrl('file:///etc/passwd'), false)
  assert.equal(isTrustedTranslateProofUrl('about:blank'), false)
})

test('translate preferences admit only the exact reviewed key set with bounded values', () => {
  assert.deepEqual(TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, { langFrom: 'auto', lang1: 'en', lang2: 'en', autoInput: true, defaultAction: 'copy', prioritizeCrossLanguage: false, proxy: '' }, 'defaults match the unchanged extension manifest')
  assert.equal(isTrustedRaycastPreferences(TRUSTED_RAYCAST_PREFERENCE_DEFAULTS), true)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, lang1: 'en', autoInput: true, defaultAction: 'paste', proxy: 'http://127.0.0.1:8080' }), true)
  assert.equal(isTrustedRaycastPreferences({}), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, extra: 'key' }), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, langFrom: 'javascript:alert(1)' }), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, lang1: 'x'.repeat(17) }), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: 'yes' }), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, defaultAction: 'open' }), false)
  assert.equal(isTrustedRaycastPreferences({ ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, proxy: 'x'.repeat(2049) }), false)
})

test('manager start rejects unsupported preferences but admits defaults', async () => {
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {} })
  await assert.rejects(manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: { lang1: 'unsafe<script>' } }), /Unsupported Translate preferences/)
  await assert.rejects(manager.start({ webContentsId: 1 }, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: {} }), /Packaged Node|runtimeDir|artifact|ENOENT/i)
})

test('manager rewrites field handles, forwards navigation, and rejects stale field and search events', async () => {
  const writes: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {} })
  const stdin = new PassThrough(); stdin.on('data', chunk => writes.push(String(chunk)))
  const owner = { webContentsId: 1 }
  const session = { child: { stdin }, owner, input: { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate' as const, preferences: {} }, workspace: '/tmp/x', revision: 2, querySequence: 0, eventId: 'search', actions: new Map([['action', 'source-action']]), fields: new Map([['field', 'source-field']]), action: undefined as { eventId: string; revision: number; nativeUsed: boolean } | undefined }
  Reflect.set(manager, 'session', session)
  assert.throws(() => manager.send(owner, { extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', revision: 2, eventId: 'field', kind: 'fieldChanged', value: 'manage' }), /stale/)
  assert.equal(writes.length, 0)
  manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'field', kind: 'fieldChanged', value: 'manage' })
  assert.deepEqual(JSON.parse(writes.at(-1)!), { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'source-field', kind: 'fieldChanged', value: 'manage' })
  assert.throws(() => manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'unknown', kind: 'fieldChanged', value: 'manage' }), /stale/)
  manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' })
  assert.deepEqual(JSON.parse(writes.at(-1)!), { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'language-nav', kind: 'navigation', value: 'language:pop' })
  assert.throws(() => manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'language-nav', kind: 'navigation', value: 'unsafe' }), /stale/)
  session.eventId = ''
  assert.throws(() => manager.send(owner, { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: '', kind: 'searchChanged', value: 'x' }), /stale/)
  stdin.destroy()
})

test('selected text native requests resolve with bounded results or honest denial', async () => {
  const writes: string[] = []
  const selections: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {}, readSelectedText: async () => { selections.push('read'); return { text: 'fixture selection' } } })
  const stdin = new PassThrough(); stdin.on('data', chunk => writes.push(String(chunk)))
  const owner = { webContentsId: 1 }
  const session = { child: { stdin }, owner, input: { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate' as const, preferences: {} }, workspace: '/tmp/x', revision: 2, querySequence: 0, eventId: 'search', actions: new Map(), fields: new Map(), action: undefined as { eventId: string; revision: number; nativeUsed: boolean } | undefined }
  Reflect.set(manager, 'session', session)
  const native = Reflect.get(manager, 'native').bind(manager)
  await native(session, { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', requestId: 'n1', kind: 'selectedText' })
  const outcome = JSON.parse(writes.at(-1)!)
  assert.equal(outcome.succeeded, true)
  assert.equal(outcome.result, 'fixture selection')
  await native(session, { type: 'native', extensionId: 'google-translate', sessionId: 'other', generation: 'g', requestId: 'n2', kind: 'selectedText' })
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  assert.equal(selections.length, 1, 'unowned sessions cannot read selection')
  Reflect.set(manager, 'session', { ...session, input: { ...session.input, sessionId: 's' } })
  const denied = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {} })
  Reflect.set(denied, 'session', session)
  await Reflect.get(denied, 'native').bind(denied)(session, { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', requestId: 'n3', kind: 'selectedText' })
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  assert.match(JSON.parse(writes.at(-1)!).message, /unavailable/i)
  stdin.destroy()
})

test('paste requires a correlated action and surfaces honest policy denial', async () => {
  const writes: string[] = []
  const pastes: string[] = []
  const manager = new TrustedRaycastManager({ runtimeDir: '/unused', nodePath: process.execPath, onMessage() {}, pasteText: async text => { pastes.push(text); throw new Error('No prior application captured. Paste requires a captured target application.') } })
  const stdin = new PassThrough(); stdin.on('data', chunk => writes.push(String(chunk)))
  const owner = { webContentsId: 1 }
  const session: { child: { stdin: PassThrough }; owner: typeof owner; input: { extensionId: 'google-translate'; sessionId: string; generation: string; command: 'translate'; preferences: Record<string, never> }; workspace: string; revision: number; querySequence: number; eventId: string; actions: Map<string, string>; fields: Map<string, string>; action?: { eventId: string; revision: number; nativeUsed: boolean } } = { child: { stdin }, owner, input: { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', command: 'translate', preferences: {} }, workspace: '/tmp/x', revision: 2, querySequence: 0, eventId: 'search', actions: new Map(), fields: new Map(), action: { eventId: 'paste-action', revision: 2, nativeUsed: false } }
  Reflect.set(manager, 'session', session)
  const native = Reflect.get(manager, 'native').bind(manager)
  const base = { type: 'native', extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 2, eventId: 'paste-action', requestId: 'n', kind: 'paste', text: 'translated text' }
  await native(session, base)
  const outcome = JSON.parse(writes.at(-1)!)
  assert.equal(outcome.succeeded, false)
  assert.equal(outcome.message, 'No prior application captured. Paste requires a captured target application.')
  assert.deepEqual(pastes, ['translated text'])
  await native(session, { ...base, requestId: 'replay' })
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  assert.equal(pastes.length, 1, 'replay cannot repeat a native effect')
  delete session.action
  await native(session, { ...base, requestId: 'late' })
  assert.equal(JSON.parse(writes.at(-1)!).succeeded, false)
  stdin.destroy()
})

test('cached state persists across child restarts and admits legacy stored shapes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'raycast-cached-state-'))
  const stateFile = join(dir, 'state.json')
  const previousEnv = process.env.TRUSTED_RAYCAST_STATE_FILE
  try {
    writeFileSync(stateFile, JSON.stringify({ selectedLanguageSet: { langFrom: 'en', langTo: 'zh-CN' }, languages: [] }), { mode: 0o600 })
    process.env.TRUSTED_RAYCAST_STATE_FILE = stateFile
    const output = await build({ stdin: { contents: `export { useCachedState } from './src/trusted-raycast-compat-utils.ts'`, resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'isolated-hook-scheduler', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `let state, dependency, cleanup; export default {useState(initial) {state ??= (typeof initial === 'function' ? initial() : initial); return [state,next=>{state=typeof next==='function'?next(state):next}]},useEffect(effect,deps){if(JSON.stringify(deps)!==dependency){cleanup?.();dependency=JSON.stringify(deps);cleanup=effect()}},useCallback(callback){return callback},useSyncExternalStore(_subscribe,getSnapshot){return getSnapshot()},createContext(value){return {Provider:()=>null,value}},useRef(value){return {current:value}},useContext(){return null},Children:{toArray:children=>children}}` }))
    } }] })
    const { useCachedState } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`)
    const [legacy] = useCachedState('selectedLanguageSet', { langFrom: 'auto', langTo: ['zh-CN'] })
    assert.deepEqual(legacy, { langFrom: 'en', langTo: 'zh-CN' }, 'stored legacy shape is loaded for source-side unification')
    const [, set] = useCachedState('languages', [])
    set([{ langFrom: 'auto', langTo: ['zh-CN', 'en'] }])
    let persisted = JSON.parse(readFileSync(stateFile, 'utf8'))
    for (let attempt = 0; attempt < 20 && persisted.languages?.length !== 1; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      persisted = JSON.parse(readFileSync(stateFile, 'utf8'))
    }
    assert.deepEqual(persisted.languages, [{ langFrom: 'auto', langTo: ['zh-CN', 'en'] }])
    assert.equal((persisted.selectedLanguageSet as { langTo: string }).langTo, 'zh-CN', 'unrelated cached keys are preserved')
    const compatibilityUtils = readFileSync(join(resolve('.'), 'src', 'trusted-raycast-compat-utils.ts'), 'utf8')
    assert.match(compatibilityUtils, /atomicWrite\(stateFile,/)
    assert.doesNotMatch(compatibilityUtils, /writeFileSync\(stateFile,/)
  } finally {
    if (previousEnv === undefined) delete process.env.TRUSTED_RAYCAST_STATE_FILE; else process.env.TRUSTED_RAYCAST_STATE_FILE = previousEnv
    rmSync(dir, { recursive: true, force: true })
  }
})
