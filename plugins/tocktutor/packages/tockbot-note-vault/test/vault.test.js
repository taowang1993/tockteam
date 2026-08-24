import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply, Config } from '../index.js'

async function withVault(run) {
  const root = await mkdtemp(join(tmpdir(), 'tockbot-note-vault-'))
  const vault = join(root, 'vault')
  const outside = join(root, 'outside.md')
  await mkdir(join(vault, 'projects'), { recursive: true })
  await writeFile(join(vault, 'projects', 'alpha.md'), '# Alpha\nNeedle in the first note.\n')
  await writeFile(
    join(vault, 'second.markdown'),
    '# Second\nAnother needle appears here.\nSee [[catalog#Decisions]] and [Alpha](projects/alpha.md).\n',
  )
  await writeFile(
    join(vault, 'catalog.md'),
    '---\ntitle: Product Roadmap\ntags: [planning, urgent] # priorities\nowner: Max\n---\n# Internal Name\n```md\n## Fake\n[Alpha](projects/alpha.md)\n```\nShip the plan.\n## Decisions\nUse DSH.\n## C#\nSharp.\n## Later\nRevisit.\n[[second]] [[board.canvas]]\n',
  )
  await writeFile(
    join(vault, 'board.canvas'),
    `${JSON.stringify({ nodes: [{ id: 'one', type: 'text', text: 'Canvas roadmap' }], edges: [] })}\n`,
  )
  await writeFile(join(vault, 'ignored.txt'), 'needle must not appear')
  await symlink(join(vault, 'ignored.txt'), join(vault, 'disguised.md'))
  await writeFile(outside, 'outside secret needle')
  await symlink(outside, join(vault, 'escape.md'))
  try {
    await run(vault)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

// Portable contracts pinned from Tockbot a1f11e92236df639c3f5b004feee62bb9c2e0a57:
// search-files.ts, outline.ts, link-scan.ts, notes-tags.ts, NotesSmartViews.ts,
// NotesGraph.ts, NotesCanvasNodes.ts, and NotesMentions.ts. Outline/link behavior
// retains their Pennivo v1.4.0 adaptation notices. Fixtures stay read-only,
// vault-relative, bounded, and deliberately exclude UI, writes, and evaluation.
async function withAdvancedVault(run) {
  await withVault(async vault => {
    await mkdir(join(vault, 'advanced'), { recursive: true })
    await writeFile(
      join(vault, 'advanced', 'query.md'),
      [
        '---',
        'title: Advanced Query Fixture',
        'aliases: [Unique Query Alias, Shared Alias]',
        'tags: [project/alpha, urgent]',
        'status: active',
        'reviewers: [Ada, Lin]',
        'empty:',
        '---',
        '# Query Fixture',
        'Alpha Bravo exact phrase. #planning/deep',
        '',
        'Paragraph block with gamma and delta.',
        '',
        '## Decisions',
        '- [ ] Ship cursor canary 8f3c0a42',
        '- [x] Archive completed task',
        '## Decisions',
        'Duplicate heading selector.',
        '```md',
        '## Hidden Heading',
        '[[hidden-link]] #hidden-tag',
        '```',
        '> ```',
        '> [[blockquote-hidden]]',
        '> ```',
        '<!-- [[comment-hidden]] -->',
        '<pre>[[raw-hidden]]</pre>',
        '[Reference Label][linked-ref]',
        '[linked-ref]: ../linked.md#Section "Title"',
        '[[Unique Linked Alias|Alias Label]]',
        '[[Shared Alias]]',
        '[[missing-note#Later|Missing Label]]',
        '![Linked image](../linked.md#Section)',
        '![[../linked.md#Section|Linked embed]]',
        '[External](https://example.invalid/no-fetch)',
        '[Escape](../../outside.md)',
        '`[[../linked.md]]`',
        '`[[../linked.md]]',
        '\\[[../linked.md]]',
        '    [[../linked.md]]',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(vault, 'linked.md'),
      '---\naliases: [Unique Linked Alias, Shared Alias]\ntags: [project/beta]\npriority: 2\n---\n# Linked Target\n## Section\nRelated planning project ships quickly.\n',
    )
    await writeFile(
      join(vault, 'duplicate-alias.md'),
      '---\naliases: [Shared Alias]\n---\n# Duplicate Alias\nRelated projects shipped. [[linked]]\n',
    )
    await writeFile(
      join(vault, 'advanced', 'related.md'),
      '# Related\nPlanning projects ship with urgency. See [Linked](../linked.md). #urgent\n',
    )
    await writeFile(
      join(vault, 'relations.canvas'),
      [
        '{',
        '  "nodes": [',
        '    {"id":"text","type":"text","text":"linked.md Canvas relation canary 4d91be73"},',
        '    {"id":"file","type":"file","file":"linked.md"},',
        '    {"id":"url","type":"link","url":"https://example.invalid/never-fetch"}',
        '  ],',
        '  "edges": []',
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(vault, 'query.base'),
      'filters:\n  and:\n    - status == "active"\nviews:\n  - type: table\n    name: Raw Canary 7b2e816c\nsource: https://example.invalid/never-fetch\n',
    )
    await writeFile(join(vault, 'malformed.base'), 'not: [valid Base Canary d02c71ef\n')
    await utimes(join(vault, 'linked.md'), new Date(1_980_000_000_000), new Date(1_980_000_000_000))
    await utimes(join(vault, 'advanced', 'related.md'), new Date(1_990_000_000_000), new Date(1_990_000_000_000))
    await utimes(join(vault, 'advanced', 'query.md'), new Date(2_000_000_000_000), new Date(2_000_000_000_000))
    await run(vault)
  })
}

async function loadTools(vault, overrides = {}) {
  const tools = new Map()
  await apply({
    tools: {
      register(tool) {
        tools.set(tool.name, tool)
      },
    },
  }, {
    root: vault,
    maxReadBytes: 1024,
    maxSearchBytes: 2048,
    maxSearchEntries: 100,
    maxSearchFileBytes: 1024,
    maxSearchResults: 20,
    ...overrides,
  })
  return tools
}

function withoutScanMetadata({ cursor: _cursor, scan: _scan, truncationReason: _reason, warnings: _warnings, ...value }) {
  return value
}

function withoutLinkDetails({ outgoingDetails: _outgoing, backlinkDetails: _backlinks, tagRelations: _tags, ...value }) {
  return withoutScanMetadata(value)
}

function assertDshSchemaSubset(schema) {
  assert.equal(Array.isArray(schema.type), false, 'DSH does not accept type arrays')
  if (schema.enum) assert.equal(typeof schema.type, 'string', 'DSH enums require a scalar type')
  for (const child of schema.oneOf ?? []) assertDshSchemaSubset(child)
  for (const child of Object.values(schema.properties ?? {})) assertDshSchemaSubset(child)
  if (schema.items) assertDshSchemaSubset(schema.items)
}

test('pins the advanced read-only fixture corpus', async () => {
  await withAdvancedVault(async vault => {
    const tools = await loadTools(vault)
    const signal = new AbortController().signal
    const query = await tools.get('vault_read').execute({ path: 'advanced/query.md' }, { signal })
    assert.match(query.content, /cursor canary 8f3c0a42/)
    const canvas = await tools.get('vault_read').execute({ path: 'relations.canvas' }, { signal })
    assert.match(canvas.content, /Canvas relation canary 4d91be73/)
  })
})

test('registers schemas supported by the DSH tool registry', async () => {
  await withVault(async vault => {
    const tools = await loadTools(vault)
    assert.deepEqual([...tools.keys()], [
      'vault_search',
      'vault_read',
      'vault_list',
      'vault_links',
      'vault_outline',
      'vault_graph',
      'vault_canvas',
      'vault_facets',
    ])
    for (const tool of tools.values()) {
      assertDshSchemaSubset(tool.parameters)
      assertDshSchemaSubset(tool.output.schema)
    }
  })
})

test('resumes deterministic bounded scans with operation-bound cursors', async () => {
  await withAdvancedVault(async vault => {
    const tools = await loadTools(vault, { maxSearchResults: 2 })
    const signal = new AbortController().signal

    const listed = []
    let listCursor
    do {
      const page = await tools.get('vault_list').execute({ limit: 2, cursor: listCursor }, { signal })
      listed.push(...page.entries.map(entry => entry.path))
      assert.equal(page.scan.files >= page.entries.length, true)
      assert.equal(page.scan.bytes >= 0, true)
      assert.equal(page.warnings.every(warning => !warning.includes(vault)), true)
      listCursor = page.cursor ?? undefined
    } while (listCursor)
    assert.deepEqual(listed, [...new Set(listed)].sort((left, right) => left.localeCompare(right)))
    assert.equal(listed.includes('advanced/query.md'), true)

    const firstSearch = await tools.get('vault_search').execute(
      { query: 'related', limit: 1 },
      { signal },
    )
    assert.equal(firstSearch.matches.length, 1)
    assert.equal(typeof firstSearch.cursor, 'string')
    const secondSearch = await tools.get('vault_search').execute(
      { query: 'related', limit: 1, cursor: firstSearch.cursor },
      { signal },
    )
    assert.notDeepEqual(secondSearch.matches[0], firstSearch.matches[0])
    await assert.rejects(
      tools.get('vault_search').execute(
        { query: 'different', cursor: firstSearch.cursor },
        { signal },
      ),
      /cursor does not match this operation/,
    )
    const tampered = `${firstSearch.cursor.slice(0, -1)}${firstSearch.cursor.endsWith('A') ? 'B' : 'A'}`
    await assert.rejects(
      tools.get('vault_search').execute({ query: 'related', cursor: tampered }, { signal }),
      /invalid cursor/,
    )

    const backlinkSources = []
    const backlinkRecords = []
    let linksCursor
    do {
      const page = await tools.get('vault_links').execute(
        { path: 'linked.md', cursor: linksCursor },
        { signal },
      )
      backlinkSources.push(...page.backlinks)
      backlinkRecords.push(...page.backlinkDetails.map(record => (
        `${record.sourcePath}:${String(record.line)}:${record.kind}:${record.authoredTarget}`
      )))
      linksCursor = page.cursor ?? undefined
    } while (linksCursor)
    assert.equal(new Set(backlinkSources).size >= 2, true)
    assert.equal(new Set(backlinkRecords).size, backlinkRecords.length)
  })
})

test('resumes entry and byte limited scans without duplicate or missing paths', async () => {
  await withAdvancedVault(async vault => {
    await writeFile(join(vault, 'Z.md'), '# Shared Resume Marker\n')
    await writeFile(join(vault, 'a.md'), '# Shared Resume Marker\n')
    await writeFile(join(vault, 'Ä.md'), '# Shared Resume Marker\n')
    await Promise.all(Array.from({ length: 12 }, (_, index) => (
      writeFile(join(vault, `.ignored-${String(index)}.txt`), 'ignored')
    )))
    const signal = new AbortController().signal
    const collectList = async overrides => {
      const list = (await loadTools(vault, overrides)).get('vault_list')
      const paths = []
      let cursor
      do {
        const page = await list.execute({ limit: 20, cursor }, { signal })
        paths.push(...page.entries.map(entry => entry.path))
        assert.equal(page.scan.entries <= overrides.maxSearchEntries, true)
        cursor = page.cursor ?? undefined
      } while (cursor)
      return paths
    }
    const entryPaths = await collectList({ maxSearchEntries: 2, maxSearchBytes: 64 * 1024 })
    assert.equal(new Set(entryPaths).size, entryPaths.length)
    assert.equal(entryPaths.includes('Z.md') && entryPaths.includes('a.md') && entryPaths.includes('Ä.md'), true)

    const search = (await loadTools(vault, {
      maxSearchBytes: 500,
      maxSearchEntries: 100,
      maxSearchFileBytes: 1024,
    })).get('vault_search')
    const matches = []
    let cursor
    do {
      const page = await search.execute({ query: 'Shared Resume Marker', limit: 20, cursor }, { signal })
      matches.push(...page.matches.map(match => `${match.path}:${String(match.line)}:${match.kind}`))
      cursor = page.cursor ?? undefined
    } while (cursor)
    assert.equal(new Set(matches).size, matches.length)
    assert.deepEqual([...new Set(matches.map(match => match.split(':', 1)[0]))].sort(), ['Z.md', 'a.md', 'Ä.md'].sort())
  })
})

test('supports explicit advanced exact query syntax', async () => {
  await withAdvancedVault(async vault => {
    const search = (await loadTools(vault)).get('vault_search')
    const signal = new AbortController().signal
    const paths = async args => (await search.execute({ mode: 'query', ...args }, { signal }))
      .matches.map(match => match.path)

    assert.deepEqual([...new Set(await paths({ query: 'alpha "exact phrase"' }))], ['advanced/query.md'])
    assert.deepEqual([...new Set(await paths({ query: 'file:linked OR file:duplicate-alias' }))], [
      'duplicate-alias.md',
      'linked.md',
    ])
    assert.deepEqual([...new Set(await paths({ query: 'path:advanced -content:urgency' }))], ['advanced/query.md'])
    assert.deepEqual([...new Set(await paths({ query: '/cursor\\s+canary/i' }))], ['advanced/query.md'])
    assert.deepEqual([...new Set(await paths({
      query: 'Bravo',
      caseSensitive: true,
      wholeWord: true,
      directory: 'advanced',
    }))], ['advanced/query.md'])
    assert.deepEqual(await paths({ query: 'bravo', caseSensitive: true, wholeWord: true }), [])
    await assert.rejects(
      search.execute({ mode: 'query', query: '/(/' }, { signal }),
      /invalid search pattern/,
    )

    const first = await search.execute({ mode: 'query', query: 'related', limit: 1 }, { signal })
    assert.equal(typeof first.cursor, 'string')
    await assert.rejects(
      search.execute({ mode: 'query', query: 'related', limit: 1, regex: true, cursor: first.cursor }, { signal }),
      /cursor does not match this operation/,
    )
  })
})

test('supports structured property, tag, line, block, section, and task queries', async () => {
  await withAdvancedVault(async vault => {
    const search = (await loadTools(vault)).get('vault_search')
    const signal = new AbortController().signal
    const run = async query => await search.execute({ mode: 'query', query }, { signal })
    const uniquePaths = result => [...new Set(result.matches.map(match => match.path))]

    assert.deepEqual(uniquePaths(await run('[status]')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('[status:active]')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('[empty:null]')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('tag:project')), [
      'advanced/query.md',
      'linked.md',
    ])
    assert.deepEqual(uniquePaths(await run('tag:hidden')), [])
    assert.deepEqual(uniquePaths(await run('line:"Alpha Bravo"')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('block:"gamma and delta"')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('section:"Duplicate heading selector"')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('task-todo:"cursor canary"')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('task-done:Archive')), ['advanced/query.md'])
    assert.deepEqual(uniquePaths(await run('tag:project -[status:active] OR task-done:Archive')), [
      'advanced/query.md',
      'linked.md',
    ])

    const task = await run('task-todo:"cursor canary"')
    assert.equal(task.matches[0].operator, 'task-todo')
    assert.equal(task.matches[0].provenance, 'task')
    assert.equal(task.matches[0].line, 15)
  })
})

test('ranks local Related results deterministically with resumable citations', async () => {
  await withAdvancedVault(async vault => {
    const search = (await loadTools(vault)).get('vault_search')
    const signal = new AbortController().signal
    const args = { mode: 'related', query: 'planning projects ship urgency' }
    const firstRun = await search.execute(args, { signal })
    const secondRun = await search.execute(args, { signal })
    assert.deepEqual(firstRun.matches, secondRun.matches)
    assert.equal(firstRun.matches[0].path, 'advanced/related.md')
    assert.equal(firstRun.matches[0].line, 2)
    assert.equal(firstRun.matches[0].operator, 'related')

    const pageOne = await search.execute({ ...args, limit: 1 }, { signal })
    const pageTwo = await search.execute({ ...args, limit: 1, cursor: pageOne.cursor }, { signal })
    assert.equal(typeof pageOne.cursor, 'string')
    assert.notEqual(pageOne.matches[0].path, pageTwo.matches[0].path)
    assert.equal(pageOne.scan.bytes <= 2048, true)
  })
})

test('searches and reads Markdown inside the configured vault', async () => {
  await withVault(async vault => {
    const tools = await loadTools(vault)
    assert.deepEqual([...tools.keys()], ['vault_search', 'vault_read', 'vault_list', 'vault_links', 'vault_outline', 'vault_graph', 'vault_canvas', 'vault_facets'])

    const search = await tools.get('vault_search').execute(
      { query: 'needle', limit: 10 },
      { signal: new AbortController().signal },
    )
    assert.deepEqual(withoutScanMetadata(search), {
      matches: [
        { path: 'projects/alpha.md', kind: 'content', line: 2, preview: 'Needle in the first note.' },
        { path: 'second.markdown', kind: 'content', line: 2, preview: 'Another needle appears here.' },
      ],
      query: 'needle',
      truncated: false,
    })

    const readTool = tools.get('vault_read')
    const read = await readTool.execute(
      { path: 'projects/alpha.md' },
      { signal: new AbortController().signal },
    )
    assert.deepEqual(read, {
      content: '# Alpha\nNeedle in the first note.\n',
      path: 'projects/alpha.md',
    })
    assert.deepEqual(readTool.output.render({ path: 'projects/alpha.md' }, read), [{
      type: 'text',
      text: read.content,
    }])
  })
})

test('searches titles, paths, properties, tags, and Canvas content', async () => {
  await withVault(async vault => {
    const tools = await loadTools(vault)
    const signal = new AbortController().signal

    assert.deepEqual(withoutScanMetadata(await tools.get('vault_search').execute(
      { query: 'roadmap', scope: 'path' },
      { signal },
    )), {
      matches: [{
        path: 'catalog.md',
        kind: 'path',
        line: null,
        preview: 'Product Roadmap — catalog.md',
      }],
      query: 'roadmap',
      truncated: false,
    })
    assert.deepEqual(withoutScanMetadata(await tools.get('vault_search').execute(
      { query: '#urgent', scope: 'properties' },
      { signal },
    )), {
      matches: [{
        path: 'catalog.md',
        kind: 'property',
        line: 3,
        preview: 'tags: [planning, urgent] # priorities',
      }],
      query: '#urgent',
      truncated: false,
    })
    assert.deepEqual(withoutScanMetadata(await tools.get('vault_search').execute(
      { query: 'canvas roadmap', scope: 'content' },
      { signal },
    )), {
      matches: [{
        path: 'board.canvas',
        kind: 'canvas',
        line: null,
        preview: 'Canvas roadmap',
      }],
      query: 'canvas roadmap',
      truncated: false,
    })

    const canvas = await tools.get('vault_read').execute({ path: 'board.canvas' }, { signal })
    assert.equal(canvas.path, 'board.canvas')
    assert.match(canvas.content, /Canvas roadmap/)
  })
})

test('returns bounded outlines with selectable duplicate headings', async () => {
  await withAdvancedVault(async vault => {
    const tools = await loadTools(vault)
    const signal = new AbortController().signal
    const outline = await tools.get('vault_outline').execute({ path: 'advanced/query.md' }, { signal })
    assert.deepEqual(outline, {
      path: 'advanced/query.md',
      headings: [
        { level: 1, line: 9, selector: 'Query Fixture', text: 'Query Fixture' },
        { level: 2, line: 14, selector: 'Decisions', text: 'Decisions' },
        { level: 2, line: 17, selector: 'Decisions::2', text: 'Decisions' },
      ],
      truncated: false,
    })
    const duplicate = await tools.get('vault_read').execute(
      { path: 'advanced/query.md', heading: 'Decisions::2' },
      { signal },
    )
    assert.match(duplicate.content, /Duplicate heading selector/)
    assert.doesNotMatch(duplicate.content, /cursor canary/)
    const bounded = await tools.get('vault_outline').execute(
      { path: 'advanced/query.md', limit: 2 },
      { signal },
    )
    assert.equal(bounded.headings.length, 2)
    assert.equal(bounded.truncated, true)
  })
})

const INLINE_FOOTNOTE_FIXTURE = [
  '---',
  'title: Footnotes',
  '^[hidden in frontmatter]',
  '---',
  '# Footnotes',
  'First inline ^[alpha note] here.',
  'Second ^[beta note] and third ^[gamma note].',
  'Escaped \\^[not a footnote], empty ^[ ] and ^[], nested ^[outer [inner].',
  '`code ^[masked]` and ^[visible after code].',
  '```md',
  '^[fenced]',
  '```',
  '[^def]: definition is not inline',
  '',
].join('\n')

test('inventories and reads inline footnotes with bounded ordinals', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'foot.md'), INLINE_FOOTNOTE_FIXTURE)
    const tools = await loadTools(vault)
    const signal = new AbortController().signal

    const plain = await tools.get('vault_outline').execute({ path: 'foot.md' }, { signal })
    assert.deepEqual(plain, {
      path: 'foot.md',
      headings: [{ level: 1, line: 5, selector: 'Footnotes', text: 'Footnotes' }],
      truncated: false,
    })

    const outline = await tools.get('vault_outline').execute(
      { path: 'foot.md', includeFootnotes: true },
      { signal },
    )
    assert.deepEqual(outline.footnotes, [
      { ordinal: 1, kind: 'inline', content: 'alpha note', line: 6 },
      { ordinal: 2, kind: 'inline', content: 'beta note', line: 7 },
      { ordinal: 3, kind: 'inline', content: 'gamma note', line: 7 },
      { ordinal: 4, kind: 'inline', content: 'visible after code', line: 9 },
    ])
    assert.equal(outline.footnotesTruncated, false)

    const bounded = await tools.get('vault_outline').execute(
      { path: 'foot.md', includeFootnotes: true, limit: 2 },
      { signal },
    )
    assert.equal(bounded.headings.length, 1)
    assert.equal(bounded.footnotes.length, 2)
    assert.equal(bounded.footnotesTruncated, true)
    assert.equal(bounded.truncated, false)

    const second = await tools.get('vault_read').execute(
      { path: 'foot.md', inlineFootnote: 2 },
      { signal },
    )
    assert.deepEqual(second, { path: 'foot.md', content: '^[beta note]' })

    await assert.rejects(
      () => tools.get('vault_read').execute({ path: 'foot.md', inlineFootnote: 5 }, { signal }),
      /inline footnote 5 was not found/,
    )
    await assert.rejects(
      () => tools.get('vault_read').execute({ path: 'foot.md', inlineFootnote: 0 }, { signal }),
      /inlineFootnote must be a positive integer/,
    )
    await assert.rejects(
      () => tools.get('vault_read').execute(
        { path: 'foot.md', inlineFootnote: 1, heading: 'Footnotes' },
        { signal },
      ),
      /only one Markdown selector/,
    )
    await assert.rejects(
      () => tools.get('vault_read').execute({ path: 'board.canvas', inlineFootnote: 1 }, { signal }),
      /Markdown files only/,
    )
  })
})

