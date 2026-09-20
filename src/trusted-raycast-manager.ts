// @ts-expect-error JavaScript helper owns bounded process-group termination.
import { stopOwnedChild } from '../scripts/trusted-raycast-process.mjs'
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, isAbsolute, dirname } from 'node:path'
import { admitTrustedRaycastArtifact, readLegacyGoogleTranslateBuildIdentity, readTrustedRaycastBuildIdentity, readTrustedRaycastDerivedFile } from './trusted-raycast-artifact-admission.ts'
import { getTrustedRaycastRuntimeDescriptor, type TrustedRaycastExtensionId, type TrustedRaycastRuntimeExtensionId } from './trusted-raycast-descriptors.ts'
import { createTrustedRaycastCanIUsePreferenceForm } from './trusted-raycast-can-i-use-preference-form.ts'
import { createTrustedRaycastCanIUseRuntime, loadTrustedRaycastCanIUseData } from './trusted-raycast-can-i-use-runtime.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, prepareTrustedRaycastCanIUsePreferences, type TrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import { isTrustedRaycastNativeRequest, isTrustedRaycastPreferences, KAOMOJI_PREFERENCE_DEFAULTS, TRUSTED_RAYCAST_PREFERENCE_DEFAULTS, type TrustedRaycastNativeRequest, type TrustedRaycastViewNode, isTrustedRaycastViewEvent, parseTrustedRaycastChildMessage, isTrustedRaycastViewOpen, type TrustedRaycastViewEvent, type TrustedRaycastViewMessage, type TrustedRaycastViewOpen } from './trusted-raycast-contract.ts'

export type TrustedRaycastOwner = Readonly<{ webContentsId: number }>
export type TrustedRaycastManagerOptions = Readonly<{
  /** The live runtime directory, or a main-owned resolver when the install store owns it. */
  runtimeDir: string | ((extensionId: TrustedRaycastRuntimeExtensionId) => string | undefined)
  nodePath: string
  resolveTranslateProxy?: () => Promise<string>
  onMessage: (owner: TrustedRaycastOwner, message: TrustedRaycastViewMessage) => void
  onError?: (owner: TrustedRaycastOwner, error: Error) => void
  copyText?: (text: string) => void | Promise<void>
  openGoogleTranslate?: (url: string) => Promise<void>
  openCanIUse?: (url: string) => Promise<void>
  saveCanIUsePreferences?: (preferences: TrustedRaycastCanIUsePreferences, canonicalTargets: readonly string[], previous: Readonly<Record<string, boolean | string>>) => void | Promise<void>
  readSelectedText?: () => Promise<Readonly<{ text?: string; unavailable?: string }>>
  pasteText?: (text: string) => void | Promise<void>
  preferencesConfigured?: (extensionId: TrustedRaycastExtensionId) => boolean
  savePreferences?: (preferences: Readonly<Record<string, boolean | string>>, extensionId: TrustedRaycastExtensionId, previous: Readonly<Record<string, boolean | string>>) => void | Promise<void>
  stateFile?: string | ((extensionId: TrustedRaycastExtensionId) => string | undefined)
}>
type Session = { themeEventId?: string | undefined; preferencesEventId?: string | undefined; navigationEventId?: string | undefined; canIUse?: ReturnType<typeof createTrustedRaycastCanIUseRuntime>; revoked?: boolean; child: ChildProcessWithoutNullStreams; owner: TrustedRaycastOwner; input: TrustedRaycastViewOpen; workspace: string; revision: number; querySequence: number; eventId: string; actions: Map<string, string>; fields: Map<string, string>; action?: { eventId: string; revision: number; nativeUsed: boolean } | undefined; reject: (error: Error) => void }
type CanPreferenceField = 'defaultQuery' | 'showReleaseDate' | 'showPartialSupport' | 'briefMode'
type CanPreferenceSetup = { owner: TrustedRaycastOwner; input: TrustedRaycastViewOpen; workspace: string; data: ReturnType<typeof loadTrustedRaycastCanIUseData>; values: TrustedRaycastCanIUsePreferences; fields: Readonly<Record<CanPreferenceField, string>>; submitId: string; saving: boolean }
type Preview = { child: ChildProcessWithoutNullStreams; workspace: string; phase: 'running' | 'cleanup-failed'; stopping?: Promise<void> }

