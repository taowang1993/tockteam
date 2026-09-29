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
import { DESKTOP_SKINS_MESSAGES } from '../plugins/skins/src/client/i18n.ts'
import {
  DESKTOP_SKINS,
  TOCKTEAM_SKINS,
  type DesktopSkin,
} from '../plugins/skins/src/client/skins.ts'
import { SKIN_ID } from '../plugins/skins/src/skin-ids.ts'
import {
  ORIGINAL_MODE_PENDING_KEY,
  PREFERENCES_VERSION_KEY,
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

test('Ember retains its saved ID, uses the source dark colors, and provides a matching Light mode', () => {
  assert.deepEqual(TOCKTEAM_SKINS.map(({ id, displayName }) => [id, displayName]), [
    [SKIN_ID.deepCurrent, 'Navy'],
    [SKIN_ID.jadeCircuit, 'Jade'],
    [SKIN_ID.emberDusk, 'Ember'],
  ])
  assert.deepEqual([
    DESKTOP_SKINS_MESSAGES.en['skins.name.default'],
    ...TOCKTEAM_SKINS.map(skin => DESKTOP_SKINS_MESSAGES.en[skin.label]),
  ], ['Default', 'Navy', 'Jade', 'Ember'])
  assert.deepEqual([
    DESKTOP_SKINS_MESSAGES.zh['skins.name.default'],
    ...TOCKTEAM_SKINS.map(skin => DESKTOP_SKINS_MESSAGES.zh[skin.label]),
  ], ['默认', '海军蓝', '翡翠绿', '余烬橙'])
  const ember = TOCKTEAM_SKINS.find(skin => skin.id === SKIN_ID.emberDusk)!
  assert.equal(ember.palettes.dark.tokens['--dsw-alias-bg-base'], '#16110d')
  assert.equal(ember.palettes.dark.tokens['--dsw-specific-sidebar-fill'], '#211a15')
  assert.equal(ember.palettes.dark.tokens['--dsw-alias-label-primary'], '#fdf0e6')
  assert.equal(ember.palettes.dark.tokens['--dsw-alias-brand-primary'], '#f59e5b')
  assert.equal(ember.palettes.light.tokens['--dsw-alias-bg-base'], '#f8f2e9')
  assert.equal(ember.palettes.light.tokens['--dsw-alias-brand-primary'], '#96511c')
  assert.notEqual(ember.palettes.light.tokens['--dsw-alias-bg-base'], ember.palettes.dark.tokens['--dsw-alias-bg-base'])
  assert.equal(ember.palettes.light.tui.text, ember.palettes.light.tokens['--dsw-alias-label-primary'])
})

test('named skin text and selected marks remain legible in both palettes', () => {
  const luminance = (hex: string): number => {
    const [red, green, blue] = [1, 3, 5].map(index => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722
  }
  const contrast = (one: string, two: string): number => {
    const left = luminance(one)
    const right = luminance(two)
    return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05)
  }
  for (const skin of TOCKTEAM_SKINS) {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = skin.palettes[mode].tokens
      for (const background of ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1']) {
        for (const foreground of ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-brand-text']) {
          assert.ok(contrast(tokens[foreground]!, tokens[background]!) >= 4.5, `${skin.id}:${mode}:${foreground}/${background}`)
        }
      }
      assert.ok(contrast(tokens['--dsw-alias-bg-base']!, tokens['--dsw-alias-brand-primary']!) >= 3)
    }
  }
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

test('TUI offers paired native themes, retains old dark IDs, and safely migrates Porcelain', async () => {
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
      for (const mode of ['dark', 'light'] as const) {
        const id = `${skin.id}${mode === 'light' ? '-light' : ''}`
        const native = JSON.parse(await readFile(join(paths.themes, `${id}.json`), 'utf8'))
        assert.equal(native.name, id)
        assert.equal(native.displayName, `TockTeam · ${skin.displayName} · ${mode === 'dark' ? 'Dark' : 'Light'}`)
        assert.equal(native.base, mode)
        assert.deepEqual(native.colors, skin.palettes[mode].tui)
      }
    }

    await writeFile(paths.themePreference, JSON.stringify({ theme: 'tockteam-skin-ember-dusk-light' }))
    assert.deepEqual(mountTuiSkins(dataRoot, configRoot), {
      activeId: 'tockteam-skin-ember-dusk',
      theme: 'tockteam-skin-ember-dusk-light',
    })
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), {
      activeId: 'tockteam-skin-ember-dusk', fallbackTheme: 'light', version: 2,
    })

    await writeFile(paths.themePreference, JSON.stringify({ theme: 'tockteam-skin-porcelain' }))
    assert.deepEqual(mountTuiSkins(dataRoot, configRoot), { activeId: null, theme: 'light' })
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), {
      activeId: null, fallbackTheme: 'light', version: 2, porcelainMigrationPending: true,
    })
    mountTuiSkins(dataRoot, configRoot)
    assert.equal(JSON.parse(await readFile(paths.preferences, 'utf8')).porcelainMigrationPending, true)

    await writeFile(paths.themePreference, JSON.stringify({ theme: 'dark' }))
    mountTuiSkins(dataRoot, configRoot)
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), {
      activeId: null, fallbackTheme: 'dark', version: 2,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI renames only untouched generated themes, preserving custom files and chosen IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-renamed-tui-skins-'))
  const dataRoot = join(directory, 'data')
  const configRoot = join(directory, 'config')
  const paths = tuiSkinPaths(dataRoot, configRoot)
  try {
    await mkdir(paths.themes, { recursive: true })
    await mkdir(dataRoot, { recursive: true })
    await writeFile(paths.preferences, JSON.stringify({ activeId: SKIN_ID.jadeCircuit, fallbackTheme: 'dark', version: 2 }))
    await writeFile(paths.themePreference, JSON.stringify({ theme: SKIN_ID.jadeCircuit }))
    for (const [skin, oldLabel] of [[TOCKTEAM_SKINS[0]!, 'Deep Current'], [TOCKTEAM_SKINS[1]!, 'Jade Circuit']] as const) {
      for (const mode of ['dark', 'light'] as const) {
        const id = `${skin.id}${mode === 'light' ? '-light' : ''}`
        const oldTheme = { name: id, displayName: `TockTeam · ${oldLabel} · ${mode === 'dark' ? 'Dark' : 'Light'}`, base: mode, colors: skin.palettes[mode].tui }
        await writeFile(join(paths.themes, `${id}.json`), `${JSON.stringify(oldTheme, null, 2)}\n`)
      }
    }
    const oldDarkPath = join(paths.themes, `${SKIN_ID.jadeCircuit}.json`)
    const oldDark = { name: SKIN_ID.jadeCircuit, displayName: 'TockTeam · Jade Circuit', base: 'dark', colors: TOCKTEAM_SKINS[1]!.palettes.dark.tui }
    await writeFile(oldDarkPath, `${JSON.stringify(oldDark, null, 2)}\n`)
    const customPath = join(paths.themes, `${SKIN_ID.jadeCircuit}-light.json`)
    const custom = `${JSON.stringify({
      name: `${SKIN_ID.jadeCircuit}-light`, displayName: 'TockTeam · Jade Circuit · Light', base: 'light',
      colors: { ...TOCKTEAM_SKINS[1]!.palettes.light.tui, text: '#111111' },
    }, null, 2)}\n`
    await writeFile(customPath, custom)

    for (let launch = 0; launch < 2; launch += 1) {
      assert.deepEqual(mountTuiSkins(dataRoot, configRoot), { activeId: SKIN_ID.jadeCircuit, theme: SKIN_ID.jadeCircuit })
      for (const skin of TOCKTEAM_SKINS.slice(0, 2)) {
        for (const mode of ['dark', 'light'] as const) {
          const id = `${skin.id}${mode === 'light' ? '-light' : ''}`
          const native = JSON.parse(await readFile(join(paths.themes, `${id}.json`), 'utf8'))
          assert.equal(native.name, id)
          if (skin.id === SKIN_ID.jadeCircuit && mode === 'light') continue
          assert.equal(native.displayName, `TockTeam · ${skin.displayName} · ${mode === 'dark' ? 'Dark' : 'Light'}`)
          assert.deepEqual(native.colors, skin.palettes[mode].tui)
        }
      }
      assert.equal(await readFile(customPath, 'utf8'), custom)
      assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), { activeId: SKIN_ID.jadeCircuit, fallbackTheme: 'dark', version: 2 })
    }

    // Current generated labels are also previous versions after this rename.
    for (const [skin, oldLabel] of [[TOCKTEAM_SKINS[0]!, 'Cyan'], [TOCKTEAM_SKINS[1]!, 'Aurora']] as const) {
      for (const mode of ['dark', 'light'] as const) {
        const id = `${skin.id}${mode === 'light' ? '-light' : ''}`
        const oldTheme = { name: id, displayName: `TockTeam · ${oldLabel} · ${mode === 'dark' ? 'Dark' : 'Light'}`, base: mode, colors: skin.palettes[mode].tui }
        await writeFile(join(paths.themes, `${id}.json`), `${JSON.stringify(oldTheme, null, 2)}\n`)
      }
    }
    mountTuiSkins(dataRoot, configRoot)
    for (const skin of TOCKTEAM_SKINS.slice(0, 2)) {
      for (const mode of ['dark', 'light'] as const) {
        const id = `${skin.id}${mode === 'light' ? '-light' : ''}`
        const native = JSON.parse(await readFile(join(paths.themes, `${id}.json`), 'utf8'))
        assert.equal(native.displayName, `TockTeam · ${skin.displayName} · ${mode === 'dark' ? 'Dark' : 'Light'}`)
      }
    }
    const customized = `${JSON.stringify({ name: SKIN_ID.deepCurrent, displayName: 'TockTeam · Cyan · Dark', base: 'dark', colors: { ...TOCKTEAM_SKINS[0]!.palettes.dark.tui, text: '#111111' } }, null, 2)}\n`
    await writeFile(join(paths.themes, `${SKIN_ID.deepCurrent}.json`), customized)
    mountTuiSkins(dataRoot, configRoot)
    assert.equal(await readFile(join(paths.themes, `${SKIN_ID.deepCurrent}.json`), 'utf8'), customized)
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), { activeId: SKIN_ID.jadeCircuit, fallbackTheme: 'dark', version: 2 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI upgrades only untouched Ember Dusk themes while preserving customized themes and saved IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-ember-upgrade-'))
  const dataRoot = join(directory, 'data')
  const configRoot = join(directory, 'config')
  const paths = tuiSkinPaths(dataRoot, configRoot)
  const old = JSON.parse(await readFile(new URL('./fixtures/ember-dusk-native-themes.json', import.meta.url), 'utf8'))
  const themePath = (mode: 'dark' | 'light') => join(paths.themes, `${SKIN_ID.emberDusk}${mode === 'light' ? '-light' : ''}.json`)
  try {
    await mkdir(paths.themes, { recursive: true })
    await mkdir(dataRoot, { recursive: true })
    await writeFile(paths.preferences, JSON.stringify({ activeId: SKIN_ID.emberDusk, fallbackTheme: 'dark', version: 2 }))
    await writeFile(paths.themePreference, JSON.stringify({ theme: SKIN_ID.emberDusk }))
    for (const mode of ['dark', 'light'] as const) await writeFile(themePath(mode), `${JSON.stringify(old[mode], null, 2)}\n`)

    assert.deepEqual(mountTuiSkins(dataRoot, configRoot), { activeId: SKIN_ID.emberDusk, theme: SKIN_ID.emberDusk })
    const ember = TOCKTEAM_SKINS.find(skin => skin.id === SKIN_ID.emberDusk)!
    for (const mode of ['dark', 'light'] as const) {
      const native = JSON.parse(await readFile(themePath(mode), 'utf8'))
      assert.equal(native.displayName, `TockTeam · Ember · ${mode === 'dark' ? 'Dark' : 'Light'}`)
      assert.deepEqual(native.colors, ember.palettes[mode].tui)
    }
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), { activeId: SKIN_ID.emberDusk, fallbackTheme: 'dark', version: 2 })

    const custom = `${JSON.stringify({ ...old.light, colors: { ...old.light.colors, text: '#111111' } }, null, 2)}\n`
    const olderDark = `${JSON.stringify({ ...old.dark, displayName: 'TockTeam · Ember Dusk' }, null, 2)}\n`
    await writeFile(themePath('light'), custom)
    await writeFile(themePath('dark'), olderDark)
    mountTuiSkins(dataRoot, configRoot)
    assert.equal(JSON.parse(await readFile(themePath('dark'), 'utf8')).displayName, 'TockTeam · Ember · Dark')
    assert.equal(await readFile(themePath('light'), 'utf8'), custom)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI launch does not erase an older Desktop dark skin and remembered Default Light', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-skins-cross-surface-'))
  const paths = tuiSkinPaths(join(directory, 'data'), join(directory, 'config'))
  try {
    await mkdir(join(directory, 'data'), { recursive: true })
    await mkdir(join(directory, 'config'), { recursive: true })
    const oldPreferences = { activeId: 'tockteam-skin-jade-circuit', fallbackTheme: 'light' }
    await writeFile(paths.preferences, JSON.stringify(oldPreferences))
    await writeFile(paths.themePreference, JSON.stringify({ theme: 'tockteam-skin-jade-circuit' }))
    assert.equal(mountTuiSkins(join(directory, 'data'), join(directory, 'config')).theme, 'tockteam-skin-jade-circuit')
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), oldPreferences)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI seeds legacy named skins as Dark before Desktop has migrated them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-skins-tui-legacy-seed-'))
  const paths = tuiSkinPaths(join(directory, 'data'), join(directory, 'config'))
  const legacy = { activeId: 'tockteam-skin-jade-circuit', fallbackTheme: 'light' }
  try {
    await mkdir(join(directory, 'data'), { recursive: true })
    await writeFile(paths.preferences, JSON.stringify(legacy))
    for (let launch = 0; launch < 2; launch += 1) {
      assert.equal(mountTuiSkins(join(directory, 'data'), join(directory, 'config')).theme, legacy.activeId)
      assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), legacy)
    }
    const storage = new MemoryStorage()
    storage.setItem(ACTIVE_SKIN_KEY, legacy.activeId)
    storage.setItem(FALLBACK_THEME_KEY, legacy.fallbackTheme)
    const theme = new FakeThemeService('light')
    const controller = new DesktopSkinsController(theme, storage, new FakeSkinDom())
    controller.start()
    assert.equal(theme.getTheme().preference, 'dark')
    controller.setSkin(null)
    assert.equal(theme.getTheme().preference, 'light')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI startup preserves Desktop pending Default mode across native dark theme and absent theme file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-skins-tui-pending-original-'))
  const paths = tuiSkinPaths(join(directory, 'data'), join(directory, 'config'))
  const pending = { activeId: 'tockteam-skin-jade-circuit', fallbackTheme: 'light', version: 2, originalModePending: true }
  try {
    await mkdir(join(directory, 'data'), { recursive: true })
    await mkdir(join(directory, 'config'), { recursive: true })
    await writeFile(paths.preferences, JSON.stringify(pending))
    await writeFile(paths.themePreference, JSON.stringify({ theme: pending.activeId }))
    for (let launch = 0; launch < 2; launch += 1) {
      assert.equal(mountTuiSkins(join(directory, 'data'), join(directory, 'config')).theme, pending.activeId)
      assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), pending)
    }
    await rm(paths.themePreference)
    assert.equal(mountTuiSkins(join(directory, 'data'), join(directory, 'config')).theme, pending.activeId)
    assert.deepEqual(JSON.parse(await readFile(paths.preferences, 'utf8')), pending)
    const storage = new MemoryStorage()
    storage.setItem(ACTIVE_SKIN_KEY, pending.activeId)
    storage.setItem(FALLBACK_THEME_KEY, pending.fallbackTheme)
    storage.setItem(PREFERENCES_VERSION_KEY, '2')
    storage.setItem(ORIGINAL_MODE_PENDING_KEY, '1')
    const theme = new FakeThemeService('dark')
    const controller = new DesktopSkinsController(theme, storage, new FakeSkinDom())
    controller.start()
    controller.setSkin(null)
    assert.equal(theme.getTheme().preference, 'light')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TUI retires only byte-identical generated Porcelain, preserving customized themes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-retired-skin-'))
  const paths = tuiSkinPaths(join(directory, 'data'), join(directory, 'config'))
  const oldPath = join(paths.themes, 'tockteam-skin-porcelain.json')
  const generated = await readFile(new URL('./fixtures/skins/generated-porcelain.json', import.meta.url), 'utf8')
  try {
    await mkdir(paths.themes, { recursive: true })
    await writeFile(oldPath, generated)
    mountTuiSkins(join(directory, 'data'), join(directory, 'config'))
    await assert.rejects(readFile(oldPath), { code: 'ENOENT' })

    const customized = generated.replace('TockTeam · Porcelain', 'My Porcelain')
    await writeFile(oldPath, customized)
    const darkPath = join(paths.themes, 'tockteam-skin-deep-current.json')
    const customizedDark = '{"name":"My Deep Current"}\n'
    await writeFile(darkPath, customizedDark)
    mountTuiSkins(join(directory, 'data'), join(directory, 'config'))
    assert.equal(await readFile(oldPath, 'utf8'), customized)
    assert.equal(await readFile(darkPath, 'utf8'), customizedDark)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Navy stays selected as the built-in Appearance setting changes', () => {
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

test('upgrade keeps the former dark skin yet remembers Default Light until deselection', () => {
  const storage = new MemoryStorage()
  storage.setItem(ACTIVE_SKIN_KEY, 'tockteam-skin-jade-circuit')
  storage.setItem(FALLBACK_THEME_KEY, 'light')
  const theme = new FakeThemeService('light')
  const controller = new DesktopSkinsController(theme, storage, new FakeSkinDom())
  controller.start()
  assert.equal(theme.getTheme().preference, 'dark')
  assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'light')
  controller.dispose()

  const resumed = new DesktopSkinsController(theme, storage, new FakeSkinDom())
  resumed.start()
  assert.equal(theme.getTheme().preference, 'dark')
  resumed.setSkin(null)
  assert.equal(theme.getTheme().preference, 'light')
  assert.equal(storage.getItem(ACTIVE_SKIN_KEY), null)
})

