import { describe, expect, it } from 'vitest'
import {
  clampEditorSearchIndex,
  findEditorMatches,
  MAX_EDITOR_SEARCH_MATCHES,
  moveEditorSearchIndex,
  searchEditorMatches,
} from '../src/editor-search.ts'

describe('note-local editor search', () => {
  it('finds bounded, non-overlapping Unicode matches and treats empty queries as inactive', () => {
    expect(findEditorMatches('😀 alpha α\nalpha', 'alpha')).toEqual([
      { from: 3, to: 8 },
      { from: 11, to: 16 },
    ])
    expect(findEditorMatches('aaaa', 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ])
    expect(findEditorMatches('anything', '')).toEqual([])
    expect(findEditorMatches('0123456789', '1', 2)).toEqual([{ from: 1, to: 2 }])
  })

  it('wraps next and previous navigation without creating an index for no matches', () => {
    expect(clampEditorSearchIndex(0, 0)).toBeNull()
    expect(clampEditorSearchIndex(3, 99)).toBe(2)
    expect(moveEditorSearchIndex(3, 0, 1)).toBe(1)
    expect(moveEditorSearchIndex(3, 0, -1)).toBe(2)
    expect(moveEditorSearchIndex(3, 2, 1)).toBe(0)
  })

  it('reports capped matches and rejects an overlong query explicitly', () => {
    const capped = searchEditorMatches('x'.repeat(MAX_EDITOR_SEARCH_MATCHES + 1), 'x')
    expect(capped.matches).toHaveLength(MAX_EDITOR_SEARCH_MATCHES)
    expect(capped.truncated).toBe(true)
    expect(findEditorMatches('x'.repeat(MAX_EDITOR_SEARCH_MATCHES + 1), 'x')).toHaveLength(MAX_EDITOR_SEARCH_MATCHES)
    expect(searchEditorMatches('x', 'x'.repeat(100_001))).toEqual({ error: 'Search query is too long.', matches: [], truncated: false })
  })
})
