import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  DesktopSkinPreferencesStorage,
  type PreferencesFetch,
} from '../plugins/skins/src/client/preferences-storage.ts'
import {
  ACTIVE_SKIN_KEY,
  DesktopSkinsController,
  FALLBACK_THEME_KEY,
  matchesThemeHotkey,
  type StorageLike,
  type ThemeService,
  type ThemeSnapshot,
} from '../plugins/skins/src/client/skin-controller.ts'
import type { SkinDomPort } from '../plugins/skins/src/client/skin-dom.ts'
import {
  DESKTOP_SKINS,
  TOCKTEAM_SKINS,
  type DesktopSkin,
} from '../plugins/skins/src/client/skins.ts'
import {
  parseSkinPreferences,
  type DesktopSkinPreferences,
} from '../plugins/skins/src/preferences.ts'
import {
  loadSkinPreferences,
  saveSkinPreferences,
} from '../plugins/skins/src/preferences-server.ts'
import {
  mountTuiSkins,
  tuiSkinPaths,
} from '../plugins/skins/src/tui-adapter.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class FakeThemeService implements ThemeService {
  readonly custom = new Map<string, ThemeSnapshot['active']>()
  readonly overrides = new Map<string, Record<string, { light: string; dark: string }>>()
  private snapshot: ThemeSnapshot
  private systemDark = false
  onChange?: (snapshot: ThemeSnapshot) => void

  constructor(preference: 'light' | 'dark' | 'system' = 'system') {
    this.snapshot = this.builtinSnapshot(preference, 0)
  }

  getTheme(): ThemeSnapshot {
    return this.snapshot
  }

  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void {
    this.overrides.set(source, tokens)
    this.recompose()
    return () => {
      if (this.overrides.get(source) !== tokens) return
      this.overrides.delete(source)
      this.recompose()
    }
  }

  setTheme(id: string): void {
    const custom = this.custom.get(id)
    if (custom !== undefined) {
      this.snapshot = { preference: id, active: custom, revision: this.snapshot.revision + 1 }
      this.onChange?.(this.snapshot)
      return
    }
    if (id !== 'light' && id !== 'dark' && id !== 'system') throw new Error(`unknown theme: ${id}`)
    this.snapshot = this.builtinSnapshot(id, this.snapshot.revision + 1)
    this.onChange?.(this.snapshot)
  }

  setSystemDark(dark: boolean): void {
    this.systemDark = dark
    if (this.snapshot.preference === 'system') this.recompose()
  }

  private recompose(): void {
    const preference = this.snapshot.preference
    if (preference === 'light' || preference === 'dark' || preference === 'system') {
      this.snapshot = this.builtinSnapshot(preference, this.snapshot.revision + 1)
      this.onChange?.(this.snapshot)
    }
  }

  private builtinSnapshot(preference: 'light' | 'dark' | 'system', revision: number): ThemeSnapshot {
    const id = preference === 'system' ? (this.systemDark ? 'dark' : 'light') : preference
    const tokens = Object.fromEntries([...this.overrides.values()].flatMap(layer =>
      Object.entries(layer).map(([key, pair]) => [key, pair[id]])))
    return { preference, active: { id, colorScheme: id, tokens }, revision }
  }
}

class FakeSkinDom implements SkinDomPort {
  active: string | undefined

  apply(skin: DesktopSkin | undefined): void {
    this.active = skin?.id
  }

  dispose(): void {
    this.active = undefined
  }
}

