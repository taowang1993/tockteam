/** Browser-local PNG capture of one rendered assistant response. */

import { getFontEmbedCSS, toCanvas } from 'html-to-image'

type HtmlToImageOptions = {
  pixelRatio?: number
  width?: number
  height?: number
  skipFonts?: boolean
  backgroundColor?: string
}

const FLOW_ITEM_SELECTOR = '[data-chat-flow-kind]'
const TURN_TAIL_SELECTOR = '[data-turn-tail]'
const ASSISTANT_STEP_KIND = 'assistant-step'
/** Sibling hops the strip row may sit above the response node. */
const MAX_SIBLING_HOPS = 10
/** Tail headroom over the node box, as a fraction of its height. */
const BOTTOM_SLACK_RATIO = 0.05
/** Tail headroom floor so short responses keep room for boundary drift. */
const MIN_BOTTOM_SLACK_PX = 128
/** Background rows kept beyond drawn content on each end. */
const CONTENT_PADDING_FLOOR_PX = 8
const CONTENT_PADDING_CEILING_PX = 48
/** Summed channel distance below which a pixel counts as background. */
const BACKGROUND_TOLERANCE = 24
/** Canvas rows read back per band when locating the drawn content bottom. */
const SCAN_BAND_ROWS = 1024
/** Bound retries when foreignObject layout consumes all available headroom. */
const MAX_SLACK_GROWTHS = 2
const REVOKE_DELAY_MS = 10_000

/** Smallest browser adapter seam for capture and deterministic failure tests. */
export interface CaptureAdapter {
  getFontEmbedCSS: typeof getFontEmbedCSS
  toCanvas: (node: HTMLElement, options: HtmlToImageOptions) => Promise<HTMLCanvasElement>
}

const DEFAULT_CAPTURE_ADAPTER: CaptureAdapter = { getFontEmbedCSS, toCanvas }

/** Build a bounded, path-safe download file name for one message id. */
export function captureFileName(messageId: string): string {
  const safe = messageId.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 118)
  return `tockteam-response-${safe || 'response'}.png`
}

/**
 * Locate the rendered response from the finalized assistant action strip.
 * DSH renders the action inside a turn-tail flow item; the preceding flow
 * siblings remain structural rows, so the nearest assistant-step is selected
 * without duplicating Chat state or depending on generated class names.
 */
export function findAssistantStep(anchor: Element): HTMLElement {
  const row = anchor.closest(FLOW_ITEM_SELECTOR)
  if (row === null
    || row.getAttribute('data-chat-flow-kind') !== 'turn-tail'
    || row.querySelector(TURN_TAIL_SELECTOR) === null) {
    throw new Error('save-as-image: finalized turn tail not found')
  }
  let sibling = row.previousElementSibling
  for (let hops = 0; sibling !== null && hops < MAX_SIBLING_HOPS; hops += 1) {
    if (sibling.getAttribute('data-chat-flow-kind') === ASSISTANT_STEP_KIND) {
      return sibling as HTMLElement
    }
    sibling = sibling.previousElementSibling
  }
  throw new Error('save-as-image: assistant response node not found')
}

/** Materialize a CSS color into RGBA for pixel comparison. */
function parseBackgroundColor(color: string | undefined): [number, number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('save-as-image: 2d context unavailable')
  context.clearRect(0, 0, 1, 1)
  if (color !== undefined) {
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
  }
  const { data } = context.getImageData(0, 0, 1, 1)
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0]
}

/** Find the last drawn row without materializing a full-image pixel buffer. */
function measureContentBottom(
  canvas: HTMLCanvasElement,
  background: [number, number, number, number],
): number {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('save-as-image: 2d context unavailable')
  let bandFloor = canvas.height
  while (bandFloor > 0) {
    const bandHeight = Math.min(SCAN_BAND_ROWS, bandFloor)
    const bandTop = bandFloor - bandHeight
    const { data, width } = context.getImageData(0, bandTop, canvas.width, bandHeight)
    const channel = (offset: number): number => data[offset] ?? 0
    for (let y = bandHeight - 1; y >= 0; y -= 1) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4
        const opaque = channel(index + 3) >= 128
        const differs = Math.abs(channel(index) - background[0])
          + Math.abs(channel(index + 1) - background[1])
          + Math.abs(channel(index + 2) - background[2]) > BACKGROUND_TOLERANCE
        if (opaque && (background[3] < 128 || differs)) return bandTop + y
      }
    }
    bandFloor = bandTop
  }
  return canvas.height
}

