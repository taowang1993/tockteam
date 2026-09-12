import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { buildSync } from 'esbuild'

// Execute the real preload with only Electron's boundary replaced.
const bundled = buildSync({
  entryPoints: [new URL('../src/preload.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false,
}).outputFiles[0]!.text
const module = { exports: {} as { parseDesktopCommand?: (value: unknown) => { paths?: string[]; type: string } } }
const require = createRequire(import.meta.url)
runInNewContext(bundled, {
  module, exports: module.exports, window: { location: { protocol: 'file:' } },
  require: (name: string) => name === 'electron'
    ? { contextBridge: { exposeInMainWorld() {} }, ipcRenderer: { on() {} } }
    : require(name),
})
const parse = module.exports.parseDesktopCommand!

test('desktop open-paths admits ordinary POSIX and Windows paths without sharing the input array', () => {
  const paths = ['/Users/person/Documents/notes0.md', 'C:\\Users\\person\\notes0.md']
  const parsed = parse({ type: 'open-paths', paths })
  assert.equal(parsed.type, 'open-paths')
  assert.equal(JSON.stringify(parsed.paths), JSON.stringify(paths))
  assert.notEqual(parsed.paths, paths)
})

test('desktop open-paths rejects control characters, oversized values, and extra fields', () => {
  for (const path of ['bad\0path', 'bad\rpath', 'bad\npath', '', 'x'.repeat(4_097), 3]) {
    assert.throws(() => parse({ type: 'open-paths', paths: [path] }), /Invalid desktop paths command/u)
  }
  assert.throws(() => parse({ type: 'open-paths', paths: Array(129).fill('/ok') }))
  assert.throws(() => parse({ type: 'open-paths', paths: ['/ok'], extra: true }))
  assert.equal(parse({ type: 'show-settings', section: 'tocklauncher' }).type, 'show-settings')
  assert.throws(() => parse({ type: 'show-settings', section: 'unknown' }))
})
