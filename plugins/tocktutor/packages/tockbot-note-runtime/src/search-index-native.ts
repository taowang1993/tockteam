import { randomUUID } from 'node:crypto'
import { lstat, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Document as FlexDocument, StorageInterface } from 'flexsearch'
import type { NativeOperationProgress } from './search-index-progress.ts'
import type { VaultSearchCandidateRequest, VaultSearchCandidateResult } from 'tockbot-note-vault/inspection'

export const SEARCH_INDEX_SCHEMA = 'tocktutor-search-v2'
const SEARCH_INDEX_TOKEN = /[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)*/gu

export type IndexedSearchDocument = { modifiedAt: number; path: string; revision: string }
type SearchDatabase = import('sqlite3').Database & { searchError?: Error; progress?: NativeOperationProgress }
type SearchStorage = StorageInterface & { db: SearchDatabase }
export type SearchDependencies = {
  Document: typeof import('flexsearch').Document
  Sqlite: typeof import('flexsearch/db/sqlite').default
  sqlite3: { Database: typeof import('sqlite3').Database }
}
export type SearchIndexOptions = {
  directory: string
  identity: string
  list(signal: AbortSignal): Promise<IndexedSearchDocument[] | null>
  read(path: string, signal: AbortSignal): Promise<(IndexedSearchDocument & { content: string }) | null>
  vaultId: string
  schema?: string
  progress?: NativeOperationProgress
  changed?(ready: boolean): void
  failed?(error: unknown): void
}

