import type { IncomingMessage, ServerResponse } from 'node:http'
import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {
  NoteVaultRuntime,
  VaultReference,
  WriteDocumentResult,
} from 'tockbot-note-runtime'
import {
  defaultPublicFetchLimits,
  fetchPublicText,
  maximumPublicFetchLimits,
  type PublicFetchLimits,
  type PublicTextResult,
} from './fetch.ts'
import {
  defaultReaderViewLimits,
  maximumReaderViewLimits,
  projectReaderView,
  type ReaderViewLimits,
  type ReaderViewResult,
} from './reader.ts'
import {
  ClipReviewStore,
  type ClipApproval,
  type ClipPreview,
  type ClipPreviewInput,
  type ClipVaultReference,
  type ConsumedClipCreate,
} from './review.ts'
import {
  WEB_CLIP_APPLY_API_PATH,
  WEB_CLIP_CANCEL_API_PATH,
  WEB_CLIP_READER_API_PATH,
  WEB_CLIP_REVIEW_API_PATH,
  WEB_CLIP_VIEWER_API_PATH,
  createClipApplyHandler,
  createClipCancelHandler,
  createClipReviewHandler,
  createReaderHandler,
  createViewerHandler,
  type ViewerPageResult,
} from './server.ts'

export * from './fetch.ts'
export * from './reader.ts'
export * from './review.ts'
export * from './server.ts'
export * from './viewer.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webClip: WebClipHost
  }
}

export interface Config extends PublicFetchLimits, ReaderViewLimits {
  maxConcurrentRequests: number
}

export type ClipRuntimeErrorCode = 'capacity' | 'runtime-result' | 'runtime-unavailable' | 'stale-vault'

export class ClipRuntimeError extends Error {
  readonly code: ClipRuntimeErrorCode

  constructor(code: ClipRuntimeErrorCode, message: string) {
    super(message)
    this.name = 'ClipRuntimeError'
    this.code = code
  }
}

const positiveInteger = (value: number, max: number) => (
  Schema.number().step(1).min(1).max(max).default(value)
)

export const Config: Schema<Config> = Schema.object({
  connectTimeoutMs: positiveInteger(defaultPublicFetchLimits.connectTimeoutMs, maximumPublicFetchLimits.connectTimeoutMs),
  maxAddresses: positiveInteger(defaultPublicFetchLimits.maxAddresses, maximumPublicFetchLimits.maxAddresses),
  maxConcurrentRequests: positiveInteger(8, 64),
  maxRedirects: Schema.number().step(1).min(0).max(maximumPublicFetchLimits.maxRedirects).default(defaultPublicFetchLimits.maxRedirects),
  maxResponseBytes: positiveInteger(defaultPublicFetchLimits.maxResponseBytes, maximumPublicFetchLimits.maxResponseBytes),
  maxResponseHeadersBytes: positiveInteger(defaultPublicFetchLimits.maxResponseHeadersBytes, maximumPublicFetchLimits.maxResponseHeadersBytes),
  maxTextChars: positiveInteger(defaultPublicFetchLimits.maxTextChars, maximumPublicFetchLimits.maxTextChars),
  maxUrlBytes: positiveInteger(defaultPublicFetchLimits.maxUrlBytes, maximumPublicFetchLimits.maxUrlBytes),
  timeoutMs: positiveInteger(defaultPublicFetchLimits.timeoutMs, maximumPublicFetchLimits.timeoutMs),
  maxParserInputChars: positiveInteger(defaultReaderViewLimits.maxParserInputChars, maximumReaderViewLimits.maxParserInputChars),
  maxParserTokens: positiveInteger(defaultReaderViewLimits.maxParserTokens, maximumReaderViewLimits.maxParserTokens),
  maxReaderOutputChars: positiveInteger(defaultReaderViewLimits.maxReaderOutputChars, maximumReaderViewLimits.maxReaderOutputChars),
  maxReaderTitleChars: positiveInteger(defaultReaderViewLimits.maxReaderTitleChars, maximumReaderViewLimits.maxReaderTitleChars),
  maxReaderWarningChars: positiveInteger(defaultReaderViewLimits.maxReaderWarningChars, maximumReaderViewLimits.maxReaderWarningChars),
  maxReaderWarnings: positiveInteger(defaultReaderViewLimits.maxReaderWarnings, maximumReaderViewLimits.maxReaderWarnings),
})

const MAX_VIEWER_HTML_CHARS = 1_000_000

function escapedViewerText(value: string, maxChars: number): string {
  return value.toWellFormed()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .slice(0, maxChars)
}

interface ActiveOperation {
  controller: AbortController
  promise: Promise<unknown>
}