const QUERY_BLOCK_FIXTURE = [
  '---',
  'title: Query Blocks',
  '```query',
  'hidden frontmatter',
  '```',
  '---',
  '# Queries',
  '```query',
  'tag:#alpha',
  'path:projects',
  '```',
  '  ~~~~ QUERY',
  'line one',
  'line two',
  '~~~~',
  '```query extra',
  'malformed info',
  '```',
  '    ```query',
  'overindented',
  '    ```',
  '~~~md',
  '```query',
  'nested in another fence',
  '```',
  '~~~',
  '<!--',
  '```query',
  'hidden comment',
  '```',
  '-->',
  '```query',
  'x'.repeat(260),
  '```',
  '```query',
  'unclosed',
].join('\r\n')

test('extracts bounded inert query blocks with exact source lines', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'queries.md'), QUERY_BLOCK_FIXTURE)
    const tools = await loadTools(vault, { maxReadBytes: 4096 })
    const signal = new AbortController().signal

    const plain = await tools.get('vault_outline').execute({ path: 'queries.md' }, { signal })
    assert.equal('queries' in plain, false)
    assert.equal('queriesTruncated' in plain, false)

    const outline = await tools.get('vault_outline').execute(
      { path: 'queries.md', includeQueries: true },
      { signal },
    )
    assert.deepEqual(outline.queries, [
      {
        ordinal: 1,
        query: 'tag:#alpha\r\npath:projects',
        line: 8,
        lineEnd: 11,
        fence: '```',
      },
      {
        ordinal: 2,
        query: 'line one\r\nline two',
        line: 12,
        lineEnd: 15,
        fence: '~~~~',
      },
      {
        ordinal: 3,
        query: 'x'.repeat(240),
        line: 32,
        lineEnd: 34,
        fence: '```',
      },
    ])
    assert.equal(outline.queriesTruncated, true)

    const bounded = await tools.get('vault_outline').execute(
      { path: 'queries.md', includeQueries: true, limit: 1 },
      { signal },
    )
    assert.deepEqual(bounded.queries, [outline.queries[0]])
    assert.equal(bounded.queriesTruncated, true)
  })
})

