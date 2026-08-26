import type { ChildProcess } from 'node:child_process'

export function stopChildProcess(
  child: ChildProcess,
  graceMs?: number,
  killMs?: number,
): Promise<void>
