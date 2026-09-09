import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'

const MAX_WORKSPACE_COMPONENTS = 31
const MAX_WORKSPACE_BYTES = 1_024
const MAX_WORKSPACE_COMPONENT_BYTES = 255
const WORKSPACE_COMPONENT_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/
const WINDOWS_DEVICE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
])

export type TrustedRaycastCanIUseWorkspaceSelection =
  | Readonly<{ mode: 'default'; path: '' }>
  | Readonly<{ mode: 'workspace'; path: string }>

export type TrustedRaycastCanIUseDefaultWorkspacePreparation = Readonly<{
  mode: 'default'
  path: ''
  probes: 0
}>

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function invalidSelection(): never {
  return failTrustedRaycastCanIUse('CONFIG_INVALID')
}

function isWindowsDeviceComponent(value: string): boolean {
  const basename = value.slice(0, value.indexOf('.') < 0 ? value.length : value.indexOf('.')).toUpperCase()
  return WINDOWS_DEVICE_NAMES.has(basename)
}

/** Validate the managed virtual selection; this function performs no I/O. */
export function validateTrustedRaycastCanIUseWorkspaceSelection(value: unknown): TrustedRaycastCanIUseWorkspaceSelection {
  if (typeof value !== 'string') return invalidSelection()
  if (value === '') return Object.freeze({ mode: 'default', path: '' })
  if (value === '.') return Object.freeze({ mode: 'workspace', path: '.' })
  if (!/^[\x00-\x7f]*$/.test(value)
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.includes('\\')
    || value.includes(':')
    || value.includes('%')
    || byteLength(value) > MAX_WORKSPACE_BYTES) {
    return invalidSelection()
  }

  const components = value.split('/')
  if (components.length === 0 || components.length > MAX_WORKSPACE_COMPONENTS) return invalidSelection()
  for (const component of components) {
    if (byteLength(component) === 0 || byteLength(component) > MAX_WORKSPACE_COMPONENT_BYTES
      || component === '.'
      || component === '..'
      || component.endsWith('.')
      || !WORKSPACE_COMPONENT_PATTERN.test(component)
      || isWindowsDeviceComponent(component)) {
      return invalidSelection()
    }
  }
  return Object.freeze({ mode: 'workspace', path: value })
}

/**
 * No reviewed descriptor-anchored Host primitive exists yet.  This seam is
 * always unavailable: it never interprets the selection or accepts a reader.
 */
export function useTrustedRaycastCanIUseAnchoredWorkspaceCapability(
  _selection: TrustedRaycastCanIUseWorkspaceSelection & { mode: 'workspace' },
): never {
  return failTrustedRaycastCanIUse('WORKSPACE_UNAVAILABLE')
}

/**
 * Prepare only the filesystem-free default mode.  Workspace mode stays
 * unavailable until a separately reviewed anchored capability exists.
 */
export function prepareTrustedRaycastCanIUseWorkspace(value: unknown): TrustedRaycastCanIUseDefaultWorkspacePreparation {
  const selection = validateTrustedRaycastCanIUseWorkspaceSelection(value)
  if (selection.mode === 'workspace') useTrustedRaycastCanIUseAnchoredWorkspaceCapability(selection)
  return Object.freeze({ mode: 'default', path: '', probes: 0 })
}
