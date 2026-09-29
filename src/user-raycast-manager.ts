// @ts-expect-error Shared first-party process-group cleanup owns descendants.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { admitTrustedRaycastArtifact } from './trusted-raycast-artifact-admission.ts'
import { getTrustedRaycastRuntimeDescriptor } from './trusted-raycast-descriptors.ts'
import { createTrustedRaycastLineReader, inspectTrustedRaycastProjection } from './trusted-raycast-contract.ts'
import type { UserRaycastCandidate, UserRaycastInstall } from './user-raycast-install.ts'

export type UserRaycastOwner = Readonly<{ webContentsId: number }>
export type UserRaycastMessage = Readonly<{ extensionId: string; sessionId: string; revision: number; type: 'ready' | 'patch' | 'error' | 'outcome' | 'toast'; root?: unknown; message?: string; eventId?: string; succeeded?: boolean; title?: string; style?: string }>
type Session = { child: ChildProcessWithoutNullStreams; workspace: string; owner: UserRaycastOwner; candidate: UserRaycastCandidate; id: string; revision: number; actions: Set<string>; action?: { eventId: string; revision: number; nativeUsed: boolean }; resolve: () => void; reject: (error: Error) => void; settled: boolean }
type NativeRequest = { type: 'native'; extensionId: string; sessionId: string; revision: number; eventId: string; requestId: string; kind: 'copy'; text: string }
const frameBytes = 1024 * 1024
const types = new Set(['root', 'raycast-list', 'raycast-list-item', 'raycast-section', 'raycast-detail', 'raycast-empty', 'raycast-dropdown', 'raycast-dropdown-item', 'raycast-grid', 'raycast-grid-item', 'raycast-action-panel', 'raycast-action-section', 'raycast-action', 'raycast-form', 'raycast-text-field', 'raycast-form-dropdown', 'raycast-form-dropdown-item'])
const validNode = (value: unknown, state = { nodes: 0, text: 0, actions: new Set<string>() }, depth = 0): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32 || ++state.nodes > 8192) return false
  const node = value as { type?: unknown; props?: unknown; children?: unknown }
  if (Object.keys(node).sort().join(',') !== 'children,props,type' || !types.has(node.type as string) || !node.props || typeof node.props !== 'object' || Array.isArray(node.props) || !Array.isArray(node.children) || node.children.length > 1024 || Object.keys(node.props).length > 64) return false
  for (const [key, entry] of Object.entries(node.props)) {
    if (key.length > 128 || typeof entry !== 'string' && typeof entry !== 'boolean' && entry !== null && (typeof entry !== 'number' || !Number.isFinite(entry))) return false
    if (typeof entry === 'string') { state.text += Buffer.byteLength(entry); if (state.text > 256 * 1024) return false }
    if (key === 'actionEventId') {
      if (node.type !== 'raycast-action' || typeof entry !== 'string' || entry.length > 128 || state.actions.size >= 256 || state.actions.has(entry)) return false
      state.actions.add(entry)
    }
  }
  return node.children.every(child => typeof child === 'string' ? (state.text += Buffer.byteLength(child)) <= 256 * 1024 && Buffer.byteLength(child) <= 16384 : validNode(child, state, depth + 1))
}

