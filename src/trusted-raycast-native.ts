import { Buffer } from 'node:buffer'

const byteLength = (value: string): number => Buffer.byteLength(value)

export type TrustedRaycastPriorApp = Readonly<{ name: string; capturedAt: number }>
export type TrustedRaycastNativeDeps = Readonly<{
  execFile: (file: string, args: string[], options?: { timeout?: number; maxBuffer?: number }) => Promise<Readonly<{ stdout: string }>>
  readClipboard: () => string
  writeClipboard: (text: string) => void
  readClipboardFormats: () => string[]
  readClipboardBuffer: (format: string) => Buffer
  writeClipboardBuffer: (format: string, data: Buffer) => void
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

export type TrustedRaycastPasteResult = Readonly<{ target: string; fixture: boolean; restoration: 'restored' | 'external-change-preserved' }>

type ClipboardSnapshot = Readonly<{ formats: string[]; data: Map<string, Buffer> }>
const MAX_CLIPBOARD_SNAPSHOT = 16 * 1024 * 1024

const captureClipboardSnapshot = (deps: TrustedRaycastNativeDeps): ClipboardSnapshot => {
  const formats = [...new Set(deps.readClipboardFormats())].sort()
  const data = new Map<string, Buffer>()
  let bytes = 0
  for (const format of formats) {
    const buffer = deps.readClipboardBuffer(format)
    bytes += format.length + buffer.length
    if (bytes > MAX_CLIPBOARD_SNAPSHOT) throw new Error('Clipboard exceeds its preservation bound')
    data.set(format, buffer)
  }
  return { formats, data }
}

const restoreClipboardSnapshot = (deps: TrustedRaycastNativeDeps, snapshot: ClipboardSnapshot): void => {
  deps.writeClipboard('')
  for (const [format, data] of snapshot.data) deps.writeClipboardBuffer(format, data)
  const restored = [...new Set(deps.readClipboardFormats())].sort()
  if (restored.length !== snapshot.formats.length || restored.some((format, index) => format !== snapshot.formats[index])) throw new Error('Clipboard restoration failed')
}

/** The clipboard still carries this paste's own write: safe to restore the captured snapshot. */
const stillOwnsPasteWrite = (deps: TrustedRaycastNativeDeps, text: string): boolean => deps.readClipboard() === text

/** Main-owned paste policy: restore the captured target app, paste, and always preserve the prior clipboard. */
export async function pasteTrustedRaycastText(text: string, priorApp: TrustedRaycastPriorApp | undefined, deps: TrustedRaycastNativeDeps): Promise<TrustedRaycastPasteResult> {
  if (byteLength(text) > MAX_PASTE_TEXT) throw new Error('Paste text exceeds its bound')
  if (priorApp === undefined) throw new Error('No prior application captured. Paste requires a captured target application.')
  // Capture every clipboard format in memory before any mutation; deny the paste instead of clobbering.
  const snapshot = captureClipboardSnapshot(deps)
  const wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  deps.writeClipboard(text)
  if (deps.readClipboard() !== text) { restoreClipboardSnapshot(deps, snapshot); throw new Error('Clipboard was not accepted') }
  const restore = async (): Promise<'restored' | 'external-change-preserved'> => {
    if (!stillOwnsPasteWrite(deps, text)) return 'external-change-preserved'
    restoreClipboardSnapshot(deps, snapshot)
    return 'restored'
  }
  try {
    if (deps.fixture === 'paste') return Object.freeze({ target: priorApp.name, fixture: true, restoration: await restore() })
    await deps.execFile('/usr/bin/osascript', ['-e', `tell application "System Events"\ntell process "${applescriptString(priorApp.name)}" to set frontmost to true\ndelay 0.15\nkeystroke "v" using command down\nend tell`], { timeout: 6000, maxBuffer: 4096 })
    await wait(250)
    return Object.freeze({ target: priorApp.name, fixture: false, restoration: await restore() })
  } catch (error) {
    try { await restore() } catch { throw new Error('Paste failed and the prior clipboard could not be restored') }
    const message = error instanceof Error ? error.message : 'Paste failed'
    if (/assistive|accessibility|not allowed|-1719|-25211/i.test(message)) throw new Error('Paste denied: macOS Accessibility permission is required')
    throw new Error(`Paste denied: ${message.slice(0, 256)}`)
  }
}
