const SESSION_TERMINAL_ANCHOR = 'const handle = ptyManager.open(sessionId, tabId, cwd, 80, 24'
const SESSION_TERMINAL_END = 'const dataSub = handle.pty.onData(onData)'
const TEXT_EXIT = `const onExit = ({ exitCode }: { exitCode: number; signal?: number }): void => {
      onData(\`\\r\\n[process exited with code \${String(exitCode)}]\\r\\n\`)
    }`
const BINARY_EXIT = `const onExit = ({ exitCode }: { exitCode: number; signal?: number }): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(JSON.stringify({ code: exitCode, type: 'tockteam-terminal-exit' })))
      }
    }`

export function adaptBetterSidebarHost(source) {
  const normalized = source.replaceAll('\r\n', '\n')
  const start = normalized.indexOf(SESSION_TERMINAL_ANCHOR)
  const end = normalized.indexOf(SESSION_TERMINAL_END, start)
  if (start < 0 || end < 0) throw new Error('Better Sidebar session terminal seam changed upstream')
  const section = normalized.slice(start, end)
  if (!section.includes(TEXT_EXIT)) throw new Error('Better Sidebar session exit seam changed upstream')
  return `${normalized.slice(0, start)}${section.replace(TEXT_EXIT, BINARY_EXIT)}${normalized.slice(end)}`
}
