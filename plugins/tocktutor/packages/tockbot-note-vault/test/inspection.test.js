import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import { createVaultInspection } from 'tockbot-note-vault/inspection'

const documents = new Map([
  ['notes/alpha.md', '# Alpha\nSee [[beta]] and ![[image.png]]. #project\n'],
  ['beta.md', '# Beta\nNeedle canary.\n'],
  ['board.canvas', JSON.stringify({
    nodes: [{ id: 'text', type: 'text', text: 'Canvas needle' }],
    edges: [],
  })],
  ['query.base', 'filters:\n  - inert needle\n'],
])

function memoryInput({
  includeInvalid = false,
  sourceTruncated = false,
  warning = 'provider inventory was truncated',
} = {}) {
  const readPaths = []
  const inventory = [
    ...[...documents].map(([path, content]) => ({
      path,
      kind: 'document',
      createdMs: 10,
      modifiedMs: 20,
      size: Buffer.byteLength(content),
      revision: `revision:${path}`,
    })),
    {
      path: 'image.png',
      kind: 'attachment',
      mediaKind: 'image',
      createdMs: 30,
      modifiedMs: 40,
      size: 4096,
    },
    ...(includeInvalid ? [
      {
        path: '.hidden.md',
        kind: 'document',
        createdMs: 10,
        modifiedMs: 20,
        size: 1,
      },
      {
        path: 'unsupported.txt',
        kind: 'document',
        createdMs: 10,
        modifiedMs: 20,
        size: 1,
      },
    ] : []),
  ].sort((left, right) => left.path.localeCompare(right.path))
  const cursors = new Map([[null, 0], ['page:b', 2], ['page:c', 4]])

  return {
    readPaths,
    input: {
      async list({ cursor = null, limit = 2 }, signal) {
        signal.throwIfAborted()
        const start = cursors.get(cursor)
        if (start == null) throw new Error('provider cursor changed')
        const end = Math.min(start + Math.min(limit, 2), inventory.length)
        const next = end < inventory.length
          ? end === 2 ? 'page:b' : end === 4 ? 'page:c' : `page:${String(end)}`
          : null
        if (next?.startsWith('page:') && !cursors.has(next)) cursors.set(next, end)
        return {
          entries: inventory.slice(start, end),
          cursor: next,
          complete: next === null && !sourceTruncated,
          truncated: next !== null || sourceTruncated,
          truncationReason: next !== null ? 'result-limit' : sourceTruncated ? 'entry-limit' : null,
          warnings: sourceTruncated && next === null ? [warning] : [],
        }
      },
      async read(path, maxBytes, signal) {
        signal.throwIfAborted()
        readPaths.push(path)
        const content = documents.get(path)
        if (content == null) throw new Error('provider refused document')
        if (Buffer.byteLength(content) > maxBytes) throw new Error('provider byte cap exceeded')
        return { path, content }
      },
    },
  }
}

const limits = {
  maxReadBytes: 1024,
  maxSearchBytes: 16 * 1024,
  maxSearchEntries: 100,
  maxSearchFileBytes: 1024,
  maxSearchResults: 20,
}

test('provider-input inspection reuses all eight read-only operations without a filesystem root', async () => {
  const provider = memoryInput()
  const inspection = createVaultInspection(provider.input, limits)
  const signal = new AbortController().signal

  const search = await inspection.search({ query: 'needle' }, signal)
  assert.deepEqual(search.matches.map(match => match.path), ['beta.md', 'board.canvas', 'query.base'])
  assert.equal(search.scan.files, 4)

  assert.deepEqual(await inspection.read({ path: 'notes/alpha.md' }, signal), {
    path: 'notes/alpha.md',
    content: documents.get('notes/alpha.md'),
  })

  const listed = await inspection.list({ kind: 'all' }, signal)
  assert.deepEqual(listed.entries.map(entry => entry.path), [
    'beta.md',
    'board.canvas',
    'image.png',
    'notes/alpha.md',
    'query.base',
  ])
  assert.equal(listed.entries.find(entry => entry.path === 'image.png')?.mediaKind, 'image')

  const links = await inspection.links({ path: 'notes/alpha.md' }, signal)
  assert.deepEqual(links.outgoing, ['beta.md'])

  const outline = await inspection.outline({ path: 'notes/alpha.md' }, signal)
  assert.deepEqual(outline.headings.map(heading => heading.text), ['Alpha'])

  const graph = await inspection.graph({
    scope: 'global',
    includeAttachments: true,
  }, signal)
  assert.equal(graph.nodes.some(node => node.path === 'image.png'), true)

  const canvas = await inspection.canvas({ path: 'board.canvas' }, signal)
  assert.deepEqual(canvas.items.map(item => item.id), ['text'])

  const facets = await inspection.facets({}, signal)
  assert.deepEqual(facets.tags, [{ count: 1, tag: 'project' }])

  assert.equal(provider.readPaths.includes('image.png'), false, 'attachment bytes must stay unopened')
  assert.equal(provider.readPaths.includes('.hidden.md'), false)
  assert.equal(provider.readPaths.includes('unsupported.txt'), false)
})

