export const LAUNCHER_NETWORK_EXTENSION_IDS = Object.freeze([
  'CurrencyConversion',
  'CustomWebSearch',
  'DeeplTranslator',
  'WebSearch',
] as const)

export type LauncherNetworkExtensionId = (typeof LAUNCHER_NETWORK_EXTENSION_IDS)[number]

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
