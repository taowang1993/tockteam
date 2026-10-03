import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import fs, { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { createUserRaycastStorage } from '../src/user-raycast-storage.ts'

test('default Cache clear preserves exact legacy LocalStorage strings before its first mutation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-preservation-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), legacy = Object.fromEntries([
    ['saved', 'false'], ['number', '0'], ['empty', ''], ['__proto__', 'plain data'], ['constructor', 'also data'], ['', 'visible legacy key'], ['large', 'x'.repeat(8000)],
  ])
  writeFileSync(path, JSON.stringify(legacy), { mode: 0o600 })
  const storage = createUserRaycastStorage(path), cache = storage.cache(), named = storage.cache('private')
  named.set('hidden', 'named data')
  assert.deepEqual(await storage.allItems(), legacy)
  assert.deepEqual(readdirSync(root), ['state.json'], 'Import, reads and named Cache do not create a LocalStorage snapshot')
  cache.clear()
  assert.equal(cache.has('saved'), false)
  assert.equal(named.get('hidden'), 'named data')
  assert.deepEqual(await storage.allItems(), legacy, 'Default Cache clear must preserve every legacy LocalStorage string first')
  assert.deepEqual(await createUserRaycastStorage(path).allItems(), legacy, 'The preserved namespace survives a cold open')
})

test('named Cache clears only its encoded keys and preserves prefix-shaped public legacy LocalStorage', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-public-prefix-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), prefix = `cache:${createHash('sha256').update(JSON.stringify('private')).digest('hex')}:`, key = `${prefix}short`
  assert.ok(key.length <= 128)
  const legacy = { [key]: 'public legacy value' }
  writeFileSync(path, JSON.stringify(legacy))
  const storage = createUserRaycastStorage(path), named = storage.cache('private')
  assert.equal(named.isEmpty, true, 'A public prefix-shaped key does not make a named Cache non-empty')
  assert.equal(named.has('short'), false)
  named.set('short', 'actual private key'); named.clear()
  assert.deepEqual(await storage.allItems(), legacy, 'A public key that resembles a namespace prefix is not an encoded Cache key')
  assert.equal(storage.cache().get(key), 'public legacy value')
  assert.equal(named.isEmpty, true)
  assert.deepEqual(readdirSync(root), ['state.json'], 'Named-only mutations do not need or create a safety snapshot')
  assert.deepEqual(await createUserRaycastStorage(path).allItems(), legacy)
})

test('LocalStorage preserves primitive types across cold opens without changing Cache bytes or subscribers', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-types-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), raw = '{\n "legacyBoolean": "false", "legacyNumber": "0", "legacyEmpty": ""\n}\n'
  writeFileSync(path, raw, { mode: 0o600 })
  const legacy = JSON.parse(raw), storage = createUserRaycastStorage(path), cache = storage.cache(), events: unknown[] = []
  storage.subscribe((...event) => events.push(event))
  const primitives = Object.fromEntries<string | number | boolean>([['false', false], ['true', true], ['zero', 0], ['negativeZero', -0], ['number', -12.5], ['large', 1e300], ['small', 1e-300], ['empty', ''], ['__proto__', false], ['constructor', 0]])
  for (const [key, value] of Object.entries(primitives)) {
    await storage.setItem(key, value)
  }
  assert.deepEqual(await storage.allItems(), { ...legacy, ...primitives })
  assert.deepEqual(events, [], 'LocalStorage changes never send string-only Cache notifications')
  assert.equal(readFileSync(path, 'utf8'), raw, 'LocalStorage never rewrites the original raw Cache file')
  assert.equal(cache.get('false'), undefined)
  assert.equal(cache.get('legacyBoolean'), 'false')
  const cold = createUserRaycastStorage(path)
  assert.deepEqual(await cold.allItems(), { ...legacy, ...primitives })
  assert.equal(await cold.getItem('false'), false)
  assert.ok(Object.is(await cold.getItem('negativeZero'), -0))
  const snapshot = await cold.allItems(); snapshot.false = 'caller change'
  assert.equal(await cold.getItem('false'), false)
  cache.set('zero', 'Cache-only zero')
  await cold.removeItem('zero'); assert.equal(await cold.getItem('zero'), undefined)
  assert.equal(cache.get('zero'), 'Cache-only zero')
  cache.set('legacyBoolean', 'Cache-only replacement'); cache.clear()
  assert.equal(await cold.getItem('legacyBoolean'), 'false')
  assert.equal(await cold.getItem('true'), true)
  cache.set('survivor', 'Cache survives'); const beforeClear = [...events]
  await cold.clear()
  assert.deepEqual(await cold.allItems(), {})
  assert.equal(cache.get('survivor'), 'Cache survives')
  assert.deepEqual(events, beforeClear)
})

