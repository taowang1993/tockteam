import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VaultSearchCandidateRequest, VaultSearchCandidateResult } from 'tockbot-note-vault/inspection'
import { spawnOwnedProcess, type OwnedProcess, type OwnedProcessOptions } from './owned-process.ts'
import { listenForIndexPeer } from './search-index-auth.ts'
import { NativeProgressClock } from './search-index-progress.ts'
import { awaitSearchIndexSettlement } from './search-index-ownership.ts'
import { IndexProtocol, documentRecord, exact, integer, relativePath, text } from './search-index-protocol.ts'
import type { IndexedSearchDocument } from './search-index-native.ts'

export { ISOLATED_SEARCH_SCHEMA } from './search-index-protocol.ts'
export type SearchIndexProcessOptions = {
  directory: string; identity: string; vaultId: string; maxReadBytes: number
  list(signal: AbortSignal, progress: () => void): Promise<IndexedSearchDocument[] | null>
  read(path: string, signal: AbortSignal, progress: () => void): Promise<(IndexedSearchDocument & { content: string }) | null>
  failed?(error: Error): void
}

/** Owns a single generation. close() is ownership proof, never merely socket EOF. */
export class SearchIndexProcess {
  private readonly options: SearchIndexProcessOptions
  private readonly controller = new AbortController()
  private readonly readiness = Promise.withResolvers<void>()
  readonly whenReady = this.readiness.promise
  private owner?: OwnedProcess
  private spawnFailure?: Error
  private listener?: Awaited<ReturnType<typeof listenForIndexPeer>>
  private protocol?: IndexProtocol
  private readonly clock = new NativeProgressClock()
  private timer?: ReturnType<typeof setInterval>
  private readonly starting: Promise<void>
  private closing?: Promise<void>
  private closed = false
  private initialized = false
  private revision = 0
  private readyRevision = -1
  private hostProgress: { last: number } | undefined
  private searches = 0
  private failure?: Error
  private invalidatePending = false
  private fullInvalidation = false
  private readonly changedPaths = new Set<string>()
  private changedPathBytes = 0

  constructor(options: SearchIndexProcessOptions) {
    this.options = options
    void this.whenReady.catch(() => {})
    this.starting = this.start()
    void this.starting.catch(error => this.fail(error))
  }

  get pid(): number | undefined { return this.owner?.pid }

  private fail(error: unknown): void {
    if (this.closed) return
    this.failure = error instanceof Error ? error : new Error('Index process failed')
    void this.close().catch(() => {}) // close retains its rejected ownership proof for the caller.
    try { this.options.failed?.(this.failure) } catch { /* Diagnostic subscribers cannot prevent cleanup. */ }
  }

  private ready(): void {
    if (!this.closed && this.initialized && this.readyRevision === this.revision) this.readiness.resolve()
  }

  private spawn(options: OwnedProcessOptions): Promise<OwnedProcess> { return spawnOwnedProcess(options) }

