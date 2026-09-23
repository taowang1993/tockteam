export const MAX_EDITOR_SEARCH_MATCHES = 10_000
export const MAX_EDITOR_SEARCH_QUERY_LENGTH = 100_000

export interface EditorSearchMatch {
  from: number
  to: number
}

export type EditorSearchAction = 'next' | 'previous' | 'replace' | 'replace-all'

export interface EditorSearchRequest {
  action: EditorSearchAction
  // Route-owned atomic claim: stale or already-consumed requests must not execute.
  consume?: () => boolean
  id: number
  replacement?: string
}

export interface EditorSearchState {
  current: number | null
  error?: string
  query: string
  total: number
  truncated?: boolean
}

export interface EditorSearchMatches {
  error?: string
  matches: readonly EditorSearchMatch[]
  truncated: boolean
}

export function searchEditorMatches(
  source: string,
  query: string,
  limit = MAX_EDITOR_SEARCH_MATCHES,
): EditorSearchMatches {
  if (query.length === 0) return { matches: [], truncated: false }
  if (query.length > MAX_EDITOR_SEARCH_QUERY_LENGTH) return { error: 'Search query is too long.', matches: [], truncated: false }
  if (source.length === 0) return { matches: [], truncated: false }
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(0, Math.min(limit, MAX_EDITOR_SEARCH_MATCHES)) : MAX_EDITOR_SEARCH_MATCHES
  if (boundedLimit === 0) return { matches: [], truncated: false }
  const matches: EditorSearchMatch[] = []
  let from = source.indexOf(query)
  while (from >= 0) {
    if (matches.length >= boundedLimit) return { matches, truncated: true }
    matches.push({ from, to: from + query.length })
    from = source.indexOf(query, from + query.length)
  }
  return { matches, truncated: false }
}

export function findEditorMatches(
  source: string,
  query: string,
  limit = MAX_EDITOR_SEARCH_MATCHES,
): readonly EditorSearchMatch[] {
  return searchEditorMatches(source, query, limit).matches
}

export function clampEditorSearchIndex(total: number, index: number | null | undefined): number | null {
  if (!Number.isSafeInteger(total) || total <= 0) return null
  const requested = Number.isSafeInteger(index) ? index! : 0
  return Math.max(0, Math.min(requested, total - 1))
}

export function moveEditorSearchIndex(total: number, current: number | null | undefined, direction: -1 | 1): number | null {
  const index = clampEditorSearchIndex(total, current)
  if (index === null) return null
  return (index + direction + total) % total
}
