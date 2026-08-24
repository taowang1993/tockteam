const MAX_INPUT_CHARS = 100_000
const MAX_MESSAGE_CHARS = 8_000
const MAX_HISTORY_CHARS = 16_000
const MAX_ATTACHMENT_CHARS = 8_000
const MAX_HISTORY_MESSAGES = 12
const MAX_ATTACHMENTS = 32
const MAX_RELATIVE_PATH_CHARS = 4_096

const SYSTEM_PROMPT = `# TockTutor Notes Assistant
You are the inline assistant for TockTutor's local Markdown notes. Answer with concise Markdown. Use only relative note paths. Never expose credentials, absolute paths, process details, or environment values. Read notes only through the provided tools. A write request creates a review proposal; it never changes a note until the user explicitly approves it.`

export interface AssistantPromptHistory {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantPromptAttachment {
  relativePath: string
  markdown: string
}

export interface AssistantPromptInput {
  message: string
  history?: AssistantPromptHistory[]
  attachments?: AssistantPromptAttachment[]
}

export interface AssistantPrompt {
  system: string
  user: string
}

function assertText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_INPUT_CHARS) {
    throw new TypeError(`${field} must be a string no longer than ${MAX_INPUT_CHARS} characters`)
  }
}

export function assertSafeRelativePath(value: string, field = 'path'): void {
  if (
    value.length === 0
    || value.length > MAX_RELATIVE_PATH_CHARS
    || value.includes('\0')
    || value.includes('\\')
    || value.startsWith('/')
    || /^[A-Za-z]:/u.test(value)
    || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
    || value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(`${field} must be a safe vault-relative path`)
  }
}

/** Remove path and credential-shaped data before text crosses a model or browser boundary. */
export function redactBoundaryText(value: string): string {
  return value
    .replace(/\bBearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\b((?:(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|password|secret|token))\s*[:=]\s*)\S+/giu, '$1[REDACTED]')
    .replace(/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED]')
    .replace(/\bfile:\/\/[^\s<>'"`]+/giu, '[REDACTED]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s<>'"`]+/gu, '[REDACTED]')
    .replace(/(^|[\s("'`=:[{,])\/(?!\/)[^\s<>'"`]*/gu, '$1[REDACTED]')
}

function clamp(value: string, maxChars: number): string {
  const redacted = redactBoundaryText(value)
  if (redacted.length <= maxChars) return redacted
  return maxChars === 1 ? '…' : `${redacted.slice(0, maxChars - 1)}…`
}

/** Bound one already-serialized tool argument/result before display or model reuse. */
export function boundToolText(value: string, limit: number): string {
  assertText(value, 'tool text')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_INPUT_CHARS) {
    throw new TypeError('tool text limit must be a positive safe integer')
  }
  return clamp(value, limit)
}

function recentConversation(history: AssistantPromptHistory[]): string {
  const entries: string[] = []
  let remaining = MAX_HISTORY_CHARS
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (message === undefined || (message.role !== 'user' && message.role !== 'assistant')) {
      throw new TypeError(`history[${index}] has an invalid role`)
    }
    assertText(message.content, `history[${index}].content`)
    const prefix = `${message.role === 'user' ? 'User' : 'Assistant'}: `
    const separator = entries.length === 0 ? 0 : 2
    const budget = Math.min(MAX_MESSAGE_CHARS, remaining - prefix.length - separator)
    if (budget < 1) break
    const entry = `${prefix}${clamp(message.content, budget)}`
    entries.unshift(entry)
    remaining -= entry.length + separator
  }
  return entries.join('\n\n')
}

function attachmentContext(attachments: AssistantPromptAttachment[]): string {
  const entries: string[] = []
  let remaining = MAX_ATTACHMENT_CHARS
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index]
    if (attachment === undefined) continue
    assertText(attachment.relativePath, `attachments[${index}].relativePath`)
    assertSafeRelativePath(attachment.relativePath, `attachments[${index}].relativePath`)
    assertText(attachment.markdown, `attachments[${index}].markdown`)
    const prefix = `- ${attachment.relativePath}: `
    const separator = entries.length === 0 ? 0 : 1
    const budget = remaining - prefix.length - separator
    if (budget < 1) break
    const entry = `${prefix}${clamp(attachment.markdown, budget)}`
    entries.push(entry)
    remaining -= entry.length + separator
  }
  return entries.join('\n')
}

/** Assemble one deterministic bounded provider request without creating an Agent. */
export function buildAssistantPrompt(input: AssistantPromptInput): AssistantPrompt {
  assertText(input.message, 'message')
  const history = input.history ?? []
  const attachments = input.attachments ?? []
  if (!Array.isArray(history) || history.length > MAX_HISTORY_MESSAGES) {
    throw new TypeError(`history must contain at most ${MAX_HISTORY_MESSAGES} messages`)
  }
  if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) {
    throw new TypeError(`attachments must contain at most ${MAX_ATTACHMENTS} entries`)
  }

  const conversation = recentConversation(history)
  const attached = attachmentContext(attachments)
  const user = [
    conversation ? `Recent Conversation:\n${conversation}` : '',
    `Current User Message:\n${clamp(input.message, MAX_MESSAGE_CHARS)}`,
    attached ? `Attached Files:\n${attached}` : '',
  ].filter(Boolean).join('\n\n')

  return { system: SYSTEM_PROMPT, user }
}
