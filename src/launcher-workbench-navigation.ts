import {
  LAUNCHER_WORKBENCH_ROUTE_CHANNEL,
  parseLauncherWorkbenchRoute,
  type LauncherWorkbenchRoute,
  type TockTeamDestination,
} from './launcher-navigation.ts'

export type LauncherWorkbenchWindow = Readonly<{
  focus: () => void
  isDestroyed: () => boolean
  show?: () => void
  isMinimized: () => boolean
  restore: () => void
}> 

/**
 * Per-window route readiness. A route is a latest-intent operation, so one
 * pending route is retained while a workbench renderer is navigating.
 */
export function createLauncherWorkbenchRouteDelivery<TWindow extends object>(
  send: (window: TWindow, route: LauncherWorkbenchRoute) => void,
) {
  const pending = new WeakMap<TWindow, LauncherWorkbenchRoute>()
  const ready = new WeakSet<TWindow>()
  return Object.freeze({
    deliver(window: TWindow, route: LauncherWorkbenchRoute): void {
      const parsed = parseLauncherWorkbenchRoute(route)
      if (ready.has(window)) send(window, parsed)
      else pending.set(window, parsed)
    },
    markReady(window: TWindow): void {
      ready.add(window)
      const queued = pending.get(window)
      if (queued === undefined) return
      pending.delete(window)
      send(window, queued)
    },
    markUnready(window: TWindow): void {
      ready.delete(window)
    },
    clear(window: TWindow): void {
      ready.delete(window)
      pending.delete(window)
    },
    isReady(window: TWindow): boolean {
      return ready.has(window)
    },
  })
}

/** Bounded FIFO delivery for commands that must not be lost during navigation. */
export function createLauncherWorkbenchCommandDelivery<
  TWindow extends object,
  TValue,
>(
  send: (window: TWindow, value: TValue) => void,
  maxPending = 128,
) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
    throw new Error('Workbench command queue capacity must be a positive integer')
  }
  const pending = new WeakMap<TWindow, TValue[]>()
  const ready = new WeakSet<TWindow>()
  return Object.freeze({
    deliver(window: TWindow, value: TValue): void {
      if (ready.has(window)) {
        send(window, value)
        return
      }
      const queue = pending.get(window) ?? []
      if (queue.length >= maxPending) throw new Error('Workbench command queue is full')
      queue.push(value)
      pending.set(window, queue)
    },
    markReady(window: TWindow): void {
      ready.add(window)
      const queue = pending.get(window)
      if (queue === undefined) return
      pending.delete(window)
      for (const value of queue) send(window, value)
    },
    markUnready(window: TWindow): void {
      ready.delete(window)
    },
    clear(window: TWindow): void {
      ready.delete(window)
      pending.delete(window)
    },
    isReady(window: TWindow): boolean {
      return ready.has(window)
    },
  })
}

/** Restore/focus the one canonical workbench and deliver a finite route. */
export function dispatchLauncherRouteToWorkbench<TWindow extends LauncherWorkbenchWindow>(args: Readonly<{
  createWorkbench: () => TWindow
  destination: TockTeamDestination
  send: (window: TWindow, route: LauncherWorkbenchRoute) => void
  workbenchWindow: TWindow | null | undefined
}>): TWindow {
  const reusableWindow = args.workbenchWindow !== null
    && args.workbenchWindow !== undefined
    && !args.workbenchWindow.isDestroyed()
    ? args.workbenchWindow
    : null
  const targetWindow = reusableWindow ?? args.createWorkbench()
  if (targetWindow.isMinimized()) targetWindow.restore()
  targetWindow.show?.()
  targetWindow.focus()
  args.send(targetWindow, Object.freeze({ destination: parseLauncherWorkbenchRoute({ destination: args.destination }).destination }))
  return targetWindow
}

export { LAUNCHER_WORKBENCH_ROUTE_CHANNEL }
