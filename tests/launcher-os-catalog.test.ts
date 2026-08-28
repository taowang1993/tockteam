import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LAUNCHER_OS_EXTENSION_IDS,
  LAUNCHER_OS_MODULES,
  MACOS_SYSTEM_SETTINGS,
  SYSTEM_COMMAND_CATALOG,
  UELI_COMMAND_CATALOG,
  WINDOWS_SYSTEM_SETTINGS,
  osExtensionSupported,
} from '../src/launcher-os-catalog.ts'

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
})