test('Desktop image lightboxes stay below the owned titlebar without changing Radix dialogs', async () => {
  const css = await readFile(new URL('../plugins/skins/src/client/tailwind.css', import.meta.url), 'utf8')
  assert.match(css, /@utility tockteam-desktop-shell[\s\S]*?& body > \[role='dialog'\]\[aria-modal='true'\]:has\(> img\) \{[\s\S]*?top: var\(--tockteam-titlebar-height\) !important;[\s\S]*?padding: 40px !important;/u)
  assert.match(css, /body > \[role='dialog'\]\[aria-modal='true'\]:has\(> img\) > img \{[\s\S]*?max-height: calc\(100vh - var\(--tockteam-titlebar-height\) - 80px\) !important;/u)
  assert.match(css, /body > \[role='dialog'\]\[aria-modal='true'\]:has\(> img\) > button \{[\s\S]*?top: calc\(var\(--tockteam-titlebar-height\) \+ 8px\) !important;[\s\S]*?right: 8px !important;/u)
  assert.doesNotMatch(css, /\[role='presentation'\] > \[role='dialog'\][^{]*\{[^}]*max-height:/u)
})

test('each retained skin has two distinct palettes with an editor darker than its shell', () => {
  assert.equal(DESKTOP_SKINS.length, 3)
  assert.equal(new Set(DESKTOP_SKINS.map(skin => skin.id)).size, DESKTOP_SKINS.length)
  for (const skin of DESKTOP_SKINS) {
    assert.match(skin.id, /^tockteam-skin-/)
    for (const mode of ['light', 'dark'] as const) {
      const { tokens } = skin.palettes[mode]
      assert.ok(Object.keys(tokens).length >= 30)
      assert.match(tokens['--dsw-alias-bg-base'] ?? '', /^#[0-9a-f]{6}$/i)
      assert.equal(tokens['--dsw-alias-bg-layer-1'], tokens['--dsw-specific-sidebar-fill'])
      assert.notEqual(tokens['--dsw-alias-bg-base'], tokens['--dsw-specific-sidebar-fill'])
    }
    assert.deepEqual(Object.keys(skin.palettes.light.tokens), Object.keys(skin.palettes.dark.tokens))
    assert.notEqual(skin.palettes.light.tokens['--dsw-alias-bg-base'], skin.palettes.dark.tokens['--dsw-alias-bg-base'])
    assert.equal(skin.css, undefined)
  }
  assert.equal(new Set(DESKTOP_SKINS.map(skin => skin.palettes.light.tokens['--dsw-alias-bg-base'])).size, 3)
})

test('one skin catalog supplies browser tokens and both TUI semantic palettes', () => {
  assert.equal(DESKTOP_SKINS, TOCKTEAM_SKINS)
  for (const skin of TOCKTEAM_SKINS) {
    for (const mode of ['light', 'dark'] as const) {
      const { tokens, tui } = skin.palettes[mode]
      assert.ok(Object.keys(tui).length >= 30)
      assert.equal(tui.claude, tokens['--dsw-alias-brand-primary'])
      assert.equal(tui.text, tokens['--dsw-alias-label-primary'])
      for (const color of Object.values(tui)) assert.match(color, /^#[0-9a-f]{6}$/i)
    }
  }
})

test('TUI adapter materializes skins and reconciles the native theme picker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-tui-skins-'))
  const dataRoot = join(directory, 'data')
  const configRoot = join(directory, 'config')
  const paths = tuiSkinPaths(dataRoot, configRoot)
  try {
    await mkdir(dataRoot, { recursive: true })
    await writeFile(paths.preferences, JSON.stringify({
      activeId: 'tockteam-skin-jade-circuit',
      fallbackTheme: 'system',
    }))

    const seeded = mountTuiSkins(dataRoot, configRoot)
    assert.equal(seeded.theme, 'tockteam-skin-jade-circuit')
    assert.deepEqual(JSON.parse(await readFile(paths.themePreference, 'utf8')), {
      theme: 'tockteam-skin-jade-circuit',
    })
    for (const skin of TOCKTEAM_SKINS) {
      const theme = JSON.parse(await readFile(
        join(paths.themes, `${skin.id}.json`),
        'utf8',
      ))
      assert.equal(theme.name, skin.id)
      assert.equal(theme.base, skin.colorScheme)
      assert.deepEqual(theme.colors, skin.tui)
    }

    await writeFile(paths.themePreference, JSON.stringify({ theme: 'tockteam-skin-porcelain' }))
    mountTuiSkins(dataRoot, configRoot)
    assert.equal(
      JSON.parse(await readFile(paths.preferences, 'utf8')).activeId,
      'tockteam-skin-porcelain',
    )

    await writeFile(paths.themePreference, JSON.stringify({ theme: 'light' }))
    mountTuiSkins(dataRoot, configRoot)
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), {
      activeId: null,
      fallbackTheme: 'light',
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Deep Current stays selected as the built-in Appearance setting changes', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService('dark')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()
  controller.setSkin('tockteam-skin-deep-current')

  assert.equal(theme.getTheme().preference, 'dark')
  assert.equal(theme.getTheme().active.id, 'dark')
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#071923')
  theme.setTheme('light')
  controller.adopt(theme.getTheme())
  assert.equal(theme.getTheme().preference, 'light')
  assert.equal(theme.getTheme().active.id, 'light')
  assert.equal(controller.getSnapshot().activeId, 'tockteam-skin-deep-current')
  assert.notEqual(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#071923')
  assert.equal(dom.active, 'tockteam-skin-deep-current')

  controller.setSkin(null)
  assert.equal(theme.getTheme().preference, 'light')
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], undefined)
})

test('synchronous theme events never reapply a removed or third-party skin', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService('light')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()
  theme.onChange = snapshot => controller.adopt(snapshot)
  controller.setSkin('tockteam-skin-deep-current')
  assert.equal(theme.overrides.size, 1)
  theme.setTheme('system')
  theme.setSystemDark(true)
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#071923')
  assert.equal(controller.getSnapshot().activeId, 'tockteam-skin-deep-current')
  theme.setSystemDark(false)
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#eaf4f7')

  theme.custom.set('other-theme', { id: 'other-theme', colorScheme: 'dark', tokens: {} })
  theme.setTheme('other-theme')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), null)
  assert.equal(theme.overrides.size, 0)
  assert.equal(dom.active, undefined)
  assert.equal(controller.getSnapshot().activeId, null)
})

