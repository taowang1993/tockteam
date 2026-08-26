const OWNED_ROOTS = '#tockteam-terminal-root'

function isOwnedRoot(node: Node): boolean {
  return node instanceof Element && node.matches(OWNED_ROOTS)
}

function insideOwnedRoot(node: Node): boolean {
  let current: Node | null = node
  while (current !== null) {
    if (isOwnedRoot(current)) return true
    current = current.parentNode
  }
  return false
}

export function mutationNeedsMount(record: MutationRecord): boolean {
  if (record.type === 'attributes') return !insideOwnedRoot(record.target)
  if (record.type !== 'childList' || insideOwnedRoot(record.target)) return false
  if ([...record.removedNodes].some(isOwnedRoot)) return true
  return [...record.addedNodes, ...record.removedNodes].some(node => !insideOwnedRoot(node))
}

export function createMountScheduler(run: () => void): { schedule(): void; cancel(): void } {
  let frame: number | null = null
  return {
    schedule: () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        run()
      })
    },
    cancel: () => {
      if (frame === null) return
      window.cancelAnimationFrame(frame)
      frame = null
    },
  }
}
