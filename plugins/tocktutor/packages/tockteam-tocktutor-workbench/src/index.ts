import type { Context } from '@deepseek-ai/cordis'
import { TockTutorWorkbenchGateway } from './host-read.ts'

/** Host Loader identity for the native TockTutor workbench. */
export const name = '@tockteam/tocktutor-workbench'

/** Required Host capability supplied only by tockbot-note-runtime. */
export const inject = ['noteVault']

/** Register the accepted read/tree gateway under this plugin's Cordis lifecycle. */
export function apply(ctx: Context): void {
  ctx.plugin(TockTutorWorkbenchGateway)
}

export * from './host-read.ts'
export * from './vault-events.ts'
export * from './session.ts'
export * from './canvas.ts'
export * from './base.ts'
export * from './markdown.ts'
