/** Browser face of the TockTeam Web shell. */

import {
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  type TockTeamSurfaceView,
} from '../../plugins/shared/surface.ts'

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

/** Enroll the web shell identity and the client-plane surface contract. */
export function apply(ctx: ClientContext): void {
  // The unified three-surface contract, client plane: the web shell.
  ctx.reflect.provide(TOCKTEAM_SURFACE_VIEW_SERVICE, Object.freeze({
    kind: 'web',
  } satisfies TockTeamSurfaceView), undefined)
  ctx.effect(() => {
    const originalTitle = document.title
    document.title = 'TockTeam Web'
    return () => { document.title = originalTitle }
  }, 'tockteam-web: shell identity')
  ctx.effect(() => {
    const headlineCopy = new Set([
      'Into the Unknown',
      '探索未知之境',
      '探索未至之境',
    ])
    const originalHeadlines = new Map<HTMLElement, string>()
    const synchronize = (): void => {
      for (const element of document.querySelectorAll<HTMLElement>('span')) {
        const text = element.textContent?.trim() ?? ''
        if (!headlineCopy.has(text)) continue
        if (!originalHeadlines.has(element)) originalHeadlines.set(element, text)
        element.textContent = 'TockTeam Web'
        element.dataset.tockTeamWebHeroHeadline = 'true'
      }
    }
    const observer = new MutationObserver(synchronize)
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
        delete element.dataset.tockTeamWebHeroHeadline
      }
    }
  }, 'tockteam-web: hero identity')
}