test('plans pure span-aware file rewrites with post-move paths and pre-move revisions', async () => {
  const contents = new Map([
    ['Plan.md', [
      '# Plan',
      'Back [Home](./index.md).',
      '![diagram](./Plan-md-images/diagram%201.png)',
      '```md',
      '[Hidden](./index.md)',
      '```',
      '',
    ].join('\n')],
    ['foo(bar).md', '# Parentheses\n'],
    ['index.md', [
      'See [Plan](./Plan.md#Overview).',
      '[plan-ref]: <./Plan.md> "Plan title"',
      'See [Parentheses](./foo(bar).md).',
      '',
    ].join('\n')],
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 2,
    size: Buffer.byteLength(content),
    revision: `before:${path}`,
  })).sort((left, right) => left.path.localeCompare(right.path))
  const input = {
    async list(_request, signal) {
      signal.throwIfAborted()
      return {
        entries,
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path, _maxBytes, signal) {
      signal.throwIfAborted()
      return { path, content: contents.get(path) }
    },
  }
  const before = new Map(contents)
  const plan = await createVaultInspection(input, limits).planPathRewrite({
    oldPath: 'Plan.md',
    newPath: 'Projects/Plan.md',
    isDirectory: false,
  }, new AbortController().signal)

  assert.equal(plan.complete, true)
  assert.equal(plan.cursor, null)
  assert.equal(plan.truncated, false)
  assert.deepEqual(plan.updates.map(update => [update.path, update.revision]), [
    ['index.md', 'before:index.md'],
    ['Projects/Plan.md', 'before:Plan.md'],
  ])
  assert.equal(plan.updates[0].newContent, [
    'See [Plan](./Projects/Plan.md#Overview).',
    '[plan-ref]: <./Projects/Plan.md> "Plan title"',
    'See [Parentheses](./foo(bar).md).',
    '',
  ].join('\n'))
  assert.equal(plan.updates[1].newContent, [
    '# Plan',
    'Back [Home](../index.md).',
    '![diagram](./Plan-md-images/diagram%201.png)',
    '```md',
    '[Hidden](./index.md)',
    '```',
    '',
  ].join('\n'))
  assert.deepEqual(contents, before)
})

test('keeps Tockbot sidecar naming for Markdown and .markdown referrers', async () => {
  const content = '![asset](./Draft.markdown-md-images/asset%201.png)\n'
  const entries = [{
    path: 'Draft.markdown',
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
    revision: 'rev:draft',
  }]
  const inspection = createVaultInspection({
    async list() {
      return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
    },
    async read(path) { return { path, content } },
  }, limits)
  const result = await inspection.planPathRewrite({
    oldPath: 'Draft.markdown',
    newPath: 'Archive/Roadmap.markdown',
    isDirectory: false,
  })
  assert.deepEqual(result.updates, [{
    path: 'Archive/Roadmap.markdown',
    newContent: '![asset](./Roadmap.markdown-md-images/asset%201.png)\n',
    revision: 'rev:draft',
  }])
})

test('plans folder referrer moves while preserving unchanged and non-parsing links', async () => {
  const contents = new Map([
    ['docs/guide.md', [
      'Back [Home](../index.md).',
      'Next [Intro](./intro.md).',
      'External [Site](https://example.com/docs).',
      'Anchor [Here](#part).',
      '',
    ].join('\n')],
    ['docs/intro.md', '# Intro\n'],
    ['index.md', 'Open [Guide](./docs/guide.md).\n'],
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
    revision: `rev:${path}`,
  })).sort((left, right) => left.path.localeCompare(right.path))
  const inspection = createVaultInspection({
    async list() {
      return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
    },
    async read(path) { return { path, content: contents.get(path) } },
  }, limits)
  const result = await inspection.planPathRewrite({
    oldPath: 'docs',
    newPath: 'manual/docs',
    isDirectory: true,
  })

  assert.deepEqual(result.updates.map(update => update.path), ['manual/docs/guide.md', 'index.md'])
  assert.equal(result.updates[0].newContent, [
    'Back [Home](../../index.md).',
    'Next [Intro](./intro.md).',
    'External [Site](https://example.com/docs).',
    'Anchor [Here](#part).',
    '',
  ].join('\n'))
  assert.equal(result.updates[1].newContent, 'Open [Guide](./manual/docs/guide.md).\n')
  assert.equal(result.complete, true)
})

