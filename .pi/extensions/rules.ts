import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const RULE_FILE = '.pi/rules/web.md'
const MUTATING_TOOLS = new Set(['edit', 'write', 'patch'])
const activeSessions = new Set<string>()
const queuedSessions = new Set<string>()

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

export function isWebUiPath(relativePath: string): boolean {
  const file = toPosix(relativePath)
  return (
    file === 'src/client.ts' ||
    file === 'cordis.patch.yml' ||
    file.startsWith('web/') ||
    /^plugins\/.+\/src\/.+\.(?:css|tsx)$/u.test(file) ||
    /^plugins\/.+\/src\/client(?:\.ts|\/)/u.test(file)
  )
}

async function findProjectRoot(start: string): Promise<string> {
  let current = path.resolve(start)
  while (true) {
    try {
      await fs.access(path.join(current, RULE_FILE))
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(start)
      current = parent
    }
  }
}

function extractPaths(text: string): string[] {
  return [
    ...new Set(
      (text.match(/[~@./A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)+/gu) ?? [])
        .map((value) =>
          value.replace(/^[`'"(@]+/u, '').replace(/[`'"),.:;!?]+$/u, ''),
        )
        .filter(Boolean),
    ),
  ]
}

function promptTargetsWebUi(
  prompt: string,
  cwd: string,
  root: string,
): boolean {
  if (/\.pi\/rules\/web\.md/iu.test(prompt)) return true
  if (
    /(?:TockTeam|TockTutor).{0,40}(?:design system|interface|\bUI\b|CSS|style|theme)/iu.test(
      prompt,
    )
  )
    return true

  return extractPaths(prompt).some((value) => {
    const absolute = path.isAbsolute(value)
      ? value
      : value.startsWith('~/') && process.env.HOME
        ? path.resolve(process.env.HOME, value.slice(2))
        : path.resolve(cwd, value.replace(/^@/u, ''))
    const relative = path.relative(root, absolute)
    return (
      relative !== '' && !relative.startsWith('..') && isWebUiPath(relative)
    )
  })
}

async function readRule(root: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(root, RULE_FILE), 'utf8')
  } catch {
    return undefined
  }
}

function ruleMessage(content: string): string {
  return `### TockTeam Web Guidelines (Auto-loaded)\n\n${content}`
}

function clearSession(sessionId: string): void {
  activeSessions.delete(sessionId)
  queuedSessions.delete(sessionId)
}

export default function rules(pi: ExtensionAPI): void {
  pi.on('session_start', (_event, ctx) =>
    clearSession(ctx.sessionManager.getSessionId()),
  )
  pi.on('session_shutdown', (_event, ctx) =>
    clearSession(ctx.sessionManager.getSessionId()),
  )
  pi.on('session_before_compact', (_event, ctx) =>
    clearSession(ctx.sessionManager.getSessionId()),
  )
  pi.on('agent_end', (_event, ctx) =>
    clearSession(ctx.sessionManager.getSessionId()),
  )

  pi.on('turn_start', (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId()
    if (!queuedSessions.delete(sessionId)) return
    activeSessions.add(sessionId)
  })

  pi.on('before_agent_start', async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId()
    clearSession(sessionId)
    const root = await findProjectRoot(ctx.cwd)
    if (!promptTargetsWebUi(event.prompt ?? '', ctx.cwd, root)) return
    const content = await readRule(root)
    if (!content) return
    activeSessions.add(sessionId)
    return { systemPrompt: `${event.systemPrompt}\n\n${ruleMessage(content)}` }
  })

  pi.on('tool_call', async (event, ctx) => {
    const input = event.input as { path?: unknown } | undefined
    if (typeof input?.path !== 'string') return

    const root = await findProjectRoot(ctx.cwd)
    const target = path.isAbsolute(input.path)
      ? input.path
      : path.resolve(ctx.cwd, input.path)
    const relative = toPosix(path.relative(root, target))
    if (
      relative === RULE_FILE ||
      relative.startsWith('..') ||
      !isWebUiPath(relative)
    )
      return

    const sessionId = ctx.sessionManager.getSessionId()
    if (activeSessions.has(sessionId)) return

    if (!queuedSessions.has(sessionId)) {
      const content = await readRule(root)
      if (content) {
        pi.sendMessage(
          {
            customType: `rule:${RULE_FILE}`,
            content: ruleMessage(content),
            display: false,
          },
          { deliverAs: 'steer', triggerTurn: false },
        )
        queuedSessions.add(sessionId)
      }
    }

    if (MUTATING_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason:
          'TockTeam Web guidelines were queued for the next model turn. Retry this edit after that turn.',
      }
    }
  })
}
