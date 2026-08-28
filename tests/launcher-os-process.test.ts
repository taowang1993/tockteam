import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseWindowsControlPanelItems,
  resolveAppearanceInvocation,
  resolveSystemCommandInvocation,
  resolveWindowsControlPanelInvocation,
} from '../src/launcher-os-process.ts'

test('OS process adapters expose only fixed executable and argv records', () => {
  assert.deepEqual(resolveSystemCommandInvocation('macOS', 'shutdown'), { executable: 'osascript', args: ['-e', 'tell app "System Events" to shut down'] })
  assert.deepEqual(resolveSystemCommandInvocation('Windows', 'lock'), { executable: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] })
  assert.equal(resolveSystemCommandInvocation('Linux', 'empty-trash'), undefined)
  assert.deepEqual(resolveAppearanceInvocation('macOS', true), { executable: 'osascript', args: ['-e', 'tell app "System Events" to tell appearance preferences to set dark mode to false'] })
  assert.equal(resolveAppearanceInvocation('Windows', false).executable, 'powershell.exe')
  assert.throws(() => resolveAppearanceInvocation('Linux', false), /not supported/i)
})

test('Control Panel records reject command injection and parse bounded scalar/array output', () => {
  assert.deepEqual(resolveWindowsControlPanelInvocation('Microsoft.System'), { executable: 'control.exe', args: ['/name', 'Microsoft.System'] })
  for (const hostile of ['Microsoft.System;calc', 'Microsoft.System\r\ncalc', 'x'.repeat(257), '']) assert.throws(() => resolveWindowsControlPanelInvocation(hostile), /invalid/i)
  assert.deepEqual(parseWindowsControlPanelItems(JSON.stringify({ CanonicalName: 'Microsoft.System', Name: 'System' })), [{ canonicalName: 'Microsoft.System', name: 'System' }])
  assert.deepEqual(parseWindowsControlPanelItems(JSON.stringify([
    { CanonicalName: 'Microsoft.System', Name: 'System' },
    { CanonicalName: 'Microsoft.System', Name: 'duplicate' },
    { CanonicalName: 'Microsoft.System;calc', Name: 'bad' },
    { CanonicalName: 'Microsoft.NetworkAndSharingCenter', Name: 'Network' },
  ])), [
    { canonicalName: 'Microsoft.System', name: 'System' },
    { canonicalName: 'Microsoft.NetworkAndSharingCenter', name: 'Network' },
  ])
})
