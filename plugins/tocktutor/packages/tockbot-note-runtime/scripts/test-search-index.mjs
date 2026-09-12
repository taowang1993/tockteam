import { spawnSync } from 'node:child_process'

// A node:test timeout alone does not terminate a blocked native handle. Run
// this single-file gate without worker isolation so the deadline kills the
// actual SQLite owner, not a runner that leaves its child behind.
const result = spawnSync(process.execPath, [
  '--test',
  '--test-isolation=none',
  '--test-name-pattern=search index disposal|Keyword search reconciles|persistent FlexSearch SQLite',
  'tests/loader-composition.test.ts',
], {
  cwd: new URL('../', import.meta.url),
  stdio: 'inherit',
  timeout: 60_000,
  killSignal: 'SIGKILL',
})
if (result.error) {
  console.error('Search-index gate did not finish: native startup, reconciliation, or disposal may be stalled.', result.error.message)
}
process.exitCode = result.status ?? 1
