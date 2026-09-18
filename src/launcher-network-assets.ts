export type LauncherNetworkImageKey =
  | 'currency-conversion'
  | 'custom-web-search'
  | 'deepl-translator'
  | 'web-search-duckduckgo'
  | 'web-search-google'
  | 'web-search'

export type LauncherNetworkAsset = Readonly<{
  fileName: string
  hash: string
  key: LauncherNetworkImageKey
  source: string
}>

const rows: readonly LauncherNetworkAsset[] = [
  { fileName: 'currency-conversion.png', hash: '6a87b37bf251565739e90a82614cd01838a84038866834cfcc432e2d3c7a3316', key: 'currency-conversion', source: 'assets/launcher/Extensions/CurrencyConversion/currency-conversion.png' },
  { fileName: 'custom-web-search.svg', hash: 'b7ce4cc6685aaf4f0b8e6ec3420d2f9d36a48af0acc721181010cdb0c06518e3', key: 'custom-web-search', source: 'assets/launcher/Extensions/CustomWebSearch/customwebsearch.svg' },
  { fileName: 'deepl-translator.svg', hash: 'b36e136107ca67812c0dc9265afd95951bde1ef9cc4736ff980a8ac0bccf496f', key: 'deepl-translator', source: 'assets/launcher/Extensions/DeeplTranslator/deepl-logo.svg' },
  { fileName: 'web-search-duckduckgo.svg', hash: 'a552810b288ab1511f5ad547957de90d44b4245c364b60a2a90a437532e16f21', key: 'web-search-duckduckgo', source: 'assets/launcher/Extensions/WebSearch/duckduckgo.svg' },
  { fileName: 'web-search-google.png', hash: 'e2087f585c3b213ba537a56c8bc8e6134c69d6fa1a5728d306df56d697b4e7ab', key: 'web-search-google', source: 'assets/launcher/Extensions/WebSearch/google.png' },
  { fileName: 'web-search.png', hash: '37667bef690d961232b7d290de1cdac56f8f33e23d4a7a732b95de2a7de3218a', key: 'web-search', source: 'assets/launcher/Extensions/WebSearch/websearch.png' },
]

export const LAUNCHER_NETWORK_ASSETS = Object.freeze(rows.map(row => Object.freeze(row)))
export const LAUNCHER_NETWORK_ASSET_HASHES = Object.freeze(Object.fromEntries(rows.map(row => [row.key, row.hash])) as Record<LauncherNetworkImageKey, string>)
export const LAUNCHER_NETWORK_ASSET_URLS = Object.freeze(Object.fromEntries(rows.map(row => [row.key, `./launcher-assets/${row.fileName}`])) as Record<LauncherNetworkImageKey, string>)

export function launcherNetworkAssetUrl(key: string): string | undefined {
  return Object.hasOwn(LAUNCHER_NETWORK_ASSET_URLS, key)
    ? LAUNCHER_NETWORK_ASSET_URLS[key as LauncherNetworkImageKey]
    : undefined
}
