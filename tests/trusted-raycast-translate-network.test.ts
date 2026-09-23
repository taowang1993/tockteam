import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { resolveTrustedTranslateProxy } from '../src/trusted-raycast-translate-proxy.ts'
import { TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastViewMessage } from '../src/trusted-raycast-contract.ts'
// @ts-expect-error JavaScript build helper.
import { buildTrustedRaycast } from '../scripts/trusted-raycast-build.mjs'

test('system proxy resolution is fixed-origin, bounded, and does not bypass unsupported proxy rules', async t => {
  for (const [rule, expected] of [['DIRECT', ''], ['PROXY 127.0.0.1:8080; DIRECT', 'http://127.0.0.1:8080'], ['HTTPS proxy.example:443', 'https://proxy.example'], ['PROXY [::1]:8080', 'http://[::1]:8080']]) {
    assert.equal(await resolveTrustedTranslateProxy(async url => { assert.equal(url, 'https://translate.google.com'); return rule! }), expected)
  }
  for (const rule of ['', 'SOCKS5 127.0.0.1:1080; DIRECT', 'PROXY proxy.example:99999', 'PROXY user:secret@proxy.example:8080', 'PROXY proxy.example:8080/path']) {
    await assert.rejects(resolveTrustedTranslateProxy(async () => rule), /Translate/)
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const lookup = resolveTrustedTranslateProxy(() => new Promise(() => {}))
  const rejected = assert.rejects(lookup, /timed out/)
  t.mock.timers.tick(5000)
  await rejected
})

test('closing during system proxy lookup cannot launch a late child', async () => {
  let finish!: (proxy: string) => void
  const manager = new TrustedRaycastManager({ runtimeDir: '/missing', nodePath: process.execPath,
    resolveTranslateProxy: () => new Promise(resolve => { finish = resolve }), onMessage() {} })
  const start = manager.start({ webContentsId: 1 }, { extensionId: 'google-translate', sessionId: 's', generation: 'g', command: 'translate', preferences: {} })
  const rejected = assert.rejects(start, /cancelled/)
  await manager.close()
  finish('http://127.0.0.1:8080')
  await rejected
  assert.equal(manager.active, false)
})

test('Translate routes token and translation requests through the host proxy and recovers from stalled bodies', { skip: process.platform === 'win32', timeout: 40000 }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'translate-network-'))
  const requestsFile = join(work, 'requests.json')
  const stateFile = join(work, 'state.json')
  writeFileSync(stateFile, JSON.stringify({ selectedLanguageSet: { langFrom: 'auto', langTo: ['en', 'zh-CN'] } }))
  const shim = join(work, 'network.mjs')
  // Substitute transport only: the pinned source, debounce, hooks, manager and view protocol are real.
  writeFileSync(shim, `import {registerHooks} from 'node:module'; import {writeFileSync} from 'node:fs'; import {join} from 'node:path'; import {pathToFileURL} from 'node:url';
const file=join(process.cwd(),'network-fixture.mjs');
writeFileSync(file, ${JSON.stringify(`import {writeFileSync} from 'node:fs';
export class ProxyAgent { constructor(uri) { this.uri=uri } }
const requests=[];
export async function request(url, options={}) {
  if(options.dispatcher?.uri !== 'http://127.0.0.1:12345') throw Error('Proxy was bypassed');
  if(!options.signal) throw Error('Request has no deadline');
  requests.push({url,proxy:options.dispatcher.uri}); writeFileSync(${JSON.stringify(requestsFile)},JSON.stringify(requests));
  const query=new URL(url).searchParams.get('q');
  if(query==='stalled') return {body:{json:()=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))}};
  const data=[]; data[0]=[[new URL(url).searchParams.get('tl')==='zh-CN'?'硬拉':query]]; data[2]='en'; data[8]=[['en']];
  return {body:{text:async()=>\`tkk:'\${Math.floor(Date.now()/3600000)}.1'\`,json:async()=>data}};
}`)});
registerHooks({resolve(specifier,context,next){return specifier==='undici'?{url:pathToFileURL(file).href,shortCircuit:true}:next(specifier,context)}});`)
  const executable = join(work, 'node-fixture')
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} --import ${quote(shim)} "$@"\n`, { mode: 0o700 })
  const messages: TrustedRaycastViewMessage[] = []; const errors: Error[] = []
  let resolutions = 0
  const manager = new TrustedRaycastManager({ runtimeDir: join(work, 'trusted-raycast'), nodePath: executable, stateFile,
    resolveTranslateProxy: async () => { resolutions++; return 'http://127.0.0.1:12345' },
    onMessage: (_, message) => messages.push(message), onError: (_, error) => errors.push(error) })
  const latest = () => messages.findLast(message => message.root)!
  const wait = async (predicate: () => boolean, timeout = 5000) => {
    const deadline = Date.now() + timeout
    while (!predicate() && !errors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(errors, [])
    assert.ok(predicate(), JSON.stringify(messages.slice(-2)))
  }
  const search = (value: string) => manager.send({ webContentsId: 1 }, { extensionId: 'google-translate', sessionId: 'network', generation: '1', revision: latest().revision, kind: 'searchChanged', eventId: String(latest().root!.props.searchEventId), value })
  let pid: number | undefined
  try {
    await buildTrustedRaycast(work, resolve('plugins/trusted-raycast/vendor/google-translate.tar'))
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate', sessionId: 'network', generation: '1', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false } })
    pid = Reflect.get(manager, 'session')?.child.pid
    search('deadlift')
    await wait(() => JSON.stringify(latest().root).includes('硬拉'))
    assert.equal(resolutions, 1)
    const requests = JSON.parse(readFileSync(requestsFile, 'utf8')) as { url: string }[]
    assert.ok(requests.some(request => new URL(request.url).pathname === '/'))
    assert.ok(requests.some(request => new URL(request.url).pathname === '/translate_a/single'))
    assert.ok(!JSON.stringify(messages).includes('127.0.0.1:12345'), 'proxy stays out of renderer projections')
    search('stalled')
    await wait(() => messages.some(message => message.type === 'toast' && message.style === 'failure'), 13000)
    await wait(() => !JSON.stringify(latest().root).includes('Translating...'))
    search('deadlift')
    await wait(() => JSON.stringify(latest().root).includes('硬拉'))
    assert.equal(manager.active, true)
    await manager.stop()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    messages.length = 0
    await manager.start({ webContentsId: 1 }, { extensionId: 'google-translate', sessionId: 'network', generation: '1', command: 'translate', preferences: { ...TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, autoInput: false, proxy: 'http://127.0.0.1:12345' } })
    pid = Reflect.get(manager, 'session')?.child.pid
    search('deadlift')
    await wait(() => JSON.stringify(latest().root).includes('硬拉'))
    assert.equal(resolutions, 1, 'an explicit extension proxy takes precedence over system settings')
  } finally {
    await manager.close()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    rmSync(work, { recursive: true, force: true })
  }
})

