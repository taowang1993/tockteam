export type RuntimeLifecycleTransitionArgs = Readonly<{
  setTransitioning: (transitioning: boolean) => void
  showSplash: () => Promise<void>
  stopRuntime: () => Promise<void>
}>

/** Stop the live runtime for a marketplace transaction, releasing the transition on failure. */
export async function stopLiveRuntimeForMarketplace(
  args: RuntimeLifecycleTransitionArgs,
): Promise<void> {
  args.setTransitioning(true)
  try {
    await args.showSplash()
    await args.stopRuntime()
  } catch (error) {
    args.setTransitioning(false)
    throw error
  }
}

export type UnexpectedRuntimeExitArgs = Readonly<{
  log: (error: unknown) => void
  setTransitioning: (transitioning: boolean) => void
  showStoppedSplash: () => Promise<void>
  stopRuntime: () => Promise<void>
}>

/** Keep runtime-exit cleanup observable and bounded even when one owner rejects. */
export async function handleUnexpectedRuntimeExit(
  args: UnexpectedRuntimeExitArgs,
): Promise<void> {
  const log = (error: unknown): void => {
    try {
      args.log(error)
    } catch {
      // Logging must not strand the transition or suppress the stopped splash.
    }
  }
  try {
    await args.stopRuntime()
  } catch (error) {
    log(error)
  }
  try {
    await args.showStoppedSplash()
  } catch (error) {
    log(error)
  } finally {
    args.setTransitioning(false)
  }
}