test('preserves reference containers, multiline titles, and indented code spans', async () => {
  const content = [
    '> [quoted]: ./Plan.md',
    '[guide]: ./Guide.md "Guide title',
    '[inside]: ./Plan.md',
    'continued"',
    '[target]: ./Plan.md',
    '',
    '    [indented](./Plan.md)',
    '',
    '<custom-panel>',
    '[html hidden](./Plan.md)',
    '</custom-panel>',
    '[visible](./Plan.md)',
    'Text <span>[inline hidden](./Plan.md)</span> [outside](./Plan.md)',
    '<div data-x=">"><div></div>',
    '[nested hidden](./Plan.md)',
    '</div> [trailing](./Plan.md)',
    'Text <span>',
    '[multiline inline hidden](./Plan.md)',
    '</span> [after multiline](./Plan.md)',
    '<https://example.com>',
    '[after autolink](./Plan.md)',
    '<span data-link="[attribute hidden](./Plan.md)">open',
    '[after unmatched inline](./Plan.md)',
    '<div>'.repeat(65),
    '</div>'.repeat(64),
    '[depth hidden](./Plan.md)',
    '</div> [after depth](./Plan.md)',
    '',
  ].join('\r\n')
  const entries = [{
    path: 'index.md',
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
    revision: 'rev:index',
  }]
  const inspection = createVaultInspection({
    async list() {
      return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
    },
    async read(path) { return { path, content } },
  }, { ...limits, maxReadBytes: 4096, maxSearchFileBytes: 4096 })
  const result = await inspection.planPathRewrite({
    oldPath: 'Plan.md',
    newPath: 'Projects/Plan.md',
    isDirectory: false,
  })
  assert.equal(result.updates[0].newContent, [
    '> [quoted]: ./Projects/Plan.md',
    '[guide]: ./Guide.md "Guide title',
    '[inside]: ./Plan.md',
    'continued"',
    '[target]: ./Projects/Plan.md',
    '',
    '    [indented](./Plan.md)',
    '',
    '<custom-panel>',
    '[html hidden](./Plan.md)',
    '</custom-panel>',
    '[visible](./Projects/Plan.md)',
    'Text <span>[inline hidden](./Plan.md)</span> [outside](./Projects/Plan.md)',
    '<div data-x=">"><div></div>',
    '[nested hidden](./Plan.md)',
    '</div> [trailing](./Projects/Plan.md)',
    'Text <span>',
    '[multiline inline hidden](./Plan.md)',
    '</span> [after multiline](./Projects/Plan.md)',
    '<https://example.com>',
    '[after autolink](./Projects/Plan.md)',
    '<span data-link="[attribute hidden](./Plan.md)">open',
    '[after unmatched inline](./Projects/Plan.md)',
    '<div>'.repeat(65),
    '</div>'.repeat(64),
    '[depth hidden](./Plan.md)',
    '</div> [after depth](./Projects/Plan.md)',
    '',
  ].join('\r\n'))
})

test('rewrite pages bind the full source fingerprint before resuming', async () => {
  const contents = new Map([
    ['a.md', '[Target](./Target.md)\n'],
    ['b.md', '[Target](./Target.md)\n'],
    ['c.md', '[Target](./Target.md)\n'],
    ['Target.md', '# Target\n'],
  ])
  const revisions = new Map([...contents].map(([path]) => [path, `rev:${path}`]))
  const input = {
    async list() {
      const entries = [...contents].map(([path, content]) => ({
        path,
        kind: 'document',
        createdMs: 1,
        modifiedMs: 1,
        size: Buffer.byteLength(content),
        revision: revisions.get(path),
      })).sort((left, right) => left.path.localeCompare(right.path))
      return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
    },
    async read(path) { return { path, content: contents.get(path) } },
  }
  const inspection = createVaultInspection(input, { ...limits, maxSearchResults: 1 })
  const args = { oldPath: 'Target.md', newPath: 'Archive/Target.md', isDirectory: false }
  const first = await inspection.planPathRewrite(args)
  assert.deepEqual(first.updates.map(update => update.path), ['a.md'])
  assert.equal(first.complete, false)
  assert.equal(first.truncated, true)
  assert.equal(first.truncationReason, 'result-limit')
  assert.equal(typeof first.cursor, 'string')

  revisions.set('b.md', 'rev:b.md:changed')
  await assert.rejects(
    inspection.planPathRewrite({ ...args, cursor: first.cursor }),
    /source changed during pagination/u,
  )
  revisions.set('b.md', 'rev:b.md')
  contents.set('b.md', '[Target](./Target.md)\nconcurrent\n')
  await assert.rejects(
    inspection.planPathRewrite({ ...args, cursor: first.cursor }),
    /source changed during pagination/u,
  )
  contents.set('b.md', '[Target](./Target.md)\n')

  const second = await inspection.planPathRewrite({ ...args, cursor: first.cursor })
  const third = await inspection.planPathRewrite({ ...args, cursor: second.cursor })
  assert.deepEqual(second.updates.map(update => update.path), ['b.md'])
  assert.deepEqual(third.updates.map(update => update.path), ['c.md'])
  assert.equal(third.complete, true)
  assert.equal(third.cursor, null)
  assert.equal(third.truncated, false)
})

