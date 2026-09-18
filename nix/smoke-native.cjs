const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { createRequire } = require('node:module')
const { resolve } = require('node:path')

if (!process.argv[2] || !['full', 'web'].includes(process.argv[3])) {
  throw new Error('usage: smoke-native.cjs <dsh-runtime> <full|web>')
}
const runtime = resolve(process.argv[2])
const surface = process.argv[3]

function spawnPty(pty, marker) {
  return new Promise((resolve, reject) => {
    const child = pty.spawn('/bin/sh', ['-lc', `printf ${marker}`], { cols: 80, rows: 24 })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('PTY smoke timed out'))
    }, 5_000)
    child.onData(data => { output += data })
    child.onExit(() => {
      clearTimeout(timer)
      try {
        assert.match(output, new RegExp(marker))
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function smokePty() {
  const manifest = `${runtime}/node_modules/@tockteam/better-sidebar-runtime/package.json`
  assert.equal(existsSync(manifest), true, `Better Sidebar is missing from the ${surface} runtime`)
  const requireFromRuntime = createRequire(`${runtime}/package.json`)
  const requireFromSidebar = createRequire(manifest)
  assert.equal(requireFromRuntime('node-pty/package.json').version, '1.2.0-beta.15')
  assert.equal(requireFromSidebar('node-pty/package.json').version, '1.1.0')
  assert.equal(requireFromSidebar('ws/package.json').version, '8.21.2')
  await Promise.all([
    spawnPty(requireFromRuntime('node-pty'), 'dsh-pty'),
    spawnPty(requireFromSidebar('node-pty'), 'tockteam-pty'),
  ])
}

async function smokeSqlite() {
  if (surface !== 'full') return
  const manifest = `${runtime}/node_modules/tockbot-note-runtime/package.json`
  assert.equal(existsSync(manifest), true, 'TockTutor note runtime is missing from the full runtime')
  const requireFromNotes = createRequire(manifest)
  assert.equal(requireFromNotes('sqlite3/package.json').version, '5.1.7')
  const { Document } = requireFromNotes('flexsearch')
  const Sqlite = requireFromNotes('flexsearch/db/sqlite')
  const sqlite3 = requireFromNotes('sqlite3')
  const db = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(':memory:', error => error ? reject(error) : resolve(database))
  })
  const storage = new Sqlite('tockteam-native-smoke', { db, type: 'integer' })
  const index = new Document({ document: { id: 'id', index: ['content'] }, commit: false })
  await index.mount(storage)
  index.add({ id: 1, content: 'tockteam-search' })
  await index.commit()
  assert.equal((await index.searchAsync('tockteam-search', { merge: true }))[0]?.id, 1)
  storage.db = null
  storage.close()
  await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
}

Promise.all([smokePty(), smokeSqlite()]).then(
  () => console.log('Nix native runtime smoke passed'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
