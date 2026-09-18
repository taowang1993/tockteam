export interface NativeTraceSummary {
  intervals: Array<{
    pid: number
    id: string
    start: number
    end: number
    workerTid: number
    queueUs: number
    nativeUs: number
    dispatchUs: number
  }>
  unresolved: Array<{
    pid: number
    id: string
    start: number
    end: number
    reason: string
  }>
}

export function summarizeNativeTrace(events: ReadonlyArray<Record<string, unknown>>): NativeTraceSummary
export function finishNativeTrace(directory: string, pid: number, control?: boolean): NativeTraceSummary
