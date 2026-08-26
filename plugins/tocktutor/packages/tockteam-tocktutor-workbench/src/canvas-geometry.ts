import { MAX_CANVAS_COORDINATE } from './canvas.ts'

export type CanvasNodeGeometry = { x: number; y: number; width: number; height: number }
export type CanvasNodeGeometryUpdate = { nodeId: string; geometry: CanvasNodeGeometry }
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'

export const CANVAS_GRID_SIZE = 20
export const MIN_CANVAS_NODE_WIDTH = 120
export const MIN_CANVAS_NODE_HEIGHT = 80

export function isCanvasSide(value: unknown): value is CanvasSide {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
}

export function isBoundedCanvasGeometry(value: CanvasNodeGeometry): boolean {
  return [value.x, value.y, value.width, value.height]
    .every(candidate => Number.isFinite(candidate) && Math.abs(candidate) <= MAX_CANVAS_COORDINATE)
    && value.width > 0
    && value.height > 0
}

export function calculateCanvasPointerValue(start: number, delta: number, snappingDisabled: boolean): number {
  const value = start + delta
  return snappingDisabled ? Math.round(value) : Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
}

/** Calculate lower-right resize geometry, optionally preserving the starting aspect ratio. */
export function calculateCanvasResizeGeometry(
  start: CanvasNodeGeometry,
  delta: { x: number; y: number },
  aspectRatioLocked: boolean,
  snappingDisabled: boolean,
): CanvasNodeGeometry {
  if (!aspectRatioLocked) {
    return {
      ...start,
      width: Math.max(MIN_CANVAS_NODE_WIDTH, calculateCanvasPointerValue(start.width, delta.x, snappingDisabled)),
      height: Math.max(MIN_CANVAS_NODE_HEIGHT, calculateCanvasPointerValue(start.height, delta.y, snappingDisabled)),
    }
  }

  const aspectRatio = start.width / start.height
  const widthDominant = Math.abs(delta.x) >= Math.abs(delta.y * aspectRatio)
  if (widthDominant) {
    const width = Math.max(
      MIN_CANVAS_NODE_WIDTH,
      MIN_CANVAS_NODE_HEIGHT * aspectRatio,
      calculateCanvasPointerValue(start.width, delta.x, snappingDisabled),
    )
    return { ...start, width, height: width / aspectRatio }
  }

  const height = Math.max(
    MIN_CANVAS_NODE_HEIGHT,
    MIN_CANVAS_NODE_WIDTH / aspectRatio,
    calculateCanvasPointerValue(start.height, delta.y, snappingDisabled),
  )
  return { ...start, width: height * aspectRatio, height }
}
