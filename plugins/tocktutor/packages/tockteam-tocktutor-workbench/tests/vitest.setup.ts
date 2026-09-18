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

globalThis.ResizeObserver ??= class ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}
