import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import NoteVaultRuntime from 'tockbot-note-runtime'
import { DesktopPickerChannel } from '../src/desktop-picker-channel.ts'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPickerProvider, DesktopVaultSelectionProvider } from '../src/desktop-picker-provider.ts'

async function loadRuntime(): Promise<{ context: Context; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-runtime-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: 'tockbot-note-runtime'",
    '  config:',
    '    stateRoot: null',
    '    vaultRoot: null',
    '',
  ].join('\n'))
  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== 'tockbot-note-runtime') throw new Error(`unexpected import: ${specifier}`)
      return NoteVaultRuntime
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return { context, root }
}

test('Runtime 0.1.2 activates a Desktop selection through consume-bind authority without public paths', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'tockteam-selected-vault-'))
  const source = await mkdtemp(join(tmpdir(), 'tockteam-external-source-'))
  await writeFile(join(vault, 'vault.md'), 'vault')
  await writeFile(join(source, 'source.md'), 'source')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({
      canceled: false,
      filePath: options.purpose === 'activate' ? vault : source,
    }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const picker = new DesktopPickerProvider(environment)
  const loaded = await loadRuntime()
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment)
  try {
    const identity = {
      operationId: 'activate-operation',
      requestId: 'activate-request',
      sessionId: 'activate-session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'activate-window',
    }
    const selected = await picker.pick({ identity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    const activated = await loaded.context.noteVault.activateDesktopSelection({
      authorization: selected.authorization,
      identity,
    }, new AbortController().signal)
    assert.equal(activated.status, 'activated')
    assert.equal(JSON.stringify(activated).includes(vault), false)
    assert.equal(JSON.stringify(activated).includes(selected.authorization), false)

    const sourceIdentity = {
      ...identity,
      operationId: 'source-operation',
      requestId: 'source-request',
      vaultGeneration: activated.vaultGeneration,
      vaultId: activated.vaultId,
    }
    const sourceSelection = await picker.pick({ identity: sourceIdentity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
    assert.equal(sourceSelection.status, 'selected')
    assert.equal(JSON.stringify(sourceSelection).includes(source), false)
  } finally {
    await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})
