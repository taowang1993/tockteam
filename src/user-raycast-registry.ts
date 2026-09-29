import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { digestFiles, readFiles } from './user-raycast-install.ts'
import { readTrustedRaycastFile } from './trusted-raycast-artifact-admission.ts'
import { fetchUserRaycastGitSource } from './user-raycast-git-source.ts'

const SHA = /^[a-f0-9]{40}$/
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/
const COMMAND = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const MAX_SOURCE_BYTES = 16 * 1024 * 1024
export type UserRaycastSourceCandidate = Readonly<{ command: string; digest: string; extensionId: string; title: string; license: 'MIT'; revision: string; tree: string; files: number; bytes: number; source: string; mode: 'view' | 'no-view'; version?: string }>
type TreeEntry = { path: string; type: string; mode?: string; size?: number; sha: string }
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public source metadata'); return value as Record<string, unknown> }
const pinned = (value: unknown): string => { if (typeof value !== 'string' || !SHA.test(value)) throw new Error('Invalid public source revision'); return value }

/** Read-only public-source admission. Building and applying require separate Host approvals. */
export class UserRaycastRegistry {
  private readonly root: string
  private readonly base: string
  private readonly gitOptions: Readonly<{ repositoryUrl?: string; gitPath?: string; allowLocalTest?: boolean }>
  constructor(root: string, options: Readonly<{ baseUrl?: string; repositoryUrl?: string; gitPath?: string }> = {}) {
    if (!isAbsolute(root)) throw new Error('Registry root must be absolute')
    const url = new URL(options.baseUrl ?? 'https://api.github.com')
    const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
    if (url.origin !== 'https://api.github.com' && !local) throw new Error('Unsupported public source origin')
    if (!local && (options.repositoryUrl || options.gitPath)) throw new Error('Public source overrides are test-only')
    this.root = root; this.base = url.origin
    this.gitOptions = local ? { ...(options.repositoryUrl ? { repositoryUrl: options.repositoryUrl } : {}), ...(options.gitPath ? { gitPath: options.gitPath } : {}), allowLocalTest: true } : {}
  }
  private path(name: string): string { return join(this.root, name) }
  private async json(path: string, maximum: number, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.base}/repos/raycast/extensions/${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'TockTeam-Desktop' }, redirect: 'error', signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(15000)]) })
    if (!response.ok) throw new Error(response.headers.get('x-ratelimit-remaining') === '0' ? 'GitHub public source limit reached; try again later' : `Public source request failed (${response.status})`)
    const declared = Number(response.headers.get('content-length'))
    if (declared > maximum) throw new Error('Public source response exceeded its bound')
    if (!response.body) throw new Error('Public source response is empty')
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw new Error('Public source response exceeded its bound'); chunks.push(Buffer.from(chunk)) }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new Error('Invalid public source response') }
  }
  private async tree(sha: string, signal?: AbortSignal, recursive = false): Promise<TreeEntry[]> {
    const body = record(await this.json(`git/trees/${sha}${recursive ? '?recursive=1' : ''}`, 4 * 1024 * 1024, signal))
    if (body.sha !== sha || body.truncated === true || !Array.isArray(body.tree)) throw new Error('Public source tree changed or was truncated')
    return body.tree as TreeEntry[]
  }
  private async fromApi(extensionId: string, signal?: AbortSignal): Promise<{ revision: string; tree: string; files: Map<string, Buffer> }> {
    const revision = pinned(record(record(await this.json('git/ref/heads/main', 16384, signal)).object).sha)
    const rootTree = pinned(record(record(await this.json(`git/commits/${revision}`, 16384, signal)).tree).sha)
    const extensions = this.findTree(await this.tree(rootTree, signal), 'extensions')
    const selected = this.findTree(await this.tree(extensions, signal), extensionId)
    const entries = await this.tree(selected, signal, true)
    const regular = entries.filter(entry => entry.type === 'blob')
    if (entries.some(entry => entry.path === '.npmrc' || entry.path === 'npm-shrinkwrap.json')) throw new Error('Public source includes an unsupported package configuration')
    if (regular.length === 0 || regular.length > 128 || entries.length > 256 || regular.reduce((sum, entry) => sum + (entry.size ?? MAX_SOURCE_BYTES + 1), 0) > MAX_SOURCE_BYTES) throw new Error('Public source exceeds its file or byte bound')
    const files = new Map<string, Buffer>()
    for (const entry of entries) {
      if (!entry || typeof entry.path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(entry.path) || entry.path.startsWith('/') || entry.path.split('/').some(part => !part || part === '.' || part === '..' || part.length > 128) || entry.path.split('/').length > 8 || !SHA.test(entry.sha)) throw new Error('Public source path is invalid')
      if (entry.type === 'tree') continue
      if (entry.type !== 'blob' || entry.mode !== '100644' || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > MAX_SOURCE_BYTES || files.has(entry.path)) throw new Error('Public source contains an unsupported file')
      const blob = record(await this.json(`git/blobs/${entry.sha}`, Math.ceil(entry.size! * 1.5) + 4096, signal))
      if (blob.sha !== entry.sha || blob.size !== entry.size || blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('Public source blob changed')
      const encoded = blob.content.replace(/\s/g, '')
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid public source blob encoding')
      const bytes = Buffer.from(encoded, 'base64')
      const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      if (bytes.length !== entry.size || actual !== entry.sha || bytes.toString('base64') !== encoded) throw new Error('Public source blob digest mismatch')
      files.set(entry.path, bytes)
    }
    return { revision, tree: selected, files }
  }
  inspect(): UserRaycastSourceCandidate | undefined {
    try {
      const candidate = record(JSON.parse(readTrustedRaycastFile(this.path('stage/candidate.json'), 4096).toString('utf8')))
      const files = readFiles(this.path('stage/source'))
      if (candidate.digest !== digestFiles(files) || !ID.test(candidate.extensionId as string) || !COMMAND.test(candidate.command as string) || !SHA.test(candidate.revision as string) || !SHA.test(candidate.tree as string) || candidate.license !== 'MIT' || candidate.files !== files.size || candidate.bytes !== [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0)) return undefined
      return candidate as UserRaycastSourceCandidate
    } catch { return undefined }
  }
  sourceDirectory(expectedDigest: string): string {
    if (!/^[a-f0-9]{64}$/.test(expectedDigest) || this.inspect()?.digest !== expectedDigest) throw new Error('Public source changed; review it again')
    return this.path('stage/source')
  }
  async prepare(extensionId: string, command: string, signal?: AbortSignal): Promise<UserRaycastSourceCandidate> {
    if (!ID.test(extensionId) || !COMMAND.test(command)) throw new Error('Invalid public source selection')
    if (existsSync(this.root) && !lstatSync(this.root).isDirectory()) throw new Error('Registry root must be a real directory')
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
    const { revision, tree: selected, files } = await this.fromApi(extensionId, signal).catch(async error => {
      if (error instanceof Error && error.message.startsWith('GitHub public source limit reached')) return await fetchUserRaycastGitSource(extensionId, this.gitOptions, signal)
      throw error
    })
    const manifestBytes = files.get('package.json'); const lockBytes = files.get('package-lock.json')
    if (!manifestBytes || manifestBytes.length > 128 * 1024 || !lockBytes || lockBytes.length > 4 * 1024 * 1024) throw new Error('Public source lacks a bounded manifest or lock')
    const manifest = record(JSON.parse(manifestBytes.toString('utf8')))
    const lock = record(JSON.parse(lockBytes.toString('utf8')))
    const selectedCommand = Array.isArray(manifest.commands) ? manifest.commands.map(record).find(item => item.name === command) : undefined
    if (manifest.name !== extensionId || manifest.license !== 'MIT' || typeof manifest.title !== 'string' || !manifest.title || manifest.title.length > 128 || !selectedCommand || !['view', 'no-view'].includes(selectedCommand.mode as string) || !['.tsx', '.ts', '.jsx', '.js'].some(ext => files.has(`src/${command}${ext}`)) || lock.name !== extensionId || !Number.isSafeInteger(lock.lockfileVersion) || (lock.lockfileVersion as number) < 2) throw new Error('Public source manifest, license or selected command is unsupported')
    const candidate: UserRaycastSourceCandidate = Object.freeze({ command, digest: digestFiles(files), extensionId, title: manifest.title, license: 'MIT', revision, tree: selected, files: files.size, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0), mode: selectedCommand.mode as 'view' | 'no-view', source: `https://github.com/raycast/extensions/tree/${revision}/extensions/${extensionId}`, ...(typeof manifest.version === 'string' && manifest.version.length <= 64 ? { version: manifest.version } : {}) })
    const temporary = this.path(`stage.${randomUUID()}`)
    mkdirSync(join(temporary, 'source'), { recursive: true, mode: 0o700 })
    try {
      for (const [relative, bytes] of files) { const target = join(temporary, 'source', relative); mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 }); writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }) }
      writeFileSync(join(temporary, 'candidate.json'), JSON.stringify(candidate), { flag: 'wx', mode: 0o600 })
      const old = this.path(`old.${randomUUID()}`)
      if (existsSync(this.path('stage'))) renameSync(this.path('stage'), old)
      try { renameSync(temporary, this.path('stage')) } catch (error) { if (existsSync(old)) renameSync(old, this.path('stage')); throw error }
      rmSync(old, { recursive: true, force: true })
      return candidate
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  }
  private findTree(entries: TreeEntry[], name: string): string {
    const match = entries.find(entry => entry.path === name && entry.type === 'tree')
    return pinned(match?.sha)
  }
}