for (const mutation of ['overwrite', 'remove'] as const) test(`default Cache first ${mutation} preserves the original LocalStorage namespace`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-cache-first-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), legacy = { saved: 'legacy value', retained: 'false' }
  writeFileSync(path, JSON.stringify(legacy))
  const storage = createUserRaycastStorage(path), cache = storage.cache(), events: unknown[] = []
  cache.subscribe((...event) => events.push(event))
  if (mutation === 'overwrite') cache.set('saved', 'new Cache value')
  else assert.equal(cache.remove('saved'), true)
  assert.deepEqual(await storage.allItems(), legacy)
  assert.deepEqual(await createUserRaycastStorage(path).allItems(), legacy)
  assert.equal(cache.get('saved'), mutation === 'overwrite' ? 'new Cache value' : undefined)
  assert.deepEqual(events, [['saved', mutation === 'overwrite' ? 'new Cache value' : undefined]])
})

test('invalid typed LocalStorage and Cache requests publish no sidecar or partial changes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-invalid-input-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), raw = '{ "saved": "legacy" }\n'
  writeFileSync(path, raw)
  const storage = createUserRaycastStorage(path), cache = storage.cache()
  for (const value of [undefined, null, NaN, Infinity, -Infinity, {}, [], new String('wrapped'), 1n, Symbol('value'), () => {}, 'x'.repeat(4097)]) {
    await assert.rejects(storage.setItem('saved', value as never))
    assert.throws(() => cache.set('saved', value as never))
  }
  for (const key of ['', 'x'.repeat(129), null, 0, {}]) {
    await assert.rejects(storage.setItem(key as never, false))
    await assert.rejects(storage.removeItem(key as never))
    await assert.rejects(storage.getItem(key as never))
    assert.throws(() => cache.set(key as never, 'value'))
    assert.throws(() => cache.remove(key as never))
  }
  assert.deepEqual(readdirSync(root), ['state.json'])
  assert.equal(readFileSync(path, 'utf8'), raw)
})

for (const limit of ['entries', 'bytes', 'safety snapshot'] as const) test(`storage ${limit} quota failures preserve every legacy string without publishing a sidecar`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-quota-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), legacy = limit === 'entries' ? Object.fromEntries(Array.from({ length: 256 }, (_, index) => [String(index), 'value']))
    : { saved: 'x'.repeat(limit === 'bytes' ? 65000 : 65536 - Buffer.byteLength(JSON.stringify({ saved: '' }))) }
  const raw = JSON.stringify(legacy); writeFileSync(path, raw)
  const storage = createUserRaycastStorage(path), cache = storage.cache(), events: unknown[] = []
  cache.subscribe((...event) => events.push(event))
  await assert.rejects(storage.setItem('new', limit === 'entries' ? false : 'x'.repeat(4096)), /limit/)
  assert.throws(() => limit === 'safety snapshot' ? cache.clear() : cache.set('new', 'x'.repeat(4096)), /limit/)
  assert.equal(readFileSync(path, 'utf8'), raw)
  assert.deepEqual(await storage.allItems(), legacy)
  assert.deepEqual(readdirSync(root), ['state.json'])
  assert.deepEqual(events, [])
})

