type IndexOwner = { close(): Promise<void> }
type Ownership = {
  failure: Error | null
  active: Set<IndexOwner>
  pending: Set<Promise<void>>
  retired: WeakMap<IndexOwner, Promise<void>>
}

// Cordis can replace both services and modules without replacing the Host process.
const key = Symbol.for('tockteam.search-index.ownership.v1')
const host = globalThis as typeof globalThis & { [key]?: Ownership }
const ownership = host[key] ??= { failure: null, active: new Set(), pending: new Set(), retired: new WeakMap() }

export function searchIndexOwnershipFailure(): Error | null { return ownership.failure }

export function adoptSearchIndex(index: IndexOwner): void {
  if (ownership.failure) throw ownership.failure
  ownership.active.add(index)
}

export function retireSearchIndex(index: IndexOwner): Promise<void> {
  const previous = ownership.retired.get(index)
  if (previous) return previous
  ownership.active.delete(index)
  let closing: Promise<void>
  try { closing = index.close() } catch (error) { closing = Promise.reject(error) }
  const settled = closing.catch(error => {
    ownership.failure ??= error instanceof Error ? error : new Error('Index ownership settlement is unknown')
    // Stop existing siblings too; a process-wide quarantine is not just a spawn guard.
    for (const sibling of ownership.active) void retireSearchIndex(sibling).catch(() => {})
    throw ownership.failure
  }).finally(() => { ownership.pending.delete(settled) })
  ownership.retired.set(index, settled)
  ownership.pending.add(settled)
  void settled.catch(() => {})
  return settled
}

export async function awaitSearchIndexSettlement(admit?: () => void, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  while (ownership.pending.size) {
    const aborted = Promise.withResolvers<never>()
    const abort = (): void => { aborted.reject(signal?.reason) }
    signal?.addEventListener('abort', abort, { once: true })
    try { await Promise.race([Promise.all([...ownership.pending]), aborted.promise]) }
    finally { signal?.removeEventListener('abort', abort) }
    signal?.throwIfAborted()
  }
  if (ownership.failure) throw ownership.failure
  // No await gap between the final global check and construction/spawn admission.
  admit?.()
}
