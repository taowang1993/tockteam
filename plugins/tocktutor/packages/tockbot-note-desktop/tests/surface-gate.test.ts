import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as applyClient, inject as clientInject } from '../dist/client-api.js'
import { apply as applyHost, inject as hostInject } from '../dist/index.js'

const desktopServices = [
  'tockTeamSurface',
  'tockTeamDesktopCaller',
  'tockTeamDesktopPicker',
  'tockTeamDesktopPopOut',
  'tockTeamDesktopMicrophone',
  'tockTeamDesktopPrintExport',
  'tockTeamDesktopVaultSelection',
  'tockTeamDesktopReveal',
  'noteVault',
]

test('Host mounts one caller-bound gateway only on the Desktop owner set', () => {
  assert.deepEqual(hostInject, desktopServices)
  const plugins: unknown[] = []
  const reads: string[] = []
  const context = {
    get(name: string) {
      reads.push(name)
      return { kind: 'desktop' }
    },
    effect: assert.fail,
    provide: assert.fail,
    plugin(value: unknown) { plugins.push(value) },
  }
  applyHost(context as never)
  assert.deepEqual(reads, ['tockTeamSurface'])
  assert.equal(plugins.length, 1)
  assert.equal((plugins[0] as { name?: string }).name, 'TockTutorDesktopGateway')
})

test('Host and client reject every non-Desktop surface without heuristics', async () => {
  for (const kind of ['web', 'tui', undefined]) {
    const context = { get: () => kind === undefined ? undefined : { kind } }
    assert.throws(() => applyHost(context as never), /Desktop surface is required/u)
    await assert.rejects(applyClient(context as never), /Desktop surface is required/u)
  }
  assert.deepEqual(clientInject, ['tockTeamSurface', 'remote', 'slots'])
})
