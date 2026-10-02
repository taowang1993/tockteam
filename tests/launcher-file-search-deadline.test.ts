import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLauncherFileSearchExtensions } from '../src/launcher-file-search.ts'

test('a timed-out Simple File Search root stops the scan even if the wall clock moves backward', async t => {
  const now = Date.now
  let clockOffset = 0
  t.mock.method(Date, 'now', () => now() - clockOffset)
  const scanned: string[] = []
  const failures: string[] = []
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => {}, revealPath: () => {} },
    enabledExtensionIds: () => ['SimpleFileSearch'],
    getSetting: <T>(key: string, fallback: T): T => key === 'extension[SimpleFileSearch].folders' ? [
      { id: 'first', path: '/home/max/first', recursive: true, searchFor: 'files' },
      { id: 'second', path: '/home/max/second', recursive: true, searchFor: 'files' },
    ] as T : fallback,
    homePath: '/home/max',
    onProviderError: (_id, error) => { failures.push(error.message) },
    platform: 'Linux',
    scanTimeoutMs: 5,
    scanners: {
      queryFileSearch: async () => [],
      scanSimpleFolder: async ({ folder, signal }) => {
        scanned.push(folder.id)
        if (folder.id !== 'first') return []
        return await new Promise<readonly never[]>(resolve => {
          signal.addEventListener('abort', () => { clockOffset = 50; resolve([]) }, { once: true })
        })
      },
      validatePath: async () => true,
    },
  })
  try {
    assert.deepEqual(await provider.loadIndexedItems(new AbortController().signal), [])
    assert.deepEqual(scanned, ['first'], 'the expired scan budget cannot be reused by another root')
    assert.equal(failures.length, 1)
    assert.match(failures[0]!, /timed out/u)
  } finally { await provider.close() }
})
