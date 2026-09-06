// @ts-expect-error JavaScript helper owns bounded process-group termination.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { admitTrustedRaycastArtifact, TRUSTED_RAYCAST_ARTIFACT_SHA256 } from './trusted-raycast-artifact-admission.ts'
import { isTrustedRaycastNativeRequest, type TrustedRaycastNativeRequest, type TrustedRaycastViewNode, isTrustedRaycastViewEvent, parseTrustedRaycastChildMessage, isTrustedRaycastViewOpen, type TrustedRaycastViewEvent, type TrustedRaycastViewMessage, type TrustedRaycastViewOpen } from './trusted-raycast-contract.ts'

export type TrustedRaycastOwner = Readonly<{ webContentsId: number }>
export type TrustedRaycastManagerOptions = Readonly<{
  runtimeDir: string
  nodePath: string
  onMessage: (owner: TrustedRaycastOwner, message: TrustedRaycastViewMessage) => void
  onError?: (owner: TrustedRaycastOwner, error: Error) => void
  copyText?: (text: string) => void | Promise<void>
  openGoogleTranslate?: (url: string) => Promise<void>
}>
type Session = { revoked?: boolean; child: ChildProcessWithoutNullStreams; owner: TrustedRaycastOwner; input: TrustedRaycastViewOpen; workspace: string; revision: number; querySequence: number; eventId: string; actions: Map<string, string>; action?: { eventId: string; revision: number; nativeUsed: boolean } | undefined; reject: (error: Error) => void }

