import { randomBytes } from 'node:crypto'
import type {
  DesktopPopOutCloseAllRequest,
  DesktopPopOutCloseResult,
  DesktopPopOutOpenRequest,
  DesktopPopOutOpenResult,
  DesktopPopOutWindowRequest,
  NativeOperationIdentity,
} from './host-contract.ts'

const MAX_PATH_LENGTH = 260

export interface DesktopPopOutNativeOperations {
  close(windowId: string): void
  focus(windowId: string): boolean
  isOpen(windowId: string): boolean
  open(relativePath: string, routeToken: string, onClosed: () => void): Promise<string>
}

export interface DesktopPopOutOwnerOptions {
  isAvailable(): boolean
  isCurrent(identity: NativeOperationIdentity): boolean
  native: DesktopPopOutNativeOperations
  randomId?: () => string
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH
    || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)) return false
  return value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

function validIdentity(value: unknown): value is NativeOperationIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return ['operationId', 'requestId', 'sessionId', 'windowId'].every(key => typeof record[key] === 'string' && String(record[key]).length > 0)
    && Number.isSafeInteger(record.vaultGeneration)
    && (record.vaultId === null || typeof record.vaultId === 'string')
}

function sameOwner(left: NativeOperationIdentity, right: NativeOperationIdentity): boolean {
  return left.vaultId === right.vaultId && left.vaultGeneration === right.vaultGeneration
    && left.sessionId === right.sessionId && left.windowId === right.windowId
}

interface WindowRecord {
  identity: NativeOperationIdentity
  relativePath: string
  windowId: string
}

export class DesktopPopOutOwner {
  private readonly options: DesktopPopOutOwnerOptions & { randomId: () => string }
  private readonly byPath = new Map<string, WindowRecord>()
  private readonly byWindow = new Map<string, WindowRecord>()
  private lifetime = new AbortController()
  private disposed = false

  constructor(options: DesktopPopOutOwnerOptions) {
    this.options = {
      ...options,
      randomId: options.randomId ?? (() => randomBytes(24).toString('base64url')),
    }
  }

  async open(request: DesktopPopOutOpenRequest, signal: AbortSignal): Promise<DesktopPopOutOpenResult> {
    const operationId = validIdentity(request?.identity) ? request.identity.operationId : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId, status: 'unavailable' }
    if (typeof request !== 'object' || request === null || Object.keys(request).some(key => key !== 'identity' && key !== 'relativePath')
      || !validIdentity(request.identity) || !safeRelativePath(request.relativePath)) return { operationId, status: 'denied' }
    if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
    const existing = this.byPath.get(request.relativePath)
    if (existing !== undefined && !sameOwner(existing.identity, request.identity)) {
      this.options.native.close(existing.windowId)
      this.remove(existing.windowId)
    } else if (existing !== undefined && this.options.native.isOpen(existing.windowId)) {
      if (!this.options.native.focus(existing.windowId)) return { operationId, status: 'unavailable' }
      return { operationId, status: 'focused', windowId: existing.windowId }
    }
    if (existing !== undefined) this.remove(existing.windowId)
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    try {
      const token = this.options.randomId()
      let windowId = ''
      windowId = await this.options.native.open(request.relativePath, token, () => {
        if (windowId !== '') this.remove(windowId)
      })
      if (combined.aborted) {
        this.options.native.close(windowId)
        return { operationId, status: 'cancelled' }
      }
      if (!this.options.isAvailable() || !this.options.isCurrent(request.identity)) {
        this.options.native.close(windowId)
        return { operationId, status: 'stale' }
      }
      const record = { identity: request.identity, relativePath: request.relativePath, windowId }
      this.byPath.set(request.relativePath, record)
      this.byWindow.set(windowId, record)
      return { operationId, status: 'opened', windowId }
    } catch {
      return combined.aborted ? { operationId, status: 'cancelled' } : { operationId, status: 'unavailable' }
    }
  }

  async close(request: DesktopPopOutWindowRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult> {
    return this.closeRequest(request, signal, false)
  }

  async closeAll(request: DesktopPopOutCloseAllRequest, signal: AbortSignal): Promise<DesktopPopOutCloseResult> {
    return this.closeRequest(request, signal, true)
  }

  rollbackOpen(windowId: string): void {
    this.options.native.close(windowId)
    if (!this.options.native.isOpen(windowId)) this.remove(windowId)
  }

  disposeProvider(): { status: 'closed' | 'unavailable' } {
    let complete = true
    for (const windowId of [...this.byWindow.keys()]) {
      this.options.native.close(windowId)
      if (this.options.native.isOpen(windowId)) complete = false
      else this.remove(windowId)
    }
    return { status: complete ? 'closed' : 'unavailable' }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort()
    this.disposeProvider()
    this.byPath.clear()
    this.byWindow.clear()
  }

  reopen(): void {
    this.disposed = false
    this.lifetime = new AbortController()
  }

  private async closeRequest(
    request: DesktopPopOutWindowRequest | DesktopPopOutCloseAllRequest,
    signal: AbortSignal,
    all: boolean,
  ): Promise<DesktopPopOutCloseResult> {
    const operationId = validIdentity(request?.identity) ? request.identity.operationId : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId, status: 'unavailable' }
    if (!validIdentity(request?.identity) || !this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
    const ids = all
      ? [...this.byWindow.values()].filter(record => sameOwner(record.identity, request.identity)).map(record => record.windowId)
      : ['windowId' in request ? request.windowId : '']
    const record = this.byWindow.get(ids[0] as string)
    if (!all && (ids[0] === '' || record === undefined || !sameOwner(record.identity, request.identity))) return { operationId, status: 'denied' }
    for (const windowId of ids) {
      this.options.native.close(windowId)
      this.remove(windowId)
    }
    return { operationId, status: 'closed' }
  }

  private remove(windowId: string): void {
    const record = this.byWindow.get(windowId)
    if (record === undefined) return
    this.byWindow.delete(windowId)
    if (this.byPath.get(record.relativePath)?.windowId === windowId) this.byPath.delete(record.relativePath)
  }
}
