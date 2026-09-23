const EXTERNAL_OPEN_IMPORT = "import { launchExternal } from './open-external.ts'\n"
const EXTERNAL_OPEN_START = '    // External open for the file tree'
const EXTERNAL_OPEN_END = '    // Side Chat:'
const SESSION_TERMINAL_ANCHOR = 'const handle = ptyManager.open(sessionId, tabId, cwd, 80, 24'
const SESSION_TERMINAL_END = 'const dataSub = handle.pty.onData(onData)'
const CLIENT_CWD_FALLBACK = `  if (clientCwd !== undefined && clientCwd !== '') {
    try {
      return requireAbsolute(clientCwd)
    } catch {
      throw new SidebarError('bad-request', \`invalid working directory "\${clientCwd}"\`)
    }
  }
`
const TEXT_EXIT = `const onExit = ({ exitCode }: { exitCode: number; signal?: number }): void => {
      onData(\`\\r\\n[process exited with code \${String(exitCode)}]\\r\\n\`)
    }`
const BINARY_EXIT = `const onExit = ({ exitCode }: { exitCode: number; signal?: number }): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(JSON.stringify({ code: exitCode, type: 'tockteam-terminal-exit' })))
      }
    }`

export function adaptBetterSidebarGit(source) {
  const adapted = source.replaceAll('\r\n', '\n')
  const commandPrefix = "const full = ['-C', cwd, '--no-pager', '-c', 'color.ui=false', ...args]"
  const branchCheckout = "['checkout', branch]"
  const commitPreview = "'--first-parent', hash]"
  const pathImport = "import { resolve } from 'node:path'"
  const fsImport = "import { readdir } from 'node:fs/promises'"
  const filePreview = "return await runGit(await repoRoot(cwd, selected), ['show', `${rev}:${path}`])"
  const revertCommit = "['revert', '--no-edit', hash]"
  const cherryPickCommit = "['cherry-pick', hash]"
  const selectedRoot = '    if (match !== undefined) return match'
  const pathIdentity = String.raw`resolve(path).replace(/[\\/]+$/, '')`
  const streamHandlers = ['stdout', 'stderr'].map(stream =>
    `child.${stream}.on('data', (chunk: Buffer) => { ${stream} += chunk.toString('utf8') })`)
  const rootParser = `  const out = await runGit(cwd, ['rev-parse', '--show-toplevel'], DISCOVERY_TIMEOUT_MS)
  return out.trim()`
  if (!adapted.includes(rootParser) || !adapted.includes(commandPrefix) || !adapted.includes(branchCheckout)
    || !adapted.includes(commitPreview) || !adapted.includes(filePreview)
    || !adapted.includes(pathImport) || !adapted.includes(fsImport)
    || !adapted.includes(revertCommit) || !adapted.includes(cherryPickCommit)
    || !adapted.includes(selectedRoot) || !adapted.includes(pathIdentity)
    || streamHandlers.some(handler => !adapted.includes(handler))) {
    throw new Error('Better Sidebar Git command, revision, branch, or root parsing seam changed upstream')
  }
  // Decode across chunk boundaries so filenames, content, and errors stay exact.
  const decoded = streamHandlers.reduce((text, handler) => text.replace(handler,
    handler.replace(".on('data'", ".setEncoding('utf8').on('data'")
      .replace('chunk: Buffer', 'chunk: string').replace("chunk.toString('utf8')", 'chunk')), adapted)
  // Remove Git's output terminator without redirecting whitespace-named
  // workspaces to a sibling repository during reads or mutations.
  return decoded.replace(rootParser, rootParser.replace('out.trim()', "out.replace(/\\n$/, '')"))
    // Node normalizes platform separators; POSIX backslashes are filename bytes.
    .replace(pathIdentity, 'resolve(path)')
    // An explicit stale selection must never redirect a mutation to another repo.
    .replace(selectedRoot, `${selectedRoot}
    throw new GitCommandError('selected repository is unavailable', 'not-repo', 'rev-parse')`)
    // File actions accept exact filenames, never Git pathspec patterns.
    .replace(commandPrefix, commandPrefix.replace("'--no-pager'", "'--no-pager', '--literal-pathspecs'"))
    // A stale branch choice must never fall back to restoring a same-named file.
    .replace(branchCheckout, "['switch', '--', branch]")
    // Preview revisions cannot become options such as --output=<file>.
    .replace(commitPreview, "'--first-parent', '--end-of-options', hash, '--']")
    .replace(pathImport, "import { isAbsolute, relative, resolve, sep } from 'node:path'")
    .replace(fsImport, "import { readdir, realpath } from 'node:fs/promises'")
    // The HTTP adapter supplies absolute paths; Git revision paths are relative.
    .replace(filePreview, `const root = await repoRoot(cwd, selected)
    let target = resolve(root, path)
    const fromCwd = relative(cwd, target)
    // Preserve the session's spelling of a symlinked workspace, including
    // deleted files that cannot themselves be passed through realpath.
    if (fromCwd !== '..' && !fromCwd.startsWith('..' + sep) && !isAbsolute(fromCwd)) {
      target = resolve(await realpath(cwd), fromCwd)
    }
    const file = relative(root, target)
    if (file === '..' || file.startsWith('..' + sep) || isAbsolute(file)) return null
    return await runGit(root, ['show', '--end-of-options', \`\${rev}:\${file.split(sep).join('/')}\`, '--'])`)
    // A requested commit must not control the sequencer (for example --abort).
    .replace(revertCommit, "['revert', '--no-edit', '--', hash]")
    .replace(cherryPickCommit, "['cherry-pick', '--', hash]")
}

