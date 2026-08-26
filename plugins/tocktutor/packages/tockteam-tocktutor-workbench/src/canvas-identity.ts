function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertUniqueEntries(entries: readonly unknown[], kind: 'node' | 'edge'): void {
  const ids = new Set<string>()
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    if (ids.has(entry.id)) throw new Error(`This .canvas file contains duplicate Canvas ${kind} ids.`)
    ids.add(entry.id)
  }
}

/** Reject ambiguous node or edge identities before a Canvas mutation. */
export function assertUniqueCanvasDocumentIdentities(document: Record<string, unknown>): void {
  if (Array.isArray(document.nodes)) assertUniqueEntries(document.nodes, 'node')
  if (Array.isArray(document.edges)) assertUniqueEntries(document.edges, 'edge')
}
