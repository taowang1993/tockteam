import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bundledRuntimePaths,
  resolveRuntimeResourcesRoot,
  runtimeSearchPath,
} from '../src/runtime-paths.ts'

test('bundled runtime paths use POSIX layouts on macOS and Linux', () => {
  const mac = bundledRuntimePaths('/Applications/Oh.app/Contents/Resources', 'darwin')
  assert.equal(mac.nodeBinary, '/Applications/Oh.app/Contents/Resources/node-runtime/bin/node')
  assert.equal(mac.pnpmBinary, '/Applications/Oh.app/Contents/Resources/node-runtime/bin/pnpm')
  assert.equal(
    mac.pnpmEntry,
    '/Applications/Oh.app/Contents/Resources/node-runtime/lib/node_modules/pnpm/bin/pnpm.mjs',
  )
  assert.equal(mac.cliEntry, '/Applications/Oh.app/Contents/Resources/dsh-runtime/lib/bin.js')
  assert.equal(runtimeSearchPath(mac, { PATH: '/custom/bin' }, 'darwin'), [
    '/Applications/Oh.app/Contents/Resources/node-runtime/bin',
    '/Applications/Oh.app/Contents/Resources/dsh-runtime/node_modules/.bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/custom/bin',
  ].join(':'))

  const linux = bundledRuntimePaths('/opt/tockteam/resources', 'linux')
  assert.equal(linux.nodeBinary, '/opt/tockteam/resources/node-runtime/bin/node')
  assert.equal(runtimeSearchPath(linux, { PATH: '/usr/local/sbin:/usr/bin' }, 'linux'), [
    '/opt/tockteam/resources/node-runtime/bin',
    '/opt/tockteam/resources/dsh-runtime/node_modules/.bin',
    '/usr/local/sbin:/usr/bin',
  ].join(':'))
})

test('bundled runtime paths use Windows executables and PATH separators', () => {
  const windows = bundledRuntimePaths('C:\\Program Files\\TockTeam\\resources', 'win32')
  assert.equal(windows.nodeBinary, 'C:\\Program Files\\TockTeam\\resources\\node-runtime\\node.exe')
  assert.equal(windows.pnpmBinary, 'C:\\Program Files\\TockTeam\\resources\\node-runtime\\pnpm.cmd')
  assert.equal(
    windows.pnpmEntry,
    'C:\\Program Files\\TockTeam\\resources\\node-runtime\\node_modules\\pnpm\\bin\\pnpm.mjs',
  )
  assert.equal(windows.cliEntry, 'C:\\Program Files\\TockTeam\\resources\\dsh-runtime\\lib\\bin.js')
  assert.equal(runtimeSearchPath(windows, { Path: 'C:\\Windows\\System32;D:\\Git\\cmd' }, 'win32'), [
    'C:\\Program Files\\TockTeam\\resources\\node-runtime',
    'C:\\Program Files\\TockTeam\\resources\\dsh-runtime\\node_modules\\.bin',
    'C:\\Windows\\System32;D:\\Git\\cmd',
  ].join(';'))
})

test('runtime resources root honors explicit distribution overrides', () => {
  assert.equal(
    resolveRuntimeResourcesRoot(
      '/electron/resources',
      '/source/.stage',
      false,
      { TOCKTEAM_RESOURCES_ROOT: '/nix/store/tockteam' },
    ),
    '/nix/store/tockteam',
  )
  assert.equal(
    resolveRuntimeResourcesRoot(
      '/electron/resources',
      '/source/.stage',
      false,
      { TOCKTEAM_WEB_ROOT: '/portable/tockteam' },
    ),
    '/portable/tockteam',
  )
})

test('runtime resources root falls back to Electron package mode', () => {
  assert.equal(
    resolveRuntimeResourcesRoot('/electron/resources', '/source/.stage', true, {}),
    '/electron/resources',
  )
  assert.equal(
    resolveRuntimeResourcesRoot('/electron/resources', '/source/.stage', false, {}),
    '/source/.stage',
  )
})
