type ToolCallBlock = { block: true; reason: string }
type ToolCallHandler = (event: { input: unknown; toolName: string }) => ToolCallBlock | undefined
type VerificationExtensionApi = { on(event: 'tool_call', handler: ToolCallHandler): void }

const commandBoundary = String.raw`(?:^|(?:&&|\|\||;|\n|\()\s*)`
const launchPrefix = String.raw`(?:(?:nohup|env)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|[^\s;&|()]+)\s+)*`
const executablePath = String.raw`(?:[^\s;&|()]+/)?`
const packageManager = String.raw`${executablePath}(?:pnpm|npm|yarn|bun)`
const longLivedScript = String.raw`${packageManager}(?:\s+(?:-C|--dir)\s+[^\s;&|()]+)?\s+(?:run\s+)?(?:start(?::fresh)?|dev:desktop|web)(?=$|[\s;&|)])`
const directElectron = String.raw`(?:(?:${packageManager}\s+(?:exec|dlx)\s+)|(?:${executablePath}npx\s+))?${executablePath}electron\s+\.(?=$|[\s;&|)])`
const unsafeLaunch = new RegExp(`${commandBoundary}${launchPrefix}(?:${longLivedScript}|${directElectron})`, 'u')

export function unsafeVerificationCommand(command: string): boolean {
  return unsafeLaunch.test(command)
}

export default function verification(pi: VerificationExtensionApi): void {
  pi.on('tool_call', (event) => {
    const input = event.input as { command?: unknown }
    if (event.toolName !== 'bash' || typeof input.command !== 'string' || !unsafeVerificationCommand(input.command)) return
    return {
      block: true,
      reason: 'Long-lived verification command blocked. Use a bounded smoke command that owns cleanup through scripts/process-cleanup.mjs.',
    }
  })
}
