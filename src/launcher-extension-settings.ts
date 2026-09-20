import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import { LAUNCHER_SETTINGS_CATALOG } from './launcher-setting-catalog.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS, type TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'

export type LauncherExtensionId = typeof LAUNCHER_COMPOSITION.extensionIds[number] | TrustedRaycastExtensionId
export type LauncherExtensionEditor = 'local' | 'discovery' | 'file' | 'network' | 'terminal' | 'workflow' | 'compatibility' | 'none'
const definitions: Readonly<Record<LauncherExtensionId, readonly [string, LauncherExtensionEditor]>> = {
  AppearanceSwitcher: ['Appearance Switcher', 'none'], ApplicationSearch: ['Application Search', 'discovery'],
  Base64Conversion: ['Base64 Conversion', 'local'], BrowserBookmarks: ['Browser Bookmarks', 'discovery'],
  Calculator: ['Calculator', 'local'], ColorConverter: ['Color Converter', 'local'],
  CurrencyConversion: ['Currency Conversion', 'network'], CustomWebSearch: ['Custom Web Search', 'network'],
  DeeplTranslator: ['DeepL Translator', 'network'], FileSearch: ['File Search', 'file'],
  JetBrainsToolbox: ['JetBrains Toolbox', 'discovery'], PasswordGenerator: ['Password Generator', 'local'],
  QuickFormatter: ['Quick Formatter', 'local'], RowlandTextEditor: ['Rowland Text Editor', 'local'],
  SimpleFileSearch: ['Simple File Search', 'file'], SystemCommands: ['System Commands', 'none'],
  SystemSettings: ['System Settings', 'none'], TerminalLauncher: ['Terminal Launcher', 'terminal'],
  UeliCommand: ['Ueli Commands', 'none'], UuidGenerator: ['UUID / GUID Generator', 'local'],
  VSCode: ['Visual Studio Code', 'discovery'], WebSearch: ['Web Search', 'network'],
  WindowsControlPanel: ['Windows Control Panel', 'none'], Workflow: ['Workflow', 'workflow'],
  'google-translate': ['Google Translate', 'compatibility'], 'kaomoji-search': ['Kaomoji Search', 'compatibility'],
  'can-i-use': ['Can I Use', 'compatibility'],
}
const compatibilitySearch = {
  'google-translate': ['Source Language', 'Primary Language', 'Secondary Language', 'Use Selected Text', 'Default Action', 'Prioritize Cross-Language Results', 'Proxy Override', 'Network'],
  'kaomoji-search': ['Display Mode', 'List', 'Grid', 'Primary Action', 'Copy', 'Paste'],
  'can-i-use': ['Browser Targets', 'Show Release Date', 'Show Partial Support', 'Brief Mode'],
}

export function isLauncherExtensionId(value: unknown): value is LauncherExtensionId {
  return typeof value === 'string' && Object.hasOwn(definitions, value)
}

export function launcherExtensionSettingOwner(key: string): LauncherExtensionId | undefined {
  const id = /^extension\[([^\]]+)\]\./u.exec(key)?.[1]
  return isLauncherExtensionId(id) ? id : undefined
}

/** Reviewed first-party presentation only. No runtime manifests, callbacks or storage paths. */
export const launcherExtensionPages = Object.freeze([...LAUNCHER_COMPOSITION.extensionIds, ...TRUSTED_RAYCAST_EXTENSION_IDS].map(id => {
  const [label, editor] = definitions[id]
  const settingKeys = Object.freeze(LAUNCHER_SETTINGS_CATALOG.filter(row => launcherExtensionSettingOwner(row.key) === id).map(row => row.key))
  const fields = settingKeys.map(key => key.replace(/^extension\[[^\]]+\]\./u, '').replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/\b[a-z]/gu, char => char.toUpperCase()))
  const searchLabels = Object.freeze([label, ...fields, ...fields.map(field => `${label} ${field}`), ...(compatibilitySearch[id as TrustedRaycastExtensionId] ?? [])])
  return Object.freeze({ id, label, editor, settingKeys, searchLabels })
}))
export type LauncherExtensionPage = typeof launcherExtensionPages[number]

export function launcherSettingsPlatform(source: Pick<Navigator, 'platform' | 'userAgent'> = navigator): 'Linux' | 'macOS' | 'Windows' {
  const agent = `${source.platform} ${source.userAgent}`
  return /Windows/iu.test(agent) ? 'Windows' : /Macintosh|Mac OS/iu.test(agent) ? 'macOS' : 'Linux'
}

export function findLauncherExtensionPages(query: string, translate: (label: string) => string = label => label, availability?: Readonly<{
  platform: 'Linux' | 'macOS' | 'Windows'; installedExtensionIds: readonly string[]
}>): readonly LauncherExtensionPage[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u)
  const installed = new Set(availability?.installedExtensionIds)
  return launcherExtensionPages.filter(page => {
    if (availability && (!launcherExtensionSupported(page.id, availability.platform)
      || (page.editor === 'compatibility' && !installed.has(page.id)))) return false
    const search = [...page.searchLabels, ...page.searchLabels.map(label => translate(label))].join(' ').toLocaleLowerCase()
    return terms.every(term => search.includes(term))
  })
}

/** Shared with the main-owned provider status projection. Saved values remain intact. */
export function launcherExtensionSupported(id: string, platform: 'Linux' | 'macOS' | 'Windows'): boolean {
  if ((TRUSTED_RAYCAST_EXTENSION_IDS as readonly string[]).includes(id)) return platform === 'macOS'
  if (id === 'WindowsControlPanel') return platform === 'Windows'
  return platform !== 'Linux' || !['AppearanceSwitcher', 'BrowserBookmarks', 'FileSearch', 'SystemSettings', 'TerminalLauncher'].includes(id)
}