test('keeps parser-derived Markdown syntax inert across non-parsing regions', async () => {
  await withAdvancedVault(async vault => {
    await writeFile(join(vault, 'non-parsing.md'), [
      '# Visible Heading',
      '<!--',
      '## HTML Hidden Heading',
      '[[comment-block-hidden]]',
      '-->',
      '%%',
      '## Obsidian Hidden Heading',
      '[[obsidian-comment-hidden]]',
      '%%',
      '$$',
      '## Math Hidden Heading',
      '[[math-hidden]]',
      '$$',
      '`multiline code starts',
      '## Inline Code Hidden Heading',
      '[[multiline-code-hidden]]',
      '```',
      'multiline code ends`',
      '[[visible-after-multiline-code]]',
      '<?processing',
      '## Processing Hidden Heading',
      '[[processing-hidden]]',
      '?>',
      '<![CDATA[',
      '## CDATA Hidden Heading',
      '[[cdata-hidden]]',
      ']]>',
      '[[linked]]',
      '',
    ].join('\n'))
    const tools = await loadTools(vault)
    const signal = new AbortController().signal
    const outline = await tools.get('vault_outline').execute({ path: 'non-parsing.md' }, { signal })
    assert.equal(outline.headings.some(heading => heading.text.includes('Hidden Heading')), false)

    const links = await tools.get('vault_links').execute({ path: 'non-parsing.md' }, { signal })
    const targets = links.outgoingDetails.map(record => record.authoredTarget)
    assert.equal(targets.includes('linked'), true)
    assert.equal(targets.includes('visible-after-multiline-code'), true)
    for (const target of [
      'comment-block-hidden',
      'obsidian-comment-hidden',
      'math-hidden',
      'multiline-code-hidden',
      'processing-hidden',
      'cdata-hidden',
    ]) assert.equal(targets.includes(target), false, target)
  })
})

