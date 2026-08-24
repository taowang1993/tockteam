import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { NativeOperationIdentity } from '../../../../../src/host-contract.ts'
import {
  DesktopPickerOwner,
  type DesktopPickerDialogOptions,
} from '../../../../../src/desktop-picker-owner.ts'

function identity(operationId: string, active = true): NativeOperationIdentity {
  return {
    operationId,
    requestId: `request-${operationId}`,
    sessionId: 'session-1',
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? 'vault-1' : null,
    windowId: 'window-1',
  }
}

const limits = {
  maxDepth: 16,
  maxEntries: 20,
  maxEntryBytes: 1024 * 1024,
  maxRelativePathBytes: 512,
  maxTotalBytes: 2 * 1024 * 1024,
}

test('retained Desktop source owner grants HTML, Journal, and Textbundle directories path-free', async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-directory-purposes-')))
  const vault = join(temporary, 'vault')
  const html = join(temporary, 'html')
  const journal = join(temporary, 'journal')
  const textbundle = join(temporary, 'Course.textbundle')
  await Promise.all([mkdir(vault), mkdir(html), mkdir(journal), mkdir(textbundle)])
  await Promise.all([
    writeFile(join(html, 'index.html'), '<h1>HTML</h1>'),
    writeFile(join(journal, 'Day.html'), '<p class="p2">Journal</p>'),
    writeFile(join(textbundle, 'text.md'), '# Textbundle\n'),
  ])
  const selected = [vault, html, journal, textbundle]
  const options: DesktopPickerDialogOptions[] = []
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    randomId: (() => { let id = 0; return () => `opaque-${String(++id)}` })(),
    showOpenDialog: async option => {
      options.push(option)
      return { canceled: false, filePath: selected.shift()! }
    },
    showSaveDialog: async () => ({ canceled: true }),
  })
  try {
    const activation = identity('activate', false)
    const pickedVault = await owner.pick({ identity: activation, kind: 'vault', purpose: 'activate' }, AbortSignal.timeout(5_000))
    assert.equal(pickedVault.status, 'selected')
    if (pickedVault.status !== 'selected') return
    const consumed = await owner.consumeVaultSelection({ authorization: pickedVault.authorization, identity: activation }, AbortSignal.timeout(5_000))
    assert.equal(consumed.status, 'consumed')
    if (consumed.status !== 'consumed') return
    assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: activation.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, AbortSignal.timeout(5_000))).status, 'bound')

    for (const purpose of ['html', 'apple-journal', 'textbundle'] as const) {
      const operation = identity(purpose)
      const picked = await owner.pick({ identity: operation, kind: 'source', purpose }, AbortSignal.timeout(5_000))
      assert.equal(picked.status, 'selected')
      if (picked.status !== 'selected') continue
      assert.equal(JSON.stringify(picked).includes(temporary), false)
      const begun = await owner.beginSource({ authorization: picked.authorization, identity: operation, limits, purpose }, AbortSignal.timeout(5_000))
      assert.equal(begun.root.kind, 'directory')
      const listed = await owner.listSource({ limit: 20, session: begun.session }, AbortSignal.timeout(5_000))
      assert.equal(listed.entries.some(entry => entry.kind === 'file'), true)
      assert.equal(JSON.stringify(listed).includes(temporary), false)
      await owner.releaseSource({ session: begun.session })
    }
    assert.deepEqual(options.slice(1).map(option => ({ directory: option.directory, file: option.file, purpose: option.purpose })), [
      { directory: true, file: true, purpose: 'html' },
      { directory: true, file: true, purpose: 'apple-journal' },
      { directory: true, file: true, purpose: 'textbundle' },
    ])
  } finally {
    await owner.dispose()
    await rm(temporary, { force: true, recursive: true })
  }
})
