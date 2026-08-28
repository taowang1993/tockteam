export type LauncherOsImageKey =
  | 'appearance-switcher-dark'
  | 'appearance-switcher-light'
  | 'system-command-linux'
  | 'system-command-macos-lock-dark'
  | 'system-command-macos-lock-light'
  | 'system-command-macos-logout-dark'
  | 'system-command-macos-logout-light'
  | 'system-command-macos-restart-dark'
  | 'system-command-macos-restart-light'
  | 'system-command-macos-shutdown-dark'
  | 'system-command-macos-shutdown-light'
  | 'system-command-macos-sleep-dark'
  | 'system-command-macos-sleep-light'
  | 'system-command-macos'
  | 'system-command-trash'
  | 'system-command-windows'
  | 'system-settings-macos'
  | 'system-settings-windows'
  | 'ueli-command-dark'
  | 'ueli-command-light'
  | 'control-panel'

type LauncherOsAsset = Readonly<{ fileName: string; hash: string; key: LauncherOsImageKey; source: string }>

const rows: readonly LauncherOsAsset[] = [
  { fileName: 'appearance-switcher-dark.png', hash: '0918bc78b8742066d8afbe522e3c47159aadcee50902ce8b39e6b76e94b9bb25', key: 'appearance-switcher-dark', source: 'vendor/ueli/assets/Extensions/AppearanceSwitcher/switch-to-dark-mode.png' },
  { fileName: 'appearance-switcher-light.png', hash: 'e7642a2d2364376291691734f3b12449c613134e43fbf2de50f525a015376ced', key: 'appearance-switcher-light', source: 'vendor/ueli/assets/Extensions/AppearanceSwitcher/switch-to-light-mode.png' },
  { fileName: 'system-command-linux.png', hash: '39242bd103fa6dc422affb7cb40a7f864a533f6b94ba2e8bb595f867141d2ac9', key: 'system-command-linux', source: 'vendor/ueli/assets/Extensions/SystemCommands/linux.png' },
  { fileName: 'system-command-macos-lock-dark.png', hash: 'efd9efa69b3b1f1e2ae4db45ae1586c983b4681b935b34c283fa5273a2ca4fab', key: 'system-command-macos-lock-dark', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-lock-on-dark.png' },
  { fileName: 'system-command-macos-lock-light.png', hash: '863b8ecbf73cd9714760d5ad1dd4f66e9997adb329b2c3ce8a37ae583433ef2f', key: 'system-command-macos-lock-light', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-lock-on-light.png' },
  { fileName: 'system-command-macos-logout-dark.png', hash: 'aa9649088899592199b11ce7af7c6b6f8cbacf9e49bd0f9a05acc8e7f66cd1d0', key: 'system-command-macos-logout-dark', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-logout-on-dark.png' },
  { fileName: 'system-command-macos-logout-light.png', hash: '7d0c0edbcfd0f0bb6c57b8975fafa9869b69a9e4e9cf049d70573729593c3413', key: 'system-command-macos-logout-light', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-logout-on-light.png' },
  { fileName: 'system-command-macos-restart-dark.png', hash: 'af66662b5c3c691770e78f348071d858f0cc760e1d594ff8851f2fe950d63506', key: 'system-command-macos-restart-dark', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-restart-on-dark.png' },
  { fileName: 'system-command-macos-restart-light.png', hash: 'e316a3aa47881d8efc51f13e9fb9a1143e86ac0d9edb2cd18ef6332cdd9cd488', key: 'system-command-macos-restart-light', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-restart-on-light.png' },
  { fileName: 'system-command-macos-shutdown-dark.png', hash: 'c035bcba9ac55fe61b7b6ec2a9f7a87b64461de596390279ad9e1180c7be07aa', key: 'system-command-macos-shutdown-dark', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-shutdown-on-dark.png' },
  { fileName: 'system-command-macos-shutdown-light.png', hash: '0325906ab4d6019f5cb56c8fa08cbcdef514b06c040cbf2e1ae5a11eba32ebe9', key: 'system-command-macos-shutdown-light', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-shutdown-on-light.png' },
  { fileName: 'system-command-macos-sleep-dark.png', hash: '1fd624e2ab370a896bd9bc21a777a219f1a4c92295157eee65ecf735dbf9c96b', key: 'system-command-macos-sleep-dark', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-sleep-on-dark.png' },
  { fileName: 'system-command-macos-sleep-light.png', hash: '38914903ea6fd4419492c1e840b0eab4a0b4ed83be8e0d5cac2f50d034e6bac9', key: 'system-command-macos-sleep-light', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-sleep-on-light.png' },
  { fileName: 'system-command-macos.png', hash: 'c37f0fc743564b621263fcaf937ed97f5fcc5e9329ad31c49c438e7c8c0219e9', key: 'system-command-macos', source: 'vendor/ueli/assets/Extensions/SystemCommands/macos-system-command.png' },
  { fileName: 'system-command-trash.png', hash: 'e9970c694b14eb163c975f430899500ce863cc4d617294baf7e05ff78447df20', key: 'system-command-trash', source: 'vendor/ueli/assets/Extensions/SystemCommands/trash.png' },
  { fileName: 'system-command-windows.png', hash: '41a80a39d7ea42f606b5cc1de9f133e03147a357360c8bcf8952a1d55d0dbd10', key: 'system-command-windows', source: 'vendor/ueli/assets/Extensions/SystemCommands/windows-11-system-command.png' },
  { fileName: 'system-settings-macos.png', hash: 'c37f0fc743564b621263fcaf937ed97f5fcc5e9329ad31c49c438e7c8c0219e9', key: 'system-settings-macos', source: 'vendor/ueli/assets/Extensions/SystemSettings/macos-system-settings.png' },
  { fileName: 'system-settings-windows.png', hash: '41a80a39d7ea42f606b5cc1de9f133e03147a357360c8bcf8952a1d55d0dbd10', key: 'system-settings-windows', source: 'vendor/ueli/assets/Extensions/SystemSettings/windows-11-settings.png' },
  { fileName: 'ueli-command-dark.png', hash: '3c62491065bec9cee765ebc238b6ae1546ebfd6288e0cf3ba642a4964b82979b', key: 'ueli-command-dark', source: 'vendor/ueli/assets/Extensions/UeliCommand/app-icon-dark.png' },
  { fileName: 'ueli-command-light.png', hash: '35c0b53a23b9ae22aebbc011b3f1e939be37d2a02c1db404320c41d5ff320aa9', key: 'ueli-command-light', source: 'vendor/ueli/assets/Extensions/UeliCommand/app-icon-light.png' },
  { fileName: 'control-panel.png', hash: '6581a2084b71e7b65efb9665cd70469fe1cc237dc3c41a9d1c960ee2ce14accb', key: 'control-panel', source: 'vendor/ueli/assets/Extensions/WindowsControlPanel/control-panel-icon.png' },
]

export const LAUNCHER_OS_ASSETS = Object.freeze(rows.map(row => Object.freeze(row)))
export const LAUNCHER_OS_ASSET_HASHES = Object.freeze(Object.fromEntries(rows.map(row => [row.key, row.hash])) as Record<LauncherOsImageKey, string>)
export const LAUNCHER_OS_ASSET_URLS = Object.freeze(Object.fromEntries(rows.map(row => [row.key, `./launcher-assets/${row.fileName}`])) as Record<LauncherOsImageKey, string>)

export type LauncherOsThemeMode = 'light' | 'dark'

type LauncherOsAssetAlias = Readonly<{ dark: LauncherOsImageKey; light: LauncherOsImageKey }>

const ALIASES: Readonly<Record<string, LauncherOsAssetAlias>> = Object.freeze({
  'appearance-switcher': Object.freeze({ dark: 'appearance-switcher-light', light: 'appearance-switcher-dark' }),
  'system-command-macos-lock': Object.freeze({ dark: 'system-command-macos-lock-dark', light: 'system-command-macos-lock-light' }),
  'system-command-macos-logout': Object.freeze({ dark: 'system-command-macos-logout-dark', light: 'system-command-macos-logout-light' }),
  'system-command-macos-restart': Object.freeze({ dark: 'system-command-macos-restart-dark', light: 'system-command-macos-restart-light' }),
  'system-command-macos-shutdown': Object.freeze({ dark: 'system-command-macos-shutdown-dark', light: 'system-command-macos-shutdown-light' }),
  'system-command-macos-sleep': Object.freeze({ dark: 'system-command-macos-sleep-dark', light: 'system-command-macos-sleep-light' }),
  'ueli-command': Object.freeze({ dark: 'ueli-command-dark', light: 'ueli-command-light' }),
})

export function launcherOsAssetUrl(key: string, mode: LauncherOsThemeMode = 'light'): string | undefined {
  const resolved = Object.hasOwn(LAUNCHER_OS_ASSET_URLS, key)
    ? LAUNCHER_OS_ASSET_URLS[key as LauncherOsImageKey]
    : ALIASES[key] === undefined ? undefined : LAUNCHER_OS_ASSET_URLS[ALIASES[key][mode === 'dark' ? 'dark' : 'light']]
  return resolved
}
