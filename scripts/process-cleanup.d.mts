import type { ChildProcess } from 'node:child_process'

export function parseWindowsProcessSnapshot(output: string): readonly { pid: number; parentPid: number }[]

export function windowsProcessTreePids(snapshot: readonly { pid: number; parentPid: number }[], rootPid: number): readonly number[]

export function windowsTasklistPids(output: string): ReadonlySet<number>

export function windowsOwnedProcessQuery(executablePath: string, additionalPath?: string): string

export function stopChildProcess(
  child: ChildProcess,
  graceMs?: number,
  killMs?: number,
): Promise<void>
