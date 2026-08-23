import { createHash } from 'node:crypto'
import {
  MAX_DESKTOP_DESTINATION_CHUNK_BYTES,
  MAX_PRINT_EXPORT_HTML_BYTES,
  MAX_PRINT_EXPORT_RESOURCE_REFERENCES,
  MAX_PRINT_EXPORT_RESOURCE_URL_BYTES,
  MAX_PRINT_EXPORT_TITLE_BYTES,
  TockTeamDesktopGrantError,
  computeDesktopDestinationPlanDigest,
  type DesktopPrintExportRequest,
  type DesktopPrintExportResult,
  type NativeOperationIdentity,
  type TockTeamDesktopPickerService,
} from './host-contract.ts'

const FORBIDDEN_MARKUP = /<(?:script|iframe|object|embed|link|meta|base|style|form)\b|\son[a-z]+\s*=|\s(?:style|srcset|poster)\s*=/iu
const RESOURCE_PATTERN = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu
const ALLOWED_DATA_IMAGE = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/iu

export interface DesktopPrintExportNative {
  print(html: string, title: string, signal: AbortSignal): Promise<boolean>
  renderPdf(html: string, title: string, signal: AbortSignal): Promise<Uint8Array>
}

export interface DesktopPrintExportOwnerOptions {
  isAvailable(): boolean
  isCurrent(identity: NativeOperationIdentity): boolean
  native: DesktopPrintExportNative
  picker: TockTeamDesktopPickerService
}

function bytes(value: string): number { return Buffer.byteLength(value, 'utf8') }

function validDocument(html: unknown, title: unknown): html is string {
  if (typeof html !== 'string' || html.length === 0 || typeof title !== 'string'
    || bytes(html) > MAX_PRINT_EXPORT_HTML_BYTES || bytes(title) > MAX_PRINT_EXPORT_TITLE_BYTES
    || FORBIDDEN_MARKUP.test(html)) return false
  const resources = [...html.matchAll(RESOURCE_PATTERN)].map(match => match[1] ?? match[2] ?? match[3] ?? '')
  return resources.length <= MAX_PRINT_EXPORT_RESOURCE_REFERENCES
    && resources.every(resource => bytes(resource) <= MAX_PRINT_EXPORT_RESOURCE_URL_BYTES && ALLOWED_DATA_IMAGE.test(resource))
}

function exactRequest(request: DesktopPrintExportRequest): boolean {
  const keys = Object.keys(request)
  if (request.format === 'print') {
    return keys.every(key => ['format', 'html', 'identity', 'title'].includes(key))
      && !Object.hasOwn(request, 'authorization') && !Object.hasOwn(request, 'purpose')
  }
  return keys.every(key => ['authorization', 'format', 'html', 'identity', 'purpose', 'title'].includes(key))
    && request.purpose === (request.format === 'html' ? 'export-html' : 'export-pdf')
}

export class DesktopPrintExportOwner {
  private readonly options: DesktopPrintExportOwnerOptions
  private disposed = false

  constructor(options: DesktopPrintExportOwnerOptions) { this.options = options }

  async render(request: DesktopPrintExportRequest, signal: AbortSignal): Promise<DesktopPrintExportResult> {
    const operationId = typeof request?.identity?.operationId === 'string' ? request.identity.operationId : ''
    if (signal.aborted) return { operationId, status: 'cancelled' }
    if (this.disposed || !this.options.isAvailable()) return { operationId, status: 'unavailable' }
    if (!exactRequest(request) || !validDocument(request.html, request.title)) return { operationId, status: 'denied' }
    if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
    try {
      if (request.format === 'print') {
        const printed = await this.options.native.print(request.html, request.title, signal)
        if (signal.aborted) return { operationId, status: 'cancelled' }
        if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
        return printed ? { operationId, status: 'printed' } : { operationId, status: 'denied' }
      }
      const output = request.format === 'html'
        ? new TextEncoder().encode(request.html)
        : await this.options.native.renderPdf(request.html, request.title, signal)
      if (signal.aborted) return { operationId, status: 'cancelled' }
      if (!this.options.isCurrent(request.identity)) return { operationId, status: 'stale' }
      const digest = createHash('sha256').update(output).digest('hex') as never
      const plan = {
        entries: [{ digest, size: output.byteLength, target: { kind: 'selected-file' as const } }] as const,
        purpose: request.purpose,
        totalBytes: output.byteLength,
      }
      const planDigest = computeDesktopDestinationPlanDigest(plan)
      const locked = await this.options.picker.lockDestinationPlan({
        ...plan,
        identity: request.identity,
        planDigest,
        selectionAuthorization: request.authorization,
      }, signal)
      if (signal.aborted) {
        await this.options.picker.revokeDestinationPlan({ authorization: locked.authorization })
        return { operationId, status: 'cancelled' }
      }
      const begun = await this.options.picker.beginDestination({
        ...plan,
        authorization: locked.authorization,
        identity: request.identity,
        planDigest,
      }, signal)
      let offset = 0
      try {
        while (offset < output.byteLength) {
          const chunk = output.subarray(offset, Math.min(offset + MAX_DESKTOP_DESTINATION_CHUNK_BYTES, output.byteLength))
          const result = await this.options.picker.writeDestinationChunk({
            bytes: chunk,
            offset,
            planDigest,
            session: begun.session,
            target: { kind: 'selected-file' },
          }, signal)
          offset = result.nextOffset
        }
        const result = await this.options.picker.finalizeDestination({
          expectedState: begun.expectedState,
          planDigest,
          session: begun.session,
        }, signal)
        return result.status === 'published'
          ? { label: result.label, operationId, status: 'exported' }
          : { operationId, status: 'unavailable' }
      } catch (cause) {
        await this.options.picker.abortDestination({ session: begun.session }).catch(() => undefined)
        throw cause
      }
    } catch (cause) {
      if (signal.aborted || cause instanceof TockTeamDesktopGrantError && cause.code === 'aborted') {
        return { operationId, status: 'cancelled' }
      }
      if (cause instanceof TockTeamDesktopGrantError
        && (cause.code === 'stale' || cause.code === 'changed')) return { operationId, status: 'stale' }
      return { operationId, status: 'unavailable' }
    }
  }

  dispose(): void { this.disposed = true }
  reopen(): void { this.disposed = false }
}