test('desktop skins restore a persisted dark family through DSH Appearance', () => {
  const storage = new MemoryStorage()
  storage.setItem(ACTIVE_SKIN_KEY, 'tockteam-skin-deep-current')
  const theme = new FakeThemeService('dark')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)

  controller.start()

  assert.equal(theme.custom.size, 0)
  assert.equal(theme.overrides.size, 1)
  assert.equal(theme.getTheme().active.id, 'dark')
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#071923')
  assert.equal(controller.getSnapshot().activeId, 'tockteam-skin-deep-current')
  assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'dark')
  assert.equal(dom.active, 'tockteam-skin-deep-current')
})

test('desktop skins restore a non-system fallback without a selected skin', () => {
  const storage = new MemoryStorage()
  storage.setItem(FALLBACK_THEME_KEY, 'dark')
  const theme = new FakeThemeService('system')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)

  controller.start()

  assert.equal(theme.getTheme().preference, 'dark')
  assert.equal(theme.getTheme().active.id, 'dark')
  assert.equal(controller.getSnapshot().activeId, null)
  assert.equal(dom.active, undefined)
})

test('appearance hydration keeps a restored skin selected without reasserting Dark', () => {
  const storage = new MemoryStorage()
  storage.setItem(ACTIVE_SKIN_KEY, 'tockteam-skin-jade-circuit')
  const theme = new FakeThemeService('system')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()

  theme.setTheme('light')
  controller.adopt(theme.getTheme())

  assert.equal(theme.getTheme().active.id, 'light')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), 'tockteam-skin-jade-circuit')
  assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'light')
  assert.equal(controller.getSnapshot().activeId, 'tockteam-skin-jade-circuit')
  assert.equal(dom.active, 'tockteam-skin-jade-circuit')
})

test('choosing Original restores the appearance used before a skin', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService('dark')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()

  controller.setSkin('tockteam-skin-jade-circuit')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), 'tockteam-skin-jade-circuit')
  assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'dark')

  controller.setSkin(null)
  assert.equal(theme.getTheme().preference, 'dark')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), null)
  assert.equal(controller.getSnapshot().activeId, null)
  assert.equal(dom.active, undefined)
})

test('theme hotkey toggles the active appearance between dark and light', () => {
  const theme = new FakeThemeService('dark')
  const controller = new DesktopSkinsController(theme, new MemoryStorage(), new FakeSkinDom())
  controller.start()

  controller.toggleTheme()
  assert.equal(theme.getTheme().preference, 'light')

  controller.toggleTheme()
  assert.equal(theme.getTheme().preference, 'dark')
})

