import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { AssistantSearchIntelligenceResult } from './remote-types.ts'
import type { VaultSearchMatch, VaultSearchResult } from 'tockbot-note-vault/inspection'
import { redactBoundaryText } from './context.ts'
import { AssistantTextTurnRunner, type AssistantTurnBinding } from './text-turn.ts'

const MAX_EXPANSION_OUTPUT = 16_384
const MAX_EXPANSIONS = 5
const MAX_EXPANSION_CHARS = 120
const MAX_CANDIDATES = 100
const MAX_QUERY_CHARS = 1_000
const MAX_DIRECTORY_CHARS = 1_000
const SEARCH_BINDING: AssistantTurnBinding = Object.freeze({
  vaultId: 'search-vault',
  vaultGeneration: 1,
  childInstanceId: 'search-intelligence',
  turnId: 'search-intelligence',
})

export function parseSearchExpansion(value: string): string[] {
  if (value.length > MAX_EXPANSION_OUTPUT) throw new TypeError('Search expansion is too large.')
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TypeError('Search expansion must be an object.')
  const record = parsed as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !Array.isArray(record.queries) || record.queries.length > MAX_EXPANSIONS) {
    throw new TypeError('Search expansion must contain only a bounded queries array.')
  }
  const queries = record.queries.map(query => {
    if (typeof query !== 'string' || query.length === 0 || query.length > MAX_EXPANSION_CHARS || /[\u0000-\u001f\u007f]/u.test(query)) {
      throw new TypeError('Search expansion query is invalid.')
    }
    const bounded = redactBoundaryText(query).trim()
    if (bounded.length === 0 || bounded.length > MAX_EXPANSION_CHARS) throw new TypeError('Search expansion query is invalid.')
    return bounded
  })
  return [...new Set(queries)]
}

function candidateKey(match: VaultSearchMatch): string {
  return match.id ?? `${match.path}:${match.kind}:${String(match.line)}:${match.lineEnd ?? ''}:${match.preview}`
}

function mergeCandidates(pages: readonly VaultSearchResult[]): VaultSearchMatch[] {
  const byId = new Map<string, VaultSearchMatch>()
  for (const page of pages) {
    for (const match of page.matches) {
      const key = candidateKey(match)
      const previous = byId.get(key)
      if (previous === undefined || (match.score ?? 0) > (previous.score ?? 0)) byId.set(key, match)
    }
  }
  return [...byId.values()]
    .toSorted((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.path.localeCompare(right.path))
    .slice(0, MAX_CANDIDATES)
}

function boundedSearchRequest(
  request: {
    query: string
    directory?: string
    modifiedFrom?: number
    modifiedTo?: number
    titleOnly?: boolean
  },
  query: string,
  mode: 'query' | 'related' = 'query',
): {
  query: string
  mode: 'query' | 'related'
  directory?: string
  modifiedFrom?: number
  modifiedTo?: number
  titleOnly?: boolean
  limit: number
} {
  const directory = request.directory?.trim()
  if (directory !== undefined && (directory.length > MAX_DIRECTORY_CHARS || directory.includes('\0'))) {
    throw new TypeError('Search directory is invalid.')
  }
  return {
    query,
    mode,
    ...(directory ? { directory } : {}),
    ...(request.modifiedFrom === undefined ? {} : { modifiedFrom: request.modifiedFrom }),
    ...(request.modifiedTo === undefined ? {} : { modifiedTo: request.modifiedTo }),
    ...(request.titleOnly === true ? { titleOnly: true } : {}),
    limit: MAX_CANDIDATES,
  }
}

async function textTurn(
  llm: LlmRuntime,
  provider: string,
  model: string,
  prompt: string,
  binding: AssistantTurnBinding,
  signal: AbortSignal,
  isCurrent: (binding: AssistantTurnBinding) => boolean,
): Promise<{ status: 'ok'; text: string } | { status: 'error'; code: string }> {
  const runner = new AssistantTextTurnRunner(llm, isCurrent)
  let text = ''
  for await (const event of runner.run({
    binding,
    model,
    provider,
    prompt: { message: prompt },
  }, signal)) {
    if (event.type === 'text-delta') text += event.text
    if (event.type === 'error') return { status: 'error', code: event.code }
  }
  return { status: 'ok', text }
}

export async function expandAndSearch(
  llm: LlmRuntime | undefined,
  request: {
    query: string
    vaultGeneration: number
    directory?: string
    modifiedFrom?: number
    modifiedTo?: number
    titleOnly?: boolean
  },
  provider: string,
  model: string,
  search: (request: ReturnType<typeof boundedSearchRequest>, signal: AbortSignal) => Promise<VaultSearchResult>,
  signal: AbortSignal,
  isCurrent: (binding: AssistantTurnBinding) => boolean = current => current.vaultGeneration === request.vaultGeneration,
): Promise<AssistantSearchIntelligenceResult> {
  if (llm === undefined) return { status: 'provider-unavailable', matches: [] }
  if (signal.aborted) return { status: 'cancelled', matches: [] }
  const query = redactBoundaryText(request.query.trim())
  if (query.length === 0 || query.length > MAX_QUERY_CHARS) return { status: 'invalid-output', matches: [] }
  const binding = { ...SEARCH_BINDING, vaultGeneration: request.vaultGeneration }
  const expansion = await textTurn(llm, provider, model, [
    'Return strict JSON only with exactly one key: queries.',
    `queries must be an array of at most ${String(MAX_EXPANSIONS)} short alternate search phrases.`,
    `User query: ${query}`,
  ].join('\n'), binding, signal, isCurrent)
  if (expansion.status === 'error') {
    return { status: expansion.code === 'ABORTED' ? 'cancelled' : expansion.code === 'PROVIDER_UNAVAILABLE' ? 'provider-unavailable' : 'error', matches: [] }
  }
  let queries: string[]
  try { queries = parseSearchExpansion(expansion.text) } catch { return { status: 'invalid-output', matches: [] } }
  try {
    const pages = [await search(boundedSearchRequest(request, query, 'related'), signal)]
    for (const alternate of queries) {
      if (signal.aborted) return { status: 'cancelled', matches: [] }
      pages.push(await search(boundedSearchRequest(request, alternate), signal))
    }
    return { status: 'applied', matches: mergeCandidates(pages) }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) return { status: 'cancelled', matches: [] }
    return { status: 'error', matches: [] }
  }
}
