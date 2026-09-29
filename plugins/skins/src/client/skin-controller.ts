import { desktopSkin, pairedSkinTokens, type DesktopSkin } from './skins.ts'
import type { SkinDomPort } from './skin-dom.ts'
import { LEGACY_PORCELAIN_ID } from '../skin-ids.ts'
import {
  ACTIVE_SKIN_KEY,
  FALLBACK_THEME_KEY,
  ORIGINAL_MODE_PENDING_KEY,
  PREFERENCES_VERSION_KEY,
  PORCELAIN_MIGRATION_PENDING_KEY,
} from '../preferences.ts'

export { ACTIVE_SKIN_KEY, FALLBACK_THEME_KEY } from '../preferences.ts'

export interface ThemeSnapshot {
  preference: string
  active: {
    id: string
    colorScheme: 'light' | 'dark'
    tokens: Readonly<Record<string, string>>
  }
  revision: number
}

export interface ThemeService {
  getTheme(): ThemeSnapshot
  setTheme(id: string): void
  overrideTokens(source: string, tokens: ReturnType<typeof pairedSkinTokens>): () => void
}

export interface StorageLike {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export interface DesktopSkinsSnapshot {
  activeId: string | null
  revision: number
}

export interface DesktopSkins {
  getSnapshot(): DesktopSkinsSnapshot
  setSkin(id: string | null): void
  subscribe(listener: () => void): () => void
  toggleTheme(): void
}

const BUILTIN_PREFERENCES = new Set(['light', 'dark', 'system'])

export function matchesThemeHotkey(
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): boolean {
  return (event.metaKey || event.ctrlKey)
    && event.shiftKey
    && !event.altKey
    && (event.key.toLowerCase() === '.' || event.code === 'Period')
}

function builtinPreference(value: string | null): value is 'light' | 'dark' | 'system' {
  return value !== null && BUILTIN_PREFERENCES.has(value)
}

/** Keep the selected skin independent of DSH's authoritative Appearance choice. */
export class DesktopSkinsController implements DesktopSkins {
  private readonly listeners = new Set<() => void>()
  private readonly theme: ThemeService
  private readonly storage: StorageLike
  private readonly dom: SkinDomPort
  private snapshot: DesktopSkinsSnapshot = Object.freeze({ activeId: null, revision: 0 })
  private activeLayerId: string | null = null
  private stopLayer: (() => void) | undefined
  private lastPreference = ''
  private started = false

  constructor(theme: ThemeService, storage: StorageLike, dom: SkinDomPort) {
    this.theme = theme
    this.storage = storage
    this.dom = dom
  }

  start(): void {
    if (this.started) return
    this.started = true
    try {
      const stored = this.read(ACTIVE_SKIN_KEY)
      const skin = stored === null ? undefined : desktopSkin(stored)
      if (skin === undefined && stored !== null) this.remove(ACTIVE_SKIN_KEY)
      if (stored === LEGACY_PORCELAIN_ID || this.read(PORCELAIN_MIGRATION_PENDING_KEY) === '1') {
        this.remove(ACTIVE_SKIN_KEY)
        this.remove(ORIGINAL_MODE_PENDING_KEY)
        this.remove(PORCELAIN_MIGRATION_PENDING_KEY)
        this.write(FALLBACK_THEME_KEY, 'light')
        this.write(PREFERENCES_VERSION_KEY, '2')
        this.theme.setTheme('light')
      } else if (this.read(PREFERENCES_VERSION_KEY) !== '2') {
        if (skin !== undefined) {
          // Legacy named skins were always dark, even if Original was remembered as light.
          if (!builtinPreference(this.read(FALLBACK_THEME_KEY))) {
            const preference = this.theme.getTheme().preference
            if (builtinPreference(preference)) this.write(FALLBACK_THEME_KEY, preference)
          }
          if (this.fallbackPreference() !== 'dark') this.write(ORIGINAL_MODE_PENDING_KEY, '1')
          this.theme.setTheme('dark')
        } else {
          const fallback = this.fallbackPreference()
          if (fallback !== 'system') this.theme.setTheme(fallback)
        }
        if (stored !== null || this.fallbackPreference() !== 'system') {
          this.write(PREFERENCES_VERSION_KEY, '2')
        }
      }
      this.lastPreference = this.theme.getTheme().preference
      this.adopt(this.theme.getTheme())
    } catch (error) {
      this.started = false
      this.clearLayer()
      this.dom.dispose()
      throw error
    }
  }

