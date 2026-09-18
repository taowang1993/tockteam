import path from 'node:path'
import { realpath } from 'node:fs/promises'
import type { VaultSearchCandidateRequest } from 'tockbot-note-vault/inspection'
import { connectIndexPeer } from './search-index-auth.ts'
import { IndexProtocol, documentRecord, exact, integer, relativePath, text, ISOLATED_SEARCH_SCHEMA } from './search-index-protocol.ts'
import { NativeOperationProgress, type NativeProgressEvent } from './search-index-progress.ts'
import { PersistentSearchIndex, acquireSearchIndexLease } from './search-index-native.ts'

function searchRequest(value: unknown): value is VaultSearchCandidateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  return Object.keys(request).every(key => ['directory', 'groups', 'limit', 'modifiedFrom', 'modifiedTo'].includes(key))
    && (request.directory === '' || relativePath(request.directory)) && integer(request.limit, 1, 100000)
    && Array.isArray(request.groups) && request.groups.length > 0 && request.groups.length <= 256
    && request.groups.every(group => Array.isArray(group) && group.length > 0 && group.length <= 256
      && group.every(anchor => exact(anchor, ['field', 'value']) && ['property', 'tag'].includes(anchor.field as string) && text(anchor.value, 4096)))
    && ['modifiedFrom', 'modifiedTo'].every(key => request[key] === undefined || (typeof request[key] === 'number' && Number.isFinite(request[key])))
}

async function main(): Promise<void> {
  const bootstrap = process.env.TOCKTEAM_INDEX_BOOTSTRAP
  delete process.env.TOCKTEAM_INDEX_BOOTSTRAP
  if (!bootstrap || process.versions.electron) throw new Error('Invalid index child bootstrap')
  const peer = await connectIndexPeer(bootstrap, new AbortController().signal)
  let index: PersistentSearchIndex | undefined
  let lease: unknown
  let revision = 0
  let ready = false
  let initialized = false
  let protocol: IndexProtocol
  const die = (): never => process.exit(1)
  const progressWrites = new Map<number, Promise<void>>()
  const sendStep = (event: NativeProgressEvent): Promise<void> => {
    if (event.phase === 'progress') {
      const pending = progressWrites.get(event.id)
      if (pending) return pending
      const write = protocol.notify('step', event).finally(() => progressWrites.delete(event.id))
      progressWrites.set(event.id, write)
      return write
    }
    return (async () => { await progressWrites.get(event.id); await protocol.notify('step', event) })()
  }
  const progress = new NativeOperationProgress(sendStep, die)
  protocol = new IndexProtocol(peer, async (action, args, signal) => {
    if (action === 'init') {
      if (initialized || !exact(args, ['directory', 'identity', 'vaultId', 'maxReadBytes'])
        || !text(args.directory) || !path.isAbsolute(args.directory)
        || typeof args.identity !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(args.identity)
        || typeof args.vaultId !== 'string' || !/^vault:[a-zA-Z0-9_-]{1,128}$/u.test(args.vaultId)
        || !integer(args.maxReadBytes, 1, 2 * 1024 * 1024)) throw new Error('Invalid index initialization')
      initialized = true
      const { identity, vaultId, maxReadBytes } = args
      const directory = await progress.run(() => realpath(args.directory as string))
      lease = await acquireSearchIndexLease(path.join(directory, `${vaultId.slice(6)}-${identity}.sqlite.lease`), progress)
      index = new PersistentSearchIndex({ directory, identity, vaultId, schema: ISOLATED_SEARCH_SCHEMA, progress,
        list: async () => {
          const reply = await protocol.request('inventory', { revision }, 2_000_000, 512 * 1024 * 1024)
          if (reply.meta === null && reply.items.length === 0) return null
          if (reply.meta !== true || !reply.items.every(documentRecord)) throw new Error('Invalid index inventory response')
          return reply.items
        },
        read: async requestedPath => {
          const reply = await protocol.request('document', { revision, path: requestedPath }, Math.ceil(3 * maxReadBytes / 32768), 4 * maxReadBytes + 4096)
          if (reply.meta === null && reply.items.length === 0) return null
          if (!documentRecord(reply.meta) || reply.meta.path !== requestedPath) throw new Error('Invalid index document response')
          const chunks: Buffer[] = []
          let bytes = 0
          for (const item of reply.items) {
            if (typeof item !== 'string' || item.length > 43692) throw new Error('Invalid index document chunk')
            const buffer = Buffer.from(item, 'base64')
            bytes += buffer.length
            if (buffer.length > 32768 || buffer.toString('base64') !== item || bytes > 3 * maxReadBytes) throw new Error('Invalid index document encoding')
            chunks.push(buffer)
          }
          return { ...reply.meta, content: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)) }
        },
        changed: value => {
          ready = value
          if (value) void protocol.notify('ready', { revision }).catch(die)
        },
        failed: () => { void protocol.notify('failure', null).finally(die) },
      })
      return { items: [], meta: process.pid }
    }
    if (action !== 'search' || !index || !lease || !exact(args, ['revision', 'request']) || !integer(args.revision)
      || args.revision > revision || !searchRequest(args.request)) throw new Error('Invalid index search')
    const captured = args.revision
    if (!ready || captured !== revision || signal.aborted) return { items: [], meta: null }
    const result = await index.search(args.request, signal).catch(error => {
      if (signal.aborted) return null
      throw error
    })
    if (!result || !ready || captured !== revision) return { items: [], meta: null }
    return { items: result.entries, meta: { epoch: result.epoch, revision } }
  }, (action, value) => {
    if (action !== 'invalidate' || !index || !lease || !exact(value, ['revision', 'paths']) || !integer(value.revision, revision + 1)
      || (value.paths !== null && (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 256
        || !value.paths.every(relativePath) || Buffer.byteLength(JSON.stringify(value.paths)) > 32770))) throw new Error('Invalid index invalidation')
    revision = value.revision
    ready = false
    if (value.paths === null) index.invalidate()
    else for (const changedPath of value.paths as string[]) index.invalidate(changedPath)
  }, die)
}

void main().catch(() => { process.exitCode = 1; process.exit(1) })
