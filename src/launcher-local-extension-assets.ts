import type { LauncherLocalExtensionId } from './launcher-local-extension-config.ts'

export const LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS: Readonly<Record<LauncherLocalExtensionId, string>> = Object.freeze({
  Base64Conversion: 'base64-conversion',
  Calculator: 'calculator',
  ColorConverter: 'color-converter',
  PasswordGenerator: 'password-generator',
  QuickFormatter: 'quick-formatter',
  RowlandTextEditor: 'rowland-texteditor',
  UuidGenerator: 'uuid-generator',
})

export const LAUNCHER_LOCAL_EXTENSION_ASSET_URLS: Readonly<Record<LauncherLocalExtensionId, string>> = Object.freeze(
  Object.fromEntries(Object.entries(LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS).map(([id, key]) => [id, `./launcher-assets/${key}.png`])) as Record<LauncherLocalExtensionId, string>,
)