test('reads one Markdown heading section', async () => {
  await withVault(async vault => {
    const read = (await loadTools(vault)).get('vault_read')
    const signal = new AbortController().signal
    assert.deepEqual(await read.execute(
      { path: 'catalog.md', heading: 'Decisions' },
      { signal },
    ), {
      path: 'catalog.md',
      content: '## Decisions\nUse DSH.\n',
    })
    assert.deepEqual(await read.execute(
      { path: 'catalog.md', heading: 'Later' },
      { signal },
    ), {
      path: 'catalog.md',
      content: '## Later\nRevisit.\n[[second]] [[board.canvas]]\n',
    })
    assert.deepEqual(await read.execute(
      { path: 'catalog.md', heading: 'C#' },
      { signal },
    ), {
      path: 'catalog.md',
      content: '## C#\nSharp.\n',
    })
    await assert.rejects(
      read.execute({ path: 'catalog.md', heading: 'Fake' }, { signal }),
      /heading was not found/,
    )
    await assert.rejects(
      read.execute({ path: 'catalog.md', heading: 'Missing' }, { signal }),
      /heading was not found/,
    )
  })
})

test('reads visible Markdown block IDs and footnote definitions', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'selectors.md'), [
      '# Selectors',
      'Inline block canary 4e91f ^inline-id',
      '',
      'Paragraph first line',
      'Paragraph second line',
      '',
      '^paragraph-id',
      '',
      '- List first',
      '  continuation',
      '- List second',
      '^list-id',
      '',
      'Reference [^note].',
      '[^note]: Footnote canary 93af2',
      '    four-space detail',
      '\ttab detail',
      '[^duplicate]: first',
      '[^duplicate]: second',
      'First duplicate ^same-id',
      'Second duplicate ^same-id',
      '```md',
      '^hidden-id',
      '[^hidden]: hidden footnote',
      '```',
      '',
    ].join('\n'))
    const read = (await loadTools(vault)).get('vault_read')
    const signal = new AbortController().signal

    assert.deepEqual(await read.execute({ path: 'selectors.md', blockId: 'inline-id' }, { signal }), {
      path: 'selectors.md',
      content: 'Inline block canary 4e91f',
    })
    assert.deepEqual(await read.execute({ path: 'selectors.md', blockId: 'paragraph-id' }, { signal }), {
      path: 'selectors.md',
      content: 'Paragraph first line\nParagraph second line',
    })
    assert.deepEqual(await read.execute({ path: 'selectors.md', blockId: 'list-id' }, { signal }), {
      path: 'selectors.md',
      content: '- List first\n  continuation\n- List second',
    })
    assert.deepEqual(await read.execute({ path: 'selectors.md', footnote: 'note' }, { signal }), {
      path: 'selectors.md',
      content: '[^note]: Footnote canary 93af2\n    four-space detail\n\ttab detail',
    })
    await assert.rejects(
      read.execute({ path: 'selectors.md', blockId: 'hidden-id' }, { signal }),
      /block ID was not found/,
    )
    await assert.rejects(
      read.execute({ path: 'selectors.md', footnote: 'hidden' }, { signal }),
      /footnote was not found/,
    )
    await assert.rejects(
      read.execute({ path: 'selectors.md', footnote: 'duplicate' }, { signal }),
      /footnote is ambiguous/,
    )
    await assert.rejects(
      read.execute({ path: 'selectors.md', blockId: 'same-id' }, { signal }),
      /block ID is ambiguous/,
    )
    await assert.rejects(
      read.execute({ path: 'selectors.md', blockId: 'bad id' }, { signal }),
      /valid single-line identifier/,
    )
    await assert.rejects(
      read.execute({ path: 'selectors.md', heading: 'Selectors', blockId: 'inline-id' }, { signal }),
      /one Markdown selector/,
    )
    await assert.rejects(
      read.execute({ path: 'board.canvas', blockId: 'inline-id' }, { signal }),
      /Markdown selectors support Markdown files only/,
    )
  })
})

test('reports rich resolved and inert link records without filesystem escape', async () => {
  await withAdvancedVault(async vault => {
    const links = (await loadTools(vault)).get('vault_links')
    const signal = new AbortController().signal
    const outgoing = await links.execute({ path: 'advanced/query.md' }, { signal })
    assert.deepEqual(outgoing.outgoing, ['linked.md'])
    const reference = outgoing.outgoingDetails.find(record => record.kind === 'reference')
    assert.equal(reference.authoredTarget, '../linked.md#Section')
    assert.equal(reference.fragment, 'Section')
    assert.equal(reference.resolvedPath, 'linked.md')
    assert.equal(reference.status, 'resolved')
    assert.equal(reference.displayText, 'Reference Label')
    assert.equal(outgoing.outgoingDetails.some(record => record.kind === 'image' && record.status === 'resolved'), true)
    assert.equal(outgoing.outgoingDetails.some(record => record.kind === 'embed' && record.status === 'resolved'), true)
    const missing = outgoing.outgoingDetails.find(record => record.authoredTarget.startsWith('missing-note'))
    assert.equal(missing.status, 'unresolved')
    assert.equal(missing.fragment, 'Later')
    assert.equal(missing.displayText, 'Missing Label')
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget.startsWith('https:') && record.resolvedPath === null), true)
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget === '../../outside.md' && record.resolvedPath === null), true)
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget === 'hidden-link'), false)
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget === 'blockquote-hidden'), false)
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget === 'comment-hidden'), false)
    assert.equal(outgoing.outgoingDetails.some(record => record.authoredTarget === 'raw-hidden'), false)
    assert.equal(outgoing.outgoingDetails.filter(record => record.authoredTarget === '../linked.md').length, 0)

    const incoming = await links.execute({ path: 'linked.md' }, { signal })
    assert.equal(incoming.backlinks.includes('advanced/query.md'), true)
    const detail = incoming.backlinkDetails.find(record => record.sourcePath === 'advanced/query.md')
    assert.equal(detail.resolvedPath, 'linked.md')
    assert.equal(detail.line > 0, true)
  })
})

test('resolves unique aliases, shared tags, and inert Canvas file nodes', async () => {
  await withAdvancedVault(async vault => {
    const links = (await loadTools(vault)).get('vault_links')
    const signal = new AbortController().signal
    const query = await links.execute({ path: 'advanced/query.md' }, { signal })
    const uniqueAlias = query.outgoingDetails.find(record => record.authoredTarget === 'Unique Linked Alias')
    assert.equal(uniqueAlias.status, 'resolved')
    assert.equal(uniqueAlias.resolvedPath, 'linked.md')
    const sharedAlias = query.outgoingDetails.find(record => record.authoredTarget === 'Shared Alias')
    assert.equal(sharedAlias.status, 'ambiguous')
    assert.equal(sharedAlias.resolvedPath, null)
    assert.deepEqual(query.tagRelations.find(relation => relation.tag === 'urgent').paths, [
      'advanced/query.md',
      'advanced/related.md',
      'catalog.md',
    ])

    const canvas = await links.execute({ path: 'relations.canvas' }, { signal })
    assert.deepEqual(canvas.outgoing, ['linked.md'])
    assert.equal(canvas.outgoingDetails[0].kind, 'canvas-file')
    assert.equal(canvas.outgoingDetails[0].line, 4)
    assert.equal(canvas.outgoingDetails.some(record => record.authoredTarget.startsWith('https:')), false)

    const linked = await links.execute({ path: 'linked.md' }, { signal })
    assert.equal(linked.backlinkDetails.some(record => (
      record.sourcePath === 'relations.canvas' && record.kind === 'canvas-file'
    )), true)
  })
})

test('pages every outgoing, backlink, and tag relationship without omission', async () => {
  await withAdvancedVault(async vault => {
    const links = (await loadTools(vault, {
      maxSearchBytes: 64 * 1024,
      maxSearchEntries: 2,
      maxSearchResults: 2,
    })).get('vault_links')
    const signal = new AbortController().signal
    const outgoing = []
    const tagPaths = []
    let cursor
    do {
      const page = await links.execute({ path: 'advanced/query.md', cursor }, { signal })
      outgoing.push(...page.outgoingDetails.map(record => `${record.kind}:${record.authoredTarget}`))
      tagPaths.push(...page.tagRelations.flatMap(relation => relation.paths.map(path => `${relation.tag}:${path}`)))
      cursor = page.cursor ?? undefined
    } while (cursor)
    assert.equal(new Set(outgoing).size, outgoing.length)
    assert.equal(outgoing.some(record => record.includes('missing-note#Later')), true)
    assert.equal(outgoing.some(record => record.includes('Unique Linked Alias')), true)
    assert.equal(new Set(tagPaths).size, tagPaths.length)
    assert.equal(tagPaths.includes('urgent:advanced/related.md'), true)
  })
})

