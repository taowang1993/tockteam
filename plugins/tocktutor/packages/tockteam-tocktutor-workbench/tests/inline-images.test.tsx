import { afterEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { attachInlineImages, InlineImageLoader } from '../src/inline-images.ts'
import { markdownImageUrls } from '../src/live-preview-decorations.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const payload = () => new Response(JSON.stringify({ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' }))
function placeholder(url = 'https://example.com/image.png') {
  const root = document.createElement('div')
  root.innerHTML = `<span data-external-embed-kind="image" data-external-url="${url}" data-image-alt="Photo"></span>`
  return root
}

it('loads offscreen images without waiting for an intersection', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const root = placeholder()
  const dispose = attachInlineImages(root)
  try {
    await waitFor(() => expect(root.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo='))
    expect(request).toHaveBeenCalledTimes(1)
  } finally { dispose() }
})

it('discovers distant, reference and nested images, not code or viewer embeds', () => {
  const source = '# Note\n\n' + 'Paragraph.\n\n'.repeat(1000) + '\n![Photo][id]\n\n[id]: https://example.com/a.png\n\n> ![](https://example.com/b.png)\n\n```md\n![](https://example.com/code.png)\n```\n\n![](https://youtu.be/abcdefghijk)'
  expect(markdownImageUrls(source)).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
})

it('reuses prefetched images across widget recreation without one consumer cancelling another', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const loader = new InlineImageLoader()
  const first = placeholder(), second = placeholder()
  loader.sync(['https://example.com/image.png'])
  const disposeFirst = attachInlineImages(first, () => {}, loader)
  const disposeSecond = attachInlineImages(second, () => {}, loader)
  disposeFirst()
  try {
    await waitFor(() => expect(second.querySelector('img[src]')).toBeTruthy())
    expect(first.querySelector('img[src]')).toBeNull()
    expect(request).toHaveBeenCalledTimes(1)
    const third = placeholder()
    const disposeThird = attachInlineImages(third, () => {}, loader)
    await waitFor(() => expect(third.querySelector('img[src]')).toBeTruthy())
    expect(request).toHaveBeenCalledTimes(1)
    disposeThird()
  } finally { disposeSecond(); loader.dispose() }
})

function decodingImages(width: number, height: number, decode = vi.fn(async () => {})) {
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img')
    Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height }, decode: { value: decode } })
    queueMicrotask(() => image.dispatchEvent(new Event('load')))
    return image
  })
  return decode
}

it('does not publish an image until decoding finishes', async () => {
  let finish!: () => void
  const decode = decodingImages(100, 50, vi.fn(() => new Promise<void>(resolve => { finish = resolve })))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const root = placeholder(), dispose = attachInlineImages(root)
  try {
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1))
    expect(root.querySelector('img')).toBeNull()
    finish()
    await waitFor(() => expect(root.querySelector('img[width="100"][height="50"]')).toBeTruthy())
  } finally { dispose() }
})

it('bounds decoded image dimensions before decoding and retains a bounded cache', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const decode = decodingImages(4097, 4097)
  const loader = new InlineImageLoader()
  try {
    await expect(loader.load('https://example.com/huge.png')).rejects.toThrow('dimensions too large')
    expect(decode).not.toHaveBeenCalled()
    decodingImages(4096, 4096)
    const urls = ['https://example.com/one.png', 'https://example.com/two.png']
    loader.sync(urls)
    await Promise.all(urls.map(url => loader.load(url)))
    expect(request).toHaveBeenCalledTimes(3)
    loader.sync(urls)
    expect(request).toHaveBeenCalledTimes(3) // Typing must not repeatedly prefetch evicted images.
    await loader.load(urls[0]!)
    expect(request).toHaveBeenCalledTimes(4)
  } finally { loader.dispose() }
})

it('bounds concurrent decoding and releases slots when a view closes', async () => {
  const decode = decodingImages(100, 50, vi.fn(() => new Promise<void>(() => {})))
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const loader = new InlineImageLoader()
  loader.sync(Array.from({ length: 8 }, (_, i) => `https://example.com/decode-${i}.png`))
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(4))
  expect(request).toHaveBeenCalledTimes(4)
  loader.dispose()
  decodingImages(100, 50)
  const survivor = new InlineImageLoader()
  try { await expect(survivor.load('https://example.com/survivor.png')).resolves.toBeInstanceOf(HTMLImageElement) }
  finally { survivor.dispose() }
  expect(request).toHaveBeenCalledTimes(5)
})

it('caps whole-note prefetch at 100 distinct images', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => payload())
  const loader = new InlineImageLoader()
  try {
    loader.sync(Array.from({ length: 150 }, (_, i) => `https://example.com/bounded-${i}.png`))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(100))
    loader.sync([])
    expect(request).toHaveBeenCalledTimes(100)
  } finally { loader.dispose() }
})

it('cancels removed-document work and does not start abandoned queued requests', async () => {
  const signals: AbortSignal[] = []
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    const signal = options!.signal! as AbortSignal
    signals.push(signal)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const loader = new InlineImageLoader()
  loader.sync(Array.from({ length: 8 }, (_, i) => `https://example.com/${i}.png`))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(4))
  loader.sync([])
  await waitFor(() => expect(signals.every(signal => signal.aborted)).toBe(true))
  loader.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(request).toHaveBeenCalledTimes(4)
})
