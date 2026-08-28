export type TockTeamLocale = 'en' | 'zh'

export interface LocaleSnapshot {
  active: TockTeamLocale
  revision: number
}

export type Translate<Key extends string = string> = (
  key: Key,
  params?: Record<string, unknown>,
) => string

export type LocaleMessages<Key extends string> = Record<
  TockTeamLocale,
  Record<Key, string>
>

/** Narrow face of the native DSH locale service used by TockTeam plugins. */
export interface LocaleService {
  bind<Key extends string = string>(namespace: string): Translate<Key>
  getSnapshot(): LocaleSnapshot
  setLocale(locale: TockTeamLocale): void
  register<Key extends string>(
    namespace: string,
    messages: LocaleMessages<Key>,
  ): () => void
  subscribe(listener: () => void): () => void
}

export function localeTag(locale: LocaleService): 'en-US' | 'zh-CN' {
  return locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
}