/** Main owns identity and the sole live child. Trusted code is not an OS sandbox. */
export class TrustedRaycastManager {
  private session: Session | undefined
  private stopping: Promise<void> | undefined
  private preview: Preview | undefined
  private setup: CanPreferenceSetup | undefined
  private disposed = false
  private lifecycleToken = Symbol()
  private readonly options: TrustedRaycastManagerOptions
  constructor(options: TrustedRaycastManagerOptions) { this.options = options }
  get active(): boolean { return this.setup !== undefined || (this.session !== undefined && !this.session.revoked) }
  get activeExtensionId(): TrustedRaycastRuntimeExtensionId | undefined { return this.setup ? 'can-i-use' : this.session?.revoked ? undefined : this.session?.input.extensionId }
  private resolveRuntimeDir(extensionId: TrustedRaycastRuntimeExtensionId): string | undefined {
    const resolved = typeof this.options.runtimeDir === 'function' ? this.options.runtimeDir(extensionId) : this.options.runtimeDir
    return resolved === '' ? undefined : resolved
  }
  get available(): boolean { return this.availableFor('google-translate') }
  private readBuildIdentity(runtimeDir: string, extensionId: TrustedRaycastRuntimeExtensionId) {
    const descriptor = getTrustedRaycastRuntimeDescriptor(extensionId)!
    try { return readTrustedRaycastBuildIdentity(runtimeDir, descriptor) }
    catch (error) {
      if (extensionId !== 'google-translate') throw error
      return readLegacyGoogleTranslateBuildIdentity(runtimeDir, descriptor)
    }
  }
  availableFor(extensionId: TrustedRaycastRuntimeExtensionId): boolean {
    if (process.platform !== 'darwin') return false
    const runtimeDir = this.resolveRuntimeDir(extensionId)
    if (runtimeDir === undefined) return false
    try { this.readBuildIdentity(runtimeDir, extensionId); return true } catch { return false }
  }
  /** Shared admission and workspace staging; main calls this before any child can load. */
  private stageWorkspace(runtimeDir: string, input: TrustedRaycastViewOpen): { workspace: string; artifactRoot: string } {
    const descriptor = getTrustedRaycastRuntimeDescriptor(input.extensionId)!
    const identity = this.readBuildIdentity(runtimeDir, input.extensionId)
    const bytes = admitTrustedRaycastArtifact(descriptor, join(runtimeDir, 'artifact.tar'))
    const workspace = mkdtempSync(join(tmpdir(), 'tockteam-trusted-raycast-'))
    try {
      execFileSync('/usr/bin/tar', ['xf', '-', '-C', workspace], { input: bytes, timeout: 15000 })
      const runtime = join(workspace, descriptor.artifactRoot, 'runtime', 'node_modules')
      symlinkSync(runtime, join(workspace, 'node_modules'))
      // Read through checked descriptors, then execute the exact bytes that were verified.
      writeFileSync(join(workspace, 'child.mjs'), readTrustedRaycastDerivedFile(join(runtimeDir, 'child.mjs'), identity.childSha256))
      writeFileSync(join(workspace, 'resolution.mjs'), readTrustedRaycastDerivedFile(join(runtimeDir, 'resolution.mjs'), identity.resolutionSha256))
      mkdirSync(join(workspace, 'tmp'))
      return { workspace, artifactRoot: descriptor.artifactRoot }
    } catch (error) { rmSync(workspace, { recursive: true, force: true }); throw error }
  }
  private createWorkspace(runtimeDir: string, input: TrustedRaycastViewOpen, initialQuery = '', translateProxy = ''): { child: ChildProcessWithoutNullStreams; workspace: string; canIUse?: ReturnType<typeof createTrustedRaycastCanIUseRuntime> } {
    const { workspace, artifactRoot } = this.stageWorkspace(runtimeDir, input)
    try {
      const canIUse = input.extensionId === 'can-i-use' ? createTrustedRaycastCanIUseRuntime(join(workspace, artifactRoot), input.sessionId, input.preferences, initialQuery) : undefined
      const stateFile = input.extensionId === 'can-i-use' ? undefined : typeof this.options.stateFile === 'function' ? this.options.stateFile(input.extensionId) : this.options.stateFile
      if (stateFile !== undefined) mkdirSync(dirname(stateFile), { recursive: true })
      const defaults = input.extensionId === 'kaomoji-search' ? KAOMOJI_PREFERENCE_DEFAULTS : TRUSTED_RAYCAST_PREFERENCE_DEFAULTS
      const child = spawn(this.options.nodePath, ['--import', join(workspace, 'resolution.mjs'), join(workspace, 'child.mjs')], {
        cwd: workspace, detached: true,
        env: { PATH: '/usr/bin:/bin', HOME: workspace, TMPDIR: join(workspace, 'tmp'), TMP: join(workspace, 'tmp'), TEMP: join(workspace, 'tmp'), TRUSTED_RAYCAST_EXTENSION_ID: input.extensionId, TRUSTED_RAYCAST_SESSION_ID: input.sessionId, TRUSTED_RAYCAST_GENERATION: input.generation, TRUSTED_RAYCAST_PREFERENCES: JSON.stringify(canIUse?.preferences ?? (Object.keys(input.preferences).length === 0 ? defaults : input.preferences)), TRUSTED_RAYCAST_PREFERENCES_CONFIGURED: input.extensionId !== 'can-i-use' && this.options.preferencesConfigured?.(input.extensionId) === false ? '0' : '1', ...(stateFile === undefined ? {} : { TRUSTED_RAYCAST_STATE_FILE: stateFile }), ...(input.extensionId === 'google-translate' ? { TRUSTED_RAYCAST_TRANSLATE_PROXY: String(input.preferences.proxy || translateProxy) } : {}), ...(canIUse ? { TRUSTED_RAYCAST_CAN_I_USE_CONTEXT: JSON.stringify(canIUse.context), TRUSTED_RAYCAST_CAN_I_USE_ROOT: canIUse.initialMessage } : {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { child, workspace, ...(canIUse ? { canIUse } : {}) }
    } catch (error) {
      rmSync(workspace, { recursive: true, force: true })
      throw error
    }
  }
  /** First-party configuration precedes any source process or upstream preference read. */
  private openCanIUseSetup(owner: TrustedRaycastOwner, input: TrustedRaycastViewOpen, runtimeDir: string, checkLaunch?: () => void): void {
    if (this.disposed || this.session || this.setup || this.stopping || this.preview) throw new Error('Can I Use preferences are busy')
    const { workspace, artifactRoot } = this.stageWorkspace(runtimeDir, input)
    try {
      const data = loadTrustedRaycastCanIUseData(join(workspace, artifactRoot))
      const initial = Object.keys(input.preferences).length === 0
        ? { ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: data.defaultTargets.join(','), environment: 'production' }
        : input.preferences
      const values = prepareTrustedRaycastCanIUsePreferences(initial, { canonicalTargets: data.canonicalTargets }).preferences
      const fields = { defaultQuery: randomUUID(), showReleaseDate: randomUUID(), showPartialSupport: randomUUID(), briefMode: randomUUID() }
      const submitId = randomUUID()
      checkLaunch?.()
      this.setup = { owner, input, workspace, data, values, fields, submitId, saving: false }
      this.options.onMessage(owner, { type: 'ready', extensionId: 'can-i-use', sessionId: input.sessionId, generation: input.generation, revision: 0,
        root: createTrustedRaycastCanIUsePreferenceForm(values, fields, submitId) })
    } catch (error) { this.setup = undefined; rmSync(workspace, { recursive: true, force: true }); throw error }
  }
  private sendCanIUseSetup(owner: TrustedRaycastOwner, event: TrustedRaycastViewEvent): void {
    const setup = this.setup!
    if (!isTrustedRaycastViewEvent(event) || owner.webContentsId !== setup.owner.webContentsId || event.extensionId !== 'can-i-use'
      || event.sessionId !== setup.input.sessionId || event.generation !== setup.input.generation || event.revision !== 0) throw new Error('Can I Use preference event is stale')
    if (setup.saving) throw new Error('Can I Use preferences are busy')
    if (event.kind === 'fieldChanged') {
      const field = (Object.keys(setup.fields) as CanPreferenceField[]).find(field => setup.fields[field] === event.eventId)
      if (!field || typeof event.value !== 'string') throw new Error('Can I Use preference event is stale')
      if (field === 'defaultQuery') setup.values = { ...setup.values, defaultQuery: event.value }
      else {
        if (event.value !== 'true' && event.value !== 'false') throw new Error('Invalid Can I Use preference')
        setup.values = { ...setup.values, [field]: event.value === 'true' }
      }
      return
    }
    if (event.kind !== 'action' || event.value !== undefined || event.eventId !== setup.submitId) throw new Error('Can I Use preference event is stale')
    setup.saving = true
    void this.saveCanIUseSetup(setup)
  }
  private async saveCanIUseSetup(setup: CanPreferenceSetup): Promise<void> {
    const fail = (message: string): void => {
      if (this.setup !== setup) return
      setup.saving = false
      this.options.onMessage(setup.owner, { type: 'outcome', extensionId: 'can-i-use', sessionId: setup.input.sessionId, generation: setup.input.generation,
        revision: 0, eventId: setup.submitId, succeeded: false, message })
    }
    let preferences: TrustedRaycastCanIUsePreferences
    try { preferences = prepareTrustedRaycastCanIUsePreferences(setup.values, { canonicalTargets: setup.data.canonicalTargets }).preferences }
    catch { fail('Use supported exact browser targets, such as chrome 100, firefox 100.'); return }
    try {
      if (!this.options.saveCanIUsePreferences) throw new Error('Preference storage is unavailable')
      await this.options.saveCanIUsePreferences(preferences, setup.data.canonicalTargets, setup.input.preferences)
    } catch { fail('Preferences could not be saved. Please try again.'); return }
    if (this.setup !== setup || this.disposed) return
    this.setup = undefined
    rmSync(setup.workspace, { recursive: true, force: true })
    try { await this.start(setup.owner, { ...setup.input, sessionId: randomUUID(), generation: randomUUID(), preferences }) }
    catch (error) { this.options.onError?.(setup.owner, error instanceof Error ? error : new Error('Can I Use could not start')) }
  }
  private async stopPreview(): Promise<void> {
    const preview = this.preview
    if (preview === undefined) return
    if (preview.stopping !== undefined) return await preview.stopping
    const operation = (async () => {
      await stopOwnedChild(preview.child, 250, true)
      rmSync(preview.workspace, { recursive: true, force: true })
      if (this.preview === preview) this.preview = undefined
    })()
    preview.stopping = operation
    try { await operation } catch (error) { delete preview.stopping; preview.phase = 'cleanup-failed'; throw error }
  }

  /** Isolated bounded boot of a staged install: first valid readiness or a typed failure, then teardown. */
  async previewRuntime(runtimeDir: string, extensionId: TrustedRaycastRuntimeExtensionId = 'google-translate'): Promise<string> {
    if (this.disposed || this.session || this.setup || this.stopping || (this.preview && this.preview.phase !== 'cleanup-failed')) throw new Error('Trusted extension runtime is busy or closed')
    if (this.preview?.phase === 'cleanup-failed') await this.stopPreview()
    const descriptor = getTrustedRaycastRuntimeDescriptor(extensionId)!
    // Candidate preview uses an explicit, already reviewed exact query, never the unsupported defaults token.
    const input: TrustedRaycastViewOpen = Object.freeze({ extensionId, sessionId: randomUUID(), generation: randomUUID(), command: descriptor.command, preferences: extensionId === 'can-i-use' ? Object.freeze({ ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: 'chrome 100' }) : Object.freeze({}) })
    const { child, workspace, canIUse } = this.createWorkspace(runtimeDir, input)
    this.preview = { child, workspace, phase: 'running' }
    try {
      await new Promise<void>((resolve, reject) => {
        let pending = ''
        let finished = false
        const finish = (error?: Error): void => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          // Drain the pipes to EOF: paused stdio would keep the child 'close' event from ever firing.
          child.stdout.removeAllListeners('data'); child.stdout.resume()
          child.stderr.resume()
          child.stdin.removeAllListeners()
          child.removeAllListeners()
          if (error) reject(error); else resolve()
        }
        const timer = setTimeout(() => finish(new Error('Translate preview readiness timed out')), 15000)
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
          pending += chunk
          if (Buffer.byteLength(pending) > 1024 * 1024) { finish(new Error('Translate preview output exceeded its bound')); return }
          let end: number
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end); pending = pending.slice(end + 1)
            try {
              const message = parseTrustedRaycastChildMessage(line, input, -1)
              if (message.type === 'ready') { canIUse?.publish(message.root!); finish(); return }
              if (message.type === 'error') { finish(new Error(message.message)); return }
            } catch (error) { finish(error instanceof Error ? error : new Error('Invalid Translate preview output')); return }
          }
        })
        child.once('error', () => finish(new Error('Translate preview failed to start')))
        child.once('close', () => finish(new Error('Translate preview closed before readiness')))
      })
      return ''
    } finally { try { canIUse?.close() } finally { await this.stopPreview() } }
  }
  async start(owner: TrustedRaycastOwner, input: TrustedRaycastViewOpen, initialQuery = '', checkLaunch?: () => void): Promise<void> {
    const startedAt = Date.now()
    if (this.disposed || this.session || this.setup || this.stopping || this.preview) throw new Error('Translate runtime is busy or closed')
    if (!isTrustedRaycastViewOpen(input)) throw new Error('Invalid Translate session')
    if (input.extensionId === 'google-translate' && Object.keys(input.preferences).length !== 0 && !isTrustedRaycastPreferences(input.preferences)) throw new Error('Unsupported Translate preferences')
    if (!isAbsolute(this.options.nodePath) || !existsSync(this.options.nodePath)) throw new Error('Packaged Node is unavailable')
    const runtimeDir = this.resolveRuntimeDir(input.extensionId)
    if (runtimeDir === undefined) throw new Error('Trusted extension capability is not installed')
    if (input.extensionId === 'can-i-use' && Object.keys(input.preferences).length === 0) { this.openCanIUseSetup(owner, input, runtimeDir, checkLaunch); return }
    let current: Session | undefined
    let workspace = ''
    try {
      const token = this.lifecycleToken
      const proxy = input.extensionId === 'google-translate' && !input.preferences.proxy && this.options.resolveTranslateProxy
        ? await this.options.resolveTranslateProxy() : ''
      if (this.disposed || this.session || this.setup || this.stopping || this.preview || token !== this.lifecycleToken) throw new Error('Translate startup was cancelled')
      checkLaunch?.()
      const created = this.createWorkspace(runtimeDir, input, initialQuery, proxy)
      workspace = created.workspace
      const child = created.child
      let resolveReady!: () => void
      let rejectReady!: (error: Error) => void
      const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
      current = { ...(created.canIUse ? { canIUse: created.canIUse } : {}), child, owner, input, workspace, revision: -1, querySequence: 0, eventId: '', actions: new Map(), fields: new Map(), reject: rejectReady }
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
            session.eventId = ''
            session.actions.clear()
            session.fields.clear()
            const querySequence = message.root!.props.querySequence
            if (!Number.isSafeInteger(querySequence) || (querySequence as number) < 0 || (querySequence as number) > session.querySequence) throw new Error('Invalid Translate query sequence')
            if (session.canIUse) {
              if (querySequence !== session.querySequence) throw new Error('SNAPSHOT_STALE')
            }
            const sourceRoot = session.canIUse?.publish(message.root!) ?? message.root!
            session.navigationEventId = typeof sourceRoot.props.navigationEventId === 'string' ? sourceRoot.props.navigationEventId : undefined
            const wrap = (node: TrustedRaycastViewNode): TrustedRaycastViewNode => {
              const props = { ...node.props }
              if (Object.hasOwn(props, 'actionEventId')) {
                if (node.type !== 'raycast-action' || typeof props.actionEventId !== 'string') throw new Error('Invalid Translate action handle')
                if (querySequence === session.querySequence) { const id = randomUUID(); session.actions.set(id, props.actionEventId); props.actionEventId = id }
                else delete props.actionEventId
              }
              if (Object.hasOwn(props, 'fieldEventId')) {
                if ((node.type !== 'raycast-form-dropdown' && node.type !== 'raycast-dropdown') || typeof props.fieldEventId !== 'string') throw new Error('Invalid Translate field handle')
                if (querySequence === session.querySequence) { const id = randomUUID(); session.fields.set(id, props.fieldEventId); props.fieldEventId = id }
                else delete props.fieldEventId
              }
              return { ...node, props, children: node.children.map(child => typeof child === 'string' ? child : wrap(child)) }
            }
            const root = wrap(sourceRoot)
            // Readiness replaces approval before start resolves; the captured launch must still own it.
            if (message.type === 'ready') checkLaunch?.()
            this.options.onMessage(owner, { ...message, root: { ...root, props: { ...root.props, ...(root.props.searchable === true ? { searchEventId: session.eventId = randomUUID() } : {}), ...(session.canIUse ? { preferencesEventId: session.preferencesEventId = randomUUID(), themeEventId: session.themeEventId = randomUUID() } : {}), queryCurrent: querySequence === session.querySequence } } })
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
      else if (workspace) rmSync(workspace, { recursive: true, force: true })
      throw error
    }
  }
  send(owner: TrustedRaycastOwner, event: TrustedRaycastViewEvent): void {
    if (this.setup) { this.sendCanIUseSetup(owner, event); return }
    const session = this.session
    if (!isTrustedRaycastViewEvent(event) || !session || session.revoked || owner.webContentsId !== session.owner.webContentsId || event.extensionId !== session.input.extensionId || event.sessionId !== session.input.sessionId || event.generation !== session.input.generation || event.revision !== session.revision) throw new Error('Translate event is stale')
    if (session.child.stdin.writableLength > 32768) throw new Error('Translate input is busy')
    if (event.kind === 'searchChanged') {
      if (event.eventId !== session.eventId || session.eventId === '') throw new Error('Translate event is stale')
      if (session.canIUse) {
        session.eventId = ''; session.preferencesEventId = undefined; session.themeEventId = undefined
        session.actions.clear(); session.fields.clear(); session.action = undefined
        try {
          const packet = session.canIUse.search(event.value)
          session.querySequence++
          session.child.stdin.write(`${packet}\n`)
        } catch (error) {
          void this.stop('search-failed').catch(error => this.options.onError?.(owner, error))
          throw error
        }
        return
      }
      session.querySequence++
      session.actions.clear(); session.fields.clear(); session.action = undefined
      session.child.stdin.write(`${JSON.stringify(event)}\n`)
      return
    }
    if (session.canIUse) {
      if (event.kind === 'themeChanged') {
        if (event.eventId !== session.themeEventId) throw new Error('Can I Use theme event is stale')
        void this.restartCanIUse(owner).catch(() => this.options.onMessage(owner, { type: 'error', extensionId: 'can-i-use',
          sessionId: session.input.sessionId, generation: session.input.generation, revision: session.revision + 1, message: 'Can I Use could not refresh. Please reopen the command.' }))
        return
      }
      if (event.kind === 'action' && event.value === undefined && session.preferencesEventId === event.eventId) {
        if (session.action) throw new Error('Can I Use action is busy')
        void this.configureCanIUse(session).catch(() => this.options.onMessage(owner, { type: 'error', extensionId: 'can-i-use',
          sessionId: session.input.sessionId, generation: session.input.generation, revision: session.revision + 1, message: 'Preferences could not be opened. Please reopen the command.' }))
        return
      }
      const actionId = session.actions.get(event.eventId)
      const back = event.kind === 'navigation' && event.value === 'can-i-use:pop' && session.navigationEventId === event.eventId
      if (!back && (event.kind !== 'action' || event.value !== undefined || actionId === undefined)) throw new Error('Can I Use event is stale')
      if (session.action) throw new Error('Can I Use action is busy')
      try {
        const result = back ? { kind: 'detail' as const, message: session.canIUse.pop(event.eventId) } : session.canIUse.activate(actionId!)
        if (result.kind === 'open-browser') {
          session.action = { eventId: event.eventId, revision: event.revision, nativeUsed: true }
          void this.openCanIUse(session, result.url)
          return
        }
        const packet = result.message
        session.eventId = ''; session.navigationEventId = undefined; session.preferencesEventId = undefined; session.themeEventId = undefined
        session.actions.clear(); session.fields.clear(); session.action = undefined
        session.querySequence++
        session.child.stdin.write(`${packet}\n`)
      } catch (error) {
        void this.stop('navigation-failed').catch(error => this.options.onError?.(owner, error))
        throw error
      }
      return
    }
    if (event.kind === 'fieldChanged') {
      if (!session.fields.has(event.eventId)) throw new Error('Translate event is stale')
      session.child.stdin.write(`${JSON.stringify({ ...event, eventId: session.fields.get(event.eventId) })}\n`)
      return
    }
    if (event.kind === 'navigation') {
      session.child.stdin.write(`${JSON.stringify(event)}\n`)
      return
    }
    if (event.kind !== 'action' || event.value !== undefined || !session.actions.has(event.eventId)) throw new Error('Translate event is stale')
    if (session.action) throw new Error('Translate action is busy')
    session.action = { eventId: event.eventId, revision: event.revision, nativeUsed: false }
    session.child.stdin.write(`${JSON.stringify({ ...event, value: session.actions.get(event.eventId) })}\n`)
  }
  private async openCanIUse(session: Session, url: string): Promise<void> {
    const action = session.action!
    let succeeded = false
    let message = ''
    try {
      if (this.session !== session || session.revoked || session.revision !== action.revision) throw new Error('Can I Use action is stale')
      if (!this.options.openCanIUse) throw new Error('Browser opening is unavailable')
      await this.options.openCanIUse(url)
      succeeded = true
    } catch (error) { message = error instanceof Error ? error.message.slice(0, 512) : 'Browser opening failed' }
    if (this.session === session && !session.revoked && session.action === action) {
      session.action = undefined
      this.options.onMessage(session.owner, { type: 'outcome', extensionId: session.input.extensionId, sessionId: session.input.sessionId,
        generation: session.input.generation, revision: session.revision, eventId: action.eventId, succeeded, message })
    }
  }
  private async native(session: Session, request: TrustedRaycastNativeRequest): Promise<void> {
    let succeeded = false
    let message = ''
    let result: string | undefined
    try {
      if (this.session !== session || session.revoked || request.extensionId !== session.input.extensionId || request.sessionId !== session.input.sessionId || request.generation !== session.input.generation) throw new Error('Trusted extension native action is stale')
      if (request.kind === 'selectedText') {
        if (!this.options.readSelectedText) throw new Error('Selected text is unavailable')
        const selection = await this.options.readSelectedText()
        if (selection.text !== undefined) result = selection.text
        else throw new Error(selection.unavailable ?? 'Selected text is unavailable')
      } else {
        if (request.eventId !== session.action?.eventId || request.revision !== session.action.revision || session.action.nativeUsed) throw new Error('Translate native action is stale')
        session.action.nativeUsed = true
        if (request.kind === 'copy') {
          if (!this.options.copyText) throw new Error('Clipboard Copy is unavailable')
          await this.options.copyText(request.text)
        } else if (request.kind === 'paste') {
          if (!this.options.pasteText) throw new Error('Paste is unavailable')
          await this.options.pasteText(request.text)
        } else if (request.kind === 'openGoogleTranslate') {
          if (!this.options.openGoogleTranslate) throw new Error('Browser opening is unavailable')
          await this.options.openGoogleTranslate(request.url)
        } else {
          if (!this.options.savePreferences) throw new Error('Translate preference storage is unavailable')
          await this.options.savePreferences(request.preferences, request.extensionId, session.input.preferences)
          session.input = { ...session.input, preferences: request.preferences }
        }
      }
      succeeded = true
    } catch (error) { message = error instanceof Error ? error.message.slice(0, 512) : 'Native action failed' }
    if (this.session === session && !session.revoked) session.child.stdin.write(`${JSON.stringify({ type: 'nativeOutcome', extensionId: session.input.extensionId, requestId: request.requestId, succeeded, message, ...(result === undefined ? {} : { result }) })}\n`)
  }
  private async configureCanIUse(session: Session): Promise<void> {
    const input = { ...session.input, sessionId: randomUUID(), generation: randomUUID(), preferences: session.canIUse!.preferences }
    const stopping = this.stop('capability-rotation')
    const token = this.lifecycleToken
    await stopping
    if (token !== this.lifecycleToken) throw new Error('Can I Use configuration was cancelled')
    const directory = this.resolveRuntimeDir('can-i-use')
    if (!directory) throw new Error('Can I Use is unavailable')
    this.openCanIUseSetup(session.owner, input, directory)
  }
  /** Host-only replacement for managed preferences/theme. Close/disable wins over a pending restart. */
  async restartCanIUse(owner: TrustedRaycastOwner, preferences?: Readonly<Record<string, boolean | string>>): Promise<void> {
    const session = this.session
    if (!session?.canIUse || session.revoked || owner.webContentsId !== session.owner.webContentsId) throw new Error('Can I Use session is stale')
    const query = preferences === undefined ? session.canIUse.query : ''
    let next: Readonly<Record<string, boolean | string>>
    try { next = session.canIUse.validatePreferences(preferences ?? session.canIUse.preferences) }
    catch (error) { await this.stop('configuration-invalid'); throw error }
    const stopping = this.stop('capability-rotation')
    const token = this.lifecycleToken
    await stopping
    if (this.disposed || this.session || token !== this.lifecycleToken) throw new Error('Can I Use replacement was cancelled')
    await this.start(owner, { ...session.input, sessionId: randomUUID(), generation: randomUUID(), preferences: next }, query)
  }
  async closeOwner(owner: TrustedRaycastOwner): Promise<void> {
    if (this.setup?.owner.webContentsId === owner.webContentsId || this.session?.owner.webContentsId === owner.webContentsId) await this.stop('owner-closed')
  }
  async stop(reason = 'closed'): Promise<void> {
    this.lifecycleToken = Symbol()
    if (this.stopping) return await this.stopping
    if (this.setup) {
      const setup = this.setup
      this.setup = undefined
      rmSync(setup.workspace, { recursive: true, force: true })
    }
    const session = this.session
    if (!session) return
    if (!session.revoked) session.canIUse?.close()
    session.revoked = true
    session.reject(new Error('Translate session closed'))
    const operation = (async () => {
      try {
        if (!['activation-revoked', 'capability-disabled', 'capability-removed', 'capability-recovery', 'capability-rotation', 'owner-closed', 'shutdown'].includes(reason)) {
          this.options.onMessage(session.owner, { type: 'error', extensionId: session.input.extensionId, sessionId: session.input.sessionId, generation: session.input.generation, revision: session.revision + 1, message: 'Trusted extension closed unexpectedly. Please reopen it.' })
        }
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
  async close(): Promise<void> { this.disposed = true; await this.stop('shutdown'); await this.stopPreview() }
}
