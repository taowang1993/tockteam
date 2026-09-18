import { AsyncLocalStorage } from 'node:async_hooks'

export type NativeProgressEvent = Readonly<{ phase: 'start' | 'progress' | 'end'; id: number }>
const MAX_NATIVE_OPERATIONS = 4
const STALL_MS = 5_000

/** Callback progress belongs to the logical operation that submitted it, not the current caller. */
export class NativeOperationProgress {
  private readonly context = new AsyncLocalStorage<{ id: number; active: boolean }>()
  private readonly notify: (event: NativeProgressEvent) => void | Promise<void>
  private readonly failed: (error: Error) => void
  private nextId = 1
  private readonly pending = new Set<(error: Error) => void>()
  private failure?: Error

  constructor(notify: (event: NativeProgressEvent) => void | Promise<void>, failed: (error: Error) => void) {
    this.notify = notify
    this.failed = failed
  }

  private async report(event: NativeProgressEvent): Promise<void> {
    if (this.failure) throw this.failure
    try { await this.notify(event) } catch (error) {
      if (!this.failure) {
        this.failure = error instanceof Error ? error : new Error('Native index progress failed')
        for (const reject of this.pending) reject(this.failure)
        this.failed(this.failure)
      }
      throw this.failure
    }
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.failure) throw this.failure
    if (this.context.getStore()?.active) return await work()
    if (this.pending.size >= MAX_NATIVE_OPERATIONS || !Number.isSafeInteger(this.nextId)) throw new Error('Native index operation limit exceeded')
    const operation = { id: this.nextId++, active: true }
    const interrupted = Promise.withResolvers<never>()
    this.pending.add(interrupted.reject)
    try {
      // In particular, deliver this before a native call could block the child event loop.
      await Promise.race([this.report({ phase: 'start', id: operation.id }), interrupted.promise])
      if (this.failure) throw this.failure
      try {
        return await Promise.race([this.context.run(operation, work), interrupted.promise])
      } finally {
        operation.active = false
        if (!this.failure) await Promise.race([this.report({ phase: 'end', id: operation.id }), interrupted.promise])
      }
    } finally {
      operation.active = false
      this.pending.delete(interrupted.reject)
    }
  }

  wrap<This, Args extends unknown[], Result>(callback: (this: This, ...args: Args) => Result): (this: This, ...args: Args) => Result {
    const operation = this.context.getStore()
    const context = this.context
    const report = this.report.bind(this)
    return function (this: This, ...args: Args): Result {
      if (operation?.active && args[0] == null) {
        // report() latches transport failure and invokes the fatal hook before rejecting.
        void report({ phase: 'progress', id: operation.id }).catch(() => {})
      }
      return operation
        ? context.run(operation, () => callback.apply(this, args))
        : context.exit(() => callback.apply(this, args))
    }
  }
}

/** Host monotonic clocks. No heartbeat, submission or another operation renews a stalled step. */
export class NativeProgressClock {
  private readonly active = new Map<number, number>()
  private nextId = 1

  observe(value: unknown, now = performance.now()): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'phase') || !Object.hasOwn(value, 'id')) {
      throw new Error('Invalid native index progress')
    }
    const { phase, id } = value as NativeProgressEvent
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid native index operation identity')
    if (phase === 'start') {
      if (id !== this.nextId || this.active.size >= MAX_NATIVE_OPERATIONS) throw new Error('Native index operation limit or sequence violated')
      this.nextId += 1
      this.active.set(id, now)
    } else {
      if (!this.active.has(id)) throw new Error('Unknown native index operation')
      if (phase === 'progress') this.active.set(id, now)
      else if (phase === 'end') this.active.delete(id)
      else throw new Error('Invalid native index progress phase')
    }
  }

  isStalled(now = performance.now()): boolean {
    return [...this.active.values()].some(last => now - last >= STALL_MS)
  }
}