  adopt(snapshot: ThemeSnapshot): void {
    if (!this.started) return
    const changed = snapshot.preference !== this.lastPreference
    this.lastPreference = snapshot.preference
    // A separately chosen third-party theme is never shaded by a TockTeam skin.
    if (!builtinPreference(snapshot.preference)) {
      this.remove(ACTIVE_SKIN_KEY)
      this.clearLayer()
      this.dom.apply(undefined)
      this.publish(null)
      return
    }
    if (changed) {
      this.remove(ORIGINAL_MODE_PENDING_KEY)
      this.write(FALLBACK_THEME_KEY, snapshot.preference)
    }
    const stored = this.read(ACTIVE_SKIN_KEY)
    const skin = stored === null ? undefined : desktopSkin(stored)
    if (skin === undefined && stored !== null) this.remove(ACTIVE_SKIN_KEY)
    this.activate(skin)
    this.dom.apply(skin)
    this.publish(skin?.id ?? null)
  }

  dispose(): void {
    if (!this.started) return
    this.started = false
    this.clearLayer()
    this.dom.dispose()
  }

  getSnapshot(): DesktopSkinsSnapshot {
    return this.snapshot
  }

  setSkin(id: string | null): void {
    if (!this.started) throw new Error('desktop skins controller is not started')
    const skin = id === null ? undefined : desktopSkin(id)
    if (id !== null && skin === undefined) throw new Error(`unknown desktop skin: ${id}`)
    if (skin === undefined) {
      const restore = this.read(ORIGINAL_MODE_PENDING_KEY) === '1'
        ? this.fallbackPreference()
        : undefined
      this.remove(ACTIVE_SKIN_KEY)
      this.remove(ORIGINAL_MODE_PENDING_KEY)
      this.remove(PORCELAIN_MIGRATION_PENDING_KEY)
      this.clearLayer()
      if (restore !== undefined) this.theme.setTheme(restore)
    } else {
      this.write(ACTIVE_SKIN_KEY, skin.id)
      this.remove(PORCELAIN_MIGRATION_PENDING_KEY)
      const preference = this.theme.getTheme().preference
      if (builtinPreference(preference) && this.read(ORIGINAL_MODE_PENDING_KEY) !== '1') {
        this.write(FALLBACK_THEME_KEY, preference)
      }
      this.write(PREFERENCES_VERSION_KEY, '2')
      this.activate(skin)
    }
    this.adopt(this.theme.getTheme())
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggleTheme(): void {
    if (!this.started) throw new Error('desktop skins controller is not started')
    const next = this.theme.getTheme().active.colorScheme === 'dark' ? 'light' : 'dark'
    this.theme.setTheme(next)
    this.adopt(this.theme.getTheme())
  }

  private activate(skin: DesktopSkin | undefined): void {
    if (skin === undefined) {
      this.clearLayer()
      return
    }
    if (this.activeLayerId === skin.id) return
    this.activeLayerId = skin.id // DSH emits theme/change synchronously from overrideTokens.
    this.stopLayer = this.theme.overrideTokens('tockteam.skins', pairedSkinTokens(skin))
  }

  private clearLayer(): void {
    this.activeLayerId = null
    const stop = this.stopLayer
    this.stopLayer = undefined
    stop?.()
  }

  private fallbackPreference(): 'light' | 'dark' | 'system' {
    const stored = this.read(FALLBACK_THEME_KEY)
    return builtinPreference(stored) ? stored : 'system'
  }

  private publish(activeId: string | null): void {
    if (this.snapshot.activeId === activeId) return
    this.snapshot = Object.freeze({ activeId, revision: this.snapshot.revision + 1 })
    for (const listener of this.listeners) listener()
  }

  private read(key: string): string | null {
    try { return this.storage.getItem(key) } catch { return null }
  }

  private remove(key: string): void {
    try { this.storage.removeItem(key) } catch { /* best effort */ }
  }

  private write(key: string, value: string): void {
    try { this.storage.setItem(key, value) } catch { /* best effort */ }
  }
}