function isInside(root: string, target: string): boolean {
  const base = process.platform === 'win32' ? path.toNamespacedPath(path.resolve(root)) : root
  const candidate = process.platform === 'win32' ? path.toNamespacedPath(path.resolve(target)) : target
  const relative = path.relative(base, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function assertInside(root: string, target: string): void {
  if (!isInside(root, target)) throw new Error('Search index storage is unsafe')
}

function encodeSearchIndex(value: string): string[] {
  const tokens = value.normalize('NFKC').toLowerCase().match(SEARCH_INDEX_TOKEN) ?? []
  return tokens.flatMap((token) => {
    if (!token.includes('/')) return [token]
    const parts = token.split('/')
    return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
  })
}

function native<T>(owner: { progress?: NativeOperationProgress | undefined }, work: () => Promise<T>): Promise<T> {
  return owner.progress ? owner.progress.run(work) : work()
}

async function openSearchDatabase(Database: SearchDependencies['sqlite3']['Database'], filename: string, progress?: NativeOperationProgress): Promise<SearchDatabase> {
  // Failed native opens never drain queued SQL/close callbacks. Do not queue
  // anything until the constructor callback confirms that the handle is open.
  const database = await native({ progress }, () => new Promise<SearchDatabase>((resolve, reject) => {
    const opened = (error: Error | null): void => error ? reject(error) : resolve(raw)
    const raw = new Database(filename, progress ? progress.wrap(opened) : opened)
  }))
  if (progress) database.progress = progress
  const capture = (error: Error | null) => { if (error) database.searchError ??= error }
  const exec = database.exec
  const run = database.run
  // FlexSearch issues callback-less SQL. Its native error events can throw
  // before sqlite3 drains the queue, permanently stranding commit and close.
  database.exec = function (sql, callback) { return exec.call(this, sql, callback ?? capture) }
  database.run = function (sql: string, ...parameters: unknown[]) {
    if (typeof parameters.at(-1) !== 'function') parameters.push(capture)
    return Reflect.apply(run, this, [sql, ...parameters])
  }
  if (progress) {
    for (const name of ['run', 'exec', 'get', 'all', 'wait', 'close'] as const) {
      const original = database[name]
      Object.defineProperty(database, name, { configurable: true, writable: true, value: function (this: SearchDatabase, ...args: unknown[]) {
        if (typeof args.at(-1) !== 'function') args.push(capture)
        args[args.length - 1] = progress.wrap(args.at(-1) as (...values: unknown[]) => unknown)
        return Reflect.apply(original, this, args)
      } })
    }
  }
  return database
}

async function drainSearchDatabase(database: SearchDatabase): Promise<void> {
  await native(database, () => new Promise<void>((resolve, reject) => database.wait(error => error ? reject(error) : resolve())))
  if (database.searchError !== undefined) throw database.searchError
}

function runSearchDatabase(
  database: SearchDatabase,
  sql: string,
  parameters: unknown[] = [],
): Promise<void> {
  return native(database, () => new Promise((resolve, reject) => {
    database.run(sql, parameters, error => error ? reject(error) : resolve())
  }))
}

function allSearchDatabase<Row>(
  database: SearchDatabase,
  sql: string,
  parameters: unknown[] = [],
): Promise<Row[]> {
  return native(database, () => new Promise((resolve, reject) => {
    database.all(sql, parameters, (error, rows: Row[]) => error ? reject(error) : resolve(rows))
  }))
}

const requireSearchDependency = createRequire(import.meta.url)
let searchDependencies: SearchDependencies | null | undefined

function loadSearchDependencies(): SearchDependencies | null {
  if (searchDependencies !== undefined) return searchDependencies
  try {
    const flexsearch = requireSearchDependency('flexsearch') as typeof import('flexsearch')
    const Sqlite = requireSearchDependency('flexsearch/db/sqlite') as SearchDependencies['Sqlite']
    const sqlite3 = requireSearchDependency('sqlite3') as SearchDependencies['sqlite3']
    searchDependencies = { Document: flexsearch.Document, Sqlite, sqlite3 }
  } catch {
    searchDependencies = null
  }
  return searchDependencies
}

async function closeSearchDatabase(database: SearchStorage): Promise<void> {
  const progress = database.db.progress
  try {
    const raw = database.db
    ;(database as StorageInterface & { db: SearchDatabase | null }).db = null
    database.close()
    await native(raw, () => new Promise<void>((resolve, reject) => {
      raw.close((error: Error | null) => error ? reject(error) : resolve())
    }))
  } catch (error) {
    // An isolated owner must stop rather than unlink/reopen after uncertain native closure.
    if (progress) throw error
  }
}

/** Kept reachable by the child until process death; never repaired, replaced or unlinked. */
export async function acquireSearchIndexLease(filename: string, progress: NativeOperationProgress): Promise<unknown> {
  return progress.run(async () => {
    try {
      const entry = await lstat(filename)
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Unsafe index lease')
      if (await realpath(filename) !== filename) throw new Error('Unsafe index lease alias')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const dependencies = loadSearchDependencies()
    if (!dependencies) throw new Error('Native index dependencies unavailable')
    const lease = await openSearchDatabase(dependencies.sqlite3.Database, filename, progress)
    // A failed lease is not retried. The child exits and the OS releases its connection.
    await runSearchDatabase(lease, 'PRAGMA busy_timeout=0')
    const rows = await allSearchDatabase<{ journal_mode: string }>(lease, 'PRAGMA journal_mode')
    if (rows[0]?.journal_mode !== 'delete') throw new Error('Unexpected index lease journal mode')
    await runSearchDatabase(lease, 'BEGIN EXCLUSIVE')
    return lease
  })
}

function createSearchIndex(Document: SearchDependencies['Document']): FlexDocument {
  return new Document({
    document: { id: 'id', index: [{ field: 'content', tokenize: 'strict' }] },
    encode: encodeSearchIndex,
    commit: false,
  })
}

export class PersistentSearchIndex {
  private controller = new AbortController()
  private database: SearchStorage | null = null
  private readonly options: SearchIndexOptions
  private index: FlexDocument | null = null
  private ready = false
  private reconcileTask: Promise<void> | null = null
  private fullReconcilePending = true
  private readonly pendingPaths = new Set<string>()
  private pendingPathBytes = 0
  private epoch = ''

  constructor(options: SearchIndexOptions) {
    this.options = options
    this.reconcile()
  }

  private publish(ready: boolean): void {
    this.ready = ready
    this.options.changed?.(ready)
  }

  invalidate(changedPath?: string): void {
    this.ready = false
    if (changedPath === undefined) {
      this.fullReconcilePending = true
      this.pendingPaths.clear()
      this.pendingPathBytes = 0
    } else if (!this.fullReconcilePending && !this.pendingPaths.has(changedPath)) {
      this.pendingPaths.add(changedPath)
      if (this.options.progress) {
        this.pendingPathBytes += Buffer.byteLength(JSON.stringify(changedPath)) + 1
        if (this.pendingPaths.size > 4096 || this.pendingPathBytes > 1024 * 1024) {
          this.fullReconcilePending = true
          this.pendingPaths.clear()
          this.pendingPathBytes = 0
        }
      }
    }
    this.reconcile()
  }

  async search(
    request: VaultSearchCandidateRequest,
    signal: AbortSignal,
  ): Promise<VaultSearchCandidateResult | null> {
    signal.throwIfAborted()
    if (!this.ready || this.index === null || this.database === null) return null
    const index = this.index
    const groupIds: Set<number>[] = []
    for (const group of request.groups) {
      let ids: Set<number> | null = null
      for (const anchor of group) {
        signal.throwIfAborted()
        const result = await native(this.options, () => index.searchAsync(anchor.value, {
          index: 'content',
          limit: request.limit + 1,
          merge: true,
        })) as Array<{ id: number }>
        if (result.length > request.limit) return null
        const found = new Set(result.map(item => item.id))
        if (ids === null) ids = found
        else for (const id of ids) if (!found.has(id)) ids.delete(id)
      }
      groupIds.push(ids ?? new Set())
    }
    const ids = [...new Set(groupIds.flatMap(group => [...group]))]
    if (ids.length > request.limit) return null
    const paths: Array<{ modifiedMs: number; path: string; revision: string }> = []
    for (let offset = 0; offset < ids.length; offset += 500) {
      const chunk = ids.slice(offset, offset + 500)
      const dateClauses = [
        request.modifiedFrom === undefined ? null : 'modifiedAt >= ?',
        request.modifiedTo === undefined ? null : 'modifiedAt <= ?',
      ].filter((clause): clause is string => clause !== null)
      const rows = await allSearchDatabase<{ id: number; modifiedAt: number; path: string; revision: string }>(
        this.database.db,
        `SELECT id, modifiedAt, path, revision FROM documents WHERE id IN (${chunk.map(() => '?').join(',')})${dateClauses.length === 0 ? '' : ` AND ${dateClauses.join(' AND ')}`}`,
        [...chunk, ...[request.modifiedFrom, request.modifiedTo].filter((value): value is number => value !== undefined)],
      )
      paths.push(...rows
        .filter(row => !request.directory || row.path.startsWith(`${request.directory}/`))
        .map(row => ({ modifiedMs: row.modifiedAt, path: row.path, revision: row.revision })))
    }
    signal.throwIfAborted()
    if (!this.ready || index !== this.index) return null
    return { complete: true, epoch: this.epoch, entries: paths }
  }

  async close(): Promise<void> {
    this.ready = false
    this.controller.abort()
    await this.reconcileTask?.catch(() => undefined)
    const database = this.database
    this.database = null
    this.index = null
    if (database !== null) await closeSearchDatabase(database)
  }

  private reconcile(): void {
    if (this.reconcileTask !== null || this.controller.signal.aborted) return
    let failed = false
    this.reconcileTask = this.reconcileNow()
      .catch(async (error: unknown) => {
        this.options.failed?.(error)
        failed = true
        this.ready = false
        this.fullReconcilePending = true
        const database = this.database
        this.database = null
        this.index = null
        if (database !== null) await closeSearchDatabase(database)
      })
      .finally(() => {
        this.reconcileTask = null
        // A native failure stays on the exact scanner until a new invalidation;
        // never retry a poisoned partial batch or spin on an unavailable DB.
        if (!failed && (this.fullReconcilePending || this.pendingPaths.size > 0)) this.reconcile()
      })
  }

  private async reconcileNow(): Promise<void> {
    const signal = this.controller.signal
    signal.throwIfAborted()
    if (!this.fullReconcilePending && this.database !== null && this.index !== null) {
      const paths = [...this.pendingPaths]
      this.pendingPaths.clear()
      this.pendingPathBytes = 0
      await this.reconcilePaths(paths, signal)
      if (!this.fullReconcilePending && this.pendingPaths.size === 0) this.publish(true)
      return
    }
    this.fullReconcilePending = false
    this.pendingPaths.clear()
    this.pendingPathBytes = 0
    const documents = await this.options.list(signal)
    signal.throwIfAborted()
    if (documents === null) return
    const dependencies = await native(this.options, async () => loadSearchDependencies())
    if (dependencies === null) return
    const databasePath = path.join(
      this.options.directory,
      `${this.options.vaultId.replace(/^vault:/u, '')}-${this.options.identity}.sqlite`,
    )
    try {
      const entry = await lstat(databasePath)
      if (!entry.isFile() || entry.isSymbolicLink()) return
      assertInside(this.options.directory, await realpath(databasePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
    }
    let mounted = await this.open(databasePath, dependencies, signal)
    if (mounted === null) {
      signal.throwIfAborted()
      await rm(databasePath, { force: true })
      signal.throwIfAborted()
      mounted = await this.create(databasePath, dependencies, signal)
    }
    try {
      await runSearchDatabase(mounted.database.db, 'DELETE FROM metadata WHERE key = ?', ['schema'])
      const existing = await allSearchDatabase<{ id: number; modifiedAt: number; path: string; revision: string }>(
        mounted.database.db,
        'SELECT id, modifiedAt, path, revision FROM documents',
      )
      const current = new Map(documents.map(document => [document.path, document]))
      for (const row of existing) {
        signal.throwIfAborted()
        if (current.has(row.path)) continue
        await native(this.options, async () => { mounted.index.remove(row.id) })
        await runSearchDatabase(mounted.database.db, 'DELETE FROM documents WHERE id = ?', [row.id])
      }
      const byPath = new Map(existing.map(row => [row.path, row]))
      const revisionUpdates: Array<{ id: number; modifiedAt: number; revision: string }> = []
      for (const document of documents) {
        signal.throwIfAborted()
        const prior = byPath.get(document.path)
        if (prior?.revision === document.revision && prior.modifiedAt === document.modifiedAt) continue
        let id = prior?.id
        if (id === undefined) {
          await runSearchDatabase(
            mounted.database.db,
            'INSERT INTO documents(path, modifiedAt, revision) VALUES (?, ?, ?)',
            [document.path, document.modifiedAt, ''],
          )
          id = (await allSearchDatabase<{ id: number }>(
            mounted.database.db,
            'SELECT id FROM documents WHERE path = ?',
            [document.path],
          ))[0]?.id
        }
        if (id === undefined) throw new Error('search index mapping failed')
        const opened = await this.options.read(document.path, signal)
        signal.throwIfAborted()
        if (opened === null || opened.revision !== document.revision) {
          this.fullReconcilePending = true
          return
        }
        await native(this.options, async () => { mounted.index.update(id, { id, content: opened.content }) })
        revisionUpdates.push({ id, modifiedAt: document.modifiedAt, revision: document.revision })
      }
      signal.throwIfAborted()
      await native(this.options, async () => {
        await mounted.index.commit()
        await drainSearchDatabase(mounted.database.db)
      })
      signal.throwIfAborted()
      for (const update of revisionUpdates) {
        await runSearchDatabase(
          mounted.database.db,
          'UPDATE documents SET modifiedAt = ?, revision = ? WHERE id = ?',
          [update.modifiedAt, update.revision, update.id],
        )
      }
      this.epoch = randomUUID()
      await runSearchDatabase(
        mounted.database.db,
        'INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)',
        ['epoch', this.epoch],
      )
      signal.throwIfAborted()
      await runSearchDatabase(mounted.database.db, 'INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)', ['schema', this.options.schema ?? SEARCH_INDEX_SCHEMA])
      if (this.fullReconcilePending) return
      const previous = this.database
      this.database = mounted.database
      this.index = mounted.index
      this.publish(this.pendingPaths.size === 0)
      if (previous !== null && previous !== mounted.database) await closeSearchDatabase(previous)
    } finally {
      // The mounting connection is owned even before it becomes searchable.
      if (this.database !== mounted.database) await closeSearchDatabase(mounted.database)
    }
  }

  private async reconcilePaths(paths: string[], signal: AbortSignal): Promise<void> {
    const database = this.database
    const index = this.index
    if (database === null || index === null) return
    await runSearchDatabase(database.db, 'DELETE FROM metadata WHERE key = ?', ['schema'])
    const revisionUpdates: Array<{ id: number; modifiedAt: number; revision: string }> = []
    for (const changedPath of paths) {
      signal.throwIfAborted()
      const prior = (await allSearchDatabase<{ id: number; modifiedAt: number; revision: string }>(
        database.db,
        'SELECT id, modifiedAt, revision FROM documents WHERE path = ?',
        [changedPath],
      ))[0]
      const opened = await this.options.read(changedPath, signal)
      signal.throwIfAborted()
      if (opened === null) {
        if (prior !== undefined) {
          await native(this.options, async () => { index.remove(prior.id) })
          await runSearchDatabase(database.db, 'DELETE FROM documents WHERE id = ?', [prior.id])
        }
        continue
      }
      if (prior?.revision === opened.revision && prior.modifiedAt === opened.modifiedAt) continue
      let id = prior?.id
      if (id === undefined) {
        await runSearchDatabase(
          database.db,
          'INSERT INTO documents(path, modifiedAt, revision) VALUES (?, ?, ?)',
          [changedPath, opened.modifiedAt, '']
        )
        id = (await allSearchDatabase<{ id: number }>(
          database.db,
          'SELECT id FROM documents WHERE path = ?',
          [changedPath],
        ))[0]?.id
      }
      if (id === undefined) throw new Error('search index mapping failed')
      await native(this.options, async () => { index.update(id, { id, content: opened.content }) })
      revisionUpdates.push({ id, modifiedAt: opened.modifiedAt, revision: opened.revision })
    }
    signal.throwIfAborted()
    await native(this.options, async () => {
      await index.commit()
      await drainSearchDatabase(database.db)
    })
    signal.throwIfAborted()
    for (const update of revisionUpdates) {
      await runSearchDatabase(
        database.db,
        'UPDATE documents SET modifiedAt = ?, revision = ? WHERE id = ?',
        [update.modifiedAt, update.revision, update.id],
      )
    }
    this.epoch = randomUUID()
    await runSearchDatabase(
      database.db,
      'INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)',
      ['epoch', this.epoch],
    )
    await runSearchDatabase(database.db, 'INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)', ['schema', this.options.schema ?? SEARCH_INDEX_SCHEMA])
  }

  private async open(
    databasePath: string,
    { Document, Sqlite, sqlite3 }: SearchDependencies,
    signal: AbortSignal,
  ): Promise<{ database: SearchStorage; index: FlexDocument } | null> {
    const raw = await openSearchDatabase(sqlite3.Database, databasePath, this.options.progress)
    let database: SearchStorage | null = null
    try {
      const metadata = await allSearchDatabase<{ value: string }>(
        raw,
        'SELECT value FROM metadata WHERE key = ?',
        ['schema'],
      )
      if (metadata[0]?.value !== (this.options.schema ?? SEARCH_INDEX_SCHEMA)) throw new Error('schema mismatch')
      database = new Sqlite(this.storageName(), { db: raw, type: 'integer' }) as SearchStorage
      const index = createSearchIndex(Document)
      signal.throwIfAborted()
      // FlexSearch native work is not cancellable. Drain it before closing
      // the connection; racing abort would let it issue SQL after close.
      await native(this.options, async () => { await index.mount(database!); await drainSearchDatabase(raw) })
      signal.throwIfAborted()
      return { database, index }
    } catch {
      if (database !== null) await closeSearchDatabase(database)
      else await native(raw, () => new Promise<void>((resolve, reject) => raw.close(error => error && this.options.progress ? reject(error) : resolve())))
      signal.throwIfAborted()
      return null
    }
  }

  private async create(
    databasePath: string,
    { Document, Sqlite, sqlite3 }: SearchDependencies,
    signal: AbortSignal,
  ): Promise<{ database: SearchStorage; index: FlexDocument }> {
    const raw = await openSearchDatabase(sqlite3.Database, databasePath, this.options.progress)
    let database: SearchStorage | null = null
    try {
      await runSearchDatabase(raw, 'CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      await runSearchDatabase(raw, 'CREATE TABLE documents(id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE, modifiedAt REAL NOT NULL, revision TEXT NOT NULL)')
      await runSearchDatabase(raw, 'INSERT INTO metadata(key, value) VALUES (?, ?)', ['schema', this.options.schema ?? SEARCH_INDEX_SCHEMA])
      database = new Sqlite(this.storageName(), { db: raw, type: 'integer' }) as SearchStorage
      const index = createSearchIndex(Document)
      signal.throwIfAborted()
      await native(this.options, async () => { await index.mount(database!); await drainSearchDatabase(raw) })
      signal.throwIfAborted()
      return { database, index }
    } catch (error) {
      if (database !== null) await closeSearchDatabase(database)
      else await native(raw, () => new Promise<void>((resolve, reject) => raw.close(closeError => closeError && this.options.progress ? reject(closeError) : resolve())))
      throw error
    }
  }

  private storageName(): string {
    return `tocktutor-${this.options.vaultId.slice(-16)}-${this.options.identity.slice(0, 16)}`
  }
}

