import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  LAUNCHER_OS_EXTENSION_IDS,
  LAUNCHER_OS_MODULES,
  MACOS_SYSTEM_SETTINGS,
  SYSTEM_COMMAND_CATALOG,
  UELI_COMMAND_CATALOG,
  WINDOWS_SYSTEM_SETTINGS,
  osExtensionSupported,
  systemCommandId,
} from '../src/launcher-os-catalog.ts'
import {
  resolveAppearanceInvocation,
  resolveSystemCommandInvocation,
  resolveWindowsControlPanelInvocation,
  resolveWindowsControlPanelScanInvocation,
} from '../src/launcher-os-process.ts'

test('OS catalog preserves the ordered finite extension inventory and platform support', () => {
  assert.deepEqual(LAUNCHER_OS_MODULES, [
    ['AppearanceSwitcherModule', 'AppearanceSwitcher'],
    ['SystemCommandsModule', 'SystemCommands'],
    ['SystemSettingsModule', 'SystemSettings'],
    ['UeliCommandModule', 'UeliCommand'],
    ['WindowsControlPanelModule', 'WindowsControlPanel'],
  ])
  assert.deepEqual(LAUNCHER_OS_EXTENSION_IDS, ['AppearanceSwitcher', 'SystemCommands', 'SystemSettings', 'UeliCommand', 'WindowsControlPanel'])
  assert.equal(osExtensionSupported('AppearanceSwitcher', 'Linux'), false)
  assert.equal(osExtensionSupported('SystemCommands', 'Linux'), true)
  assert.equal(osExtensionSupported('WindowsControlPanel', 'Windows'), true)
  assert.equal(osExtensionSupported('WindowsControlPanel', 'macOS'), false)
  assert.equal(osExtensionSupported('Unknown', 'Linux'), false)
})

test('OS catalogs retain exact finite row counts and fixed labels', () => {
  assert.equal(MACOS_SYSTEM_SETTINGS.length, 26)
  assert.equal(WINDOWS_SYSTEM_SETTINGS.length, 133)
  assert.equal(SYSTEM_COMMAND_CATALOG.Linux.length, 1)
  assert.equal(SYSTEM_COMMAND_CATALOG.macOS.length, 6)
  assert.equal(SYSTEM_COMMAND_CATALOG.Windows.length, 7)
  assert.equal(UELI_COMMAND_CATALOG.length, 6)
  assert.equal(WINDOWS_SYSTEM_SETTINGS.find(row => row.name === 'App volume and device preferences')?.target, 'ms-settings:apps-volume')
  assert.equal(UELI_COMMAND_CATALOG[0]?.name, 'Quit TockTeam')
  assert.equal(UELI_COMMAND_CATALOG.at(-1)?.id, 'ueliCommand:toggleHotkey')
  assert.equal(SYSTEM_COMMAND_CATALOG.Windows.at(-1)?.imageKey, 'system-command-windows')
})

test('OS catalogs and fixed effects match the pinned Ueli v9.29.0 tuples', () => {
  const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const commands = (platform: 'Linux' | 'macOS' | 'Windows') => SYSTEM_COMMAND_CATALOG[platform].map(row => ({
    command: row.command,
    details: row.details,
    id: systemCommandId(row.name),
    imageKey: row.imageKey,
    name: row.name,
  }))
  assert.equal(digest(MACOS_SYSTEM_SETTINGS), '14d687d392e5a91a213970c1a9496b839b19a794434409a763c6713b0535ca6c')
  assert.equal(digest(WINDOWS_SYSTEM_SETTINGS), 'a8ae3c10cf361f6292680ef8ced3f460e0e9a74514f684ca393108fd22acd312')
  assert.equal(digest(UELI_COMMAND_CATALOG), '5782d84a713c8e509e6a06c688cf5462cfa19c29ebb9860103446ba5334e617b')
  assert.equal(digest(commands('Linux')), 'a1ae631119da2dc7fc0110d25112dcf25f29cdadbfc4e89f75e2b60a3f870a45')
  assert.equal(digest(commands('macOS')), '0ec30bb19ae273661ce815426270d492a0666770d5b60910edf3eb3ab53d0974')
  assert.equal(digest(commands('Windows')), 'b578d8392f099e660e779b7fd2f9146ddc170011afeaf48c66f76ed19f51274e')
  assert.equal(digest(SYSTEM_COMMAND_CATALOG.macOS.map(row => [row.name, row.command, resolveSystemCommandInvocation('macOS', row.command)])), '133f1f90b083b384ae976e105b9de9619a98e8e03fe434b03398942017400d7d')
  assert.equal(digest(SYSTEM_COMMAND_CATALOG.Windows.map(row => [row.name, row.command, resolveSystemCommandInvocation('Windows', row.command)])), '5405c7fdb1413d3f28f3733588b5dbceb7a532424f6653b56b2c8973f7165398')
  assert.equal(digest(SYSTEM_COMMAND_CATALOG.Linux.map(row => [row.name, row.command, resolveSystemCommandInvocation('Linux', row.command)])), 'bb3a3dde1fe2cfc257ce5d847405c6b856673529d33353c50a4a016c77ab32e8')
  assert.equal(digest([resolveAppearanceInvocation('macOS', true), resolveAppearanceInvocation('macOS', false)]), '448b636555167e2c082e8c8f2bba8ffff6b039a342ce13c3de7eada7ba23900b')
  assert.equal(digest([resolveAppearanceInvocation('Windows', true), resolveAppearanceInvocation('Windows', false)]), '2d06332a07817ba79efb24746ed1e14b54493ce26909ce860db4eb0fa84ece11')
  assert.equal(digest(resolveWindowsControlPanelScanInvocation()), 'b506b03ea91b1633dd2aab28b6dc4c08e8e432514fa81b45b42b85d8fcceea49')
  assert.equal(digest(resolveWindowsControlPanelInvocation('Microsoft.System')), '07fef61590c7301f3d7f3e21d6a2c7abbab370570c847d736a0cbfb4386bcc66')
  assert.equal(digest(['Linux', 'macOS', 'Windows'].map(platform => ['AppearanceSwitcher', 'SystemCommands', 'SystemSettings', 'UeliCommand', 'WindowsControlPanel'].map(id => [platform, id, osExtensionSupported(id, platform)]))), 'abf5b631a6fde9324bfa3f1ae074b3fe71817d36994d27a67caecdd8fe4ddfbf')
})
