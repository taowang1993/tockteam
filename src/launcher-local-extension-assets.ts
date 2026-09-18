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

export const LAUNCHER_LOCAL_EXTENSION_ASSET_HASHES: Readonly<Record<LauncherLocalExtensionId, string>> = Object.freeze({
  Base64Conversion: '4ec2ab60efec30d53dd04b48038dc5bfc97eee7c9e92c3c0fb6d1d8612a769a8',
  Calculator: 'e0a078797184e5ebc584d305cefd201f83e7c3ea41383fbe1cdf5de668cd9391',
  ColorConverter: 'ae6d518c491a2451ff714c3d7329725db258d2d8bec861a9c0adde669e81bfd0',
  PasswordGenerator: '8d317883865b625a35b50d1e1150afec2a2cf8392584e482aa5d09117f7aa9ca',
  QuickFormatter: '5e1e438c834c0b37afc0106a47b7315d6090f089d5c10d271315c243c2d0c186',
  RowlandTextEditor: 'cb6bdcd60962680bb35be8db49469162951e1e5091d013b6dc11b149bd10700f',
  UuidGenerator: '2a4b0aef1d383d3927c431031290b7f6cc6c9993aa6ca600e6459b51f4e5de75',
})

export const LAUNCHER_LOCAL_EXTENSION_ASSET_URLS: Readonly<Record<LauncherLocalExtensionId, string>> = Object.freeze(
  Object.fromEntries(Object.entries(LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS).map(([id, key]) => [id, `./launcher-assets/${key}.png`])) as Record<LauncherLocalExtensionId, string>,
)
