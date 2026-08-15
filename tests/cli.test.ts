import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  desktopLaunchSpec,
  main,
} from '../src/cli.ts'

function output(): { stream: NodeJS.WriteStream; text: () => string } {
  let value = ''
  return {
    stream: {
      isTTY: false,
      write: (chunk: string) => {
        value += chunk
        return true
      },
    } as unknown as NodeJS.WriteStream,
    text: () => value,
  }
}

test('tockteam dispatches desktop, web, and TUI through one surface command', async () => {
  const stdout = output()
  const stderr = output()
  const calls: Array<{ args: readonly string[]; surface: string }> = []

  assert.equal(await main(
    ['desktop', '--inspect'],
    {},
    stdout.stream,
    stderr.stream,
    async args => {
      calls.push({ args, surface: 'desktop' })
      return 0
    },
    async args => {
      calls.push({ args, surface: 'web' })
      return 0
    },
  ), 0)
  assert.equal(await main(
    ['web', '--port', '0'],
    {},
    stdout.stream,
    stderr.stream,
    async () => 0,
    async args => {
      calls.push({ args, surface: 'web' })
      return 0
    },
  ), 0)
  assert.equal(await main(
    ['tui', '--inline'],
    {},
    stdout.stream,
    stderr.stream,
    async () => 0,
    async () => 0,
    async args => {
      calls.push({ args, surface: 'tui' })
      return 0
    },
  ), 0)
  assert.deepEqual(calls, [
    { args: ['--inspect'], surface: 'desktop' },
    { args: ['--port', '0'], surface: 'web' },
    { args: ['--inline'], surface: 'tui' },
  ])
})

test('layered distributions list and reject unavailable surfaces', async () => {
  const stdout = output()
  const stderr = output()
  assert.equal(await main(
    ['--help'],
    { TOCKTEAM_SURFACES: 'web' },
    stdout.stream,
    stderr.stream,
  ), 0)
  assert.match(stdout.text(), /web\s+Start TockTeam Web/)
  assert.doesNotMatch(stdout.text(), /Start TockTeam Desktop/)
  assert.doesNotMatch(stdout.text(), /Start TockTeam TUI/)

  assert.equal(await main(
    ['desktop'],
    { TOCKTEAM_SURFACES: 'web' },
    stdout.stream,
    stderr.stream,
  ), 2)
  assert.match(stderr.text(), /Surface 'desktop' is not included/)
})

test('desktop launch keeps source and installed macOS paths distinct', () => {
  assert.deepEqual(desktopLaunchSpec([], {
    TOCKTEAM_DESKTOP_APP: '/Applications/TockTeam Desktop.app',
  }, 'darwin'), {
    args: ['/Applications/TockTeam Desktop.app'],
    command: '/usr/bin/open',
  })
  assert.deepEqual(desktopLaunchSpec([], {}, 'darwin'), {
    args: ['-a', 'TockTeam Desktop'],
    command: '/usr/bin/open',
  })
})

test('desktop launch resolves paths with target platform semantics', () => {
  assert.deepEqual(desktopLaunchSpec(['--inspect'], {
    TOCKTEAM_DESKTOP_APP: 'C:\\Tools\\TockTeam Desktop.exe',
  }, 'win32'), {
    args: ['--inspect'],
    command: 'C:\\Tools\\TockTeam Desktop.exe',
  })
})

test('packaged Windows launcher resolves the adjacent desktop executable', () => {
  const launcher = readFileSync(new URL('../bin/tockteam.cmd', import.meta.url), 'utf8')
  assert.match(
    launcher,
    /IF EXIST "%ROOT%\\\.\.\\TockTeam Desktop\.exe" SET "TOCKTEAM_DESKTOP_APP=%ROOT%\\\.\.\\TockTeam Desktop\.exe"/,
  )
})
