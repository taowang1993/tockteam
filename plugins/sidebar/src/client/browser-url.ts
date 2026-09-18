import type { Translate } from '../../../shared/i18n.ts'
import type { WorkspaceMessage } from './i18n.ts'

export function normalizeBrowserUrl(
  raw: string,
  t: Translate<WorkspaceMessage>,
): string {
  const value = raw.trim()
  if (value === '') throw new Error(t('browser.enter-url'))
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value)
    ? value
    : `https://${value}`)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(t('browser.http-only'))
  }
  return url.href
}

export function initialBrowserUrl(
  resource: string | undefined,
  t: Translate<WorkspaceMessage>,
): { error?: string; url: string } {
  if (resource === undefined || resource === '') return { url: 'about:blank' }
  try {
    return { url: normalizeBrowserUrl(resource, t) }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      url: 'about:blank',
    }
  }
}
