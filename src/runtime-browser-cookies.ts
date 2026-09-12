import { createHash } from 'node:crypto'
import type { Cookies } from 'electron'

/** Retire only the pinned DSH connection's workbench cookies, never general browser data. */
export async function pruneRuntimeBrowserCookies(cookies: Pick<Cookies, 'get' | 'remove'>, activeRuntimeUrls: readonly URL[]): Promise<number> {
  // DSH 0.1.2-rc.1 binds this cookie name to the canonical Host authority, including port.
  const activeNames = new Set(activeRuntimeUrls.map(url => `dsh-auth-${createHash('sha256').update(new URL(`http://${url.host}`).host).digest('base64url')}`))
  let removed = 0
  for (const cookie of await cookies.get({ domain: '127.0.0.1' })) {
    if (cookie.domain !== '127.0.0.1' || cookie.hostOnly !== true || cookie.path !== '/'
      || cookie.httpOnly !== true || cookie.secure !== false || cookie.sameSite !== 'strict'
      || !/^dsh-auth-[A-Za-z0-9_-]{43}$/u.test(cookie.name) || activeNames.has(cookie.name)) continue
    await cookies.remove('http://127.0.0.1/', cookie.name)
    removed++
  }
  return removed
}