test('rewrite planning fails closed on validation, revisions, output bytes, work, and cancellation', async () => {
  let listCalls = 0
  const neverInput = {
    async list() { listCalls += 1; throw new Error('must not list') },
    async read() { throw new Error('must not read') },
  }
  const neverInspection = createVaultInspection(neverInput, limits)
  for (const args of [
    { oldPath: '../old', newPath: 'new.md', isDirectory: false },
    { oldPath: 'same.md', newPath: 'same.md', isDirectory: false },
    { oldPath: 'docs', newPath: 'docs/archive', isDirectory: true },
  ]) await assert.rejects(neverInspection.planPathRewrite(args))
  assert.equal(listCalls, 0)

  let warningReads = 0
  const warningContent = '[T](./Target.md)\n'
  const warningInspection = createVaultInspection({
    async list() {
      return {
        entries: [{
          path: 'source.md',
          kind: 'document',
          createdMs: 1,
          modifiedMs: 1,
          size: Buffer.byteLength(warningContent),
          revision: 'rev:source',
        }],
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: ['unsafe.md: could not be inspected safely'],
      }
    },
    async read(path) { warningReads += 1; return { path, content: warningContent } },
  }, limits)
  const warned = await warningInspection.planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'Archive/Target.md',
    isDirectory: false,
  })
  assert.deepEqual(warned.updates, [])
  assert.equal(warned.complete, false)
  assert.equal(warned.truncationReason, 'file-limit')
  assert.equal(warningReads, 0)

  const makeInspection = (content, revision, configuredLimits = limits) => {
    const entries = [{
      path: 'source.md',
      kind: 'document',
      createdMs: 1,
      modifiedMs: 1,
      size: Buffer.byteLength(content),
      ...(revision === undefined ? {} : { revision }),
    }]
    return createVaultInspection({
      async list(_request, signal) {
        signal.throwIfAborted()
        return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
      },
      async read(path, _maxBytes, signal) {
        signal.throwIfAborted()
        return { path, content }
      },
    }, configuredLimits)
  }
  const missingRevision = await makeInspection('[T](./Target.md)\n').planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'Archive/Target.md',
    isDirectory: false,
  })
  assert.equal(missingRevision.updates.length, 1)
  assert.equal('revision' in missingRevision.updates[0], false)
  assert.equal(missingRevision.complete, false)
  assert.equal(missingRevision.truncationReason, 'metadata-limit')
  assert.equal(missingRevision.warnings.some(warning => warning.includes('no source revision')), true)

  const growing = '[T](./Target.md)\n'
  const byteLimited = await makeInspection(growing, 'rev:source', {
    ...limits,
    maxSearchBytes: Buffer.byteLength(growing),
  }).planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'A-Very-Long-Archive-Path/Target.md',
    isDirectory: false,
  })
  assert.deepEqual(byteLimited.updates, [])
  assert.equal(byteLimited.complete, false)
  assert.equal(byteLimited.truncationReason, 'byte-limit')

  const adversarial = `${Array.from({ length: 10_001 }, () => '[T](./Target.md)').join(' ')}\n`
  const largeLimits = {
    ...limits,
    maxSearchBytes: 1024 * 1024,
    maxSearchFileBytes: 512 * 1024,
  }
  const boundedInspection = makeInspection(adversarial, 'rev:source', largeLimits)
  const bounded = await boundedInspection.planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'Archive/Target.md',
    isDirectory: false,
  })
  assert.deepEqual(bounded.updates, [])
  assert.equal(bounded.cursor, null)
  assert.equal(bounded.complete, false)
  assert.equal(bounded.truncationReason, 'result-limit')
  assert.equal(bounded.warnings.some(warning => warning.includes('10000 link destinations')), true)

  let parserChecks = 0
  const abortSignal = {
    throwIfAborted() {
      if (new Error().stack.includes('scanInlineLinkSpans')) {
        parserChecks += 1
        if (parserChecks > 50) throw new DOMException('cancel rewrite', 'AbortError')
      }
    },
  }
  await assert.rejects(
    boundedInspection.planPathRewrite({
      oldPath: 'Target.md',
      newPath: 'Archive/Target.md',
      isDirectory: false,
    }, abortSignal),
    error => error?.name === 'AbortError',
  )

  const manyUnclosedTags = `${Array.from(
    { length: 10_000 },
    (_, index) => `Text <span data-index="${String(index)}">`,
  ).join('\n')}\n[T](./Target.md)\n`
  const htmlInspection = makeInspection(manyUnclosedTags, 'rev:html', largeLimits)
  const htmlStarted = performance.now()
  const htmlResult = await htmlInspection.planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'Archive/Target.md',
    isDirectory: false,
  })
  assert.equal(performance.now() - htmlStarted < 250, true)
  assert.equal(htmlResult.updates.length, 1)

  const nestedBlock = `${'<div>\n'.repeat(20_000)}${'body\n'.repeat(20_000)}\n`
  const nestedInspection = makeInspection(nestedBlock, 'rev:nested', largeLimits)
  const nestedStarted = performance.now()
  const nestedResult = await nestedInspection.planPathRewrite({
    oldPath: 'Target.md',
    newPath: 'Archive/Target.md',
    isDirectory: false,
  })
  assert.equal(performance.now() - nestedStarted < 250, true)
  assert.deepEqual(nestedResult.updates, [])
  assert.equal(nestedResult.complete, true)

  let htmlChecks = 0
  const htmlAbortSignal = {
    throwIfAborted() {
      htmlChecks += 1
      if (
        htmlChecks % 1_000 === 0
        && new Error().stack.includes('scanHtmlTags')
      ) throw new DOMException('cancel HTML scan', 'AbortError')
    },
  }
  await assert.rejects(
    htmlInspection.planPathRewrite({
      oldPath: 'Target.md',
      newPath: 'Archive/Target.md',
      isDirectory: false,
    }, htmlAbortSignal),
    error => error?.name === 'AbortError',
  )
})