const MENTION_TARGET_FIXTURE = [
  '---',
  'title: Unique Target Title',
  'aliases: [Shared Alias, Lone Alias]',
  '---',
  '# Target',
  'Self Unique Target Title mention.',
  '',
].join('\n')

const MENTION_SOURCE_FIXTURE = [
  '# Mentions',
  'Plain Unique Target Title mention.',
  'Also Lone Alias here.',
  'A [Unique Target Title](unique-target.md) link.',
  'A [[Lone Alias]] wikilink.',
  'See [Lone Alias][r].',
  '[r]: unique-target.md',
  '`code Unique Target Title` hidden.',
  'Unique Target Title again on this line.',
  '',
].join('\n')

async function withMentionVault(run, overrides = {}) {
  await withVault(async vault => {
    await writeFile(join(vault, 'unique-target.md'), MENTION_TARGET_FIXTURE)
    await writeFile(join(vault, 'mentions.md'), MENTION_SOURCE_FIXTURE)
    await writeFile(join(vault, 'other.md'), '---\naliases: [Shared Alias]\n---\n# Other\n')
    await run(await loadTools(vault, overrides))
  })
}

test('reports bounded incoming unlinked mentions', async () => {
  await withMentionVault(async tools => {
    const signal = new AbortController().signal
    const plain = await tools.get('vault_links').execute({ path: 'unique-target.md' }, { signal })
    assert.equal('unlinkedMentions' in plain, false)
    assert.equal('complete' in plain, false)

    const result = await tools.get('vault_links').execute(
      { path: 'unique-target.md', includeUnlinked: true },
      { signal },
    )
    assert.equal(result.complete, true)
    assert.deepEqual(result.unlinkedMentions, [
      {
        sourcePath: 'mentions.md',
        line: 2,
        matchedText: 'Unique Target Title',
        identifierKind: 'title',
        snippet: 'Plain Unique Target Title mention.',
      },
      {
        sourcePath: 'mentions.md',
        line: 3,
        matchedText: 'Lone Alias',
        identifierKind: 'alias',
        snippet: 'Also Lone Alias here.',
      },
      {
        sourcePath: 'mentions.md',
        line: 9,
        matchedText: 'Unique Target Title',
        identifierKind: 'title',
        snippet: 'Unique Target Title again on this line.',
      },
    ])
    assert.ok(
      result.warnings.some(warning => warning.includes('Shared Alias')),
      'ambiguous alias warns',
    )
  })
})

test('omits unlinked mentions honestly when the source scan is incomplete', async () => {
  await withMentionVault(async tools => {
    const signal = new AbortController().signal
    let cursor
    let pages = 0
    do {
      const result = await tools.get('vault_links').execute({
        path: 'unique-target.md',
        includeUnlinked: true,
        ...(cursor ? { cursor } : {}),
      }, { signal })
      assert.equal(result.complete, false)
      assert.equal('unlinkedMentions' in result, false)
      assert.ok(result.warnings.length > 0, 'incomplete scan warns')
      cursor = result.cursor
      pages += 1
      assert.ok(pages < 20, 'mention continuation terminates')
    } while (cursor)

    await assert.rejects(
      () => tools.get('vault_links').execute(
        { path: 'board.canvas', includeUnlinked: true },
        { signal },
      ),
      /unlinked mentions support Markdown files only/,
    )
  }, { maxSearchBytes: 200 })
})

async function withAttachmentVault(run, overrides = {}) {
  await withVault(async vault => {
    await writeFile(join(vault, 'image.PNG'), Buffer.from('fake png bytes'))
    await writeFile(join(vault, 'audio.mp3'), Buffer.from('fake mp3'))
    await writeFile(join(vault, 'video.mkv'), Buffer.from('fake mkv'))
    await writeFile(join(vault, 'doc.pdf'), Buffer.from('fake pdf'))
    await writeFile(join(vault, 'notes.txt'), 'unsupported text')
    await writeFile(join(vault, '.hidden.png'), Buffer.from('hidden'))
    const outsideAttachment = join(vault, '..', 'outside.png')
    await writeFile(outsideAttachment, Buffer.from('outside attachment'))
    await symlink(outsideAttachment, join(vault, 'linked.png'))
    await run(await loadTools(vault, overrides), vault)
  })
}

test('lists accepted attachment metadata without opening binaries', async () => {
  await withAttachmentVault(async (tools, vault) => {
    const signal = new AbortController().signal
    const plain = await tools.get('vault_list').execute({}, { signal })
    assert.ok(plain.entries.every(entry => entry.type !== 'attachment'))

    const attachments = await tools.get('vault_list').execute({ kind: 'attachments' }, { signal })
    assert.deepEqual(attachments.entries.map(entry => ({
      path: entry.path,
      type: entry.type,
      mediaKind: entry.mediaKind,
      extension: entry.extension,
      size: entry.size,
    })), [
      { path: 'audio.mp3', type: 'attachment', mediaKind: 'audio', extension: '.mp3', size: 8 },
      { path: 'doc.pdf', type: 'attachment', mediaKind: 'pdf', extension: '.pdf', size: 8 },
      { path: 'image.PNG', type: 'attachment', mediaKind: 'image', extension: '.png', size: 14 },
      { path: 'video.mkv', type: 'attachment', mediaKind: 'video', extension: '.mkv', size: 8 },
    ])
    for (const entry of attachments.entries) {
      assert.equal(typeof entry.modifiedMs, 'number')
      assert.ok(entry.createdMs === null || typeof entry.createdMs === 'number')
      assert.equal('title' in entry, false)
      assert.equal('tags' in entry, false)
    }
    const statSize = (await readFile(join(vault, 'image.PNG'))).byteLength
    assert.equal(attachments.entries.find(entry => entry.path === 'image.PNG').size, statSize)

    const all = await tools.get('vault_list').execute({ kind: 'all' }, { signal })
    assert.deepEqual(
      all.entries.filter(entry => entry.type === 'attachment').map(entry => entry.path),
      ['audio.mp3', 'doc.pdf', 'image.PNG', 'video.mkv'],
    )
    assert.ok(all.entries.some(entry => entry.type === 'markdown'))
    assert.ok(all.entries.every(entry => entry.path !== 'notes.txt'))

    const first = await tools.get('vault_list').execute({ kind: 'attachments', limit: 3 }, { signal })
    assert.equal(first.entries.length, 3)
    assert.equal(first.truncated, true)
    const second = await tools.get('vault_list').execute(
      { kind: 'attachments', limit: 3, cursor: first.cursor },
      { signal },
    )
    assert.deepEqual(
      [...first.entries, ...second.entries].map(entry => entry.path),
      ['audio.mp3', 'doc.pdf', 'image.PNG', 'video.mkv'],
    )
    assert.equal(second.cursor, null)
  })
})

test('reports outgoing links and backlinks', async () => {
  await withVault(async vault => {
    const links = (await loadTools(vault)).get('vault_links')
    const signal = new AbortController().signal
    assert.deepEqual(withoutLinkDetails(await links.execute({ path: 'catalog.md' }, { signal })), {
      path: 'catalog.md',
      outgoing: ['board.canvas', 'second.markdown'],
      backlinks: ['second.markdown'],
      truncated: false,
    })
    assert.deepEqual(withoutLinkDetails(await links.execute({ path: 'second.markdown' }, { signal })), {
      path: 'second.markdown',
      outgoing: ['catalog.md', 'projects/alpha.md'],
      backlinks: ['catalog.md'],
      truncated: false,
    })
  })
})

