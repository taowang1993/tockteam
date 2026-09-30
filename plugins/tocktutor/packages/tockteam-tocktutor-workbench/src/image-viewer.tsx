import { createRoot } from 'react-dom/client'
import { Button } from '@tockteam/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@tockteam/ui/dialog'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'

const MAX_IMAGE_DATA_URL_LENGTH = 90_000_000
const SAFE_RASTER_DATA_URL = /^data:image\/(avif|bmp|gif|jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/iu
const EMPTY_PROXY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const MIN_ZOOM = 0.2
const MAX_ZOOM = 8
const ZOOM_STEP = 0.25
const PAN_STEP = 80

export interface ViewerImage {
  alt: string
  src: string
}

export function safeRasterImageDataUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_URL_LENGTH || value === EMPTY_PROXY_IMAGE) return null
  const match = SAFE_RASTER_DATA_URL.exec(value)
  if (match === null) return null
  const base64 = match[2]!
  const padding = base64.match(/=+$/u)?.[0].length ?? 0
  const remainder = (base64.length - padding) % 4
  if (padding === 0 ? remainder === 1 : padding === 1 ? remainder !== 3 : remainder !== 2) return null
  return value
}

function clampedZoom(value: number): number { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) }

export function ImageViewerAction(props: { image: ViewerImage; onView(image: ViewerImage, trigger: HTMLButtonElement): void }): ReactNode {
  const src = safeRasterImageDataUrl(props.image.src)
  if (src === null) return null
  return (
    <Button
      className="mx-2 my-1 align-middle"
      onClick={event => {
        event.stopPropagation()
        props.onView({ src, alt: props.image.alt }, event.currentTarget)
      }}
      onMouseDown={event => { event.stopPropagation() }}
      onKeyDown={event => { event.stopPropagation() }}
      size="sm"
      type="button"
      variant="outline"
    >View Image</Button>
  )
}

export function ImageViewerDialog(props: { image: ViewerImage | null; onClose(): void; returnFocusRef?: RefObject<HTMLElement | null> }): ReactNode {
  const src = safeRasterImageDataUrl(props.image?.src)
  const image = props.image !== null && src !== null ? { ...props.image, src } : null
  const label = image?.alt.trim() || 'Image'
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [broken, setBroken] = useState(false)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setBroken(false)
    drag.current = null
  }, [image?.src])

  const reset = (): void => { setZoom(1); setOffset({ x: 0, y: 0 }) }
  const zoomBy = (factor: number): void => { setZoom(current => clampedZoom(current * factor)) }
  const startPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: offset.x, y: offset.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const movePan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = drag.current
    if (active === null || active.pointerId !== event.pointerId) return
    setOffset({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY })
  }
  const stopPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <Dialog open={image !== null} onOpenChange={open => { if (!open) props.onClose() }}>
      <DialogContent
        className="!max-w-[min(92vw,90rem)] z-[2147483647] w-[min(92vw,90rem)] max-h-[calc(100dvh-2rem)] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3 border border-border !bg-background p-4 text-foreground shadow-xl"
        overlayClassName="z-[2147483646]"
        onCloseAutoFocus={event => {
          const trigger = props.returnFocusRef?.current
          if (trigger?.isConnected) { event.preventDefault(); trigger.focus() }
        }}
        onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey) return
          if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1 + ZOOM_STEP) }
          else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(1 / (1 + ZOOM_STEP)) }
          else if (event.key === '0') { event.preventDefault(); reset() }
        }}
        onWheel={event => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1) }}
        onWheelCapture={event => { event.stopPropagation() }}
      >
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle className="truncate text-foreground">{label}</DialogTitle>
          <DialogDescription className="text-foreground">Use the controls or plus and minus keys to zoom. Drag the image to pan.</DialogDescription>
        </DialogHeader>
        <div
          aria-label="Image Viewport"
          className="flex min-h-0 min-w-0 cursor-grab items-center justify-center overflow-hidden rounded-md bg-background touch-none active:cursor-grabbing"
          onPointerCancel={stopPan}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
        >
          {image !== null && (broken
            ? <div aria-label={label} className="p-8 text-center text-muted-foreground" role="img">Image Preview Is Unavailable</div>
            : <img
                alt={image.alt || label}
                className="max-h-[calc(100dvh-11rem)] max-w-full select-none object-contain"
                data-offset-x={offset.x}
                data-offset-y={offset.y}
                data-zoom={zoom}
                draggable={false}
                onError={() => { setBroken(true) }}
                onLoad={() => { setBroken(false) }}
                src={image.src}
                style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transformOrigin: 'center center' }}
              />)}
        </div>
        <div aria-label="Image Controls" className="flex flex-wrap items-center justify-center gap-1.5" role="group">
          <Button aria-label="Zoom Out" disabled={zoom <= MIN_ZOOM} onClick={() => { zoomBy(1 / (1 + ZOOM_STEP)) }} size="icon-sm" type="button" variant="outline"><ZoomOut aria-hidden="true" /></Button>
          <span aria-live="polite" className="min-w-12 text-center text-xs tabular-nums">{String(Math.round(zoom * 100))}%</span>
          <Button aria-label="Zoom In" disabled={zoom >= MAX_ZOOM} onClick={() => { zoomBy(1 + ZOOM_STEP) }} size="icon-sm" type="button" variant="outline"><ZoomIn aria-hidden="true" /></Button>
          <Button onClick={reset} size="sm" type="button" variant="outline">Fit Image</Button>
          <span aria-label="Pan Controls" className="ml-1 inline-flex items-center gap-0.5" role="group">
            <Button aria-label="Pan Image Left" onClick={() => { setOffset(current => ({ ...current, x: current.x - PAN_STEP })) }} size="icon-sm" type="button" variant="outline"><ArrowLeft aria-hidden="true" /></Button>
            <Button aria-label="Pan Image Up" onClick={() => { setOffset(current => ({ ...current, y: current.y - PAN_STEP })) }} size="icon-sm" type="button" variant="outline"><ArrowUp aria-hidden="true" /></Button>
            <Button aria-label="Pan Image Down" onClick={() => { setOffset(current => ({ ...current, y: current.y + PAN_STEP })) }} size="icon-sm" type="button" variant="outline"><ArrowDown aria-hidden="true" /></Button>
            <Button aria-label="Pan Image Right" onClick={() => { setOffset(current => ({ ...current, x: current.x + PAN_STEP })) }} size="icon-sm" type="button" variant="outline"><ArrowRight aria-hidden="true" /></Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ImageViewerButton(props: { image: ViewerImage }): ReactNode {
  const [image, setImage] = useState<ViewerImage | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  return <>
    <ImageViewerAction image={props.image} onView={(value, trigger) => { triggerRef.current = trigger; setImage(value) }} />
    <ImageViewerDialog image={image} onClose={() => { setImage(null) }} returnFocusRef={triggerRef} />
  </>
}

export function mountImageViewerButton(container: HTMLElement, image: ViewerImage): () => void {
  const root = createRoot(container)
  root.render(<ImageViewerButton image={image} />)
  return () => { root.unmount() }
}

export function mountImageViewerAction(container: HTMLElement, image: ViewerImage, onView: (image: ViewerImage, trigger: HTMLButtonElement) => void): () => void {
  const root = createRoot(container)
  root.render(<ImageViewerAction image={image} onView={onView} />)
  return () => { root.unmount() }
}
