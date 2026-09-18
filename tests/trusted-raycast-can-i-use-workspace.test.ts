import assert from 'node:assert/strict'
import test from 'node:test'
import { TrustedRaycastCanIUseError } from '../src/trusted-raycast-can-i-use-errors.ts'
import {
  prepareTrustedRaycastCanIUseWorkspace,
  useTrustedRaycastCanIUseAnchoredWorkspaceCapability,
  validateTrustedRaycastCanIUseWorkspaceSelection,
} from '../src/trusted-raycast-can-i-use-workspace.ts'

function assertCode(code: string, action: () => unknown): void {
  assert.throws(action, error => error instanceof TrustedRaycastCanIUseError && String(error.code) === code)
}

test('accepts only the managed default/root selections and refuses anchored workspace access', () => {
  assert.deepEqual(validateTrustedRaycastCanIUseWorkspaceSelection(''), { mode: 'default', path: '' })
  assert.deepEqual(validateTrustedRaycastCanIUseWorkspaceSelection('.'), { mode: 'workspace', path: '.' })
  assert.deepEqual(validateTrustedRaycastCanIUseWorkspaceSelection('src/config-v1/file.txt'), {
    mode: 'workspace',
    path: 'src/config-v1/file.txt',
  })
  assert.deepEqual(prepareTrustedRaycastCanIUseWorkspace(''), { mode: 'default', path: '', probes: 0 })
  assertCode('WORKSPACE_UNAVAILABLE', () => prepareTrustedRaycastCanIUseWorkspace('.'))
  assertCode('WORKSPACE_UNAVAILABLE', () => useTrustedRaycastCanIUseAnchoredWorkspaceCapability(
    { mode: 'workspace', path: 'src' },
  ))
})

test('rejects absolute, home, traversal, Unicode, device, and malformed path spellings before I/O', () => {
  for (const path of [
    '/absolute',
    'C:/workspace',
    'C:\\workspace',
    '\\\\server\\share',
    '~',
    '~/workspace',
    '../workspace',
    'a/../b',
    './a',
    'a//b',
    '/a',
    'a/',
    'a\\b',
    'a:b',
    'a%2Fb',
    'a b',
    'a\u00e9',
    'CON',
    'con.txt',
    'PRN.md',
    'AUX',
    'NUL',
    'COM1',
    'com9.log',
    'LPT1',
    'a.',
    '.',
    '..',
    '',
  ]) {
    if (path === '.' || path === '') continue
    assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection(path))
  }
  assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection(42))
  assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection('a\u0000b'))
})

test('enforces component, component-count, and total byte bounds without normalization', () => {
  const component = `a${'x'.repeat(254)}`
  assert.equal(component.length, 255)
  assert.equal(validateTrustedRaycastCanIUseWorkspaceSelection(component).path, component)
  assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection(`${component}x`))

  const thirtyOne = Array.from({ length: 31 }, () => 'a').join('/')
  assert.equal(validateTrustedRaycastCanIUseWorkspaceSelection(thirtyOne).path, thirtyOne)
  assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection(`${thirtyOne}/a`))

  const fourComponents = Array.from({ length: 4 }, () => component).join('/')
  assert.equal(fourComponents.length, 1_023)
  assert.equal(validateTrustedRaycastCanIUseWorkspaceSelection(fourComponents).path, fourComponents)
  const fiveComponents = `${fourComponents}/a`
  assertCode('CONFIG_INVALID', () => validateTrustedRaycastCanIUseWorkspaceSelection(fiveComponents))
})