test('provider-input inspection rejects unsafe or unsupported inventory records', async () => {
  const provider = memoryInput({ includeInvalid: true })
  const inspection = createVaultInspection(provider.input, { ...limits, maxSearchEntries: 1 })
  await assert.rejects(
    inspection.list({}, new AbortController().signal),
    /Vault inventory provider returned an invalid entry/,
  )
  assert.equal(provider.readPaths.length, 0)

  const unordered = createVaultInspection({
    async list() {
      return {
        entries: [
          { path: 'z.md', kind: 'document', createdMs: 1, modifiedMs: 1, size: 0 },
          { path: 'a.md', kind: 'document', createdMs: 1, modifiedMs: 1, size: 0 },
        ],
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) { return { path, content: '' } },
  }, limits)
  await assert.rejects(
    unordered.list({}, new AbortController().signal),
    /strictly path ordered/,
  )
})

test('provider inventory pagination has a hard no-progress bound', async () => {
  let listCalls = 0
  const inspection = createVaultInspection({
    async list() {
      listCalls += 1
      return {
        entries: [],
        cursor: `empty:${String(listCalls)}`,
        complete: false,
        truncated: true,
        truncationReason: 'result-limit',
        warnings: [],
      }
    },
    async read(path) { return { path, content: '' } },
  }, limits)
  await assert.rejects(
    inspection.planPathRewrite({
      oldPath: 'old.md',
      newPath: 'new.md',
      isDirectory: false,
    }),
    /exceeded the page limit/u,
  )
  assert.equal(listCalls, 1_024)
})

test('provider-input cursors cross source and result boundaries without filtered loss', async () => {
  const provider = memoryInput()
  const inspection = createVaultInspection(provider.input, {
    ...limits,
    maxSearchEntries: 2,
    maxSearchResults: 1,
  })
  const signal = new AbortController().signal

  const listed = []
  let cursor
  do {
    const page = await inspection.list({ kind: 'all', limit: 1, ...(cursor ? { cursor } : {}) }, signal)
    listed.push(...page.entries.map(entry => entry.path))
    cursor = page.cursor ?? undefined
  } while (cursor)
  assert.deepEqual(listed, ['beta.md', 'board.canvas', 'image.png', 'notes/alpha.md', 'query.base'])
  assert.equal(new Set(listed).size, listed.length)

  const attachments = []
  cursor = undefined
  do {
    const page = await inspection.list({
      kind: 'attachments',
      limit: 1,
      ...(cursor ? { cursor } : {}),
    }, signal)
    attachments.push(...page.entries.map(entry => entry.path))
    cursor = page.cursor ?? undefined
  } while (cursor)
  assert.deepEqual(attachments, ['image.png'])
  assert.equal(provider.readPaths.includes('image.png'), false)
})

test('provider-input scan constructs one path inventory and checks cancellation before reads', async () => {
  const count = 64
  const entries = Array.from({ length: count }, (_, index) => ({
    path: `bulk/${String(index).padStart(3, '0')}.md`,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: 7,
  }))
  let reads = 0
  const input = {
    async list() {
      return {
        entries,
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) {
      reads += 1
      return { path, content: '# Note\n' }
    },
  }
  const inspection = createVaultInspection(input, {
    ...limits,
    maxSearchEntries: count,
    maxSearchResults: count,
  })
  const originalMap = Array.prototype.map
  let inventoryMaps = 0
  let abortOnInventory = null
  Array.prototype.map = function (...args) {
    if (
      this.length === count
      && this.every(item => item?.kind === 'document' && typeof item.path === 'string')
    ) {
      inventoryMaps += 1
      abortOnInventory?.abort()
    }
    return Reflect.apply(originalMap, this, args)
  }
  try {
    await inspection.search({ query: 'absent' }, new AbortController().signal)
    assert.equal(inventoryMaps, 1)
    assert.equal(reads, count)

    reads = 0
    inventoryMaps = 0
    abortOnInventory = new AbortController()
    await assert.rejects(
      inspection.search({ query: 'absent' }, abortOnInventory.signal),
      error => error?.name === 'AbortError',
    )
    assert.equal(inventoryMaps, 1)
    assert.equal(reads, 0)
  } finally {
    Array.prototype.map = originalMap
  }
})

test('query search uses complete indexed candidates only as input to the exact verifier', async () => {
  const provider = memoryInput()
  let listCalls = 0
  const candidateRequests = []
  const input = {
    ...provider.input,
    async list(...args) {
      listCalls += 1
      return await provider.input.list(...args)
    },
    async searchCandidates(request, signal) {
      signal.throwIfAborted()
      candidateRequests.push(request)
      return {
        complete: true,
        epoch: 'index-v1',
        paths: ['notes/alpha.md', 'beta.md', 'notes/alpha.md'],
      }
    },
  }
  const inspection = createVaultInspection(input, limits)
  const result = await inspection.search({
    mode: 'query',
    query: 'tag:project content:Alpha',
  }, new AbortController().signal)

  assert.deepEqual(candidateRequests, [{
    directory: '',
    groups: [[{ field: 'tag', value: 'project' }]],
    limit: 100,
  }])
  assert.equal(listCalls, 0)
  assert.deepEqual(provider.readPaths, ['beta.md', 'notes/alpha.md'])
  assert.deepEqual(result.matches.map(match => [match.path, match.operator]), [
    ['notes/alpha.md', undefined],
    ['notes/alpha.md', 'tag'],
  ])
  assert.deepEqual(result.scan, { bytes: 72, entries: 2, files: 2 })

  await inspection.search({ mode: 'query', query: '[status]' }, new AbortController().signal)
  assert.deepEqual(candidateRequests[1]?.groups, [[{ field: 'property', value: 'status' }]])
})

test('indexed candidate cursors resume exact projections without duplicates', async () => {
  const provider = memoryInput()
  const inspection = createVaultInspection({
    ...provider.input,
    async searchCandidates() {
      return { complete: true, epoch: 'stable-index', paths: ['notes/alpha.md'] }
    },
  }, limits)
  const first = await inspection.search({
    limit: 1,
    mode: 'query',
    query: 'tag:project content:Alpha',
  }, new AbortController().signal)
  assert.equal(first.matches.length, 1)
  assert.notEqual(first.cursor, null)

  const second = await inspection.search({
    cursor: first.cursor,
    limit: 1,
    mode: 'query',
    query: 'tag:project content:Alpha',
  }, new AbortController().signal)
  assert.equal(second.cursor, null)
  assert.deepEqual(
    [...first.matches, ...second.matches].map(match => [match.kind, match.operator]),
    [['content', undefined], ['tag', 'tag']],
  )
})

test('query search falls back to the bounded scanner when candidates are unavailable, unsafe, or unsupported', async () => {
  const provider = memoryInput()
  let candidateCalls = 0
  let candidateResult = null
  const inspection = createVaultInspection({
    ...provider.input,
    async searchCandidates() { candidateCalls += 1; return candidateResult },
  }, limits)
  const unavailable = await inspection.search({
    mode: 'query',
    query: 'tag:project',
  }, new AbortController().signal)

  assert.deepEqual(unavailable.matches.map(match => match.path), ['notes/alpha.md'])
  assert.equal(unavailable.scan.entries, 5)
  assert.equal(unavailable.scan.files, 4)

  candidateResult = { complete: true, epoch: 'unsafe-index', paths: ['../escape.md'] }
  const unsafe = await inspection.search({
    mode: 'query',
    query: 'tag:project',
  }, new AbortController().signal)
  assert.deepEqual(unsafe.matches.map(match => match.path), ['notes/alpha.md'])

  const unsupported = await inspection.search({
    mode: 'query',
    query: 'line:needle',
  }, new AbortController().signal)
  assert.deepEqual(unsupported.matches.map(match => match.path), ['beta.md'])
  assert.equal(candidateCalls, 2)
})

test('query regex rejects backtracking hazards before scans and checks cancellation around matches', async () => {
  let listCalls = 0
  const content = Array.from({ length: 1_000 }, (_, index) => `line ${String(index)}`).join('\n')
  const input = {
    async list() {
      listCalls += 1
      return {
        entries: [{
          path: 'query.md',
          kind: 'document',
          createdMs: 1,
          modifiedMs: 1,
          size: Buffer.byteLength(content),
        }],
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) { return { path, content } },
  }
  const inspection = createVaultInspection(input, {
    ...limits,
    maxSearchBytes: 128 * 1024,
    maxSearchFileBytes: 128 * 1024,
  })
  for (const query of ['/(a+)+$/', '/(a|aa)+$/', '/^(a+)\\1+$/', '/a+$/', '/aaa+$/']) {
    await assert.rejects(
      inspection.search({ mode: 'query', query }, new AbortController().signal),
      /unsafe search regex/,
    )
  }
  const boundedRepeatStarted = performance.now()
  await assert.rejects(
    inspection.search({
      mode: 'query',
      query: '^a{0,64}a{0,64}a{0,64}a{0,64}b$',
      regex: true,
    }, new AbortController().signal),
    /unsafe search regex/,
  )
  assert.equal(performance.now() - boundedRepeatStarted < 50, true)
  assert.equal(listCalls, 0)
  const ordinary = await inspection.search(
    { mode: 'query', query: '/line\\s+999/i' },
    new AbortController().signal,
  )
  assert.deepEqual(ordinary.matches.map(match => match.path), ['query.md'])

  const matchAbortSignal = {
    throwIfAborted() {
      if (new Error().stack.includes('patternIndex')) {
        throw new DOMException('cancel regex match', 'AbortError')
      }
    },
  }
  await assert.rejects(
    inspection.search({ mode: 'query', query: '/absent/' }, matchAbortSignal),
    error => error?.name === 'AbortError',
  )
})

test('public inspection metadata uses uniform field and collection bounds', async () => {
  const giant = 'x'.repeat(600)
  const giantFence = '~'.repeat(600)
  const target = [
    '---',
    `title: ${giant}`,
    `aliases: [${giant}]`,
    `tags: [${giant}]`,
    '---',
    `# ${giant}`,
    `[${giant}](other.md#${giant})`,
    `${giantFence}query`,
    'content:"bounded"',
    giantFence,
    '',
  ].join('\n')
  const contents = new Map([
    ['target.md', target],
    ['other.md', '# Other\n'],
    ['duplicate.md', `---\naliases: [${giant}]\n---\n# Duplicate\n`],
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
  })).sort((left, right) => left.path.localeCompare(right.path))
  const inspection = createVaultInspection({
    async list() {
      return {
        entries,
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) { return { path, content: contents.get(path) } },
  }, {
    ...limits,
    maxReadBytes: 16 * 1024,
    maxSearchBytes: 32 * 1024,
    maxSearchFileBytes: 16 * 1024,
    maxSearchResults: 50,
  })
  const signal = new AbortController().signal

  const listed = await inspection.list({}, signal)
  const listedTarget = listed.entries.find(entry => entry.path === 'target.md')
  assert.equal(listedTarget.title.length <= 240, true)
  assert.equal(listedTarget.tags.every(tag => tag.length <= 240), true)
  assert.equal(listedTarget.aliases.every(alias => alias.length <= 240), true)
  assert.equal(listed.truncated, true)

  const searched = await inspection.search({ query: giant.slice(0, 20) }, signal)
  assert.equal(searched.matches.every(match => match.preview.length <= 240), true)
  assert.equal(searched.truncated, true)

  const outline = await inspection.outline({ path: 'target.md', includeQueries: true }, signal)
  assert.equal(outline.headings[0].text.length <= 240, true)
  assert.equal(outline.headings[0].selector.length <= 240, true)
  assert.equal(outline.queries[0].fence.length <= 240, true)
  assert.equal(outline.queriesTruncated, true)
  assert.equal(outline.truncated, true)
  const selected = await inspection.read({
    path: 'target.md',
    heading: outline.headings[0].selector,
  }, signal)
  assert.equal(selected.content.startsWith(`# ${giant}`), true)

  const links = await inspection.links({ path: 'target.md', includeUnlinked: true }, signal)
  const outgoing = links.outgoingDetails[0]
  for (const field of ['authoredTarget', 'displayText', 'fragment', 'normalizedTarget']) {
    assert.equal(outgoing[field].length <= 240, true, field)
  }
  assert.equal(links.truncated, true)
  assert.equal(links.warnings.every(warning => warning.length <= 240), true)

  const graph = await inspection.graph({ path: 'target.md' }, signal)
  assert.equal(graph.edges[0].fragment.length <= 240, true)
  assert.equal(graph.truncated, true)

  const global = await inspection.graph({ scope: 'global', includeTags: true }, signal)
  assert.equal(global.nodes.every(node => !node.path.startsWith('tag:') || node.path.length <= 240), true)
  assert.equal(global.truncated, true)
})

test('overlong unlinked identifiers fail closed without claiming completeness', async () => {
  const giantAlias = `Unique-${'z'.repeat(500)}`
  const contents = new Map([
    ['source.md', `# Source\n${giantAlias}\n`],
    ['target.md', `---\naliases: [${giantAlias}]\n---\n# Target\n`],
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
  }))
  const inspection = createVaultInspection({
    async list() {
      return {
        entries,
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) { return { path, content: contents.get(path) } },
  }, limits)
  const result = await inspection.links(
    { path: 'target.md', includeUnlinked: true },
    new AbortController().signal,
  )
  assert.deepEqual(result.unlinkedMentions, [])
  assert.equal(result.warnings.some(warning => warning.includes('truncated')), true)
  assert.equal(result.truncated, true)
  assert.equal(result.complete, false)
})

test('unlinked aliases, comparisons, and mention materialization stay bounded', async () => {
  const aliases = Array.from({ length: 2_000 }, (_, index) => `Alias-${String(index)}`)
  const aliasTarget = `---\naliases: [${aliases.join(', ')}]\n---\n# Target\n`
  const nonmatchingSource = Array.from({ length: 200 }, (_, index) => (
    `nonmatching source line ${String(index)}`
  )).join('\n')
  const aliasContents = new Map([
    ['source.md', nonmatchingSource],
    ['target.md', aliasTarget],
  ])
  const makeInput = contents => ({
    async list(_request, signal) {
      signal.throwIfAborted()
      return {
        entries: [...contents].map(([path, content]) => ({
          path,
          kind: 'document',
          createdMs: 1,
          modifiedMs: 1,
          size: Buffer.byteLength(content),
        })),
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path, _maxBytes, signal) {
      signal.throwIfAborted()
      return { path, content: contents.get(path) }
    },
  })
  const largeLimits = {
    ...limits,
    maxReadBytes: 512 * 1024,
    maxSearchBytes: 2 * 1024 * 1024,
    maxSearchFileBytes: 512 * 1024,
    maxSearchResults: 50,
  }
  const aliasInspection = createVaultInspection(makeInput(aliasContents), largeLimits)
  const aliasStarted = performance.now()
  const aliasResult = await aliasInspection.links(
    { path: 'target.md', includeUnlinked: true },
    new AbortController().signal,
  )
  assert.equal(performance.now() - aliasStarted < 250, true)
  assert.deepEqual(aliasResult.unlinkedMentions, [])
  assert.equal(aliasResult.warnings.some(warning => warning.includes('truncated')), true)
  assert.equal(aliasResult.complete, false)

  const mentionLines = Array.from({ length: 10_001 }, () => 'Needle').join('\n')
  const mentionContents = new Map([
    ['source.md', mentionLines],
    ['target.md', '---\naliases: [Needle]\n---\n# Target\n'],
  ])
  const mentionInspection = createVaultInspection(makeInput(mentionContents), largeLimits)
  const mentionResult = await mentionInspection.links(
    { path: 'target.md', includeUnlinked: true },
    new AbortController().signal,
  )
  assert.equal(mentionResult.unlinkedMentions.length, 50)
  assert.equal(typeof mentionResult.cursor, 'string')
  assert.equal(mentionResult.warnings.some(warning => warning.includes('unlinked mentions exceeded 10000')), true)
  assert.equal(mentionResult.truncated, true)
  assert.equal(mentionResult.complete, false)
})

test('outgoing and backlink relationship extraction has one cancellable work cap', async () => {
  const manyLinks = `${Array.from({ length: 20_000 }, () => '[[target]]').join(' ')}\n`
  const contents = new Map([
    ['source.md', manyLinks],
    ['target.md', '# Target\n'],
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
  }))
  const inspection = createVaultInspection({
    async list() {
      return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] }
    },
    async read(path) { return { path, content: contents.get(path) } },
  }, {
    ...limits,
    maxReadBytes: 512 * 1024,
    maxSearchBytes: 2 * 1024 * 1024,
    maxSearchFileBytes: 512 * 1024,
    maxSearchResults: 50,
  })
  const result = await inspection.links({ path: 'source.md' }, new AbortController().signal)
  assert.equal(result.outgoingDetails.length, 50)
  assert.equal(typeof result.cursor, 'string')
  assert.equal(result.warnings.some(warning => warning.includes('link relationship work exceeded 10000')), true)
  assert.equal(result.truncationReason, 'result-limit')

  let extractionChecks = 0
  const extractionAbortSignal = {
    throwIfAborted() {
      if (new Error().stack.includes('markdownLinkRecords')) {
        extractionChecks += 1
        if (extractionChecks > 20) throw new DOMException('cancel links', 'AbortError')
      }
    },
  }
  await assert.rejects(
    inspection.links({ path: 'source.md' }, extractionAbortSignal),
    error => error?.name === 'AbortError',
  )
})

test('link tag relations bound tag-by-document work and honor cancellation', async () => {
  const requestedTags = Array.from({ length: 75 }, (_, index) => (
    `tag-${String(index).padStart(3, '0')}`
  ))
  const sharedTags = requestedTags.slice(0, 50)
  const contents = new Map([
    ['000-target.md', `# Target\n${requestedTags.map(tag => `#${tag}`).join(' ')}\n`],
    ...Array.from({ length: 201 }, (_, index) => {
      const documentPath = `${String(index + 1).padStart(3, '0')}-related.md`
      return [documentPath, `# Related\n${sharedTags.map(tag => `#${tag}`).join(' ')}\n`]
    }),
  ])
  const entries = [...contents].map(([path, content]) => ({
    path,
    kind: 'document',
    createdMs: 1,
    modifiedMs: 1,
    size: Buffer.byteLength(content),
  }))
  const input = {
    async list(_request, signal) {
      signal.throwIfAborted()
      return {
        entries,
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path, _maxBytes, signal) {
      signal.throwIfAborted()
      return { path, content: contents.get(path) }
    },
  }
  const inspection = createVaultInspection(input, {
    ...limits,
    maxReadBytes: 128 * 1024,
    maxSearchBytes: 1024 * 1024,
    maxSearchEntries: entries.length,
    maxSearchFileBytes: 128 * 1024,
  })
  const result = await inspection.links({ path: '000-target.md' }, new AbortController().signal)
  assert.equal(result.truncated, true)
  assert.equal(result.truncationReason, 'result-limit')
  assert.equal(result.warnings.some(warning => warning.includes('omitted tags after 50')), true)
  assert.equal(result.warnings.some(warning => warning.includes('tag relationships exceeded 10000')), true)
  assert.equal(result.tagRelations.flatMap(relation => relation.paths).length <= 20, true)

  const relationAbortSignal = {
    throwIfAborted() {
      if (new Error().stack.includes('collectTagRelations')) {
        throw new DOMException('cancel tag relations', 'AbortError')
      }
    },
  }
  await assert.rejects(
    inspection.links({ path: '000-target.md' }, relationAbortSignal),
    error => error?.name === 'AbortError',
  )
})

test('provider-input inspection preserves source truncation, byte caps, cursors, and cancellation', async () => {
  const provider = memoryInput({
    sourceTruncated: true,
    warning: 'provider path=/Users/example/private-vault',
  })
  const inspection = createVaultInspection(provider.input, { ...limits, maxSearchResults: 1 })
  const signal = new AbortController().signal

  const first = await inspection.search({ query: 'needle', limit: 1 }, signal)
  assert.equal(first.matches.length, 1)
  assert.equal(typeof first.cursor, 'string')
  const second = await inspection.search({ query: 'needle', limit: 1, cursor: first.cursor }, signal)
  assert.notDeepEqual(second.matches, first.matches)
  assert.equal(second.complete ?? !second.truncated, false)
  assert.equal(second.warnings.includes('vault inventory provider warning'), true)
  assert.equal(second.warnings.some(warning => warning.includes('/Users/')), false)

  const rewrite = await inspection.planPathRewrite({
    oldPath: 'beta.md',
    newPath: 'archive/beta.md',
    isDirectory: false,
  }, signal)
  assert.deepEqual(rewrite.updates, [])
  assert.equal(rewrite.complete, false)
  assert.equal(rewrite.cursor, null)
  assert.equal(rewrite.truncationReason, 'entry-limit')
  assert.equal(rewrite.warnings.some(warning => warning.includes('/Users/')), false)

  const byteBounded = createVaultInspection(provider.input, { ...limits, maxReadBytes: 8 })
  await assert.rejects(
    byteBounded.read({ path: 'notes/alpha.md' }, signal),
    /configured 8-byte limit/,
  )

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    inspection.search({ query: 'needle' }, controller.signal),
    error => error?.name === 'AbortError',
  )

  const abortAfterList = new AbortController()
  const abortingInspection = createVaultInspection({
    async list() {
      abortAfterList.abort()
      return {
        entries: [],
        cursor: null,
        complete: true,
        truncated: false,
        truncationReason: null,
        warnings: [],
      }
    },
    async read(path) { return { path, content: '' } },
  }, limits)
  await assert.rejects(
    abortingInspection.search({ query: 'needle' }, abortAfterList.signal),
    error => error?.name === 'AbortError',
  )
})