for (const invalid of ['malformed', 'version', 'extra fields', 'array', 'object value', 'non-finite', 'too many entries', 'long key', 'oversized', 'symlink', 'dangling link', 'directory'] as const) test(`invalid ${invalid} LocalStorage snapshot never falls back or overwrites Cache or existing data`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-bad-snapshot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, outside = join(root, 'outside.json'), raw = '{"saved":"legacy"}'
  writeFileSync(path, raw); writeFileSync(outside, '{"outside":"untouched"}')
  if (invalid === 'symlink' || invalid === 'dangling link') symlinkSync(invalid === 'symlink' ? outside : join(root, 'missing.json'), snapshot)
  else if (invalid === 'directory') mkdirSync(snapshot)
  else writeFileSync(snapshot, invalid === 'malformed' ? 'not JSON'
    : invalid === 'version' ? '{"version":2,"values":{}}'
    : invalid === 'extra fields' ? '{"version":1,"values":{},"unknown":true}'
    : invalid === 'array' ? '{"version":1,"values":[]}'
    : invalid === 'object value' ? '{"version":1,"values":{"saved":{}}}'
    : invalid === 'non-finite' ? '{"version":1,"values":{"saved":1e999}}'
    : invalid === 'too many entries' ? JSON.stringify({ version: 1, values: Object.fromEntries(Array.from({ length: 257 }, (_, index) => [String(index), false])) })
    : invalid === 'long key' ? JSON.stringify({ version: 1, values: { ['x'.repeat(129)]: false } })
    : JSON.stringify({ version: 1, values: { saved: 'x'.repeat(65536) } }))
  const stat = lstatSync(snapshot), before = stat.isSymbolicLink() ? readlinkSync(snapshot) : stat.isFile() ? readFileSync(snapshot) : undefined
  const storage = createUserRaycastStorage(path), cache = storage.cache()
  assert.equal(cache.get('saved'), 'legacy', 'An invalid LocalStorage file does not retype Cache reads')
  await assert.rejects(storage.allItems()); await assert.rejects(storage.getItem('saved'))
  await assert.rejects(storage.setItem('new', false)); await assert.rejects(storage.removeItem('saved')); await assert.rejects(storage.clear())
  assert.throws(() => cache.set('saved', 'replacement')); assert.throws(() => cache.remove('saved')); assert.throws(() => cache.clear())
  assert.equal(readFileSync(path, 'utf8'), raw)
  assert.equal(readFileSync(outside, 'utf8'), '{"outside":"untouched"}')
  assert.deepEqual(stat.isSymbolicLink() ? readlinkSync(snapshot) : stat.isFile() ? readFileSync(snapshot) : undefined, before)
  assert.equal(lstatSync(snapshot).isDirectory(), stat.isDirectory())
  assert.equal(readdirSync(root).filter(name => name.endsWith('.tmp')).length, 0)
})

for (const failure of ['snapshot rename', 'snapshot fsync', 'Cache rename'] as const) test(`${failure} failure reports its real outcome and retains recoverable legacy data`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-write-failure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, raw = '{ "saved": "legacy" }\n'
  writeFileSync(path, raw)
  const storage = createUserRaycastStorage(path), cache = storage.cache(), events: unknown[] = []
  cache.subscribe((...event) => events.push(event))
  const rename = fs.renameSync, fsync = fs.fsyncSync
  const injectedRename = t.mock.method(fs, 'renameSync', ((source: fs.PathLike, destination: fs.PathLike) => {
    if (String(destination) === (failure === 'snapshot rename' ? snapshot : failure === 'Cache rename' ? path : '')) throw new Error('Injected publication failure')
    return rename(source, destination)
  }) as typeof fs.renameSync)
  const injectedFsync = t.mock.method(fs, 'fsyncSync', ((fd: number) => {
    if (failure === 'snapshot fsync') throw new Error('Injected publication failure')
    return fsync(fd)
  }) as typeof fs.fsyncSync)
  syncBuiltinESMExports()
  try {
    assert.throws(() => cache.set('saved', 'replacement'), /Injected publication failure/)
    assert.equal(readFileSync(path, 'utf8'), raw)
    assert.deepEqual(events, [])
    assert.deepEqual(await createUserRaycastStorage(path).allItems(), { saved: 'legacy' })
    assert.equal(readdirSync(root).includes('state.json.local-storage.v1.json'), failure === 'Cache rename')
    assert.equal(readdirSync(root).filter(name => name.endsWith('.tmp')).length, 0, 'Gracefully failed writes clean their own unpublished files')
  } finally { injectedRename.mock.restore(); injectedFsync.mock.restore(); syncBuiltinESMExports() }
  cache.set('saved', 'retry value')
  assert.equal(cache.get('saved'), 'retry value')
  assert.equal(await storage.getItem('saved'), 'legacy')
})