  private async start(): Promise<void> {
    const options = this.options
    if (process.versions.electron || !path.isAbsolute(options.directory)
      || !/^[a-zA-Z0-9_-]{1,128}$/u.test(options.identity) || !/^vault:[a-zA-Z0-9_-]{1,128}$/u.test(options.vaultId)
      || !integer(options.maxReadBytes, 1, 2 * 1024 * 1024)) throw new Error('Invalid index child configuration or Node executable')
    const deadline = setTimeout(() => this.fail(new Error('Index spawn/authentication stalled')), 15000)
    try {
      this.listener = await listenForIndexPeer(this.controller.signal)
      const env: Record<string, string | undefined> = { TOCKTEAM_INDEX_BOOTSTRAP: this.listener.bootstrap }
      for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'TZ']) env[key] = process.env[key]
      const extension = path.extname(fileURLToPath(import.meta.url))
      this.controller.signal.throwIfAborted()
      let spawning: Promise<OwnedProcess> | undefined
      let admissionRejected = false
      await awaitSearchIndexSettlement(() => {
        spawning = this.spawn({ executable: process.execPath,
          args: [fileURLToPath(new URL(`./search-index-child${extension}`, import.meta.url))],
          cwd: options.directory, env, signal: this.controller.signal,
          admit: async launch => {
            let launched: Promise<OwnedProcess> | undefined
            let launchAttempted = false
            try {
              await awaitSearchIndexSettlement(() => { launchAttempted = true; launched = launch() }, this.controller.signal)
            } catch (error) {
              // Only rejection before launch is known not to have created an owner.
              admissionRejected = !launchAttempted
              throw error
            }
            return launched!
          },
        }).catch(error => {
          // A rejected launch may include failed cleanup before it could return an owner.
          if (!admissionRejected) this.spawnFailure = error instanceof Error ? error : new Error('Index spawn settlement is unknown')
          throw error
        })
      }, this.controller.signal)
      this.owner = await spawning!
      void this.owner.completion.then(() => this.fail(new Error('Index child exited')), error => this.fail(error))
      const peer = await this.listener.peer
      this.controller.signal.throwIfAborted()
      clearTimeout(deadline)
      this.protocol = new IndexProtocol(peer, async (action, args, signal) => {
        if (action !== 'inventory' && action !== 'document') throw new Error('Invalid child filesystem demand')
        if (!exact(args, action === 'inventory' ? ['revision'] : ['revision', 'path']) || !integer(args.revision)
          || args.revision > this.revision || (action === 'document' && !relativePath(args.path))) throw new Error('Invalid child document demand')
        const operation = { last: performance.now() }
        this.hostProgress = operation
        const progress = (): void => { if (!signal.aborted && this.hostProgress === operation) operation.last = performance.now() }
        try {
          if (action === 'inventory') {
            const documents = await options.list(signal, progress)
            signal.throwIfAborted()
            if (documents === null) return { items: [], meta: null }
            if (documents.length > 2_000_000 || !documents.every(documentRecord)) throw new Error('Invalid index inventory')
            return { items: documents, meta: true }
          }
          const document = await options.read(args.path as string, signal, progress)
          signal.throwIfAborted()
          if (document === null) return { items: [], meta: null }
          const { content, ...metadata } = document
          if (!documentRecord(metadata) || metadata.path !== args.path || typeof content !== 'string') throw new Error('Invalid index document')
          const bytes = Buffer.from(content)
          if (bytes.length > 3 * options.maxReadBytes) throw new Error('Index document exceeds decoded byte limit')
          const chunks: string[] = []
          for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(bytes.subarray(offset, offset + 32768).toString('base64'))
          return { items: chunks, meta: metadata }
        } finally { this.hostProgress = undefined }
      }, (action, value) => {
        if (action === 'step') this.clock.observe(value)
        else if (action === 'ready' && exact(value, ['revision']) && integer(value.revision) && value.revision <= this.revision) {
          this.readyRevision = value.revision; this.ready()
        } else if (action === 'failure' && value === null) this.fail(new Error('Native index failed'))
        else throw new Error('Invalid index child notification')
      }, error => this.fail(error))
      this.timer = setInterval(() => {
        if (this.clock.isStalled() || (this.hostProgress !== undefined && performance.now() - this.hostProgress.last >= 15000)) this.fail(new Error('Index operation stalled'))
      }, 50)
      const response = await this.protocol.request('init', { directory: options.directory, identity: options.identity,
        vaultId: options.vaultId, maxReadBytes: options.maxReadBytes }, 0, 1024)
      if (response.meta !== this.owner.pid) throw new Error('Index child identity mismatch')
      this.initialized = true
      this.ready()
    } finally { clearTimeout(deadline) }
  }

  invalidate(changedPath?: string): void {
    if (this.closed) return
    if (changedPath === undefined || !relativePath(changedPath)) this.fullInvalidation = true
    else if (!this.fullInvalidation && !this.changedPaths.has(changedPath)) {
      this.changedPaths.add(changedPath)
      this.changedPathBytes += Buffer.byteLength(JSON.stringify(changedPath)) + 1
      if (this.changedPaths.size > 256 || this.changedPathBytes > 32768) this.fullInvalidation = true
    }
    if (this.fullInvalidation) { this.changedPaths.clear(); this.changedPathBytes = 0 }
    if (!Number.isSafeInteger(++this.revision)) { this.fail(new Error('Index revision exhausted')); return }
    this.readyRevision = -1
    if (this.invalidatePending) return
    this.invalidatePending = true
    void this.starting.then(async () => {
      while (!this.closed) {
        const revision = this.revision
        const paths = this.fullInvalidation ? null : [...this.changedPaths]
        this.fullInvalidation = false; this.changedPaths.clear(); this.changedPathBytes = 0
        await this.protocol!.notify('invalidate', { revision, paths })
        if (revision === this.revision) { this.invalidatePending = false; return }
      }
    }).catch(error => this.fail(error))
  }

  async search(request: VaultSearchCandidateRequest, signal: AbortSignal): Promise<VaultSearchCandidateResult | null> {
    signal.throwIfAborted()
    if (this.closed || !this.initialized || this.readyRevision !== this.revision || this.searches >= 4) return null
    const revision = this.revision
    this.searches += 1
    const aborted = Promise.withResolvers<null>()
    const abort = (): void => { aborted.resolve(null) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timer = setTimeout(() => this.fail(new Error('Index search deadline exceeded')), 5000)
    const work = this.protocol!.request('search', { revision, request }, request.limit, 64 * 1024 * 1024, signal)
      .then(response => {
        if (this.closed || revision !== this.revision || this.readyRevision !== revision || signal.aborted || response.meta === null) return null
        if (!exact(response.meta, ['epoch', 'revision']) || response.meta.revision !== revision || !text(response.meta.epoch, 128)
          || !response.items.every(item => exact(item, ['path', 'revision', 'modifiedMs']) && relativePath(item.path)
            && text(item.revision, 1024) && typeof item.modifiedMs === 'number' && Number.isFinite(item.modifiedMs))) throw new Error('Invalid index candidates')
        if (new Set(response.items.map(item => (item as { path: string }).path)).size !== response.items.length) throw new Error('Duplicate index candidates')
        return { complete: true as const, epoch: response.meta.epoch, entries: response.items as VaultSearchCandidateResult['entries'] }
      }).catch(error => { this.fail(error); return null }).finally(() => {
        clearTimeout(timer); this.searches -= 1; signal.removeEventListener('abort', abort)
      })
    const result = await Promise.race([work, aborted.promise])
    signal.throwIfAborted()
    return result
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.readyRevision = -1
    this.readiness.reject(this.failure ?? new Error('Index generation retired'))
    clearInterval(this.timer)
    this.controller.abort()
    this.protocol?.close()
    this.closing = (async () => {
      await this.starting.catch(() => {})
      // Never swallow termination failure or authorize database reuse from EOF.
      try {
        if (this.spawnFailure) throw this.spawnFailure
        await this.owner?.terminate()
      } finally { await this.listener?.close() }
    })()
    return this.closing
  }
}
