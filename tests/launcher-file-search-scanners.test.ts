import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createLauncherFileSearchScanners,
  macFileSearchInvocation,
  scanSimpleFileSearchFolder,
  windowsFileSearchInvocation,
} from '../src/launcher-file-search-scanners.ts'

const signal = () => new AbortController().signal

test('file-search adapters preserve hostile terms as direct argv data', () => {
  const term = 'report" & | > < ^ ; ` spaces'
  assert.deepEqual(macFileSearchInvocation(term), { executable: 'mdfind', args: ['-name', term] })
  assert.deepEqual(windowsFileSearchInvocation('C:\\Program Files\\Everything\\es.exe', 'C:\\Users\\max', term, 20), {
    executable: 'C:\\Program Files\\Everything\\es.exe',
    args: ['-max-results', '20', 'path:"C:\\Users\\max\\" "report & | > < ^ ; ` spaces"'],
  })
})

test('file-search query uses fixed bounded process options and filters stale/outside/symlink rows', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tockteam-file-search-'))
  const outside = await mkdtemp(join(tmpdir(), 'tockteam-file-search-outside-'))
  try {
    const valid = join(home, 'report.txt')
    await writeFile(valid, 'report', 'utf8')
    await writeFile(join(outside, 'outside.txt'), 'outside', 'utf8')
    await symlink(join(outside, 'outside.txt'), join(home, 'linked.txt'))
    let options: Record<string, unknown> | undefined
    const scanners = createLauncherFileSearchScanners({
      runFile: async (_executable, _args, received) => { options = received; return { stdout: [valid, join(outside, 'outside.txt'), join(home, 'linked.txt'), join(home, 'missing.txt')].join('\n') } },
      validateEverythingCliPath: async () => ({ dev: '1', ino: '1' }),
    })
    const metadata = await stat(valid, { bigint: true })
    assert.deepEqual(await scanners.queryFileSearch({
      everythingCliFilePath: '', homePath: home, maxResults: 20, platform: 'macOS', searchTerm: 'report', signal: signal(),
    }), [{ path: valid, type: 'file', identity: { dev: String(metadata.dev), ino: String(metadata.ino) } }])
    assert.equal(options?.maxBuffer, 2 * 1024 * 1024)
    assert.equal(options?.timeout, 8_000)
    assert.equal(options?.shell, false)
  } finally {
    await rm(home, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true })
  }
})

test('Simple File Search traverses deterministically without following hidden or symlink entries', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tockteam-simple-search-'))
  const outside = await mkdtemp(join(tmpdir(), 'tockteam-simple-search-outside-'))
  try {
    await mkdir(join(home, 'root', 'nested'), { recursive: true })
    await writeFile(join(home, 'root', 'z.txt'), 'z', 'utf8')
    await writeFile(join(home, 'root', 'nested', 'a.txt'), 'a', 'utf8')
    await writeFile(join(home, 'root', '.hidden.txt'), 'hidden', 'utf8')
    await writeFile(join(outside, 'escape.txt'), 'escape', 'utf8')
    await symlink(outside, join(home, 'root', 'escape'))
    const entries = await scanSimpleFileSearchFolder({
      folder: { id: 'root', path: join(home, 'root'), recursive: true, excludeHiddenFiles: true, searchFor: 'filesAndFolders' },
      homePath: home, maxResults: 20, maxVisitedEntries: 100, signal: signal(),
    })
    assert.deepEqual(entries.map(({ path, type }) => ({ path, type })), [
      { path: join(home, 'root', 'nested'), type: 'folder' },
      { path: join(home, 'root', 'z.txt'), type: 'file' },
      { path: join(home, 'root', 'nested', 'a.txt'), type: 'file' },
    ])
    assert.ok(entries.every(entry => entry.identity.dev.length > 0 && entry.identity.ino.length > 0))
  } finally { await rm(home, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }) }
})

test('Simple File Search rejects home and symlink roots and honors cancellation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tockteam-simple-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'tockteam-simple-outside-'))
  try {
    await mkdir(join(home, 'safe'))
    await symlink(outside, join(home, 'linked'))
    await assert.rejects(scanSimpleFileSearchFolder({ folder: { id: 'home', path: home, recursive: true, searchFor: 'files' }, homePath: home, maxResults: 2, maxVisitedEntries: 10, signal: signal() }), /home scope|root/i)
    await assert.rejects(scanSimpleFileSearchFolder({ folder: { id: 'linked', path: join(home, 'linked'), recursive: true, searchFor: 'files' }, homePath: home, maxResults: 2, maxVisitedEntries: 10, signal: signal() }), /home scope|root/i)
    const controller = new AbortController(); controller.abort(new Error('canceled'))
    await assert.rejects(scanSimpleFileSearchFolder({ folder: { id: 'safe', path: join(home, 'safe'), recursive: true, searchFor: 'files' }, homePath: home, maxResults: 2, maxVisitedEntries: 10, signal: controller.signal }), /canceled/u)
  } finally { await rm(home, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }) }
})

