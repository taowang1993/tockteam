export type SettingsTrigger = Readonly<{
  click: () => void
  disabled?: boolean
}>

/** Defer a settings click until the route owner has rendered TockCoder. */
export function deferSettingsOpen(args: Readonly<{
  findButton: () => SettingsTrigger | undefined
  isOpen?: () => boolean
  isTockCoder: () => boolean
  isTockTutorActive: () => boolean
  maxAttempts?: number
  onOpened?: () => void
  schedule: (callback: () => void) => void
}>): void {
  const maxAttempts = args.maxAttempts ?? 60
  let attempts = 0
  const attempt = (): void => {
    if (args.isTockCoder() && !args.isTockTutorActive() && args.isOpen?.() === true) {
      args.onOpened?.()
      return
    }
    const button = args.findButton()
    if (args.isTockCoder() && !args.isTockTutorActive() && button?.disabled !== true) {
      button?.click()
      args.onOpened?.()
      return
    }
    if (attempts >= maxAttempts) return
    attempts += 1
    args.schedule(attempt)
  }
  args.schedule(attempt)
}