test('returns bounded local graph depth, direction, tags, missing targets, and orphans', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'graph-root.md'), [
      '---',
      'tags: [graph]',
      '---',
      '# Root',
      '[[graph-a]] [[missing-local]] [External](https://example.invalid/no-fetch) [Escape](../outside.md)',
      '',
    ].join('\n'))
    await writeFile(join(vault, 'graph-a.md'), '---\ntags: [graph]\n---\n# A\n[[graph-b]] [[graph-root]]\n')
    await writeFile(join(vault, 'graph-b.md'), '---\ntags: [other]\n---\n# B\n')
    await writeFile(join(vault, 'graph-incoming.md'), '---\ntags: [graph]\n---\n# Incoming\n[[graph-root]]\n')
    await writeFile(join(vault, 'graph-orphan.md'), '---\ntags: [graph]\n---\n# Orphan\n')
    const signal = new AbortController().signal
    const graph = (await loadTools(vault, {
      maxSearchBytes: 16 * 1024,
      maxSearchFileBytes: 4 * 1024,
      maxSearchResults: 30,
    })).get('vault_graph')

    const outgoing = await graph.execute({ path: 'graph-root.md', depth: 2, direction: 'outgoing' }, { signal })
    assert.deepEqual(outgoing.nodes.map(node => [node.path, node.depth]), [
      ['graph-root.md', 0],
      ['graph-a.md', 1],
      ['graph-b.md', 2],
    ])
    assert.equal(outgoing.edges.some(edge => edge.sourcePath === 'graph-a.md' && edge.targetPath === 'graph-root.md'), true)
    assert.equal(outgoing.missing.some(record => record.authoredTarget === 'missing-local'), true)
    assert.equal(outgoing.missing.some(record => record.authoredTarget.startsWith('https:')), false)
    assert.equal(outgoing.missing.some(record => record.authoredTarget === '../outside.md'), false)
    assert.equal(outgoing.orphans.includes('graph-orphan.md'), true)
    assert.equal(outgoing.complete, true)

    await writeFile(join(vault, 'graph-long.md'), `# Long\n[[${'m'.repeat(300)}]]\n`)
    const boundedStrings = await graph.execute({ path: 'graph-long.md', direction: 'outgoing' }, { signal })
    assert.equal(boundedStrings.missing.every(record => (
      record.authoredTarget.length <= 240
      && record.displayText.length <= 240
      && record.normalizedTarget.length <= 240
    )), true)
    assert.equal(boundedStrings.complete, false)

    const backlinks = await graph.execute({ path: 'graph-root.md', direction: 'backlinks' }, { signal })
    assert.deepEqual(backlinks.nodes.map(node => node.path), [
      'graph-root.md',
      'graph-a.md',
      'graph-incoming.md',
    ])

    const tagged = await graph.execute({
      path: 'graph-root.md',
      depth: 3,
      direction: 'both',
      tag: 'graph',
    }, { signal })
    assert.equal(tagged.nodes.some(node => node.path === 'graph-b.md'), false)
    assert.equal(new Set(tagged.nodes.map(node => node.path)).size, tagged.nodes.length)

    const capped = await graph.execute({ path: 'graph-root.md', depth: 3, limit: 2 }, { signal })
    assert.equal(capped.nodes.length <= 2, true)
    assert.equal(capped.complete, false)
    assert.equal(capped.truncationReason, 'result-limit')

    const partial = await (await loadTools(vault, { maxSearchEntries: 1 })).get('vault_graph')
      .execute({ path: 'graph-root.md' }, { signal })
    assert.equal(partial.complete, false)
    assert.equal(partial.truncated, true)
    assert.equal(partial.truncationReason, 'entry-limit')
  })
})