test('theme hotkey matches Command/Ctrl + Shift + Period only', () => {
  const event = {
    altKey: false,
    code: 'Period',
    ctrlKey: false,
    key: '>',
    metaKey: true,
    shiftKey: true,
  }
  assert.equal(matchesThemeHotkey(event), true)
  assert.equal(matchesThemeHotkey({ ...event, metaKey: false, ctrlKey: true }), true)
  assert.equal(matchesThemeHotkey({ ...event, shiftKey: false }), false)
  assert.equal(matchesThemeHotkey({ ...event, altKey: true }), false)
  assert.equal(matchesThemeHotkey({ ...event, code: 'KeyT', key: 't' }), false)
})

test('appearance changes update the fallback without clearing an active skin', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService('system')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()
  controller.setSkin('tockteam-skin-ember-dusk')

  theme.setTheme('light')
  controller.adopt(theme.getTheme())

  assert.equal(theme.getTheme().active.id, 'light')
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#f6ede9')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), 'tockteam-skin-ember-dusk')
  assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'light')
  assert.equal(controller.getSnapshot().activeId, 'tockteam-skin-ember-dusk')
  assert.equal(dom.active, 'tockteam-skin-ember-dusk')
})

test('desktop skins reject unknown choices and release their token layer', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService()
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()

  assert.throws(
    () => { controller.setSkin('tockteam-skin-missing') },
    /unknown desktop skin/,
  )
  controller.setSkin('tockteam-skin-deep-current')
  assert.equal(theme.overrides.size, 1)
  controller.dispose()
  assert.equal(theme.overrides.size, 0)
  assert.equal(dom.active, undefined)
})

test('runtime teardown preserves the selected skin for the next launch', () => {
  const storage = new MemoryStorage()
  const theme = new FakeThemeService('dark')
  const dom = new FakeSkinDom()
  const controller = new DesktopSkinsController(theme, storage, dom)
  controller.start()
  controller.setSkin('tockteam-skin-deep-current')

  controller.dispose()
  controller.adopt(theme.getTheme())

  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), 'tockteam-skin-deep-current')
  assert.equal(theme.getTheme().preference, 'dark')
  assert.equal(theme.overrides.size, 0)
})

test('desktop skin preferences survive outside the changing Web origin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-skins-'))
  const path = join(directory, 'skins.json')
  const preferences: DesktopSkinPreferences = {
    activeId: 'tockteam-skin-porcelain',
    fallbackTheme: 'dark',
  }
  try {
    await saveSkinPreferences(path, preferences)
    assert.deepEqual(await loadSkinPreferences(path), preferences)
    assert.equal((await readFile(path, 'utf8')).endsWith('\n'), true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('desktop skin preferences migrate from the pre-rename durable file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-skins-legacy-'))
  const path = join(directory, 'skins.json')
  const legacy = join(directory, 'desktop-skins.json')
  const preferences: DesktopSkinPreferences = {
    activeId: 'tockteam-skin-porcelain',
    fallbackTheme: 'dark',
  }
  try {
    await writeFile(legacy, `${JSON.stringify(preferences, undefined, 2)}\n`)
    assert.deepEqual(await loadSkinPreferences(path), preferences)
    assert.deepEqual(
      JSON.parse(await readFile(path, 'utf8')) as DesktopSkinPreferences,
      preferences,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('client preference writes are coalesced and validated', async () => {
  let persisted: DesktopSkinPreferences = {
    activeId: null,
    fallbackTheme: 'system',
  }
  const writes: DesktopSkinPreferences[] = []
  const request: PreferencesFetch = async (_input, init) => {
    if (init?.method === 'PUT') {
      const value = parseSkinPreferences(JSON.parse(init.body ?? 'null') as unknown)
      assert.ok(value)
      persisted = value
      writes.push(value)
    }
    return {
      ok: true,
      status: 200,
      json: async () => persisted,
    }
  }
  const storage = new DesktopSkinPreferencesStorage(request)
  await storage.load()

  storage.setItem(ACTIVE_SKIN_KEY, 'tockteam-skin-deep-current')
  storage.setItem(FALLBACK_THEME_KEY, 'dark')
  await storage.settle()

  assert.deepEqual(persisted, {
    activeId: 'tockteam-skin-deep-current',
    fallbackTheme: 'dark',
  })
  assert.equal(writes.length, 1)
})
