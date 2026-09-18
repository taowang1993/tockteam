import assert from 'node:assert/strict'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopDispatchChannel } from '../src/desktop-dispatch-channel.ts'
import { DesktopMicrophoneChannel } from '../src/desktop-microphone-channel.ts'
import { DesktopMicrophoneOwner } from '../src/desktop-microphone-owner.ts'
import { DesktopPickerChannel } from '../src/desktop-picker-channel.ts'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPopOutChannel } from '../src/desktop-popout-channel.ts'
import { DesktopPopOutOwner } from '../src/desktop-popout-owner.ts'
import { DesktopPrintExportChannel } from '../src/desktop-print-export-channel.ts'
import { DesktopPrintExportOwner } from '../src/desktop-print-export-owner.ts'

interface Channel {
  readonly environment: unknown
  start(): Promise<unknown>
  stop(): Promise<void>
}

test('native channel stop fences every in-flight start generation', async () => {
  const picker = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot: await realpath(await mkdtemp(join(tmpdir(), 'tockteam-channel-race-'))),
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channels: Channel[] = [
    new DesktopPickerChannel(picker),
    new DesktopDispatchChannel({ identity: () => undefined, isAvailable: () => true }),
    new DesktopMicrophoneChannel(new DesktopMicrophoneOwner({ isAvailable: () => true, isCurrent: () => true, requestAccess: async () => true })),
    new DesktopPopOutChannel(new DesktopPopOutOwner({ isAvailable: () => true, isCurrent: () => true, native: { close() {}, focus: () => false, isOpen: () => false, open: async () => 'window' } })),
    new DesktopPrintExportChannel(new DesktopPrintExportOwner({ isAvailable: () => true, isCurrent: () => true, native: { print: async () => true, renderPdf: async () => new Uint8Array() }, picker: {} as never })),
  ]
  for (const channel of channels) {
    const starting = channel.start()
    await channel.stop()
    await assert.rejects(starting, /start was cancelled/)
    assert.equal(channel.environment, undefined)
    await channel.stop()
  }
})