interface WebServer {
  register(route: {
    handler(request: IncomingMessage, response: ServerResponse): void | Promise<void>
    kind: 'exact'
    path: string
  }): () => void
}

export class WebClipHost extends Service {
  static Config = Config
  private readonly active = new Set<ActiveOperation>()
  private activeFetches = 0
  private readonly clipReviews = new ClipReviewStore()
  private closing = false
  private readonly fetchLimits: PublicFetchLimits
  private readonly maxConcurrentRequests: number
  private readonly readerLimits: ReaderViewLimits
  private runtime: NoteVaultRuntime | undefined
  private runtimeEpoch = 0

  constructor(ctx: Context, config: Config) {
    super(ctx, 'webClip')
    this.fetchLimits = {
      connectTimeoutMs: config.connectTimeoutMs,
      maxAddresses: config.maxAddresses,
      maxRedirects: config.maxRedirects,
      maxResponseBytes: config.maxResponseBytes,
      maxResponseHeadersBytes: config.maxResponseHeadersBytes,
      maxTextChars: config.maxTextChars,
      maxUrlBytes: config.maxUrlBytes,
      timeoutMs: config.timeoutMs,
    }
    this.maxConcurrentRequests = config.maxConcurrentRequests
    this.readerLimits = {
      maxParserInputChars: config.maxParserInputChars,
      maxParserTokens: config.maxParserTokens,
      maxReaderOutputChars: config.maxReaderOutputChars,
      maxReaderTitleChars: config.maxReaderTitleChars,
      maxReaderWarningChars: config.maxReaderWarningChars,
      maxReaderWarnings: config.maxReaderWarnings,
    }
    ctx.effect(() => async () => {
      this.closing = true
      this.runtime = undefined
      this.runtimeEpoch += 1
      await this.abortActive()
      this.clipReviews.dispose()
    })
    ctx.inject(['noteVault'], runtimeCtx => {
      const epoch = ++this.runtimeEpoch
      this.runtime = runtimeCtx.get('noteVault') as NoteVaultRuntime
      this.clipReviews.dispose()
      runtimeCtx.effect(() => async () => {
        if (this.runtimeEpoch !== epoch) return
        this.runtime = undefined
        this.runtimeEpoch += 1
        this.clipReviews.dispose()
        await this.abortActive()
      })
    })
    ctx.inject(['webServer', 'tockTeamSurface'], browserCtx => {
      const webServer = browserCtx.get('webServer') as WebServer | undefined
      const surface = browserCtx.get('tockTeamSurface') as { kind?: unknown } | undefined
      if (!webServer || surface?.kind !== 'desktop') return
      browserCtx.effect(() => {
        const removers: Array<() => void> = []
        const removeAll = () => {
          const errors: unknown[] = []
          for (const remove of removers.reverse()) {
            try {
              remove()
            } catch (error) {
              errors.push(error)
            }
          }
          removers.length = 0
          if (errors.length > 0) throw new AggregateError(errors, 'Web Clip routes could not be removed')
        }
        try {
          removers.push(webServer.register({
            handler: createViewerHandler(async (url, signal) => await this.viewerPage(url, { signal })),
            kind: 'exact',
            path: WEB_CLIP_VIEWER_API_PATH,
          }))
          removers.push(webServer.register({
            handler: createReaderHandler(async (url, signal) => await this.readerView(url, { signal })),
            kind: 'exact',
            path: WEB_CLIP_READER_API_PATH,
          }))
          removers.push(webServer.register({
            handler: createClipReviewHandler(async (input, signal) => await this.createClipReviewFromUrl(input, signal)),
            kind: 'exact',
            path: WEB_CLIP_REVIEW_API_PATH,
          }))
          removers.push(webServer.register({
            handler: createClipApplyHandler(async (approval, signal) => await this.applyClipReview(approval, signal)),
            kind: 'exact',
            path: WEB_CLIP_APPLY_API_PATH,
          }))
          removers.push(webServer.register({
            handler: createClipCancelHandler(reviewId => this.cancelClipReview(reviewId)),
            kind: 'exact',
            path: WEB_CLIP_CANCEL_API_PATH,
          }))
        } catch (error) {
          try {
            removeAll()
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Web Clip routes could not be registered')
          }
          throw error
        }
        return removeAll
      })
    })
  }

  private assertOpen(): void {
    if (this.closing) throw new ClipRuntimeError('runtime-unavailable', 'The Web Clip Host is unloading')
  }

  private async abortActive(): Promise<void> {
    const active = [...this.active]
    for (const operation of active) operation.controller.abort()
    await Promise.allSettled(active.map(operation => operation.promise))
    for (const operation of active) this.active.delete(operation)
  }