/** Reuse the response node's bottom padding as the export frame. */
function nodeContentPadding(node: HTMLElement): number {
  const padding = Number.parseFloat(getComputedStyle(node).paddingBottom)
  const value = Number.isNaN(padding) ? 0 : padding
  return Math.min(Math.max(value, CONTENT_PADDING_FLOOR_PX), CONTENT_PADDING_CEILING_PX)
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => { canvas.toBlob(resolve, 'image/png') })
}

async function renderBlob(
  node: HTMLElement,
  pixelRatio: number,
  fontEmbedCSS: string | undefined,
  backgroundColor: string | undefined,
  background: [number, number, number, number],
  adapter: CaptureAdapter,
): Promise<Blob> {
  const rect = node.getBoundingClientRect()
  const contentHeight = Math.ceil(rect.height)
  let bottomSlack = Math.max(
    MIN_BOTTOM_SLACK_PX,
    Math.ceil(contentHeight * BOTTOM_SLACK_RATIO),
  )
  for (let growth = 0; ; growth += 1) {
    const options: HtmlToImageOptions = {
      pixelRatio,
      width: Math.ceil(rect.width),
      height: contentHeight + bottomSlack,
      ...(fontEmbedCSS === undefined ? { skipFonts: true } : { fontEmbedCSS }),
      ...(backgroundColor === undefined ? {} : { backgroundColor }),
    }
    const rendered = await adapter.toCanvas(node, options)
    // The library may scale an oversized canvas down; follow its actual scale.
    const scale = rendered.height / (contentHeight + bottomSlack)
    const padding = Math.round(nodeContentPadding(node) * scale)
    const contentBottom = measureContentBottom(rendered, background)
    if (contentBottom < rendered.height - 2 || growth >= MAX_SLACK_GROWTHS) {
      return frameRender(rendered, contentBottom, padding, backgroundColor)
    }
    bottomSlack *= 2
  }
}

/** Crop to drawn content and add a skin-colored frame around the response. */
function frameRender(
  rendered: HTMLCanvasElement,
  contentBottom: number,
  padding: number,
  backgroundColor: string | undefined,
): Promise<Blob> {
  const cropBottom = Math.min(rendered.height, contentBottom + 1 + padding)
  const cropped = document.createElement('canvas')
  cropped.width = rendered.width + padding * 2
  cropped.height = cropBottom
  const context = cropped.getContext('2d')
  if (context === null) throw new Error('save-as-image: 2d context unavailable')
  if (backgroundColor !== undefined) {
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, cropped.width, cropped.height)
  }
  context.drawImage(rendered, padding, 0)
  return canvasToPng(cropped).then(blob => {
    if (blob === null) throw new Error('save-as-image: capture produced no image')
    return blob
  })
}

/** Resolve the active DSH base background from the rendered node's skin. */
function skinBaseBackground(node: HTMLElement): string | undefined {
  const value = getComputedStyle(node).getPropertyValue('--dsw-alias-bg-base').trim()
  return value === '' ? undefined : value
}

/**
 * Render a response to a PNG. Font embedding is optional, and one normal-scale
 * retry handles oversized high-resolution canvases before reporting failure.
 */
export async function captureAssistantStep(
  node: HTMLElement,
  adapter: CaptureAdapter = DEFAULT_CAPTURE_ADAPTER,
): Promise<Blob> {
  let fontEmbedCSS: string | undefined
  try {
    fontEmbedCSS = await adapter.getFontEmbedCSS(node)
  } catch {
    fontEmbedCSS = undefined
  }
  const backgroundColor = skinBaseBackground(node)
  const background = parseBackgroundColor(backgroundColor)
  try {
    return await renderBlob(node, 2, fontEmbedCSS, backgroundColor, background, adapter)
  } catch {
    return await renderBlob(node, 1, fontEmbedCSS, backgroundColor, background, adapter)
  }
}

/** Trigger a local PNG download and revoke its object URL after navigation. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.setTimeout(() => { URL.revokeObjectURL(url) }, REVOKE_DELAY_MS)
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}