export function adaptBetterSidebarFs(source) {
  const adapted = source.replaceAll('\r\n', '\n')
  const normalize = String.raw`value.replace(/[\\/]+/g, '/').replace(/\/$/, '')`
  if (!adapted.includes(normalize)) throw new Error('Better Sidebar filesystem containment seam changed upstream')
  // Only Windows treats backslashes as separators. POSIX sibling names must
  // never become apparent children of an authorized workspace.
  return adapted.replace(normalize,
    String.raw`(platform === 'win32' ? value.replace(/\\/g, '/') : value).replace(/\/+/g, '/').replace(/\/$/, '')`)
}

export function adaptBetterSidebarHost(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  let adapted = source.replaceAll('\r\n', '\n')
  const fsImport = "import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'"
  const writeStart = adapted.indexOf("    'fs.write': async (payload) => {")
  const writeEnd = adapted.indexOf("    'git.worktrees':", writeStart)
  const writeBody = adapted.slice(writeStart, writeEnd)
  const contentValidation = "      const content = requireString(payload, 'content')"
  const temporaryPath = '      const tmp = `${path}.dsh-sidebar-tmp-${process.pid}`'
  const writeContent = "        await writeFile(tmp, content, 'utf8')"
  const cleanup = '        await rm(tmp, { force: true }).catch(() => {})\n'
  const writeDone = '      }\n      return { ok: true }'
  if (writeStart < 0 || writeEnd < 0 || !adapted.includes(fsImport)
    || ![contentValidation, temporaryPath, writeContent, cleanup, writeDone].every(part => writeBody.includes(part))) {
    throw new Error('Better Sidebar file save seam changed upstream')
  }
  // Each save owns a private, atomically created temporary directory. A
  // predictable sibling can collide with another save or follow a planted link.
  adapted = (adapted.slice(0, writeStart) + writeBody
    // Empty text is a valid file; names and paths still require nonempty strings.
    .replace(contentValidation, `      const content = (payload as { content?: unknown }).content
      if (typeof content !== 'string') {
        throw new SidebarError('bad-request', 'missing or invalid "content"')
      }`)
    .replace(temporaryPath, '      let temporary: string | undefined')
    .replace(writeContent, `        const mode = await stat(path).then(info => info.mode & 0o777).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined
          throw error
        })
        temporary = await mkdtemp(join(dirname(path), '.dsh-sidebar-save-'))
        const tmp = join(temporary, 'content')
        await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' })
        // Replacement must retain private-file access and executable bits.
        // Apply after writing so umask cannot silently strip existing bits.
        if (mode !== undefined) await chmod(tmp, mode)`)
    .replace(cleanup, '')
    .replace(writeDone, `      } finally {
        if (temporary !== undefined) await rm(temporary, { recursive: true, force: true }).catch(() => {})
      }
      return { ok: true }`) + adapted.slice(writeEnd))
    .replace(fsImport, fsImport.replace('mkdir,', 'chmod, mkdir, mkdtemp,'))
  const gitPathStart = adapted.indexOf('/**\n * Resolve a path that a git command reported')
  const gitPathEnd = adapted.indexOf('/** How many leading bytes', gitPathStart)
  if (gitPathStart < 0 || gitPathEnd < 0
    || !adapted.slice(gitPathStart, gitPathEnd).includes('async function resolveGitPath(')
    || !adapted.slice(gitPathStart, gitPathEnd).includes('return sessionPath')) {
    throw new Error('Better Sidebar Git path resolution seam changed upstream')
  }
  // Status and diff paths share the selected repository's namespace. Probing
  // cwd first can redirect previews and destructive discard to another file.
  adapted = adapted.slice(0, gitPathStart) + `/** Resolve Git paths relative to the selected repository, independent of file existence. */
async function resolveGitPath(cwd: string, raw: string, selected?: string): Promise<string> {
  if (isAbsolute(raw)) return requireAbsolute(resolveSessionPath(cwd, raw))
  return requireAbsolute(join(await git.repoRoot(cwd, selected), raw))
}

` + adapted.slice(gitPathEnd)
  // TockTeam workspace authority belongs to the Host session, including
  // detached sessions restored from persistence. Browser summaries are hints.
  const scopeStart = adapted.indexOf('async function sessionCwdOf(')
  const scopeEnd = adapted.indexOf('\n/** Optional repository selected', scopeStart)
  if (scopeStart < 0 || scopeEnd < 0) throw new Error('Better Sidebar session workspace seam changed upstream')
  const scope = adapted.slice(scopeStart, scopeEnd)
  if (!scope.includes(CLIENT_CWD_FALLBACK) || !scope.includes('  return process.cwd()')
    || !scope.includes('await persistence.inspect(sessionId)')) {
    throw new Error('Better Sidebar session workspace fallback seam changed upstream')
  }
  adapted = adapted.slice(0, scopeStart)
    + scope.replace(CLIENT_CWD_FALLBACK, '').replace(
      'await persistence.inspect(sessionId)',
      `await persistence.inspect(sessionId).catch(() => {
      throw new SidebarError('forbidden', 'session workspace is unavailable', 403)
    })`,
    ).replace(
      '  return process.cwd()',
      "  throw new SidebarError('forbidden', 'session workspace is unavailable', 403)",
    )
    + adapted.slice(scopeEnd)
  const externalStart = adapted.indexOf(EXTERNAL_OPEN_START)
  const externalEnd = adapted.indexOf(EXTERNAL_OPEN_END, externalStart)
  if (!adapted.includes(EXTERNAL_OPEN_IMPORT) || externalStart < 0 || externalEnd < 0) {
    throw new Error('Better Sidebar external-open seam changed upstream')
  }
  adapted = (adapted.slice(0, externalStart) + adapted.slice(externalEnd))
    .replace(EXTERNAL_OPEN_IMPORT, '')

  const start = adapted.indexOf(SESSION_TERMINAL_ANCHOR)
  const end = adapted.indexOf(SESSION_TERMINAL_END, start)
  if (start < 0 || end < 0) throw new Error('Better Sidebar session terminal seam changed upstream')
  const section = adapted.slice(start, end)
  if (!section.includes(TEXT_EXIT)) throw new Error('Better Sidebar session exit seam changed upstream')
  return `${adapted.slice(0, start)}${section.replace(TEXT_EXIT, BINARY_EXIT)}${adapted.slice(end)}`.replaceAll('\n', newline)
}
