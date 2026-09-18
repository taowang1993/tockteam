/** Browser face of the TockTeam Web shell. */

import {
  brandingMutationRoots,
  findHeroHeadlines,
  pruneDisconnected,
} from '../../plugins/shared/branding.ts'
import {
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  type TockTeamSurfaceView,
} from '../../plugins/shared/surface.ts'

interface ClientContext {
  effect(effect: () => (() => Promise<void> | void) | void, label?: string): void
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

/** Enroll the web shell identity and the client-plane surface contract. */
export function apply(ctx: ClientContext): void {
  // The unified three-surface contract, client plane: the web shell.
  ctx.effect(() => {
    const removeSurface = ctx.reflect.provide(TOCKTEAM_SURFACE_VIEW_SERVICE, Object.freeze({
      kind: 'web',
    } satisfies TockTeamSurfaceView), undefined)
    return async () => { await removeSurface?.() }
  }, 'tockteam-web: reflected surface service')
  ctx.effect(() => {
    const originalTitle = document.title
    const synchronizeTitle = (): void => {
      if (document.title !== 'TockTeam Web') document.title = 'TockTeam Web'
    }
    const observer = new MutationObserver(synchronizeTitle)
    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    synchronizeTitle()
    return () => {
      observer.disconnect()
      document.title = originalTitle
    }
  }, 'tockteam-web: shell identity')
  ctx.effect(() => {
    const headlineCopy = new Set([
      'Into the Unknown',
      '探索未知之境',
      '探索未至之境',
    ])
    const originalHeadlines = new Map<HTMLElement, string>()
    const synchronize = (roots: readonly ParentNode[] = [document]): void => {
      pruneDisconnected(originalHeadlines)
      for (const element of new Set(roots.flatMap(findHeroHeadlines))) {
        const text = element.textContent?.trim() ?? ''
        if (!headlineCopy.has(text)) continue
        if (!originalHeadlines.has(element)) originalHeadlines.set(element, text)
        element.textContent = 'TockTeam Web'
        element.dataset.tockteamWebHeroHeadline = 'true'
      }
    }
    const observer = new MutationObserver(records => {
      synchronize(brandingMutationRoots(records))
    })
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    synchronize()
    return () => {
      observer.disconnect()
      for (const [element, original] of originalHeadlines) {
        if (element.isConnected && element.textContent === 'TockTeam Web') {
          element.textContent = original
        }
        delete element.dataset.tockteamWebHeroHeadline
      }
    }
  }, 'tockteam-web: hero identity')
}