test('a saved Porcelain choice migrates to Default Light rather than disappearing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tockteam-porcelain-migration-'))
  const path = join(directory, 'skins.json')
  try {
    await writeFile(path, '{"activeId":"tockteam-skin-porcelain","fallbackTheme":"dark"}\n')
    const stored = await loadSkinPreferences(path)
    const storage = new MemoryStorage()
    storage.setItem(ACTIVE_SKIN_KEY, stored.activeId!)
    storage.setItem(FALLBACK_THEME_KEY, stored.fallbackTheme)
    const theme = new FakeThemeService('dark')
    const controller = new DesktopSkinsController(theme, storage, new FakeSkinDom())
    controller.start()
    assert.equal(theme.getTheme().preference, 'light')
    assert.equal(storage.getItem(ACTIVE_SKIN_KEY), null)
    assert.equal(storage.getItem(FALLBACK_THEME_KEY), 'light')
    assert.equal(controller.getSnapshot().activeId, null)
    assert.equal(DESKTOP_SKINS.find(skin => String(skin.id) === 'tockteam-skin-porcelain'), undefined)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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

test('choosing Default restores the appearance used before a skin', () => {
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
  assert.equal(theme.getTheme().active.tokens['--dsw-alias-bg-base'], '#f8f2e9')
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
