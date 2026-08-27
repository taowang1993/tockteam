export class RuntimeStartCancelledError extends Error {
  constructor() {
    super('DSH runtime start was cancelled')
    this.name = 'RuntimeStartCancelledError'
  }
}

export type RuntimeStartToken = Readonly<{
  generation: number
  isCurrent: () => boolean
}>

/** Serializes runtime starts and fences work that races secure stop/quit. */
export class RuntimeStartGate<TResult> {
  private currentGeneration = 0
  private inFlight: Promise<TResult> | undefined
  private closed = false

  get pending(): Promise<TResult> | undefined {
    return this.inFlight
  }

  start(factory: (token: RuntimeStartToken) => Promise<TResult> | TResult): Promise<TResult> {
    if (this.closed) return Promise.reject(new RuntimeStartCancelledError())
    if (this.inFlight !== undefined) return this.inFlight
    const generation = ++this.currentGeneration
    const token: RuntimeStartToken = Object.freeze({
      generation,
      isCurrent: () => !this.closed && generation === this.currentGeneration,
    })
    const operation = Promise.resolve()
      .then(() => {
        if (!token.isCurrent()) throw new RuntimeStartCancelledError()
        return factory(token)
      })
      .then(result => {
        if (!token.isCurrent()) throw new RuntimeStartCancelledError()
        return result
      })
    const tracked = operation.finally(() => {
      if (this.inFlight === tracked) this.inFlight = undefined
    })
    this.inFlight = tracked
    return tracked
  }

  invalidate(): void {
    this.currentGeneration += 1
  }

  close(): void {
    this.closed = true
    this.invalidate()
  }
}
