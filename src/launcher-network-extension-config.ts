export const LAUNCHER_NETWORK_EXTENSION_IDS = Object.freeze([
  'CurrencyConversion',
  'CustomWebSearch',
  'DeeplTranslator',
  'WebSearch',
] as const)

export type LauncherNetworkExtensionId = (typeof LAUNCHER_NETWORK_EXTENSION_IDS)[number]

export const LAUNCHER_DEEPL_QUERY_PREFIX = 'tockteam:deepl:'
export const LAUNCHER_WEB_SEARCH_QUERY_PREFIX = 'tockteam:web-search:'
export const LAUNCHER_NETWORK_TOOL_INPUT_LENGTH = 480

export const LAUNCHER_NETWORK_EXTENSION_DEFAULTS = Object.freeze({
  CurrencyConversion: Object.freeze({
    currencies: Object.freeze(['usd', 'chf', 'eur'] as const),
    defaultTargetCurrency: 'eur',
  }),
  CustomWebSearch: Object.freeze({
    customSearchEngines: Object.freeze([Object.freeze({
      encodeSearchTerm: true,
      id: 'tockteam-wikipedia',
      name: 'Wikipedia',
      prefix: 'wiki',
      url: 'https://en.wikipedia.org/wiki/{{query}}',
    })]),
  }),
  DeeplTranslator: Object.freeze({ defaultSourceLanguage: 'Auto', defaultTargetLanguage: 'EN-US' }),
  WebSearch: Object.freeze({ locale: 'en-US', searchEngine: 'Google', showInstantSearchResult: false }),
})

export type LauncherNetworkCustomSearchEngine = Readonly<{
  encodeSearchTerm: boolean
  id: string
  name: string
  prefix: string
  url: string
}>