async function withGlobalGraphVault(run, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tockbot-note-vault-'))
  const vault = join(root, 'vault')
  await mkdir(vault, { recursive: true })
  await writeFile(join(vault, 'a.md'), '# A\nLinks to [[b]] and ![[pic.png]] and [[missing-global]].\n#shared\n')
  await writeFile(join(vault, 'b.md'), '# B\nNo links.\n')
  await writeFile(join(vault, 'c.md'), '# C\nPoints at [[a]].\n')
  await writeFile(join(vault, 'orphan.md'), '# Orphan\nNothing linked.\n#shared\n')
  await writeFile(join(vault, 'pic.png'), Buffer.from('fake png'))
  try {
    await run(await loadTools(vault, overrides))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('exports a bounded global graph with cursor-paged combined streams', async () => {
  await withGlobalGraphVault(async tools => {
    const signal = new AbortController().signal
    const pages = []
    let cursor
    do {
      const page = await tools.get('vault_graph').execute(
        { scope: 'global', limit: 2, ...(cursor ? { cursor } : {}) },
        { signal },
      )
      assert.equal(page.path, null)
      pages.push(page)
      cursor = page.cursor
    } while (cursor)
    assert.ok(pages.length > 1, 'global graph pages')
    for (const page of pages.slice(0, -1)) assert.equal(page.complete, false)
    assert.equal(pages.at(-1).complete, true)
    assert.equal(pages.at(-1).cursor, null)

    const nodes = pages.flatMap(page => page.nodes)
    assert.deepEqual(nodes, ['a.md', 'b.md', 'c.md', 'orphan.md'].map(path => ({ path, depth: null })))
    const edges = pages.flatMap(page => page.edges)
    assert.deepEqual(edges, [
      { sourcePath: 'a.md', targetPath: 'b.md', kind: 'wiki', line: 2, fragment: null },
      { sourcePath: 'c.md', targetPath: 'a.md', kind: 'wiki', line: 2, fragment: null },
    ])
    const missing = pages.flatMap(page => page.missing)
    assert.deepEqual(missing.map(record => [record.sourcePath, record.normalizedTarget, record.status]), [
      ['a.md', 'missing-global', 'unresolved'],
      ['a.md', 'pic.png', 'unresolved'],
    ])
    assert.deepEqual(pages.flatMap(page => page.orphans), ['orphan.md'])

    const enriched = await tools.get('vault_graph').execute(
      { scope: 'global', includeTags: true, includeAttachments: true },
      { signal },
    )
    assert.equal(enriched.complete, true)
    assert.deepEqual(enriched.nodes, [
      'a.md', 'b.md', 'c.md', 'orphan.md', 'pic.png', 'tag:shared',
    ].map(path => ({ path, depth: null })))
    assert.deepEqual(enriched.edges, [
      { sourcePath: 'a.md', targetPath: 'b.md', kind: 'wiki', line: 2, fragment: null },
      { sourcePath: 'a.md', targetPath: 'pic.png', kind: 'embed', line: 2, fragment: null },
      { sourcePath: 'a.md', targetPath: 'tag:shared', kind: 'tag', line: 1, fragment: null },
      { sourcePath: 'c.md', targetPath: 'a.md', kind: 'wiki', line: 2, fragment: null },
      { sourcePath: 'orphan.md', targetPath: 'tag:shared', kind: 'tag', line: 1, fragment: null },
    ])
    assert.deepEqual(enriched.missing.map(record => record.normalizedTarget), ['missing-global'])
    assert.deepEqual(enriched.orphans, ['orphan.md'])

    const local = await tools.get('vault_graph').execute({ path: 'a.md' }, { signal })
    assert.equal(local.path, 'a.md')
    assert.equal('cursor' in local, false)
    assert.ok(local.nodes.every(node => typeof node.depth === 'number'))

    await assert.rejects(
      () => tools.get('vault_graph').execute({ scope: 'global', path: 'a.md' }, { signal }),
      /global scope does not accept/,
    )
    await assert.rejects(
      () => tools.get('vault_graph').execute({ scope: 'global', depth: 2 }, { signal }),
      /global scope does not accept/,
    )
    await assert.rejects(
      () => tools.get('vault_graph').execute({}, { signal }),
      /local scope requires a path/,
    )
    await assert.rejects(
      () => tools.get('vault_graph').execute({ path: 'a.md', cursor: pages[0].cursor }, { signal }),
      /global scope/,
    )
    await assert.rejects(
      () => tools.get('vault_graph').execute({
        scope: 'global',
        includeTags: true,
        cursor: pages[0].cursor,
      }, { signal }),
      /cursor does not match this operation/,
    )
  })
})

test('reports incomplete global graph source scans honestly', async () => {
  await withGlobalGraphVault(async tools => {
    const signal = new AbortController().signal
    let cursor
    let final
    let pages = 0
    do {
      final = await tools.get('vault_graph').execute(
        { scope: 'global', ...(cursor ? { cursor } : {}) },
        { signal },
      )
      assert.equal(final.complete, false)
      cursor = final.cursor
      pages += 1
      assert.ok(pages < 20, 'global source continuation terminates')
    } while (cursor)
    assert.ok(pages > 1, 'source scan continued')
    assert.equal(final.truncated, true)
    assert.equal(final.truncationReason, 'byte-limit')
    assert.equal(final.cursor, null)
  }, { maxSearchBytes: 80 })
})

test('returns deterministic paged structured Canvas nodes and edges', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'structured.canvas'), `${JSON.stringify({
      metadata: { id: 'edge' },
      nodes: [
        { meta: { id: 'text' }, id: 'text', type: 'text', text: 'Canvas canary b47e1', x: 1, y: 2, width: 20, height: 10 },
        { id: 'group', type: 'group', label: 'Planning', x: 3, y: 4, width: 300, height: 200 },
        { id: 'file', type: 'file', file: 'projects/alpha.md' },
        { id: 'unsafe-file', type: 'file', file: '../outside.md' },
        { id: 'link', type: 'link', url: 'https://example.invalid/inert' },
        { id: 'credential', type: 'link', url: `https://user:secret@example.invalid/${'x'.repeat(1_200)}` },
        { id: 'protocol-credential', type: 'link', url: '//user:secret@example.invalid/private' },
      ],
      edges: [
        { id: 'edge', fromNode: 'text', toNode: 'group', label: 'supports', color: '2' },
        { id: 'invalid-edge', fromNode: 'text', toNode: 'missing' },
      ],
    }, null, 2)}\n`)
    await writeFile(join(vault, 'duplicate.canvas'), JSON.stringify({
      nodes: [{ id: 'same' }, { id: 'same' }],
      edges: [],
    }))
    await writeFile(join(vault, 'broken.canvas'), '{not json')
    const canvas = (await loadTools(vault, { maxReadBytes: 4 * 1024, maxSearchResults: 2 })).get('vault_canvas')
    const signal = new AbortController().signal
    const items = []
    let cursor
    do {
      const page = await canvas.execute({ path: 'structured.canvas', limit: 2, cursor }, { signal })
      items.push(...page.items)
      cursor = page.cursor ?? undefined
    } while (cursor)

    assert.deepEqual(items.map(item => `${item.kind}:${item.id}`), [
      'node:text',
      'node:group',
      'node:file',
      'node:unsafe-file',
      'node:link',
      'node:credential',
      'node:protocol-credential',
      'edge:edge',
    ])
    const text = items.find(item => item.id === 'text')
    assert.equal(text.text, 'Canvas canary b47e1')
    const canvasSource = await readFile(join(vault, 'structured.canvas'), 'utf8')
    const textObjectStart = canvasSource.lastIndexOf('{', canvasSource.indexOf('"meta"'))
    assert.equal(text.line, canvasSource.slice(0, textObjectStart).split('\n').length)
    assert.equal(text.width, 80)
    assert.equal(text.height, 48)
    assert.equal(text.line > 0, true)
    assert.equal(items.find(item => item.id === 'file').file, 'projects/alpha.md')
    assert.equal(items.find(item => item.id === 'unsafe-file').file, null)
    assert.equal(items.find(item => item.id === 'link').url, 'https://example.invalid/inert')
    assert.equal(items.find(item => item.id === 'credential').url, null)
    assert.equal(items.find(item => item.id === 'protocol-credential').url, null)
    const edge = items.find(item => item.id === 'edge')
    assert.equal(edge.toNode, 'group')
    assert.equal(edge.line > text.line, true)
    assert.equal(new Set(items.map(item => item.id)).size, items.length)

    await assert.rejects(canvas.execute({ path: 'duplicate.canvas' }, { signal }), /duplicate Canvas item ID/)
    await assert.rejects(canvas.execute({ path: 'broken.canvas' }, { signal }), /valid JSON/)
    await assert.rejects(canvas.execute({ path: 'catalog.md' }, { signal }), /Canvas files only/)
  })
})

test('returns additive bounded vault tag and property facets', async () => {
  await withVault(async vault => {
    await mkdir(join(vault, 'facets'))
    await writeFile(join(vault, 'facets', 'a.md'), [
      '---',
      'tags: [Project/Alpha, shared]',
      'status: active',
      'score: 2',
      'published: true',
      'due: 2026-08-22',
      'at: 2026-08-22T10:15:30Z',
      'reviewers: [Ada, Lin]',
      'empty:',
      '---',
      '# A #shared',
      '',
    ].join('\n'))
    await writeFile(join(vault, 'facets', 'b.md'), [
      '---',
      'tags: [project/alpha, shared]',
      'status: 42',
      '---',
      '# B',
      '',
    ].join('\n'))
    const signal = new AbortController().signal
    const facets = (await loadTools(vault, {
      maxSearchBytes: 16 * 1024,
      maxSearchFileBytes: 4 * 1024,
      maxSearchResults: 20,
    })).get('vault_facets')
    const result = await facets.execute({ directory: 'facets' }, { signal })

    assert.deepEqual(result.tags.slice(0, 2), [
      { tag: 'project/alpha', count: 2 },
      { tag: 'shared', count: 2 },
    ])
    assert.deepEqual(result.properties.find(item => item.key === 'status'), {
      key: 'status',
      count: 2,
      types: ['number', 'string'],
    })
    assert.deepEqual(result.properties.find(item => item.key === 'reviewers').types, ['list'])
    assert.deepEqual(result.properties.find(item => item.key === 'empty').types, ['null'])
    assert.deepEqual(result.properties.find(item => item.key === 'due').types, ['date'])
    assert.deepEqual(result.properties.find(item => item.key === 'at').types, ['datetime'])
    assert.equal(result.complete, true)

    const paged = (await loadTools(vault, {
      maxSearchBytes: 16 * 1024,
      maxSearchEntries: 1,
      maxSearchFileBytes: 4 * 1024,
      maxSearchResults: 20,
    })).get('vault_facets')
    let cursor
    let sharedCount = 0
    do {
      const page = await paged.execute({ directory: 'facets', cursor }, { signal })
      sharedCount += page.tags.find(item => item.tag === 'shared')?.count ?? 0
      cursor = page.cursor ?? undefined
    } while (cursor)
    assert.equal(sharedCount, 2)

    await writeFile(join(vault, 'facets', 'oversized.md'), `---\n${`p${'x'.repeat(300)}`}: value\ntags: [${`t${'y'.repeat(300)}`}]\n---\n`)
    const boundedStrings = await facets.execute({ directory: 'facets' }, { signal })
    assert.equal(boundedStrings.tags.every(item => item.tag.length <= 240), true)
    assert.equal(boundedStrings.properties.every(item => item.key.length <= 240), true)
    assert.equal(boundedStrings.complete, false)

    const capped = await facets.execute({ directory: 'facets', limit: 1 }, { signal })
    assert.equal(capped.tags.length <= 1, true)
    assert.equal(capped.properties.length <= 1, true)
    assert.equal(capped.complete, false)
    assert.equal(capped.truncationReason, 'metadata-limit')
    await assert.rejects(
      facets.execute({ directory: '../' }, { signal }),
      /stay inside the configured vault/,
    )
  })
})

test('lists bounded rich metadata with deterministic recent ordering', async () => {
  await withAdvancedVault(async vault => {
    await writeFile(
      join(vault, 'overflow.md'),
      `---\n${Array.from({ length: 55 }, (_, index) => `property${String(index)}: value`).join('\n')}\n---\n# Overflow\n`,
    )
    const list = (await loadTools(vault, {
      maxSearchBytes: 16 * 1024,
      maxSearchFileBytes: 8 * 1024,
    })).get('vault_list')
    const signal = new AbortController().signal
    const result = await list.execute({ sort: 'recent' }, { signal })
    assert.equal(result.entries[0].path, 'advanced/query.md')
    const query = result.entries.find(entry => entry.path === 'advanced/query.md')
    assert.deepEqual(query.aliases, ['Shared Alias', 'Unique Query Alias'])
    assert.equal(query.tags.includes('planning/deep'), true)
    assert.equal(query.tags.includes('urgent'), true)
    assert.deepEqual(query.tasks, { done: 1, todo: 1, total: 2 })
    assert.deepEqual(query.properties.find(property => property.key === 'reviewers').values, ['Ada', 'Lin'])
    assert.equal(typeof query.createdMs, 'number')
    assert.equal(result.warnings.some(warning => warning.startsWith('overflow.md:')), true)

    const modifiedEntries = []
    let cursor
    do {
      const page = await list.execute({ sort: 'modified', limit: 3, cursor }, { signal })
      modifiedEntries.push(...page.entries)
      cursor = page.cursor ?? undefined
    } while (cursor)
    assert.equal(new Set(modifiedEntries.map(entry => entry.path)).size, modifiedEntries.length)
    assert.equal(modifiedEntries.every((entry, index) => (
      index === 0 || entry.modifiedMs <= modifiedEntries[index - 1].modifiedMs
    )), true)
  })
})

const DOCUMENT_STATS_FIXTURE = [
  '---',
  'title: Café',
  '---',
  '# Héllo world',
  "can't co-operate l’esprit 123",
  '## Second',
  '`code counts`',
  '',
].join('\r\n')

test('adds opt-in source document statistics to Markdown list entries', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, 'stats.md'), DOCUMENT_STATS_FIXTURE)
    await writeFile(join(vault, 'empty.md'), '')
    await writeFile(join(vault, 'image.png'), Buffer.from('fake png'))
    const tools = await loadTools(vault)
    const signal = new AbortController().signal

    const plain = await tools.get('vault_list').execute({}, { signal })
    assert.ok(plain.entries.every(entry => !('stats' in entry)))

    const entries = []
    let cursor
    let firstCursor
    do {
      const page = await tools.get('vault_list').execute({
        kind: 'all',
        includeStats: true,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      }, { signal })
      firstCursor ??= page.cursor
      entries.push(...page.entries)
      cursor = page.cursor
    } while (cursor)

    assert.deepEqual(entries.find(entry => entry.path === 'stats.md').stats, {
      words: 11,
      characters: DOCUMENT_STATS_FIXTURE.length,
      headings: 2,
      readingMinutes: 1,
    })
    assert.deepEqual(entries.find(entry => entry.path === 'empty.md').stats, {
      words: 0,
      characters: 0,
      headings: 0,
      readingMinutes: 1,
    })
    for (const entry of entries.filter(entry => entry.type !== 'markdown')) {
      assert.equal('stats' in entry, false)
    }
    await assert.rejects(
      () => tools.get('vault_list').execute(
        { kind: 'all', cursor: firstCursor, limit: 2 },
        { signal },
      ),
      /cursor does not match this operation/,
    )
  })
})

