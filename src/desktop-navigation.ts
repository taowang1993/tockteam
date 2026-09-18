import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function isAllowedRuntimeNavigation(
  target: string,
  allowedOrigin: string | undefined,
  splashPath: string,
): boolean {
  try {
    const url = new URL(target)
    if (url.protocol === 'file:') return resolve(fileURLToPath(url)) === resolve(splashPath)
    return allowedOrigin !== undefined && url.origin === allowedOrigin
  } catch {
    return false
  }
}

export function isAllowedBrowserNavigation(
  target: string,
  runtimeOrigin: string | undefined,
  previewOrigin: string | undefined,
): boolean {
  if (target === 'about:blank') return true
  try {
    const url = new URL(target)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return url.origin !== runtimeOrigin && url.origin !== previewOrigin
  } catch {
    return false
  }
}