test('failed updates, removals and clear retain an already published typed LocalStorage file', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-local-failure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`
  writeFileSync(path, '{"saved":"legacy"}')
  const storage = createUserRaycastStorage(path), cache = storage.cache()
  await storage.setItem('saved', false); cache.set('saved', 'Cache only')
  const before = readFileSync(snapshot), raw = readFileSync(path), rename = fs.renameSync
  const injected = t.mock.method(fs, 'renameSync', ((source: fs.PathLike, destination: fs.PathLike) => {
    if (String(destination) === snapshot) throw new Error('Injected LocalStorage publication failure')
    return rename(source, destination)
  }) as typeof fs.renameSync)
  syncBuiltinESMExports()
  try {
    await assert.rejects(storage.setItem('saved', 0)); await assert.rejects(storage.removeItem('saved')); await assert.rejects(storage.clear())
    assert.deepEqual(readFileSync(snapshot), before); assert.deepEqual(readFileSync(path), raw)
    assert.equal(await createUserRaycastStorage(path).getItem('saved'), false)
    assert.equal(cache.get('saved'), 'Cache only')
    assert.equal(readdirSync(root).filter(name => name.endsWith('.tmp')).length, 0)
  } finally { injected.mock.restore(); syncBuiltinESMExports() }
  await storage.setItem('saved', 0); assert.equal(await createUserRaycastStorage(path).getItem('saved'), 0)
})

for (const limit of ['entries', 'bytes'] as const) test(`oversized ${limit} updates retain the exact already published LocalStorage file`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-existing-quota-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`
  writeFileSync(path, '{"cache":"string"}')
  const values = limit === 'entries' ? Object.fromEntries(Array.from({ length: 256 }, (_, index) => [String(index), false])) : { saved: 'x'.repeat(65000) }
  writeFileSync(snapshot, JSON.stringify({ version: 1, values }))
  const before = readFileSync(snapshot), raw = readFileSync(path), storage = createUserRaycastStorage(path)
  await assert.rejects(storage.setItem('new', 'x'.repeat(4096)), /limit/)
  assert.deepEqual(readFileSync(snapshot), before); assert.deepEqual(readFileSync(path), raw)
  assert.deepEqual(await storage.allItems(), values)
})

for (const changedFile of ['snapshot', 'Cache'] as const) test(`a late ${changedFile} link is not followed or replaced during publication`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-late-link-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, outside = join(root, 'outside.json'), raw = '{"saved":"legacy"}'
  writeFileSync(path, raw); writeFileSync(outside, '{"outside":"untouched"}')
  const original = fs.fsyncSync; let writes = 0
  const injected = t.mock.method(fs, 'fsyncSync', (fd: number) => {
    original(fd)
    if (++writes === (changedFile === 'snapshot' ? 1 : 2)) {
      if (changedFile === 'Cache') renameSync(path, join(root, 'original.json'))
      symlinkSync(outside, changedFile === 'snapshot' ? snapshot : path)
    }
  })
  syncBuiltinESMExports()
  try {
    const storage = createUserRaycastStorage(path)
    assert.throws(() => storage.cache().set('saved', 'new value'), /changed/)
    assert.equal(readFileSync(outside, 'utf8'), '{"outside":"untouched"}')
    assert.equal(readFileSync(changedFile === 'snapshot' ? path : join(root, 'original.json'), 'utf8'), raw)
    assert.equal(readlinkSync(changedFile === 'snapshot' ? snapshot : path), outside)
    if (changedFile === 'Cache') assert.deepEqual(await storage.allItems(), { saved: 'legacy' })
    assert.equal(readdirSync(root).filter(name => name.endsWith('.tmp')).length, 0)
  } finally { injected.mock.restore(); syncBuiltinESMExports() }
})