test('lists note metadata and frontmatter tags', async () => {
  await withVault(async vault => {
    const list = (await loadTools(vault)).get('vault_list')
    const signal = new AbortController().signal
    const result = await list.execute({}, { signal })

    assert.deepEqual(result.entries.map(({
      aliases: _aliases,
      createdMs: _created,
      modifiedMs,
      properties: _properties,
      size,
      tasks: _tasks,
      ...entry
    }) => entry), [
      { path: 'board.canvas', title: 'board', type: 'canvas', tags: [] },
      { path: 'catalog.md', title: 'Product Roadmap', type: 'markdown', tags: ['planning', 'urgent'] },
      { path: 'projects/alpha.md', title: 'Alpha', type: 'markdown', tags: [] },
      { path: 'second.markdown', title: 'Second', type: 'markdown', tags: [] },
    ])
    assert.equal(result.entries.every(entry => Number.isFinite(entry.modifiedMs) && entry.size > 0), true)
    assert.equal(result.truncated, false)

    const focusedList = (await loadTools(vault, { maxSearchEntries: 1 })).get('vault_list')
    const nested = await focusedList.execute({ directory: 'projects' }, { signal })
    assert.deepEqual(nested.entries.map(entry => entry.path), ['projects/alpha.md'])
    assert.equal(nested.truncated, false)
    await assert.rejects(
      list.execute({ directory: '../' }, { signal }),
      /stay inside the configured vault/,
    )
    await assert.rejects(
      list.execute({ directory: '/tmp' }, { signal }),
      /stay inside the configured vault/,
    )
  })
})

test('reads, lists, and searches inert Base files within existing bounds', async () => {
  await withAdvancedVault(async vault => {
    const outside = join(vault, '..', 'outside.base')
    await writeFile(outside, 'outside Base secret')
    await symlink(outside, join(vault, 'escape.base'))
    const tools = await loadTools(vault, { maxSearchBytes: 16 * 1024 })
    const signal = new AbortController().signal

    const base = await tools.get('vault_read').execute({ path: 'query.base' }, { signal })
    assert.match(base.content, /Raw Canary 7b2e816c/)
    assert.match(base.content, /https:\/\/example\.invalid\/never-fetch/)
    const malformed = await tools.get('vault_read').execute({ path: 'malformed.base' }, { signal })
    assert.match(malformed.content, /Base Canary d02c71ef/)

    const listed = await tools.get('vault_list').execute({}, { signal })
    assert.equal(listed.entries.find(entry => entry.path === 'query.base').type, 'base')
    const literal = await tools.get('vault_search').execute({ query: 'Raw Canary' }, { signal })
    assert.equal(literal.matches.some(match => match.path === 'query.base' && match.kind === 'base'), true)
    const query = await tools.get('vault_search').execute(
      { mode: 'query', query: 'content:"status =="' },
      { signal },
    )
    assert.equal(query.matches.some(match => match.path === 'query.base' && match.kind === 'base'), true)

    await assert.rejects(
      tools.get('vault_read').execute({ path: 'escape.base' }, { signal }),
      /symbolic links are not allowed/,
    )
    await assert.rejects(
      (await loadTools(vault, { maxReadBytes: 8 })).get('vault_read').execute(
        { path: 'query.base' },
        { signal },
      ),
      /configured 8-byte limit/,
    )
  })
})

test('keeps hidden vault entries counted but inaccessible', async () => {
  await withVault(async vault => {
    await writeFile(join(vault, '.secret.md'), '---\ntags: [hidden-canary]\n---\n# Secret\n')
    await writeFile(join(vault, '.secret.canvas'), JSON.stringify({ nodes: [{ id: 'hidden' }], edges: [] }))
    await mkdir(join(vault, '.hidden'))
    await writeFile(join(vault, '.hidden', 'nested.md'), '# Nested secret')
    const tools = await loadTools(vault, { maxSearchBytes: 16 * 1024, maxSearchFileBytes: 4 * 1024 })
    const signal = new AbortController().signal

    const listed = await tools.get('vault_list').execute({}, { signal })
    assert.equal(listed.entries.some(entry => entry.path.includes('.secret')), false)
    assert.equal(listed.scan.entries >= listed.entries.length + 3, true)
    const facets = await tools.get('vault_facets').execute({}, { signal })
    assert.equal(facets.tags.some(item => item.tag === 'hidden-canary'), false)
    const graph = await tools.get('vault_graph').execute({ path: 'catalog.md' }, { signal })
    assert.equal(graph.orphans.some(item => item.includes('.secret')), false)

    await assert.rejects(
      tools.get('vault_canvas').execute({ path: '.secret.canvas' }, { signal }),
      /Hidden vault paths are not allowed/,
    )
    await assert.rejects(
      tools.get('vault_facets').execute({ directory: '.hidden' }, { signal }),
      /Hidden vault paths are not allowed/,
    )
  })
})

test('rejects traversal and symlinks that escape the vault', async () => {
  await withVault(async vault => {
    const outsideDirectory = join(vault, '..', 'outside-directory')
    await mkdir(outsideDirectory)
    await writeFile(join(outsideDirectory, 'note.md'), '# Outside')
    await symlink(outsideDirectory, join(vault, 'linked-directory'))
    const tools = await loadTools(vault)
    const read = tools.get('vault_read')
    await assert.rejects(
      read.execute({ path: '../outside.md' }, { signal: new AbortController().signal }),
      /stay inside the configured vault/,
    )
    await assert.rejects(
      read.execute({ path: 'escape.md' }, { signal: new AbortController().signal }),
      /symbolic links are not allowed/,
    )
    await assert.rejects(
      read.execute({ path: 'disguised.md' }, { signal: new AbortController().signal }),
      /symbolic links are not allowed/,
    )
    await assert.rejects(
      tools.get('vault_list').execute(
        { directory: 'linked-directory' },
        { signal: new AbortController().signal },
      ),
      /symbolic links are not allowed/,
    )

    const search = await tools.get('vault_search').execute(
      { query: 'outside secret' },
      { signal: new AbortController().signal },
    )
    assert.deepEqual(search.matches, [])
  })
})

test('validates configuration and supplies bounded defaults', async () => {
  assert.deepEqual(await Config['~standard'].validate({}), {
    issues: [{ message: '$.root missing required value', path: ['root'] }],
  })
  assert.deepEqual(await Config['~standard'].validate({ root: '/vault' }), {
    value: {
      root: '/vault',
      maxReadBytes: 256 * 1024,
      maxSearchBytes: 64 * 1024 * 1024,
      maxSearchEntries: 20_000,
      maxSearchFileBytes: 2 * 1024 * 1024,
      maxSearchResults: 50,
    },
  })
})

test('honors cancellation before vault traversal', async () => {
  await withVault(async vault => {
    const search = (await loadTools(vault)).get('vault_search')
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      search.execute({ query: 'needle' }, { signal: controller.signal }),
      error => error?.name === 'AbortError',
    )
  })
})

test('enforces configured read and search bounds', async () => {
  await withVault(async vault => {
    const tools = await loadTools(vault, { maxReadBytes: 8, maxSearchResults: 1 })
    await assert.rejects(
      tools.get('vault_read').execute(
        { path: 'projects/alpha.md' },
        { signal: new AbortController().signal },
      ),
      /exceeds the configured 8-byte limit/,
    )
    const search = await tools.get('vault_search').execute(
      { query: 'needle' },
      { signal: new AbortController().signal },
    )
    assert.equal(search.matches.length, 1)
    assert.equal(search.truncated, true)

    const byteBounded = await (await loadTools(vault, { maxSearchBytes: 8 }))
      .get('vault_search')
      .execute({ query: 'absent' }, { signal: new AbortController().signal })
    assert.deepEqual(withoutScanMetadata(byteBounded), { matches: [], query: 'absent', truncated: true })

    const fileBounded = await loadTools(vault, { maxSearchFileBytes: 8 })
    assert.equal((await fileBounded.get('vault_search').execute(
      { query: 'absent' },
      { signal: new AbortController().signal },
    )).truncated, true)
    assert.equal((await fileBounded.get('vault_list').execute(
      {},
      { signal: new AbortController().signal },
    )).truncated, true)
    assert.equal((await fileBounded.get('vault_links').execute(
      { path: 'catalog.md' },
      { signal: new AbortController().signal },
    )).truncated, true)
  })
})
