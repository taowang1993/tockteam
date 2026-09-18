import { TOCKTEAM_SURFACE_SERVICE, type TockTeamSurface } from '../../shared/surface.ts'
import { activateTrustedRaycast } from '../../../src/trusted-raycast-provider.ts'

export const name = 'tockteam-trusted-raycast'
export const inject = [TOCKTEAM_SURFACE_SERVICE]
interface Context {
  get(name: string): unknown
  effect(effect: () => (() => Promise<void>)): void
}
export function apply(ctx: Context): void {
  if ((ctx.get(TOCKTEAM_SURFACE_SERVICE) as TockTeamSurface | undefined)?.kind !== 'desktop') return
  const endpoint = process.env.DSH_DESKTOP_TRUSTED_RAYCAST_ENDPOINT
  const token = process.env.DSH_DESKTOP_TRUSTED_RAYCAST_TOKEN
  if (!endpoint || !token) return
  ctx.effect(() => {
    const activation = activateTrustedRaycast({ endpoint, token })
    void activation.ready.catch(error => console.error('Translate capability activation failed', error))
    return () => activation.dispose()
  })
}