test('Windows File Search uses the allowlisted executable and fixed bounded argv', async () => {
  let invocation: { executable: string; args: readonly string[]; options: unknown } | undefined
  const scanners = createLauncherFileSearchScanners({
    validateEverythingCliPath: async () => ({ dev: '1', ino: '1' }),
    runFile: async (executable, args, options) => { invocation = { executable, args, options }; return { stdout: '' } },
  })
  await scanners.queryFileSearch({
    everythingCliFilePath: 'C:\\Program Files\\Everything\\es.exe', homePath: 'C:\\Users\\max', maxResults: 20,
    platform: 'Windows', searchTerm: 'report & | > < ^ " spaces', signal: signal(),
  })
  assert.equal(invocation?.executable, 'C:\\Program Files\\Everything\\es.exe')
  assert.deepEqual(invocation?.args, ['-max-results', '20', 'path:"C:\\Users\\max\\" "report & | > < ^  spaces"'])
  assert.deepEqual(invocation?.options, { maxBuffer: 2 * 1024 * 1024, shell: false, signal: invocation?.options && (invocation.options as { signal: AbortSignal }).signal, timeout: 8_000, windowsHide: true })
})

test('Everything executable identity is revalidated immediately before spawn', async () => {
  let validations = 0
  let spawned = 0
  const scanners = createLauncherFileSearchScanners({
    validateEverythingCliPath: async () => {
      validations += 1
      return validations === 1 ? { dev: '7', ino: '8' } : undefined
    },
    runFile: async () => { spawned += 1; return { stdout: '' } },
  })
  await assert.rejects(scanners.queryFileSearch({
    everythingCliFilePath: 'C:\\Program Files\\Everything\\es.exe', homePath: 'C:\\Users\\max', maxResults: 20,
    platform: 'Windows', searchTerm: 'report', signal: signal(),
  }), /changed before spawn|unavailable/u)
  assert.equal(validations, 2)
  assert.equal(spawned, 0)
})

test('Simple File Search applies result, visit, type, and recursive bounds during enumeration', async () => {
  const home = await mkdtemp(join(tmpdir(), 'tockteam-simple-bounds-'))
  try {
    await mkdir(join(home, 'root', 'folder-a'), { recursive: true })
    await mkdir(join(home, 'root', 'folder-b'), { recursive: true })
    await writeFile(join(home, 'root', 'a.txt'), 'a', 'utf8')
    await writeFile(join(home, 'root', 'b.txt'), 'b', 'utf8')
    await writeFile(join(home, 'root', 'folder-a', 'child.txt'), 'child', 'utf8')
    const entries = await scanSimpleFileSearchFolder({
      folder: { id: 'root', path: join(home, 'root'), recursive: true, searchFor: 'folders' },
      homePath: home, maxResults: 1, maxVisitedEntries: 1, signal: signal(),
    })
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.type, 'folder')
    const files = await scanSimpleFileSearchFolder({
      folder: { id: 'root', path: join(home, 'root'), recursive: false, searchFor: 'files' },
      homePath: home, maxResults: 200, maxVisitedEntries: 10_000, signal: signal(),
    })
    assert.deepEqual(files.map(entry => entry.path), [join(home, 'root', 'a.txt'), join(home, 'root', 'b.txt')])
  } finally { await rm(home, { force: true, recursive: true }) }
})

test('File Search rejects unsupported Linux and malformed query terms before invoking a child', async () => {
  let calls = 0
  const scanners = createLauncherFileSearchScanners({ runFile: async () => { calls++; return { stdout: '' } } })
  await assert.rejects(scanners.queryFileSearch({ everythingCliFilePath: '', homePath: '/home/max', maxResults: 20, platform: 'Linux', searchTerm: 'report', signal: signal() }), /unsupported/i)
  await assert.deepEqual(await scanners.queryFileSearch({ everythingCliFilePath: '', homePath: '/home/max', maxResults: 20, platform: 'macOS', searchTerm: 'bad\nterm', signal: signal() }), [])
  assert.equal(calls, 0)
})