test('a safety snapshot that cannot be checked never changes raw Cache or reports success', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-check-failure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, raw = '{"saved":"legacy"}'
  writeFileSync(path, raw)
  const open = fs.openSync, storage = createUserRaycastStorage(path), events: unknown[] = []
  storage.subscribe((...event) => events.push(event))
  const injected = t.mock.method(fs, 'openSync', ((file: fs.PathLike, ...args: unknown[]) => {
    if (String(file) === snapshot) throw Object.assign(new Error('Check unavailable'), { code: 'EACCES' })
    return (open as (...args: unknown[]) => number)(file, ...args)
  }) as typeof fs.openSync)
  syncBuiltinESMExports()
  try {
    assert.throws(() => storage.cache().set('saved', 'replacement'), /invalid/)
    assert.equal(readFileSync(path, 'utf8'), raw); assert.deepEqual(events, [])
  } finally { injected.mock.restore(); syncBuiltinESMExports() }
  assert.deepEqual(await createUserRaycastStorage(path).allItems(), { saved: 'legacy' })
  assert.ok(lstatSync(snapshot).isFile(), 'The harmless safety copy may remain after a failed check')
})

for (const phase of ['snapshot', 'Cache'] as const) test(`a real child interrupted before ${phase} publication recovers the exact legacy namespace`, async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-interrupted-')), path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, raw = '{ "saved": "false", "number": "0" }\n'
  writeFileSync(path, raw)
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    import { createUserRaycastStorage } from ${JSON.stringify(pathToFileURL(resolve('src/user-raycast-storage.ts')).href)};
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => { if (String(target) === ${JSON.stringify(phase === 'snapshot' ? snapshot : path)}) { process.stdout.write('publication checkpoint\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); } return rename(source, target); };
    syncBuiltinESMExports(); createUserRaycastStorage(${JSON.stringify(path)}).cache().clear();
  `], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const pid = child.pid!; assert.ok(pid)
  const exit = once(child, 'exit')
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing publication checkpoint')), 3000)
      let output = ''
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('publication checkpoint')) { clearTimeout(timer); done() } })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Child exited before checkpoint')) })
    })
    process.kill(-pid, 'SIGKILL'); await exit
    assert.equal(readFileSync(path, 'utf8'), raw)
    assert.equal(readdirSync(root).includes('state.json.local-storage.v1.json'), phase === 'Cache')
    const cold = createUserRaycastStorage(path)
    assert.deepEqual(await cold.allItems(), { saved: 'false', number: '0' })
    assert.ok(readdirSync(root).some(name => name.endsWith('.tmp')), 'A hard kill can leave an unpublished private temporary file; reads never treat it as state')
    cold.cache().clear()
    assert.equal(cold.cache().isEmpty, true)
    assert.deepEqual(await cold.allItems(), { saved: 'false', number: '0' })
  } finally {
    try { process.kill(-pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    await exit
    assert.throws(() => process.kill(-pid, 0), /ESRCH/)
    t.diagnostic(`Stopped owned process group: ${pid}`)
    rmSync(root, { recursive: true, force: true })
  }
})

test('invalid Cache clear options do not create a safety snapshot or clear legacy data', t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-bad-clear-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), raw = '{"saved":"legacy"}'
  writeFileSync(path, raw)
  const cache = createUserRaycastStorage(path).cache()
  for (const options of [null, false, 1, 'clear', [], {}, { notifySubscribers: 'false' }]) assert.throws(() => cache.clear(options as never), /Invalid/)
  assert.equal(readFileSync(path, 'utf8'), raw)
  assert.deepEqual(readdirSync(root), ['state.json'])
})

test('a dangling legacy file is invalid rather than an empty LocalStorage namespace', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-dangling-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), target = join(root, 'missing.json')
  symlinkSync(target, path)
  const storage = createUserRaycastStorage(path)
  await assert.rejects(storage.allItems()); await assert.rejects(storage.setItem('saved', false)); await assert.rejects(storage.clear())
  assert.throws(() => storage.cache().get('saved')); assert.throws(() => storage.cache().set('saved', 'value'))
  assert.equal(readlinkSync(path), target)
  assert.deepEqual(readdirSync(root), ['state.json'])
})

test('unreadable LocalStorage is never replaced by legacy fallback or a new write', async t => {
  const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-unreadable-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.json'), snapshot = `${path}.local-storage.v1.json`, raw = '{"saved":"legacy"}', data = '{"version":1,"values":{"typed":false}}'
  writeFileSync(path, raw); writeFileSync(snapshot, data)
  const original = fs.openSync, injected = t.mock.method(fs, 'openSync', ((file: fs.PathLike, ...args: unknown[]) => {
    if (String(file) === snapshot) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    return (original as (...args: unknown[]) => number)(file, ...args)
  }) as typeof fs.openSync)
  syncBuiltinESMExports()
  try {
    const storage = createUserRaycastStorage(path)
    await assert.rejects(storage.allItems()); await assert.rejects(storage.setItem('saved', 0))
    assert.throws(() => storage.cache().clear())
    assert.equal(readFileSync(path, 'utf8'), raw)
  } finally { injected.mock.restore(); syncBuiltinESMExports() }
  assert.equal(readFileSync(snapshot, 'utf8'), data)
  assert.equal(readdirSync(root).filter(name => name.endsWith('.tmp')).length, 0)
})

for (const selected of ['legacy', 'LocalStorage'] as const) for (const change of ['link', 'growth'] as const) {
  test(`${selected} storage rejects ${change} between selection and opening without changing saved bytes`, async t => {
    const root = mkdtempSync(join(tmpdir(), 'user-raycast-storage-race-'))
    const rawPath = join(root, 'state.json'), path = selected === 'legacy' ? rawPath : `${rawPath}.local-storage.v1.json`
    const target = join(root, 'outside.json')
    const saved = JSON.stringify(selected === 'legacy' ? { key: 'saved' } : { version: 1, values: { key: 'saved' } })
    writeFileSync(rawPath, JSON.stringify({ key: 'saved' })); if (selected === 'LocalStorage') writeFileSync(path, saved)
    writeFileSync(target, JSON.stringify({ key: 'outside data' }))
    const storage = createUserRaycastStorage(rawPath)
    const original = fs.lstatSync
    let changed = false
    const selectedFile = t.mock.method(fs, 'lstatSync', ((selectedPath: fs.PathLike, options?: fs.StatOptions) => {
      const stat = original(selectedPath, options)
      if (String(selectedPath) === path && !changed) {
        changed = true
        if (change === 'link') {
          renameSync(path, join(root, 'original.json'))
          symlinkSync(target, path)
        } else writeFileSync(path, JSON.stringify({ key: 'x'.repeat(70_000) }))
      }
      return stat
    }) as typeof fs.lstatSync)
    syncBuiltinESMExports()
    try {
      if (selected === 'legacy') assert.throws(() => storage.get('key'))
      else await assert.rejects(storage.allItems())
      assert.equal(changed, true, 'the state changed after the selected metadata was returned')
      assert.equal(readFileSync(target, 'utf8'), JSON.stringify({ key: 'outside data' }))
      if (change === 'link') assert.equal(readFileSync(join(root, 'original.json'), 'utf8'), saved)
      else assert.equal(readFileSync(path, 'utf8'), JSON.stringify({ key: 'x'.repeat(70_000) }))
    } finally {
      selectedFile.mock.restore()
      syncBuiltinESMExports()
      rmSync(root, { recursive: true, force: true })
    }
  })
}