/** The approved code has account authority; this child protects the renderer and owns teardown, not a sandbox. */
export class UserRaycastManager {
  private session: Session | undefined
  private stopping: Promise<void> | undefined
  private readonly options: Readonly<{ install: UserRaycastInstall; runtime: string; nodePath: string; artifact: string; onMessage: (owner: UserRaycastOwner, message: UserRaycastMessage) => void; onError?: (owner: UserRaycastOwner, error: Error) => void; copyText?: (owner: UserRaycastOwner, text: string) => void | Promise<void> }>
  constructor(options: Readonly<{ install: UserRaycastInstall; runtime: string; nodePath: string; artifact: string; onMessage: (owner: UserRaycastOwner, message: UserRaycastMessage) => void; onError?: (owner: UserRaycastOwner, error: Error) => void; copyText?: (owner: UserRaycastOwner, text: string) => void | Promise<void> }>) { this.options = options }
  get childPid(): number | undefined { return this.session?.child.pid }
  async start(owner: UserRaycastOwner): Promise<void> {
    if (this.session || this.stopping) throw new Error('User extension is busy')
    if (!Number.isSafeInteger(owner.webContentsId) || ![this.options.nodePath, this.options.runtime, this.options.artifact].every(isAbsolute) || !existsSync(this.options.nodePath)) throw new Error('Invalid user extension owner or runtime')
    if (!this.options.install.runtimeDir()) throw new Error('Approved extension is not enabled')
    const workspace = mkdtempSync(join(tmpdir(), 'tockteam-user-raycast-'))
    try {
      const chosen = this.options.install.snapshotTo(join(workspace, 'source'))
      const manifest = JSON.parse(readFileSync(join(workspace, 'source', 'package.json'), 'utf8')) as { preferences?: unknown; commands?: Array<{ name: string; preferences?: unknown }> }
      const defaults: Record<string, string | boolean> = {}
      const commandPreferences = manifest.commands?.find(item => item.name === chosen.command)?.preferences
      for (const entry of [...(Array.isArray(manifest.preferences) ? manifest.preferences : []), ...(Array.isArray(commandPreferences) ? commandPreferences : [])]) {
        if (!entry || typeof entry !== 'object') continue
        const pref = entry as { name?: unknown; default?: unknown }
        if (typeof pref.name === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(pref.name) && (typeof pref.default === 'boolean' || typeof pref.default === 'string' && pref.default.length <= 512)) defaults[pref.name] = pref.default
      }
      const preferences = JSON.stringify(defaults)
      if (Buffer.byteLength(preferences) > 16384) throw new Error('Extension preferences exceed their bound')
      const descriptor = getTrustedRaycastRuntimeDescriptor('google-translate')!
      const bytes = admitTrustedRaycastArtifact(descriptor, this.options.artifact)
      execFileSync('/usr/bin/tar', ['xf', '-', '-C', workspace], { input: bytes, timeout: 15000 })
      symlinkSync(join(workspace, descriptor.artifactRoot, 'runtime', 'node_modules'), join(workspace, 'node_modules'))
      for (const file of ['api.mjs', 'child.mjs']) copyFileSync(join(this.options.runtime, file), join(workspace, file))
      mkdirSync(join(workspace, 'tmp'))
      const id = randomUUID()
      const child = spawn(this.options.nodePath, [join(workspace, 'child.mjs')], { cwd: workspace, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', HOME: workspace, TMPDIR: join(workspace, 'tmp'), TOCKTEAM_USER_RAYCAST_ID: chosen.extensionId, TOCKTEAM_USER_RAYCAST_SESSION: id, TOCKTEAM_USER_RAYCAST_COMMAND: chosen.command, TOCKTEAM_USER_RAYCAST_MODE: chosen.mode ?? 'view', ...(chosen.mode === 'no-view' ? { TOCKTEAM_USER_RAYCAST_STATE: this.options.install.statePath(chosen.extensionId) } : {}), TRUSTED_RAYCAST_EXTENSION_ID: chosen.extensionId, TRUSTED_RAYCAST_PREFERENCES: preferences } })
      let resolve!: () => void; let reject!: (error: Error) => void
      const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no })
      const session: Session = { child, workspace, owner, candidate: chosen, id, revision: -1, actions: new Set(), ...(chosen.mode === 'no-view' ? { action: { eventId: 'run', revision: 0, nativeUsed: false } } : {}), resolve, reject, settled: false }
      this.session = session
      const fail = (error: Error): void => {
        if (this.session !== session) return
        if (!session.settled) { session.settled = true; session.reject(error) }
        this.options.onError?.(owner, error)
        this.options.onMessage(owner, { type: 'error', extensionId: chosen.extensionId, sessionId: id, revision: Math.max(0, session.revision), message: error.message.slice(0, 512) })
        void this.close().catch(closeError => this.options.onError?.(owner, closeError))
      }
      const readLines = createTrustedRaycastLineReader(frameBytes)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (this.session !== session) return
        try {
          for (const line of readLines(chunk)) {
            const raw: unknown = JSON.parse(line)
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid extension message')
            const message = raw as UserRaycastMessage | NativeRequest
            if (message.extensionId !== chosen.extensionId || message.sessionId !== id || !Number.isSafeInteger(message.revision) || message.revision < 0) throw new Error('Invalid extension message identity')
            if (message.type === 'native') {
              if (Object.keys(message).sort().join(',') !== 'eventId,extensionId,kind,requestId,revision,sessionId,text,type' || message.kind !== 'copy' || typeof message.requestId !== 'string' || message.requestId.length > 128 || typeof message.text !== 'string' || Buffer.byteLength(message.text) > 131072 || !session.action || session.action.nativeUsed || message.eventId !== session.action.eventId || message.revision !== session.action.revision) throw new Error('Unowned native extension request')
              session.action.nativeUsed = true
              void Promise.resolve().then(() => {
                if (this.session !== session || !this.options.copyText) throw new Error('Copy is unavailable')
                return this.options.copyText(owner, message.text)
              }).then(() => {
                if (this.session === session) child.stdin.write(`${JSON.stringify({ type: 'native-result', revision: message.revision, eventId: message.eventId, requestId: message.requestId, succeeded: true })}\n`)
              }, error => {
                if (this.session === session) child.stdin.write(`${JSON.stringify({ type: 'native-result', revision: message.revision, eventId: message.eventId, requestId: message.requestId, succeeded: false, message: error instanceof Error ? error.message.slice(0, 512) : 'Copy failed' })}\n`)
              })
            } else if (message.type === 'ready' || message.type === 'patch') {
              if (message.revision <= session.revision || (session.revision === -1) !== (message.type === 'ready') || !validNode(message.root) || inspectTrustedRaycastProjection(message.root).rootBytes > frameBytes) throw new Error('Invalid extension projection')
              session.revision = message.revision
              session.actions = new Set<string>()
              const collect = (node: any): void => { if (typeof node.props.actionEventId === 'string') session.actions.add(node.props.actionEventId); for (const entry of node.children) if (typeof entry !== 'string') collect(entry) }
              collect(message.root)
              this.options.onMessage(owner, message)
              if (!session.settled) { session.settled = true; session.resolve() }
            } else if (message.type === 'outcome' && message.revision === session.action?.revision && message.eventId === session.action.eventId && typeof message.succeeded === 'boolean' && typeof message.message === 'string' && message.message.length <= 512) {
              delete session.action
              this.options.onMessage(owner, message)
              if (message.eventId === 'run') void this.close().catch(closeError => this.options.onError?.(owner, closeError))
            }
            else if (message.type === 'toast' && message.revision === session.revision && typeof message.title === 'string' && message.title.length <= 512 && typeof message.message === 'string' && message.message.length <= 4096 && ['failure', 'success', 'animated'].includes(message.style ?? '')) this.options.onMessage(owner, message)
            else if (message.type === 'error' && typeof message.message === 'string') throw new Error(message.message.slice(0, 512))
            else throw new Error('Invalid extension message')
          }
        } catch (error) { fail(error instanceof Error ? error : new Error('Invalid extension output')) }
      })
      let stderrBytes = 0
      child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 65536) fail(new Error('Extension diagnostic output exceeded its bound')) })
      child.stdin.on('error', () => fail(new Error('Extension input channel closed')))
      child.once('error', () => fail(new Error('Extension failed to start')))
      child.once('close', () => fail(new Error('Extension exited')))
      const timer = setTimeout(() => fail(new Error('Extension readiness timed out')), 15000)
      try { await ready } finally { clearTimeout(timer) }
    } catch (error) {
      await this.close()
      rmSync(workspace, { recursive: true, force: true })
      throw error
    }
  }
  send(owner: UserRaycastOwner, event: Readonly<{ revision: number; eventId: string; kind: 'action' | 'searchChanged'; value?: string }>): void {
    const session = this.session
    if (!session || owner.webContentsId !== session.owner.webContentsId) throw new Error('Extension owner is stale')
    if (event.revision !== session.revision || !Number.isSafeInteger(event.revision) || typeof event.eventId !== 'string' || event.eventId.length > 128 || event.kind !== 'action' && event.kind !== 'searchChanged' || event.kind === 'action' && !session.actions.has(event.eventId) || event.kind === 'searchChanged' && (typeof event.value !== 'string' || event.value.length > 16384) || session.action) throw new Error('Extension event is stale or busy')
    if (session.child.stdin.writableLength > 32768) throw new Error('Extension input is busy')
    if (event.kind === 'action') session.action = { eventId: event.eventId, revision: event.revision, nativeUsed: false }
    session.child.stdin.write(`${JSON.stringify({ type: 'event', ...event })}\n`)
  }
  async closeOwner(owner: UserRaycastOwner): Promise<void> { if (this.session?.owner.webContentsId === owner.webContentsId) await this.close() }
  async close(): Promise<void> {
    if (this.stopping) return this.stopping
    const session = this.session
    if (!session) return
    this.session = undefined
    if (!session.settled) { session.settled = true; session.reject(new Error('Extension was closed before readiness')) }
    this.stopping = (async () => {
      session.child.stdout.resume(); session.child.stderr.resume()
      await stopOwnedChild(session.child, 250, true)
      rmSync(session.workspace, { recursive: true, force: true })
    })()
    try { await this.stopping } finally { this.stopping = undefined }
  }
}
