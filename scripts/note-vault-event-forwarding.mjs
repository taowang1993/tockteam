import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const NAME = '@deepseek-ai/dsh-api-remotes'
const VERSION = '0.1.2-rc.1'
const ORIGINAL_SHA256 = '2258a0d4037b98cc020ca9fa200dc9929c19050316f50e996c626f54b8f78ad9'
const ANCHOR = 'const API_REMOTE_FORWARDED_EVENTS = ['
const ADDITION = '\n\t{\n\t\tevent: "note-vault/change",\n\t\tmode: "emit"\n\t},'

/** Extend only the staged pinned application's existing, sole Remote event source. */
export function applyNoteVaultEventForwarding(runtimeRoot) {
  const root = realpathSync(runtimeRoot)
  const candidates = [join(root, 'node_modules', NAME)]
  const store = join(root, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('@deepseek-ai+dsh-api-remotes@')) {
        candidates.push(join(store, entry.name, 'node_modules', NAME))
      }
    }
  }
  const packages = [...new Set(candidates.filter(existsSync).map(path => realpathSync(path)))]
  if (packages.length === 0) throw new Error(`${NAME}: staged package missing`)
  const changes = packages.map(packageRoot => {
    const inside = relative(root, packageRoot)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error(`${NAME}: package resolves outside staged runtime`)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.name !== NAME || manifest.version !== VERSION) throw new Error(`${NAME}: unsupported pinned version`)
    if (manifest.main !== 'lib/index.js' || manifest.exports?.['.']?.default !== './lib/index.js') throw new Error(`${NAME}: pinned Host export changed`)
    const path = realpathSync(join(packageRoot, 'lib', 'index.js'))
    const entryInside = relative(packageRoot, path)
    if (entryInside.startsWith('..') || isAbsolute(entryInside)) throw new Error(`${NAME}: Host export resolves outside staged package`)
    const original = readFileSync(path, 'utf8')
    const normalized = original.replace(ANCHOR + ADDITION, ANCHOR)
    if (createHash('sha256').update(normalized).digest('hex') !== ORIGINAL_SHA256) throw new Error(`${NAME}: pinned Host source shape changed`)
    return { path, original, source: normalized.replace(ANCHOR, ANCHOR + ADDITION) }
  })
  // Validate every actual copy before writing any; never touch the installed source or type mirror.
  for (const { path, original, source } of changes) {
    if (original === source) continue
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      // Deployment may hardlink package-store files: replace the staged inode, never mutate it.
      writeFileSync(temporary, source, { flag: 'wx', mode: statSync(path).mode })
      renameSync(temporary, path)
    } finally { rmSync(temporary, { force: true }) }
  }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('usage: node scripts/note-vault-event-forwarding.mjs <runtime-root>')
  applyNoteVaultEventForwarding(process.argv[2])
}
