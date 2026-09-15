import { AsyncResource } from 'node:async_hooks'
import { tmpdir } from 'node:os'

// Async-resource init events supply markers on the trace's own clock. No
// callback wrapping or runInAsyncScope: existing async context stays intact.
export function markNativeTrace(event: string, detail: unknown = null): void {
  if (process.env.TOCKTEAM_NATIVE_TRACE_DIR) {
    // Node writes resource names into trace JSON without escaping quotes.
    new AsyncResource(`bon:${encodeURIComponent(JSON.stringify({ event, detail }))}`).emitDestroy()
  }
}

if (process.env.TOCKTEAM_NATIVE_TRACE_DIR) {
  markNativeTrace('owner/start', { node: process.version, pid: process.pid, temp: tmpdir(), pool: process.env.UV_THREADPOOL_SIZE ?? 'default' })
  const heartbeat = setInterval(() => markNativeTrace('heartbeat'), 20)
  heartbeat.unref()
  process.once('exit', () => {
    clearInterval(heartbeat)
    markNativeTrace('owner/end')
  })
}
