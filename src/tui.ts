/** TockTeam TUI launcher over the pinned upstream dsh-TUI bundle. */

import { spawn, type SpawnOptions } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { UsageError } from './errors.ts'
import { ensureTuiProfile, TUI_PROFILE } from './profile.ts'
import {
  bundledRuntimePaths,
  runtimeSearchPath,
  type BundledRuntimePaths,
} from './runtime-paths.ts'
import { resolveProductVersion } from './version.ts'

/** Default TockTeam-owned home, isolated from the upstream DSH CLI. */
export const DEFAULT_TUI_HOME = join(homedir(), '.tockteam')

/** TUI launch options resolved from command-line flags and environment. */
export interface TuiLaunchOptions {
  cwd: string
  dataRoot: string
  fullscreen: boolean
  help: boolean
  lang?: 'en' | 'zh'
  preset?: string
  sessionId?: string
}

/** One attached TUI child-process plan. */
export interface TuiLaunchSpec {
  args: string[]
  command: string
  cwd: string
  env: NodeJS.ProcessEnv
  spawnOptions: SpawnOptions
}

export type TuiSpawner = typeof spawn

const USAGE = `usage: tockteam tui [options]

Options:
  --cwd <dir>            workspace directory (default: current directory)
  --data <dir>           DSH home and session store (default: ~/.tockteam)
  --resume <session>     resume an existing session id
  --lang <zh|en>         initial interface language
  --preset <name>        initial agent preset
  --fullscreen           use the alternate screen (default)
  --inline               keep terminal scrollback instead
  --help                 show this help

Environment:
  TOCKTEAM_TUI_HOME, TOCKTEAM_TUI_CWD, TOCKTEAM_TUI_FULLSCREEN,
  TOCKTEAM_TUI_LANG, TOCKTEAM_TUI_PRESET, TOCKTEAM_TUI_SESSION_ID
`

function parseBoolean(value: string, name: string): boolean {
  if (value === '1' || value.toLowerCase() === 'true') return true
  if (value === '0' || value.toLowerCase() === 'false') return false
  throw new UsageError(`invalid ${name} value: ${value}`)
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

function language(value: string): 'en' | 'zh' {
  if (value === 'en' || value === 'zh') return value
  throw new UsageError(`invalid TUI language: ${value}`)
}

/** Resolve TUI options without touching the filesystem or spawning DSH. */
export function parseTuiArgs(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  defaultCwd: string = process.cwd(),
  defaultDataRoot: string = DEFAULT_TUI_HOME,
): TuiLaunchOptions {
  const envFullscreen = optionalEnv(env, 'TOCKTEAM_TUI_FULLSCREEN')
  const envLang = optionalEnv(env, 'TOCKTEAM_TUI_LANG')
  const envPreset = optionalEnv(env, 'TOCKTEAM_TUI_PRESET')
  const envSessionId = optionalEnv(env, 'TOCKTEAM_TUI_SESSION_ID')
  const options: TuiLaunchOptions = {
    cwd: optionalEnv(env, 'TOCKTEAM_TUI_CWD') ?? defaultCwd,
    dataRoot: optionalEnv(env, 'TOCKTEAM_TUI_HOME') ?? defaultDataRoot,
    fullscreen: envFullscreen === undefined
      ? true
      : parseBoolean(envFullscreen, 'TOCKTEAM_TUI_FULLSCREEN'),
    help: false,
    ...(envLang === undefined ? {} : { lang: language(envLang) }),
    ...(envPreset === undefined ? {} : { preset: envPreset }),
    ...(envSessionId === undefined ? {} : { sessionId: envSessionId }),
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? ''
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--fullscreen') {
      options.fullscreen = true
      continue
    }
    if (argument === '--inline') {
      options.fullscreen = false
      continue
    }
    const flag = (name: string): string | undefined => {
      if (argument === name) {
        const value = args[index + 1]
        if (value === undefined || value === '') throw new UsageError(`${name} needs a value`)
        index += 1
        return value
      }
      if (argument.startsWith(`${name}=`)) {
        const value = argument.slice(name.length + 1)
        if (value === '') throw new UsageError(`${name} needs a value`)
        return value
      }
      return undefined
    }
    const cwd = flag('--cwd')
    if (cwd !== undefined) {
      options.cwd = cwd
      continue
    }
    const data = flag('--data')
    if (data !== undefined) {
      options.dataRoot = data
      continue
    }
    const sessionId = flag('--resume')
    if (sessionId !== undefined) {
      options.sessionId = sessionId
      continue
    }
    const lang = flag('--lang')
    if (lang !== undefined) {
      options.lang = language(lang)
      continue
    }
    const preset = flag('--preset')
    if (preset !== undefined) {
      options.preset = preset
      continue
    }
    throw new UsageError(`unknown option: ${argument}`)
  }
  return options
}

