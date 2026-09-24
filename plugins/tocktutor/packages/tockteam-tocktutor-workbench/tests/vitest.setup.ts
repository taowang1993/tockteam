const emptyRect = (): DOMRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
})

if (typeof Range !== 'undefined') {
  Range.prototype.getBoundingClientRect ??= emptyRect
  Range.prototype.getClientRects ??= (() => [] as unknown as DOMRectList)
}

HTMLElement.prototype.getBoundingClientRect ??= emptyRect
HTMLElement.prototype.scrollIntoView ??= (() => {})

// jsdom has no layout; actual visibility and image loading are verified in Electron.
globalThis.IntersectionObserver ??= class implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]
  constructor(private callback: IntersectionObserverCallback) {}
  disconnect(): void {}
  observe(target: Element): void { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this) }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

globalThis.ResizeObserver ??= class ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}
