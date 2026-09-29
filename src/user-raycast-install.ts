import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { readTrustedRaycastFile } from './trusted-raycast-artifact-admission.ts'

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_FILES = 128
const MAX_BYTES = 16 * 1024 * 1024
export type UserRaycastCandidate = Readonly<{ command: string; digest: string; extensionId: string; title: string; mode?: 'no-view'; version?: string; license?: string; source?: string }>
type Decision = { digest: string; enabled: boolean }

function readFiles(directory: string): Map<string, Buffer> {
  if (!isAbsolute(directory) || !lstatSync(directory).isDirectory()) throw new Error('Extension folder must be a real directory')
  const files = new Map<string, Buffer>()
  let total = 0
  const walk = (relative: string, depth: number): void => {
    if (depth > 8) throw new Error('Extension folder exceeds its depth bound')
    for (const name of readdirSync(join(directory, relative)).sort()) {
      if (name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.length > 128) throw new Error('Invalid extension file name')
      const child = relative ? `${relative}/${name}` : name
      const path = join(directory, child)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error('Extension folder contains a link')
      if (stat.isDirectory()) { walk(child, depth + 1); continue }
      if (!stat.isFile() || files.size >= MAX_FILES || stat.size > MAX_BYTES - total) throw new Error('Extension folder exceeds its regular-file bound')
      const bytes = readTrustedRaycastFile(path, MAX_BYTES - total)
      total += bytes.length
      files.set(child, bytes)
    }
  }
  walk('', 0)
  return files
}

