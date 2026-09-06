import { Buffer } from 'node:buffer'

const byteLength = (value: string): number => Buffer.byteLength(value)

export type TrustedRaycastPriorApp = Readonly<{ name: string; capturedAt: number }>
export type TrustedRaycastNativeDeps = Readonly<{
  execFile: (file: string, args: string[], options?: { timeout?: number; maxBuffer?: number }) => Promise<Readonly<{ stdout: string }>>
  readClipboard: () => string
  writeClipboard: (text: string) => void
  ownAppNames: readonly string[]
  fixture?: 'selection' | 'paste'
  wait?: (ms: number) => Promise<void>
}>

const MAX_SELECTED_TEXT = 16 * 1024
const MAX_PASTE_TEXT = 128 * 1024
const applescriptString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** The frontmost app outside this launcher, captured while the launcher is hidden or blurred. */
export async function captureTrustedRaycastPriorApp(deps: TrustedRaycastNativeDeps): Promise<TrustedRaycastPriorApp | undefined> {
  try {
    const { stdout } = await deps.execFile('/usr/bin/osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'], { timeout: 4000, maxBuffer: 4096 })
    const name = stdout.trim().slice(0, 128)
    if (name.length === 0 || deps.ownAppNames.includes(name)) return
    return Object.freeze({ name, capturedAt: Date.now() })
  } catch { return }
}

export type TrustedRaycastSelectionResult = Readonly<{ text: string } | { unavailable: string }>

/** Honest selected-text adapter: never reads the clipboard as a substitute for the user's selection. */
export async function readTrustedRaycastSelectedText(priorApp: TrustedRaycastPriorApp | undefined, deps: TrustedRaycastNativeDeps): Promise<TrustedRaycastSelectionResult> {
  if (deps.fixture === 'selection') return Object.freeze({ text: 'TockTeam trusted Raycast selection fixture' })
  if (priorApp === undefined) return Object.freeze({ unavailable: 'No prior application captured. Manual input is available.' })
  try {
    const { stdout } = await deps.execFile('/usr/bin/osascript', ['-e', `tell application "System Events" to tell process "${applescriptString(priorApp.name)}" to get value of attribute "AXSelectedText" of focused UI element`], { timeout: 6000, maxBuffer: MAX_SELECTED_TEXT + 1024 })
    const text = stdout.replace(/\n$/, '')
    if (text.length === 0) return Object.freeze({ unavailable: `No selected text found in ${priorApp.name}. Manual input is available.` })
    if (byteLength(text) > MAX_SELECTED_TEXT) return Object.freeze({ unavailable: 'Selected text exceeds its bound. Manual input is available.' })
    return Object.freeze({ text })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/assistive|accessibility|not allowed|-1719|-25211/i.test(message)) return Object.freeze({ unavailable: 'macOS Accessibility permission is required for selected text. Manual input is available.' })
    return Object.freeze({ unavailable: `Selected text could not be read from ${priorApp.name}. Manual input is available.` })
  }
}

export type TrustedRaycastPasteResult = Readonly<{ target: string; fixture: boolean }>

/** Main-owned paste policy: restore the captured target app, paste, and always restore the prior clipboard. */
export async function pasteTrustedRaycastText(text: string, priorApp: TrustedRaycastPriorApp | undefined, deps: TrustedRaycastNativeDeps): Promise<TrustedRaycastPasteResult> {
  if (byteLength(text) > MAX_PASTE_TEXT) throw new Error('Paste text exceeds its bound')
  if (priorApp === undefined) throw new Error('No prior application captured. Paste requires a captured target application.')
  const wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const original = deps.readClipboard()
  const restore = async (): Promise<void> => {
    deps.writeClipboard(original)
    if (deps.readClipboard() !== original) throw new Error('Clipboard restoration failed')
  }
  deps.writeClipboard(text)
  if (deps.readClipboard() !== text) { await restore(); throw new Error('Clipboard was not accepted') }
  try {
    if (deps.fixture === 'paste') {
      await restore()
      return Object.freeze({ target: priorApp.name, fixture: true })
    }
    await deps.execFile('/usr/bin/osascript', ['-e', `tell application "System Events"\ntell process "${applescriptString(priorApp.name)}" to set frontmost to true\ndelay 0.15\nkeystroke "v" using command down\nend tell`], { timeout: 6000, maxBuffer: 4096 })
    await wait(250)
    await restore()
    return Object.freeze({ target: priorApp.name, fixture: false })
  } catch (error) {
    try { await restore() } catch { throw new Error('Paste failed and the prior clipboard could not be restored') }
    const message = error instanceof Error ? error.message : 'Paste failed'
    if (/assistive|accessibility|not allowed|-1719|-25211/i.test(message)) throw new Error('Paste denied: macOS Accessibility permission is required')
    throw new Error(`Paste denied: ${message.slice(0, 256)}`)
  }
}
