const EXTERNAL_OPEN_IMPORT = "import { launchExternal } from './open-external.ts'\n"
const EXTERNAL_OPEN_START = '    // External open for the file tree'
const EXTERNAL_OPEN_END = '    // Side Chat:'
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
  let adapted = source.replaceAll('\r\n', '\n')
  const externalStart = adapted.indexOf(EXTERNAL_OPEN_START)
  const externalEnd = adapted.indexOf(EXTERNAL_OPEN_END, externalStart)
  if (!adapted.includes(EXTERNAL_OPEN_IMPORT) || externalStart < 0 || externalEnd < 0) {
    throw new Error('Better Sidebar external-open seam changed upstream')
  }
  adapted = adapted.replace(EXTERNAL_OPEN_IMPORT, '')
  adapted = adapted.slice(0, externalStart) + adapted.slice(externalEnd)

  const start = adapted.indexOf(SESSION_TERMINAL_ANCHOR)
  const end = adapted.indexOf(SESSION_TERMINAL_END, start)
  if (start < 0 || end < 0) throw new Error('Better Sidebar session terminal seam changed upstream')
  const section = adapted.slice(start, end)
  if (!section.includes(TEXT_EXIT)) throw new Error('Better Sidebar session exit seam changed upstream')
  return `${adapted.slice(0, start)}${section.replace(TEXT_EXIT, BINARY_EXIT)}${adapted.slice(end)}`
}