/** Resolve the installed distribution root or the repository root. */
export function resolveTuiRoot(env: NodeJS.ProcessEnv = process.env): string {
  for (const name of ['TOCKTEAM_TUI_ROOT', 'TOCKTEAM_SOURCE_ROOT'] as const) {
    const value = env[name]
    if (value !== undefined && value !== '') return resolve(value)
  }
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

/** Read release metadata from a standalone package or Electron resources. */
export function resolveTuiVersion(root: string): string {
  return resolveProductVersion(root)
}

/** Build one attached process launch after the profile has been initialized. */
export function tuiLaunchSpec(
  options: TuiLaunchOptions,
  env: NodeJS.ProcessEnv,
  paths: BundledRuntimePaths,
  version: string,
): TuiLaunchSpec {
  const dataRoot = resolve(options.dataRoot)
  const cwd = resolve(options.cwd)
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    DSH_HOME: dataRoot,
    DSH_TUI_LANG: options.lang,
    DSH_TUI_PRESET: options.preset,
    DSH_TUI_RESUME_SESSION: options.sessionId,
    TOCKTEAM_TUI: '1',
    TOCKTEAM_TUI_HOME: dataRoot,
    TOCKTEAM_TUI_PROFILE: TUI_PROFILE,
    TOCKTEAM_TUI_VERSION: version,
    TOCKTEAM_TUI_CONFIG_HOME: join(dataRoot, 'tui'),
    TOCKTEAM_TUI_CWD: cwd,
    TOCKTEAM_TUI_FULLSCREEN: options.fullscreen ? '1' : '0',
    TOCKTEAM_TUI_LANG: options.lang,
    TOCKTEAM_TUI_PRESET: options.preset,
    TOCKTEAM_TUI_SESSION_ID: options.sessionId,
    TOCKTEAM_TUI_TITLE: 'TockTeam TUI',
    PATH: runtimeSearchPath(paths, env),
  }
  return {
    args: [paths.cliEntry, '--profile', TUI_PROFILE],
    command: paths.nodeBinary,
    cwd,
    env: childEnv,
    spawnOptions: {
      cwd,
      env: childEnv,
      stdio: 'inherit',
    },
  }
}

/** Start the TUI in the caller's terminal and return its exit status. */
export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  stdout: NodeJS.WriteStream = process.stdout,
  stderr: NodeJS.WriteStream = process.stderr,
  spawnTui: TuiSpawner = spawn,
  stdin: Readable & { isTTY?: boolean } = process.stdin,
): Promise<number> {
  const options = parseTuiArgs(argv, env)
  if (options.help) {
    stdout.write(USAGE)
    return 0
  }
  if (stdin.isTTY !== true || stdout.isTTY !== true) {
    stderr.write('TockTeam TUI requires an interactive terminal.\n')
    return 2
  }

  const root = resolveTuiRoot(env)
  const stagedNode = process.platform === 'win32'
    ? join(root, '.stage', 'node-runtime', 'node.exe')
    : join(root, '.stage', 'node-runtime', 'bin', 'node')
  const resourcesRoot = env.TOCKTEAM_TUI_ROOT !== undefined
    ? root
    : existsSync(stagedNode)
      ? join(root, '.stage')
      : root
  const paths = bundledRuntimePaths(resourcesRoot)
  if (!existsSync(paths.nodeBinary)) {
    throw new Error(`packaged Node runtime is missing: ${paths.nodeBinary}`)
  }
  if (!existsSync(paths.cliEntry)) {
    throw new Error(`packaged DSH CLI is missing: ${paths.cliEntry}`)
  }

  const dataRoot = resolve(options.dataRoot)
  const cwd = resolve(options.cwd)
  if (!existsSync(cwd)) throw new UsageError(`workspace directory does not exist: ${cwd}`)
  mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
  ensureTuiProfile(dataRoot)

  const spec = tuiLaunchSpec(
    { ...options, cwd, dataRoot },
    env,
    paths,
    resolveTuiVersion(root),
  )
  return await new Promise<number>((resolveExit, rejectExit) => {
    const child = spawnTui(spec.command, spec.args, spec.spawnOptions)
    child.once('error', rejectExit)
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal === null ? 1 : 128))
    })
  })
}