  private async trackOperation<T>(
    signal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.assertOpen()
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    const promise = run(combined)
    const operation = { controller, promise }
    this.active.add(operation)
    try {
      return await promise
    } finally {
      this.active.delete(operation)
    }
  }

  createClipReview(input: ClipPreviewInput): ClipPreview {
    this.assertOpen()
    return this.clipReviews.create(input)
  }

  consumeClipReview(approval: ClipApproval, currentVault: ClipVaultReference): ConsumedClipCreate {
    this.assertOpen()
    return this.clipReviews.consume(approval, currentVault)
  }

  cancelClipReview(reviewId: string): boolean {
    return !this.closing && this.clipReviews.cancel(reviewId)
  }

  private activeRuntime(): { epoch: number, runtime: NoteVaultRuntime, vault: VaultReference } {
    this.assertOpen()
    const runtime = this.runtime
    const state = runtime?.state
    if (!runtime || !state?.active) {
      throw new ClipRuntimeError('runtime-unavailable', 'The note vault runtime is unavailable')
    }
    return { epoch: this.runtimeEpoch, runtime, vault: { generation: state.generation, id: state.id } }
  }

  async createClipReviewFromUrl(input: {
    destination?: string
    url: string
  }, signal: AbortSignal): Promise<ClipPreview> {
    return await this.trackOperation(signal, async combined => {
      const { epoch, runtime, vault } = this.activeRuntime()
      const reader = await this.readerView(input.url, { signal: combined })
      combined.throwIfAborted()
      const current = runtime.state
      if (this.runtimeEpoch !== epoch
        || !current.active
        || current.id !== vault.id
        || current.generation !== vault.generation) {
        throw new ClipRuntimeError('stale-vault', 'The active vault changed before review')
      }
      return this.createClipReview({
        capturedAt: new Date(),
        content: reader.content,
        ...(input.destination === undefined ? {} : { destination: input.destination }),
        sourceUrl: reader.sourceUrl,
        title: reader.title,
        vault,
      })
    })
  }

  async applyClipReview(approval: ClipApproval, signal: AbortSignal): Promise<WriteDocumentResult> {
    return await this.trackOperation(signal, async combined => await this.applyClipReviewOnce(approval, combined))
  }

  private async applyClipReviewOnce(approval: ClipApproval, signal: AbortSignal): Promise<WriteDocumentResult> {
    const { epoch, runtime, vault } = this.activeRuntime()
    signal.throwIfAborted()
    const consumed = this.consumeClipReview(approval, vault)
    if (this.runtimeEpoch !== epoch) throw new ClipRuntimeError('stale-vault', 'The active vault changed before apply')
    const result = await runtime.createDocument({
      content: consumed.content,
      expectedVault: consumed.expectedVault,
      path: consumed.path,
    }, signal)
    if (result.status !== 'created'
      || result.path !== consumed.path
      || result.digest !== consumed.contentDigest
      || result.generation !== consumed.expectedVault.generation) {
      throw new ClipRuntimeError('runtime-result', 'The note vault runtime returned an invalid create result')
    }
    return result
  }

  protected async loadPublicText(url: string, signal: AbortSignal): Promise<PublicTextResult> {
    return await fetchPublicText(url, { limits: this.fetchLimits, signal })
  }

  async fetchText(url: string, options: { signal?: AbortSignal } = {}): Promise<PublicTextResult> {
    if (this.activeFetches >= this.maxConcurrentRequests) {
      throw new ClipRuntimeError('capacity', 'Too many Web Clip requests are active')
    }
    this.activeFetches += 1
    try {
      return await this.trackOperation(options.signal, async signal => await this.loadPublicText(url, signal))
    } finally {
      this.activeFetches -= 1
    }
  }

  async readerView(url: string, options: { signal?: AbortSignal } = {}): Promise<ReaderViewResult> {
    return projectReaderView(await this.fetchText(url, options), this.readerLimits)
  }

  async viewerPage(url: string, options: { signal?: AbortSignal } = {}): Promise<ViewerPageResult> {
    const fetched = await this.fetchText(url, options)
    const reader = projectReaderView(fetched, this.readerLimits)
    const prefix = `<article><h1>${escapedViewerText(reader.title, this.readerLimits.maxReaderTitleChars * 5)}</h1><pre>`
    const suffix = '</pre></article>'
    return {
      contentType: fetched.contentType,
      html: `${prefix}${escapedViewerText(reader.content, MAX_VIEWER_HTML_CHARS - prefix.length - suffix.length)}${suffix}`,
      title: reader.title,
      url: fetched.url,
    }
  }
}

export default WebClipHost