/** Main owns identity and the sole live child. Trusted code is not an OS sandbox. */
export class TrustedRaycastManager {
  private session: Session | undefined
  private stopping: Promise<void> | undefined
  private disposed = false
  private readonly options: TrustedRaycastManagerOptions
  constructor(options: TrustedRaycastManagerOptions) { this.options = options }
  get active(): boolean { return this.session !== undefined && !this.session.revoked }
  get available(): boolean {
    if (process.platform !== 'darwin' || !existsSync(join(this.options.runtimeDir, 'child.mjs'))) return false
    try {
      const metadata = JSON.parse(readFileSync(join(this.options.runtimeDir, 'build.json'), 'utf8'))
      if (metadata.artifactSha256 !== TRUSTED_RAYCAST_ARTIFACT_SHA256) return false
      admitTrustedRaycastArtifact(join(this.options.runtimeDir, 'artifact.tar'))
      return true
    } catch { return false }
  }
  async start(owner: TrustedRaycastOwner, input: TrustedRaycastViewOpen): Promise<void> {
    const startedAt = Date.now()
    if (this.disposed || this.session || this.stopping) throw new Error('Translate runtime is busy or closed')
    if (!isTrustedRaycastViewOpen(input)) throw new Error('Invalid Translate session')
    if (Object.keys(input.preferences).length !== 0) throw new Error('Custom Translate preferences are not supported in this slice')
    if (!isAbsolute(this.options.nodePath) || !existsSync(this.options.nodePath)) throw new Error('Packaged Node is unavailable')
    const metadata = JSON.parse(readFileSync(join(this.options.runtimeDir, 'build.json'), 'utf8'))
    if (metadata.artifactSha256 !== TRUSTED_RAYCAST_ARTIFACT_SHA256 || metadata.command !== 'translate' || metadata.react !== '19.0.0' || metadata.reconciler !== '0.31.0') throw new Error('Translate build identity mismatch')
    const bytes = admitTrustedRaycastArtifact(join(this.options.runtimeDir, 'artifact.tar'))
    const workspace = mkdtempSync(join(tmpdir(), 'tockteam-trusted-raycast-'))
    let current: Session | undefined
    try {
      execFileSync('/usr/bin/tar', ['xf', '-', '-C', workspace], { input: bytes, timeout: 15000 })
      const runtime = join(workspace, 'tockteam-raycast-artifact', 'runtime', 'node_modules')
      symlinkSync(runtime, join(workspace, 'node_modules'))
      copyFileSync(join(this.options.runtimeDir, 'child.mjs'), join(workspace, 'child.mjs'))
      copyFileSync(join(this.options.runtimeDir, 'resolution.mjs'), join(workspace, 'resolution.mjs'))
      mkdirSync(join(workspace, 'tmp'))
      const child = spawn(this.options.nodePath, ['--import', join(workspace, 'resolution.mjs'), join(workspace, 'child.mjs')], {
        cwd: workspace, detached: true,
        env: { PATH: '/usr/bin:/bin', HOME: workspace, TMPDIR: join(workspace, 'tmp'), TMP: join(workspace, 'tmp'), TEMP: join(workspace, 'tmp'), TRUSTED_RAYCAST_SESSION_ID: input.sessionId, TRUSTED_RAYCAST_GENERATION: input.generation },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let resolveReady!: () => void
      let rejectReady!: (error: Error) => void
      const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
      current = { child, owner, input, workspace, revision: -1, querySequence: 0, eventId: '', actions: new Map(), reject: rejectReady }
      this.session = current
      const session = current
      const fail = (error: Error): void => {
        if (this.session !== session || session.revoked) return
        rejectReady(error)
        this.options.onError?.(owner, error)
        void this.stop(error.message).catch(error => this.options.onError?.(owner, error))
      }
      let pending = ''; let stderrBytes = 0; let diagnostic = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (this.session !== session || session.revoked) return
        pending += chunk
        if (Buffer.byteLength(pending) > 1024 * 1024) { fail(new Error('Translate output exceeded its bound')); return }
        let end: number
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1)
          try {
            const raw: unknown = JSON.parse(line)
            if ((raw as { type?: string })?.type === 'native') {
              if (!isTrustedRaycastNativeRequest(raw)) throw new Error('Invalid Translate native request')
              void this.native(session, raw)
              continue
            }
            const message = parseTrustedRaycastChildMessage(line, input, session.revision)
            if (message.type === 'error') throw new Error(message.message)
            if (message.type === 'toast') {
              if (message.querySequence === session.querySequence) this.options.onMessage(owner, message)
              else if (message.querySequence! > session.querySequence) throw new Error('Invalid Translate toast query sequence')
              continue
            }
            if (message.type === 'outcome') {
              if (session.action?.eventId === message.eventId) { session.action = undefined; this.options.onMessage(owner, message) }
              continue
            }
            session.revision = message.revision
            session.eventId = randomUUID()
            session.actions.clear()
            const querySequence = message.root!.props.querySequence
            if (!Number.isSafeInteger(querySequence) || (querySequence as number) < 0 || (querySequence as number) > session.querySequence) throw new Error('Invalid Translate query sequence')
            const wrap = (node: TrustedRaycastViewNode): TrustedRaycastViewNode => {
              const props = { ...node.props }
              if (Object.hasOwn(props, 'actionEventId')) {
                if (node.type !== 'raycast-action' || typeof props.actionEventId !== 'string') throw new Error('Invalid Translate action handle')
                if (querySequence === session.querySequence) { const id = randomUUID(); session.actions.set(id, props.actionEventId); props.actionEventId = id }
                else delete props.actionEventId
              }
              return { ...node, props, children: node.children.map(child => typeof child === 'string' ? child : wrap(child)) }
            }
            const root = wrap(message.root!)
            this.options.onMessage(owner, { ...message, root: { ...root, props: { ...root.props, searchEventId: session.eventId, queryCurrent: querySequence === session.querySequence } } })
            resolveReady()
          } catch (error) { fail(error instanceof Error ? error : new Error('Invalid Translate output')); return }
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (this.session !== session || session.revoked) return
        stderrBytes += chunk.length
        if (stderrBytes > 65536) { fail(new Error('Translate diagnostic output exceeded its bound')); return }
        diagnostic += chunk.toString()
        let end: number
        while ((end = diagnostic.indexOf('\n')) >= 0) {
          const line = diagnostic.slice(0, end); diagnostic = diagnostic.slice(end + 1)
          // Diagnostics are bounded, but ordinary service failures use typed view toasts.
        }
      })
      child.stdin.on('error', () => fail(new Error('Translate input channel closed')))
      child.once('error', () => fail(new Error('Translate child failed to start')))
      child.once('close', () => fail(new Error('Translate runtime closed')))
      const timer = setTimeout(() => fail(new Error('Translate readiness timed out')), Math.max(1, 15000 - (Date.now() - startedAt)))
      try { await ready } finally { clearTimeout(timer) }
    } catch (error) {
      if (current) await this.stop('startup-failed')
      else rmSync(workspace, { recursive: true, force: true })
      throw error
    }
  }
  send(owner: TrustedRaycastOwner, event: TrustedRaycastViewEvent): void {
    const session = this.session
    if (!isTrustedRaycastViewEvent(event) || !session || session.revoked || owner.webContentsId !== session.owner.webContentsId || event.sessionId !== session.input.sessionId || event.generation !== session.input.generation || event.revision !== session.revision) throw new Error('Translate event is stale')
    if (session.child.stdin.writableLength > 32768) throw new Error('Translate input is busy')
    if (event.kind === 'searchChanged') {
      if (event.eventId !== session.eventId) throw new Error('Translate event is stale')
      session.querySequence++
      session.actions.clear(); session.action = undefined
      session.child.stdin.write(`${JSON.stringify(event)}\n`)
      return
    }
    if (event.kind !== 'action' || event.value !== undefined || !session.actions.has(event.eventId)) throw new Error('Translate event is stale')
    if (session.action) throw new Error('Translate action is busy')
    session.action = { eventId: event.eventId, revision: event.revision, nativeUsed: false }
    session.child.stdin.write(`${JSON.stringify({ ...event, value: session.actions.get(event.eventId) })}\n`)
  }
  private async native(session: Session, request: TrustedRaycastNativeRequest): Promise<void> {
    let succeeded = false
    let message = ''
    try {
      if (this.session !== session || session.revoked || request.sessionId !== session.input.sessionId || request.generation !== session.input.generation || request.eventId !== session.action?.eventId || request.revision !== session.action.revision || session.action.nativeUsed) throw new Error('Translate native action is stale')
      session.action.nativeUsed = true
      if (request.kind === 'copy') {
        if (!this.options.copyText) throw new Error('Clipboard Copy is unavailable')
        await this.options.copyText(request.text)
      } else {
        if (!this.options.openGoogleTranslate) throw new Error('Browser opening is unavailable')
        await this.options.openGoogleTranslate(request.url)
      }
      succeeded = true
    } catch (error) { message = error instanceof Error ? error.message.slice(0, 512) : 'Native action failed' }
    if (this.session === session && !session.revoked) session.child.stdin.write(`${JSON.stringify({ type: 'nativeOutcome', requestId: request.requestId, succeeded, message })}\n`)
  }
  async closeOwner(owner: TrustedRaycastOwner): Promise<void> {
    if (this.session?.owner.webContentsId === owner.webContentsId) await this.stop('owner-closed')
  }
  async stop(reason = 'closed'): Promise<void> {
    if (this.stopping) return await this.stopping
    const session = this.session
    if (!session) return
    session.revoked = true
    session.reject(new Error('Translate session closed'))
    const operation = (async () => {
      try {
        this.options.onMessage(session.owner, { type: 'error', sessionId: session.input.sessionId, generation: session.input.generation, revision: session.revision + 1, message: `Translate session closed: ${reason}`.slice(0, 128) })
      } finally {
        await stopOwnedChild(session.child, 250, true)
        session.child.stdout.removeAllListeners()
        session.child.stderr.removeAllListeners()
        session.child.stdin.removeAllListeners()
        session.child.removeAllListeners()
        rmSync(session.workspace, { recursive: true, force: true })
        this.session = undefined
      }
    })()
    this.stopping = operation
    try { await operation } finally { this.stopping = undefined }
  }
  async close(): Promise<void> { this.disposed = true; await this.stop('shutdown') }
}
