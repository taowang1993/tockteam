import { rm, stat } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { Document } from 'flexsearch'
import Sqlite from 'flexsearch/db/sqlite'

const mode = process.argv[2] || 'build'
const count = Number(process.env.NOTES || 10_000)
const noteBytes = Number(process.env.NOTE_BYTES || 512)
const dbPath = process.env.DB_PATH || `/tmp/flexsearch-${count}.sqlite`
const updateCount = Math.min(Number(process.env.UPDATES || 1_000), Math.floor(count / 10))
const batchSize = Math.min(Number(process.env.BATCH_SIZE || 10_000), count)
const contentTokenize = process.env.CONTENT_TOKENIZE || 'strict'
const encoder = process.env.ENCODER || 'whitespace'

function alphaId(value) {
  let output = ''
  for (let i = 0; i < 6; i++) {
    output = String.fromCharCode(97 + value % 26) + output
    value = Math.floor(value / 26)
  }
  return output
}

const filler = ' planning review reference learning project meeting action research archive '
function documentFor(i, updated = false) {
  const topic = `topic${String(i % 1_000).padStart(3, '0')}`
  const unique = `needle${alphaId(i)}`
  let content = `${updated ? 'updatedmarker ' : ''}${topic} ${unique} TockTutor vault benchmark note ${i}.`
  while (content.length < noteBytes) content += filler
  return {
    id: i,
    title: `Project ${i % 10_000} note ${i}`,
    path: `area ${i % 1_000} note ${i}`,
    headings: `Review Area ${i % 100}`,
    tags: `tag${i % 500} ${i % 2 ? 'active' : 'archive'}`,
    content: content.slice(0, noteBytes),
  }
}

function createIndex() {
  return new Document({
    document: {
      id: 'id',
      index: [
        { field: 'title', tokenize: 'forward' },
        { field: 'path', tokenize: 'forward' },
        { field: 'headings', tokenize: 'forward' },
        { field: 'tags', tokenize: 'strict' },
        { field: 'content', tokenize: contentTokenize },
      ],
    },
    encode: encoder === 'whitespace' ? text => text.toLowerCase().split(/\s+/u) : undefined,
    commit: false,
  })
}

function memory() {
  const value = process.memoryUsage()
  return Object.fromEntries(Object.entries(value).map(([key, bytes]) => [key, Math.round(bytes / 1024 / 1024)]))
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

async function benchmarkQueries(index) {
  const queries = [
    `needle${alphaId(1_234)}`,
    'topic042',
    'planning review',
    'Project 42',
    'area 42',
  ]
  const output = {}
  for (const query of queries) {
    for (let i = 0; i < 3; i++) await index.search(query, { merge: true, limit: 20 })
    const times = []
    let resultCount = 0
    for (let i = 0; i < 30; i++) {
      const started = performance.now()
      resultCount = (await index.search(query, { merge: true, limit: 20 })).length
      times.push(performance.now() - started)
    }
    times.sort((a, b) => a - b)
    output[query] = {
      resultCount,
      p50Ms: Number(percentile(times, 0.5).toFixed(3)),
      p95Ms: Number(percentile(times, 0.95).toFixed(3)),
      maxMs: Number(times.at(-1).toFixed(3)),
    }
  }
  return output
}

async function openIndex() {
  const index = createIndex()
  const db = new Sqlite('tocktutor-benchmark', { path: dbPath, type: 'integer' })
  const started = performance.now()
  await index.mount(db)
  return { index, db, mountMs: performance.now() - started }
}

async function close(db) {
  if (db?.close) await db.close()
}

async function build() {
  await rm(dbPath, { force: true })
  const baselineMemory = memory()
  const { index, db, mountMs } = await openIndex()
  let queueMs = 0
  let commitMs = 0
  let batchStarted = performance.now()
  let peakMemory = memory()
  for (let i = 0; i < count; i++) {
    index.add(documentFor(i))
    if ((i + 1) % batchSize === 0 || i + 1 === count) {
      queueMs += performance.now() - batchStarted
      const commitStarted = performance.now()
      await index.commit()
      commitMs += performance.now() - commitStarted
      const currentMemory = memory()
      for (const key of Object.keys(currentMemory)) peakMemory[key] = Math.max(peakMemory[key] || 0, currentMemory[key])
      console.error(`committed ${i + 1}/${count}`)
      batchStarted = performance.now()
    }
  }
  const afterCommitMemory = memory()
  const queries = await benchmarkQueries(index)
  const dbBytes = (await stat(dbPath)).size
  await close(db)
  console.log(JSON.stringify({
    mode: 'persistent-build',
    flexsearchVersion: '0.8.212',
    count,
    noteBytes,
    batchSize,
    contentTokenize,
    encoder,
    corpusMiB: Number((count * noteBytes / 1024 / 1024).toFixed(1)),
    mountMs: Number(mountMs.toFixed(1)),
    queueMs: Number(queueMs.toFixed(1)),
    commitMs: Number(commitMs.toFixed(1)),
    totalBuildMs: Number((queueMs + commitMs).toFixed(1)),
    docsPerSecond: Math.round(count / ((queueMs + commitMs) / 1000)),
    dbMiB: Number((dbBytes / 1024 / 1024).toFixed(1)),
    queries,
    memoryMiB: { baseline: baselineMemory, afterCommit: afterCommitMemory, peak: peakMemory },
  }, null, 2))
}

async function reopen() {
  const baselineMemory = memory()
  const { index, db, mountMs } = await openIndex()
  const queries = await benchmarkQueries(index)

  const updateStarted = performance.now()
  for (let i = 0; i < updateCount; i++) index.update(documentFor(i, true))
  await index.commit()
  const updateMs = performance.now() - updateStarted

  const removeStarted = performance.now()
  for (let i = count - updateCount; i < count; i++) index.remove(i)
  await index.commit()
  const removeMs = performance.now() - removeStarted

  const removedMatches = await index.search(`needle${alphaId(count - 1)}`, { merge: true, limit: 20 })
  const removedTargetFound = removedMatches.some(match => match.id === count - 1)
  const afterMutationsMemory = memory()
  const dbBytes = (await stat(dbPath)).size
  await close(db)
  console.log(JSON.stringify({
    mode: 'persistent-reopen',
    flexsearchVersion: '0.8.212',
    count,
    noteBytes,
    contentTokenize,
    encoder,
    mountMs: Number(mountMs.toFixed(1)),
    queries,
    updates: { count: updateCount, totalMs: Number(updateMs.toFixed(1)), perSecond: Math.round(updateCount / (updateMs / 1000)) },
    removals: { count: updateCount, totalMs: Number(removeMs.toFixed(1)), perSecond: Math.round(updateCount / (removeMs / 1000)), targetFoundAfterRemoval: removedTargetFound },
    dbMiB: Number((dbBytes / 1024 / 1024).toFixed(1)),
    memoryMiB: { baseline: baselineMemory, afterMutations: afterMutationsMemory },
  }, null, 2))
}

if (!Number.isSafeInteger(count) || count < 100 || !Number.isSafeInteger(noteBytes) || noteBytes < 128) {
  throw new Error('NOTES must be >= 100 and NOTE_BYTES must be >= 128')
}

if (mode === 'build') await build()
else if (mode === 'reopen') await reopen()
else throw new Error(`Unknown mode: ${mode}`)
