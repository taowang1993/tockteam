export type LauncherDiscoveryImageKey =
  | 'application-linux'
  | 'application-linux-generic'
  | 'application-macos'
  | 'application-macos-generic'
  | 'application-windows-dark'
  | 'application-windows-light'
  | 'application-windows-generic'
  | 'browser-bookmarks'
  | 'browser-arc'
  | 'browser-brave'
  | 'browser-firefox'
  | 'browser-google-chrome'
  | 'browser-microsoft-edge'
  | 'browser-yandex'
  | 'browser-zen'
  | 'jetbrains-toolbox'
  | 'vscode-file'
  | 'vscode'

export type LauncherDiscoveryAsset = Readonly<{
  fileName: string
  hash: string
  key: LauncherDiscoveryImageKey
  source: string
}>

const rows: readonly LauncherDiscoveryAsset[] = [
  { fileName: 'application-linux.png', hash: '9571f48a26daa759c4243e28d1a427cfd459564d2a26e576b551d987be50d37f', key: 'application-linux', source: 'assets/launcher/Extensions/ApplicationSearch/linux-applications.png' },
  { fileName: 'application-linux-generic.png', hash: '954a84019db2c87f0c3465aa564e4b6ed6167a7b1765ec866cbd4bacafb7e892', key: 'application-linux-generic', source: 'assets/launcher/Extensions/ApplicationSearch/linux-generic-app-icon.png' },
  { fileName: 'application-macos.png', hash: 'da0027a559a037e662b38a8ede779b6a2e31bd4ac1bce7fceca0c8ea62a512cb', key: 'application-macos', source: 'assets/launcher/Extensions/ApplicationSearch/macos-applications.png' },
  { fileName: 'application-macos-generic.png', hash: '8eaae03ecc49a1aa393cd5b256bae52a86a0a63ba16c3fa5ac32063bfd320b2b', key: 'application-macos-generic', source: 'assets/launcher/Extensions/ApplicationSearch/macos-generic-app-icon.png' },
  { fileName: 'application-windows-dark.png', hash: '454a47d635d60ebbab44344ba66450cf52346e823ca76ca31bcbda0997eda5fa', key: 'application-windows-dark', source: 'assets/launcher/Extensions/ApplicationSearch/windows-applications-dark.png' },
  { fileName: 'application-windows-light.png', hash: 'ac3070b1ded77ae1dadc4f5aed1714128fab73f9a380a92c41b40329d3b3d4d2', key: 'application-windows-light', source: 'assets/launcher/Extensions/ApplicationSearch/windows-applications-light.png' },
  { fileName: 'application-windows-generic.png', hash: '000068955c67ab474df5b258a01a60f3bba2919d3c17326cade34a358a4912cc', key: 'application-windows-generic', source: 'assets/launcher/Extensions/ApplicationSearch/windows-generic-app-icon.png' },
  { fileName: 'browser-bookmarks.png', hash: 'c2075df1fcf0e4e7e886e46ddd445e3c04b889dda20f5aca2566f7de0863a354', key: 'browser-bookmarks', source: 'assets/launcher/Extensions/BrowserBookmarks/browser-bookmarks.png' },
  { fileName: 'jetbrains-toolbox.png', hash: '4793800c7cd1b793aac93b33e6a38c1a18e0008ebeecaf04c9a8b838f632c1b5', key: 'jetbrains-toolbox', source: 'assets/launcher/Extensions/JetBrainsToolbox/toolbox.png' },
  { fileName: 'vscode-file.png', hash: '954a84019db2c87f0c3465aa564e4b6ed6167a7b1765ec866cbd4bacafb7e892', key: 'vscode-file', source: 'assets/launcher/Extensions/VSCode/default-file-icon.png' },
  { fileName: 'vscode.png', hash: '7ac29e00cd66e549acc2ea6a99a813f92cb23a6d165293be6959845670f0c5a4', key: 'vscode', source: 'assets/launcher/Extensions/VSCode/vscode.png' },
  { fileName: 'browser-arc.png', hash: 'c8e0daa8bab62d9f71c00cf0637ec2ab557862bbab7c8d9859dce04bc095e755', key: 'browser-arc', source: 'assets/launcher/Core/WebBrowser/arc.png' },
  { fileName: 'browser-brave-browser.png', hash: 'ba9f99c1a35042f3b20e365e477d2cf5da72feed28ff3e735f54940ffd47643c', key: 'browser-brave', source: 'assets/launcher/Core/WebBrowser/brave-browser.png' },
  { fileName: 'browser-firefox.png', hash: '28651899a25e6665e1bd65ccf7a5302417a2822dc658263c12d57c9a247d51aa', key: 'browser-firefox', source: 'assets/launcher/Core/WebBrowser/firefox.png' },
  { fileName: 'browser-google-chrome.png', hash: '68e998cddd32341a776e2fb5e0c2ad26748594cf44cd3635ccc2974f0d84ba27', key: 'browser-google-chrome', source: 'assets/launcher/Core/WebBrowser/google-chrome.png' },
  { fileName: 'browser-microsoft-edge.png', hash: 'a94a9d74adf95e9bdab3b19c13de497d525aa5d85743f8a98e885d3934010e94', key: 'browser-microsoft-edge', source: 'assets/launcher/Core/WebBrowser/microsoft-edge.png' },
  { fileName: 'browser-yandex.svg', hash: '29afe7aba01ff139dde1c22db8dad0300a5a8b6fea1c26e90bc3b20a3ac888b4', key: 'browser-yandex', source: 'assets/launcher/Core/WebBrowser/yandex-browser.svg' },
  { fileName: 'browser-zen.png', hash: 'e6893025a3f607b3d12b0c5abf8c36b643e453731886d97d0933358fc11fd2c9', key: 'browser-zen', source: 'assets/launcher/Core/WebBrowser/zen.png' },
]

export const LAUNCHER_DISCOVERY_ASSETS = Object.freeze(rows.map(row => Object.freeze(row)))
export const LAUNCHER_DISCOVERY_ASSET_HASHES = Object.freeze(Object.fromEntries(rows.map(row => [row.key, row.hash])) as Record<LauncherDiscoveryImageKey, string>)
export const LAUNCHER_DISCOVERY_ASSET_URLS = Object.freeze(Object.fromEntries(rows.map(row => [row.key, `./launcher-assets/${row.fileName}`])) as Record<LauncherDiscoveryImageKey, string>)

const LAUNCHER_DISCOVERY_ASSET_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'application-windows': './launcher-assets/application-windows-generic.png',
})

export function launcherDiscoveryAssetUrl(key: string): string | undefined {
  if (Object.hasOwn(LAUNCHER_DISCOVERY_ASSET_URLS, key)) return LAUNCHER_DISCOVERY_ASSET_URLS[key as LauncherDiscoveryImageKey]
  return LAUNCHER_DISCOVERY_ASSET_ALIASES[key]
}
