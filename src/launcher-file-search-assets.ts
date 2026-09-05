export type LauncherFileSearchImageKey =
  | 'file-search-folder'
  | 'simple-file-search-linux'
  | 'simple-file-search-macos'
  | 'simple-file-search'
  | 'simple-file-search-windows'

export type LauncherFileSearchAsset = Readonly<{
  fileName: string
  hash: string
  key: LauncherFileSearchImageKey
  source: string
}>

const rows: readonly LauncherFileSearchAsset[] = [
  { fileName: 'file-search-folder.png', hash: '61dbce43d87a5af31a9aba8e9f78079dd171103ac8e2c0110819445b0e090fe3', key: 'file-search-folder', source: 'assets/launcher/Extensions/FileSearch/macos-folder-icon.png' },
  { fileName: 'simple-file-search-linux.png', hash: 'ffd2b70c988295be38a2e507380c9c8328c9aad44870d2e12ff77b76e64200e7', key: 'simple-file-search-linux', source: 'assets/launcher/Extensions/SimpleFileSearch/linux.png' },
  { fileName: 'simple-file-search-macos.png', hash: '59f8ff6242b8d79e6e8dba650ab1c7b0c55122472fb3e39ad4b56a21d4c0060a', key: 'simple-file-search-macos', source: 'assets/launcher/Extensions/SimpleFileSearch/macos.png' },
  { fileName: 'simple-file-search.png', hash: 'dc608686196c635d1fe0b55adb4e09f54fa5b1b238c839aa180dcb5d89c26f2f', key: 'simple-file-search', source: 'assets/launcher/Extensions/SimpleFileSearch/simple-file-search.png' },
  { fileName: 'simple-file-search-windows.ico', hash: 'd9b23fb20914aa0eb49de9df379c1628934bf0d77d274f0ba5391cfd4e596f2b', key: 'simple-file-search-windows', source: 'assets/launcher/Extensions/SimpleFileSearch/windows.ico' },
]

export const LAUNCHER_FILE_SEARCH_ASSETS = Object.freeze(rows.map(row => Object.freeze(row)))
export const LAUNCHER_FILE_SEARCH_ASSET_HASHES = Object.freeze(Object.fromEntries(rows.map(row => [row.key, row.hash])) as Record<LauncherFileSearchImageKey, string>)
export const LAUNCHER_FILE_SEARCH_ASSET_URLS = Object.freeze(Object.fromEntries(rows.map(row => [row.key, `./launcher-assets/${row.fileName}`])) as Record<LauncherFileSearchImageKey, string>)

export function launcherFileSearchAssetUrl(key: string): string | undefined {
  return Object.hasOwn(LAUNCHER_FILE_SEARCH_ASSET_URLS, key)
    ? LAUNCHER_FILE_SEARCH_ASSET_URLS[key as LauncherFileSearchImageKey]
    : undefined
}
