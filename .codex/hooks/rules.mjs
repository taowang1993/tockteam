#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RULE_FILE = '.pi/rules/web.md'
const MUTATING_BASH =
  /\b(?:apply_patch|tee|mv|cp|rm|touch|mkdir|truncate)\b|(?:^|[;&|]\s*)cat\b[\s\S]*?>|(?:^|\s)(?:>|>>)\s*\S+|\bsed\b[\s\S]*?\s-i(?:\s|$)|\bperl\b[\s\S]*?\s-pi(?:\s|$)|\bpython3?\b[\s\S]*?(?:\.write_text\s*\(|open\s*\([^)]*,\s*['"](?:w|a|x|r\+|w\+|a\+))|\bgit\s+(?:apply|checkout|clean|commit|merge|mv|rebase|reset|rm)\b|\b(?:pnpm|npm|bun)\s+(?:add|install|remove|uninstall)\b/iu

export function isWebUiPath(value) {
  const file = value.replaceAll('\\', '/')
  return (
    file === 'src/client.ts' ||
    file === 'cordis.patch.yml' ||
    file.startsWith('web/') ||
    /^plugins\/.+\/src\/.+\.(?:css|tsx)$/u.test(file) ||
    /^plugins\/.+\/src\/client(?:\.ts|\/)/u.test(file)
  )
}

function findProjectRoot(start) {
  let current = path.resolve(start || process.cwd())
  while (true) {
    if (existsSync(path.join(current, RULE_FILE))) return current
    const parent = path.dirname(current)
    if (parent === current) return path.resolve(start || process.cwd())
    current = parent
  }
}

function cleanToken(value) {
  return value.replace(/^[`'"({\[@]+/u, '').replace(/[>`'"),:;!?\]}]+$/u, '')
}

function extractPaths(text) {
  const matches = text.match(/[~@./A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)+/gu) ?? []
  return [...new Set(matches.map(cleanToken).filter(Boolean))]
}

function relativePath(token, cwd, root) {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(token)) return undefined
  const absolute = path.isAbsolute(token)
    ? token
    : token.startsWith('~/') && process.env.HOME
      ? path.resolve(process.env.HOME, token.slice(2))
      : path.resolve(cwd, token.replace(/^@/u, ''))
  const relative = path.relative(root, absolute).replaceAll('\\', '/')
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : undefined
}

function textTargetsRule(text, cwd, root) {
  if (/\.pi\/rules\/web\.md/iu.test(text)) return true
  if (
    /(?:TockTeam|TockTutor).{0,40}(?:design system|interface|\bUI\b|CSS|style|theme)/iu.test(
      text,
    )
  )
    return true
  return extractPaths(text).some((token) => {
    const relative = relativePath(token, cwd, root)
    return relative !== undefined && isWebUiPath(relative)
  })
}

function collectPatchPaths(command) {
  const paths = []
  for (const match of command.matchAll(
    /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gmu,
  )) {
    paths.push(cleanToken(match[1].trim()))
  }
  for (const match of command.matchAll(
    /^(?:\+\+\+|---)\s+(?:a\/|b\/)?(.+)$/gmu,
  )) {
    const file = cleanToken(match[1].trim())
    if (file && file !== '/dev/null') paths.push(file)
  }
  return paths
}

function toolTargetsRule(input, cwd, root) {
  const toolInput = input.tool_input ?? {}
  const command =
    typeof toolInput.command === 'string'
      ? toolInput.command
      : JSON.stringify(toolInput)
  return [...collectPatchPaths(command), ...extractPaths(command)].some(
    (token) => {
      const relative = relativePath(token, cwd, root)
      return relative !== undefined && isWebUiPath(relative)
    },
  )
}

function stateFile(root, sessionId) {
  const rootHash = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const safeSession = String(sessionId || 'unknown').replace(
    /[^A-Za-z0-9_.-]/gu,
    '_',
  )
  const directory =
    process.env.TOCKTEAM_CODEX_RULES_STATE_DIR ||
    path.join(tmpdir(), 'tockteam-codex-rules')
  return path.join(directory, `${rootHash}-${safeSession}.json`)
}

function readState(root, sessionId) {
  const file = stateFile(root, sessionId)
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return {
      file,
      loaded: value.loaded === true,
      pending: value.pending === true,
    }
  } catch {
    return { file, loaded: false, pending: false }
  }
}

function writeState(state) {
  mkdirSync(path.dirname(state.file), { recursive: true })
  writeFileSync(
    state.file,
    `${JSON.stringify({ loaded: state.loaded, pending: state.pending }, null, 2)}\n`,
  )
}

function snippet(root) {
  try {
    return `### TockTeam Web Guidelines (Auto-loaded)\n\n${readFileSync(path.join(root, RULE_FILE), 'utf8').trim()}\n`
  } catch {
    return undefined
  }
}

function additionalContext(hookEventName, content) {
  return { hookSpecificOutput: { hookEventName, additionalContext: content } }
}

function isMutating(input) {
  if (['apply_patch', 'Edit', 'Write'].includes(input.tool_name)) return true
  return (
    input.tool_name === 'Bash' &&
    MUTATING_BASH.test(
      typeof input.tool_input?.command === 'string'
        ? input.tool_input.command
        : '',
    )
  )
}

export function handleHookEvent(input) {
  const cwd = path.resolve(input.cwd || process.cwd())
  const root = findProjectRoot(cwd)
  const state = readState(root, input.session_id)

  if (input.hook_event_name === 'UserPromptSubmit') {
    if (state.loaded || !textTargetsRule(String(input.prompt || ''), cwd, root))
      return null
    const content = snippet(root)
    if (!content) return null
    state.loaded = true
    state.pending = false
    writeState(state)
    return additionalContext('UserPromptSubmit', content)
  }

  if (
    input.hook_event_name !== 'PreToolUse' ||
    state.loaded ||
    !toolTargetsRule(input, cwd, root)
  ) {
    return null
  }

  if (isMutating(input) && !state.pending) {
    state.pending = true
    writeState(state)
    return {
      systemMessage: 'TockTeam Web guidelines are required for this tool call.',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'TockTeam Web guidelines are required for this path. Retry this tool call to load them before editing.',
      },
    }
  }

  const content = snippet(root)
  if (!content) return null
  state.loaded = true
  state.pending = false
  writeState(state)
  return additionalContext('PreToolUse', content)
}

async function main() {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  if (!data.trim()) return
  const output = handleHookEvent(JSON.parse(data))
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    )
    process.exit(1)
  })
}
