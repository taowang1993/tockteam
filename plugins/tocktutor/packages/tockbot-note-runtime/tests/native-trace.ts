import { Console } from 'node:console'
import { tmpdir } from 'node:os'
import { Writable } from 'node:stream'

// Console timers emit on the trace's own clock without enabling every Promise's
// async-hook events. Discard this private console's text; never replace callbacks.
const traceConsole = process.env.TOCKTEAM_NATIVE_TRACE_DIR ? new Console({
  stdout: new Writable({ write(_chunk, _encoding, done) { done() } }),
  colorMode: false,
}) : undefined

export function markNativeTrace(event: string, detail: unknown = null): void {
  if (traceConsole) {
    const label = `bon:${encodeURIComponent(JSON.stringify({ event, detail }))}`
    traceConsole.time(label)
    traceConsole.timeEnd(label)
  }
}

if (traceConsole) {
  markNativeTrace('owner/start', { node: process.version, pid: process.pid, temp: tmpdir(), pool: process.env.UV_THREADPOOL_SIZE ?? 'default' })
  const heartbeat = setInterval(() => markNativeTrace('heartbeat'), 20)
  heartbeat.unref()
  process.once('exit', () => {
    clearInterval(heartbeat)
    markNativeTrace('owner/end')
  })
}
