import {
  DEFAULT_INPUT_HISTORY_LIMIT,
  type InputHistoryEntry,
  InputHistory,
} from './input-history.ts'

export const DEFAULT_COMPOSER_HISTORY_SESSION_LIMIT = 32

/** Narrow structural view of one RC.1 event-window entry. */
export interface ComposerHistoryEvent {
  readonly data?: unknown
  readonly seq?: unknown
  readonly type?: unknown
}

export interface ComposerHistoryEventLikeEntry {
  readonly event?: ComposerHistoryEvent
  readonly type?: unknown
}

export interface ComposerHistorySnapshot {
  readonly entries: readonly ComposerHistoryEventLikeEntry[]
  readonly hasMore?: boolean
  readonly revision?: number
}

export type ComposerHistoryEventWindow = ComposerHistorySnapshot

export interface ComposerHistoryEventSource {
  getSnapshot(): ComposerHistoryEventWindow
  subscribe(listener: () => void): () => void
}

export interface ComposerHistorySession {
  getSnapshot(): { readonly hasMore?: boolean; readonly loadingOlder?: boolean }
  loadOlder?(): Promise<void>
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function submittedInputEntry(entry: ComposerHistoryEventLikeEntry): InputHistoryEntry | undefined {
  if (entry.type !== 'event') return undefined
  const event = entry.event
  if (event?.type !== 'user/message' || !Number.isSafeInteger(event.seq)) return undefined
  const data = recordOf(event.data)
  const source = recordOf(data?.source)
  if (source?.kind !== 'user' || !Array.isArray(data?.content)) return undefined
  let value = ''
  for (const block of data.content) {
    const content = recordOf(block)
    if (content?.type === 'text' && typeof content.text === 'string') value += content.text
  }
  return value.trim() === '' ? undefined : { id: String(event.seq), value }
}

/** Extract only durable user-source text messages, in session order. */
export function submittedInputEntries(
  entries: readonly ComposerHistoryEventLikeEntry[] | undefined,
  cachedEntries?: WeakMap<ComposerHistoryEvent, InputHistoryEntry>,
): InputHistoryEntry[] {
  if (entries === undefined) return []
  const result: InputHistoryEntry[] = []
  for (const entry of entries) {
    const event = entry.event
    const cached = event === undefined ? undefined : cachedEntries?.get(event)
    if (cached !== undefined) {
      result.push(cached)
      continue
    }
    const input = submittedInputEntry(entry)
    if (input === undefined) continue
    if (event !== undefined) cachedEntries?.set(event, input)
    result.push(input)
  }
  return result
}

interface CachedSessionEntries {
  readonly entries: readonly ComposerHistoryEventLikeEntry[]
  readonly sequences: readonly string[]
}

function sameSequences(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((sequence, index) => sequence === right[index])
}

/**
 * Maps session ids to bounded input histories. Session event windows are the
 * durable source; older pages are requested through the public SessionFace.
 */
export class ComposerInputHistory {
  private readonly histories = new Map<string, InputHistory>()
  private readonly cachedEntries = new WeakMap<ComposerHistoryEvent, InputHistoryEntry>()
  private readonly sessionEntries = new Map<string, CachedSessionEntries>()
  private readonly loading = new Set<string>()
  private readonly limit: number
  private readonly sessionLimit: number

  constructor(
    limit = DEFAULT_INPUT_HISTORY_LIMIT,
    sessionLimit = DEFAULT_COMPOSER_HISTORY_SESSION_LIMIT,
  ) {
    if (!Number.isInteger(sessionLimit) || sessionLimit < 1) {
      throw new RangeError('composer history session limit must be a positive integer')
    }
    this.limit = limit
    this.sessionLimit = sessionLimit
  }

  forSession(sessionId: string): InputHistory {
    let history = this.histories.get(sessionId)
    if (history === undefined) {
      history = new InputHistory(this.limit)
      this.histories.set(sessionId, history)
      this.evictSessions()
    } else {
      this.touchSession(sessionId)
    }
    return history
  }

  synchronize(sessionId: string, window: ComposerHistoryEventWindow): boolean {
    const history = this.forSession(sessionId)
    const previous = this.sessionEntries.get(sessionId)
    if (previous?.entries === window.entries) return false
    const entries = submittedInputEntries(window.entries, this.cachedEntries)
    const sequences = entries.map((entry) => entry.id)
    if (previous !== undefined && sameSequences(previous.sequences, sequences)) {
      this.sessionEntries.set(sessionId, {
        entries: window.entries,
        sequences,
      })
      return false
    }
    this.sessionEntries.set(sessionId, { entries: window.entries, sequences })
    history.synchronize(entries)
    return true
  }

  resetNavigation(sessionId: string | undefined): void {
    if (sessionId === undefined) return
    const history = this.histories.get(sessionId)
    if (history === undefined) return
    this.touchSession(sessionId)
    history.resetNavigation()
  }

  requestOlder(sessionId: string, session: ComposerHistorySession): boolean {
    let sessionSnapshot: { readonly hasMore?: boolean; readonly loadingOlder?: boolean }
    try {
      sessionSnapshot = session.getSnapshot()
    } catch {
      return false
    }
    const history = this.forSession(sessionId)
    if (
      sessionSnapshot.hasMore !== true ||
      sessionSnapshot.loadingOlder === true ||
      this.loading.has(sessionId) ||
      history.size >= this.limit ||
      session.loadOlder === undefined
    )
      return false
    this.loading.add(sessionId)
    void (async () => {
      try {
        await session.loadOlder?.()
      } catch {
        // Session state owns the recoverable load error presentation.
      } finally {
        this.loading.delete(sessionId)
      }
    })()
    return true
  }

  private touchSession(sessionId: string): void {
    const history = this.histories.get(sessionId)
    if (history !== undefined) {
      this.histories.delete(sessionId)
      this.histories.set(sessionId, history)
    }
    const entries = this.sessionEntries.get(sessionId)
    if (entries !== undefined) {
      this.sessionEntries.delete(sessionId)
      this.sessionEntries.set(sessionId, entries)
    }
  }

  private evictSessions(): void {
    while (this.histories.size > this.sessionLimit) {
      const sessionId = this.histories.keys().next().value
      if (sessionId === undefined) return
      this.histories.delete(sessionId)
      this.sessionEntries.delete(sessionId)
      this.loading.delete(sessionId)
    }
  }
}
