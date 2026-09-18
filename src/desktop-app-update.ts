export const DESKTOP_APP_UPDATE_CHANNELS = Object.freeze({
  getState: 'desktop:app-update:get-state',
  check: 'desktop:app-update:check',
  download: 'desktop:app-update:download',
  install: 'desktop:app-update:install',
  state: 'desktop:app-update:state',
})

export type DesktopAppUpdateChannel = 'stable' | 'early-access'

export type DesktopAppUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type DesktopAppUpdateErrorContext = 'check' | 'download' | 'install' | 'channel' | null

export type DesktopAppUpdateState = Readonly<{
  channel: DesktopAppUpdateChannel
  enabled: boolean
  status: DesktopAppUpdateStatus
  currentVersion: string
  availableVersion: string | null
  downloadedVersion: string | null
  downloadPercent: number | null
  message: string | null
  errorContext: DesktopAppUpdateErrorContext
  checkedAt: string | null
  canRetry: boolean
}>

export type DesktopAppUpdateActionResult = Readonly<{
  accepted: boolean
  completed: boolean
  state: DesktopAppUpdateState
}>

const STATE_KEYS = [
  'channel',
  'enabled',
  'status',
  'currentVersion',
  'availableVersion',
  'downloadedVersion',
  'downloadPercent',
  'message',
  'errorContext',
  'checkedAt',
  'canRetry',
] as const

const CHANNELS = new Set<DesktopAppUpdateChannel>(['stable', 'early-access'])
const STATUSES = new Set<DesktopAppUpdateStatus>([
  'disabled',
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'error',
])
const ERROR_CONTEXTS = new Set<Exclude<DesktopAppUpdateErrorContext, null>>([
  'check',
  'download',
  'install',
  'channel',
])
const MAX_TEXT = 2_048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedNullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new Error(`Invalid ${field}`)
  return value
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

export function parseDesktopAppUpdateChannel(value: unknown): DesktopAppUpdateChannel {
  if (typeof value !== 'string' || !CHANNELS.has(value as DesktopAppUpdateChannel)) {
    throw new Error('Invalid desktop app update channel')
  }
  return value as DesktopAppUpdateChannel
}

export function parseDesktopAppUpdateState(value: unknown): DesktopAppUpdateState {
  if (!isRecord(value) || !exactKeys(value, STATE_KEYS)) throw new Error('Invalid desktop app update state')
  const channel = parseDesktopAppUpdateChannel(value.channel)
  if (typeof value.enabled !== 'boolean') throw new Error('Invalid desktop app update enabled state')
  if (typeof value.status !== 'string' || !STATUSES.has(value.status as DesktopAppUpdateStatus)) {
    throw new Error('Invalid desktop app update status')
  }
  if (typeof value.currentVersion !== 'string' || value.currentVersion.length > MAX_TEXT) {
    throw new Error('Invalid desktop app update current version')
  }
  const availableVersion = boundedNullableString(value.availableVersion, 'desktop app update available version')
  const downloadedVersion = boundedNullableString(value.downloadedVersion, 'desktop app update downloaded version')
  if (value.downloadPercent !== null
    && (typeof value.downloadPercent !== 'number'
      || !Number.isFinite(value.downloadPercent)
      || value.downloadPercent < 0
      || value.downloadPercent > 100)) {
    throw new Error('Invalid desktop app update download percent')
  }
  const message = boundedNullableString(value.message, 'desktop app update message')
  if (value.errorContext !== null
    && (typeof value.errorContext !== 'string'
      || !ERROR_CONTEXTS.has(value.errorContext as Exclude<DesktopAppUpdateErrorContext, null>))) {
    throw new Error('Invalid desktop app update error context')
  }
  const checkedAt = boundedNullableString(value.checkedAt, 'desktop app update checked timestamp')
  if (typeof value.canRetry !== 'boolean') throw new Error('Invalid desktop app update retry state')
  return Object.freeze({
    channel,
    enabled: value.enabled,
    status: value.status as DesktopAppUpdateStatus,
    currentVersion: value.currentVersion,
    availableVersion,
    downloadedVersion,
    downloadPercent: value.downloadPercent as number | null,
    message,
    errorContext: value.errorContext as DesktopAppUpdateErrorContext,
    checkedAt,
    canRetry: value.canRetry,
  })
}

export function parseDesktopAppUpdateActionResult(value: unknown): DesktopAppUpdateActionResult {
  if (!isRecord(value)
    || !exactKeys(value, ['accepted', 'completed', 'state'])
    || typeof value.accepted !== 'boolean'
    || typeof value.completed !== 'boolean') {
    throw new Error('Invalid desktop app update action result')
  }
  return Object.freeze({
    accepted: value.accepted,
    completed: value.completed,
    state: parseDesktopAppUpdateState(value.state),
  })
}

export function canChangeDesktopAppUpdateChannel(state: DesktopAppUpdateState): boolean {
  return state.downloadedVersion === null
    && state.status !== 'checking'
    && state.status !== 'downloading'
    && state.status !== 'downloaded'
}

export function createDisabledDesktopAppUpdateState(
  currentVersion: string,
  message: string,
  channel: DesktopAppUpdateChannel = 'stable',
): DesktopAppUpdateState {
  return Object.freeze({
    channel,
    enabled: false,
    status: 'disabled',
    currentVersion: currentVersion.slice(0, MAX_TEXT),
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    message: message.slice(0, MAX_TEXT),
    errorContext: null,
    checkedAt: null,
    canRetry: false,
  })
}