function digestFiles(files: Map<string, Buffer>): string {
  const hash = createHash('sha256')
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.length}:`)
    hash.update(bytes)
  }
  return hash.digest('hex')
}

function candidate(files: Map<string, Buffer>, selectedCommand?: string): UserRaycastCandidate {
  const raw = files.get('package.json')
  if (!raw || raw.length > 128 * 1024) throw new Error('Extension manifest is missing or oversized')
  const manifest: unknown = JSON.parse(raw.toString('utf8'))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid extension manifest')
  const record = manifest as Record<string, unknown>
  if (typeof record.name !== 'string' || !ID.test(record.name) || typeof record.title !== 'string' || record.title.length < 1 || record.title.length > 128 || !Array.isArray(record.commands) || record.commands.length > 128) throw new Error('Invalid extension identity or commands')
  const commands = record.commands as unknown[]
  const names = commands.map(value => value !== null && typeof value === 'object' ? (value as Record<string, unknown>).name : undefined)
  if (names.some(name => typeof name !== 'string' || !ID.test(name)) || new Set(names).size !== names.length) throw new Error('Invalid or duplicate extension commands')
  const built = commands.filter(value => value !== null && typeof value === 'object' && files.has(`${String((value as Record<string, unknown>).name)}.js`) && ['view', 'no-view'].includes((value as Record<string, unknown>).mode as string))
  const chosen = selectedCommand === undefined
    ? built.length === 1 ? built[0] : built.find(value => (value as Record<string, unknown>).mode === 'view')
    : commands.find(value => value !== null && typeof value === 'object' && (value as Record<string, unknown>).name === selectedCommand)
  if (!chosen || typeof chosen !== 'object' || !['view', 'no-view'].includes((chosen as Record<string, unknown>).mode as string) || typeof (chosen as Record<string, unknown>).name !== 'string' || !ID.test((chosen as Record<string, unknown>).name as string)) throw new Error('Selected command is unavailable')
  const command = (chosen as { name: string }).name
  if (!files.has(`${command}.js`)) throw new Error('Selected view command has no built JavaScript')
  if (files.has('selection.json')) throw new Error('Extension bundle contains a reserved file')
  const sourceValue = typeof record.repository === 'string' ? record.repository : record.repository && typeof record.repository === 'object' ? (record.repository as Record<string, unknown>).url : undefined
  let source: string | undefined
  try {
    if (typeof sourceValue === 'string' && sourceValue.length <= 512) {
      const url = new URL(sourceValue)
      if (url.protocol === 'https:' && !url.username && !url.password) source = url.href
    }
  } catch { /* Unverifiable repository metadata remains unspecified. */ }
  return Object.freeze({ extensionId: record.name, title: record.title, command, digest: digestFiles(files),
    ...((chosen as Record<string, unknown>).mode === 'no-view' ? { mode: 'no-view' as const } : {}),
    ...(typeof record.version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,63}$/.test(record.version) ? { version: record.version } : {}),
    ...(typeof record.license === 'string' && /^[\w+(). -]{1,128}$/.test(record.license) ? { license: record.license } : {}),
    ...(source ? { source } : {}),
  })
}

function save(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const fd = openSync(temporary, 'wx', 0o600)
    try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temporary, path)
  } finally { rmSync(temporary, { force: true }) }
}

/** Metadata preparation never imports extension code. Approval is a Host-only explicit user action. */
export class UserRaycastInstall {
  private readonly root: string
  constructor(root: string) { if (!isAbsolute(root)) throw new Error('Install root must be absolute'); this.root = root }
  private path(name: string): string { return join(this.root, name) }
  private ensureRoot(): void {
    if (existsSync(this.root) && !lstatSync(this.root).isDirectory()) throw new Error('Install root is not a real directory')
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
  }
  private readDecision(): Decision {
    try {
      const data: unknown = JSON.parse(readTrustedRaycastFile(this.path('trust.json'), 4096).toString('utf8'))
      if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Decision).digest === 'string' && /^[a-f0-9]{64}$/.test((data as Decision).digest)) return { digest: (data as Decision).digest, enabled: (data as Decision).enabled === true }
    } catch { /* No approved installation. */ }
    return { digest: '', enabled: false }
  }
  private inspect(name: 'stage' | 'current' | 'previous'): UserRaycastCandidate | undefined {
    try {
      const dir = this.path(name)
      const chosen: unknown = JSON.parse(readTrustedRaycastFile(join(dir, 'selection.json'), 4096).toString('utf8'))
      if (!chosen || typeof chosen !== 'object' || Array.isArray(chosen)) return undefined
      const declared = chosen as UserRaycastCandidate
      const actual = candidate(new Map([...readFiles(dir)].filter(([path]) => path !== 'selection.json')), declared.command)
      return JSON.stringify(actual) === JSON.stringify(declared) ? actual : undefined
    } catch { return undefined }
  }
  status(): Readonly<{ candidate?: UserRaycastCandidate; digest: string; enabled: boolean; hasPrevious: boolean; installed: boolean; mode?: 'no-view' }> {
    const trust = this.readDecision()
    const current = this.inspect('current')
    const candidate = this.inspect('stage')
    return Object.freeze({ ...(candidate ? { candidate } : {}), ...(current?.mode === 'no-view' ? { mode: 'no-view' as const } : {}), digest: current?.digest ?? '', enabled: trust.enabled, hasPrevious: this.inspect('previous') !== undefined, installed: current !== undefined && current.digest === trust.digest })
  }
  prepare(folder: string, command?: string): UserRaycastCandidate {
    this.ensureRoot()
    const files = readFiles(folder)
    if (files.size >= MAX_FILES || [...files.values()].reduce((total, bytes) => total + bytes.length, 0) > MAX_BYTES - 4096) throw new Error('Extension bundle leaves no room for selection metadata')
    const selected = candidate(files, command)
    const temporary = this.path(`stage.${randomUUID()}`)
    mkdirSync(temporary, { mode: 0o700 })
    try {
      for (const [relative, bytes] of files) {
        const destination = join(temporary, relative)
        mkdirSync(join(temporary, relative, '..'), { recursive: true })
        writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
      }
      save(join(temporary, 'selection.json'), selected)
      if (this.inspectDirectory(temporary)?.digest !== selected.digest) throw new Error('Extension candidate changed during staging')
      rmSync(this.path('stage'), { recursive: true, force: true })
      renameSync(temporary, this.path('stage'))
      return selected
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  }
  private inspectDirectory(directory: string): UserRaycastCandidate | undefined {
    try {
      const selected = JSON.parse(readTrustedRaycastFile(join(directory, 'selection.json'), 4096).toString('utf8')) as UserRaycastCandidate
      const actual = candidate(new Map([...readFiles(directory)].filter(([path]) => path !== 'selection.json')), selected.command)
      return JSON.stringify(actual) === JSON.stringify(selected) ? actual : undefined
    } catch { return undefined }
  }
  approve(expectedDigest: string): void {
    const staged = this.inspect('stage')
    if (!staged || staged.digest !== expectedDigest) throw new Error('Candidate digest changed; review it again')
    this.ensureRoot()
    const current = this.inspect('current')
    if (existsSync(this.path('current')) && !current) throw new Error('Current installation is invalid; recover it before updating')
    if (existsSync(this.path('previous')) && !this.inspect('previous')) throw new Error('Previous installation is invalid; recover it before updating')
    // State is written last. On interruption the old current remains recoverable in previous.
    rmSync(this.path('previous'), { recursive: true, force: true })
    if (existsSync(this.path('current'))) renameSync(this.path('current'), this.path('previous'))
    renameSync(this.path('stage'), this.path('current'))
    save(this.path('trust.json'), { digest: staged.digest, enabled: false })
    if (current && !this.inspect('previous')) throw new Error('Previous installation was not retained')
  }
  enable(): void {
    const status = this.status()
    if (!status.installed) throw new Error('Approved extension is unavailable')
    save(this.path('trust.json'), { digest: status.digest, enabled: true })
  }
  disable(): void { this.ensureRoot(); save(this.path('trust.json'), { ...this.readDecision(), enabled: false }) }
  runtimeDir(): string | undefined { const status = this.status(); return status.installed && status.enabled ? this.path('current') : undefined }
  statePath(extensionId: string): string {
    if (!ID.test(extensionId)) throw new Error('Invalid extension storage identity')
    this.ensureRoot()
    const state = this.path('state')
    if (existsSync(state) && !lstatSync(state).isDirectory()) throw new Error('Extension state must be a real directory')
    mkdirSync(state, { recursive: true, mode: 0o700 })
    return join(state, `${extensionId}.json`)
  }
  snapshotTo(directory: string): UserRaycastCandidate {
    const status = this.status()
    if (!status.installed || !status.enabled) throw new Error('Approved extension is not enabled')
    if (!isAbsolute(directory) || existsSync(directory)) throw new Error('Snapshot destination must not exist')
    const files = readFiles(this.path('current'))
    const selected = JSON.parse(files.get('selection.json')?.toString('utf8') ?? 'null') as UserRaycastCandidate
    files.delete('selection.json')
    const actual = candidate(files, selected?.command)
    if (actual.digest !== status.digest || JSON.stringify(actual) !== JSON.stringify(selected)) throw new Error('Approved extension changed before launch')
    mkdirSync(directory, { mode: 0o700 })
    try {
      for (const [relative, bytes] of files) {
        const destination = join(directory, relative)
        mkdirSync(join(directory, relative, '..'), { recursive: true })
        writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
      }
      return actual
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
  }
  recoverPrevious(): void {
    const previous = this.inspect('previous')
    if (!previous) throw new Error('No previous extension to recover')
    rmSync(this.path('current'), { recursive: true, force: true })
    renameSync(this.path('previous'), this.path('current'))
    save(this.path('trust.json'), { digest: previous.digest, enabled: false })
  }
  remove(): void {
    this.ensureRoot()
    this.disable()
    for (const name of ['stage', 'current', 'previous', 'state']) rmSync(this.path(name), { recursive: true, force: true })
    save(this.path('trust.json'), { digest: '', enabled: false })
  }
}
