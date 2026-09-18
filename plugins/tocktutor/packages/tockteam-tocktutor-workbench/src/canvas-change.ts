import { parseCanvasForMutation } from './canvas.ts'

export type CanvasChangeOperation =
  | 'create-node'
  | 'update-node'
  | 'move-node'
  | 'resize-node'
  | 'duplicate-node'
  | 'delete-node'
  | 'create-edge'
  | 'update-edge'
  | 'reconnect-edge'
  | 'delete-edge'

export interface CanvasChange {
  /** Exact source to restore when persistence rejects or conflicts. */
  previousSource: string
  /** Bounded next source to pass through the canonical revision-bound save path. */
  source: string
  /** Revision captured before the mutation; callers must reject stale values. */
  expectedRevision: string
  operation: CanvasChangeOperation
}

/** Stage a bounded Canvas mutation with all caller-owned conflict/rollback inputs. */
export function createCanvasChange(
  previousSource: string,
  expectedRevision: string,
  operation: CanvasChangeOperation,
  mutate: (source: string) => string,
): CanvasChange {
  if (!expectedRevision || expectedRevision.length > 512 || /[\0\r\n]/u.test(expectedRevision)) {
    throw new Error('The Canvas source revision is invalid.')
  }
  parseCanvasForMutation(previousSource)
  const source = mutate(previousSource)
  parseCanvasForMutation(source)
  return { previousSource, source, expectedRevision, operation }
}
