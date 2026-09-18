import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mountChromeSurface } from '../plugins/shared/chrome-layer.ts'

class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  id = ''
  parentElement: FakeElement | null = null
  readonly tagName = 'DIV'

  append(child: FakeElement): void {
    child.remove()
    child.parentElement = this
    this.children.push(child)
  }

  get childElementCount(): number { return this.children.length }

  remove(): void {
    const siblings = this.parentElement?.children
    if (siblings !== undefined) {
      const index = siblings.indexOf(this)
      if (index >= 0) siblings.splice(index, 1)
    }
    this.parentElement = null
  }
}

class FakeDocument {
  readonly body = new FakeElement()

  createElement(): FakeElement { return new FakeElement() }

  getElementById(id: string): FakeElement | null {
    return this.body.children.find(child => child.id === id) ?? null
  }
}

const originalDocument = globalThis.document
const originalHTMLElement = globalThis.HTMLElement

afterEach(() => {
  Object.assign(globalThis, {
    document: originalDocument,
    HTMLElement: originalHTMLElement,
  })
})

test('a foreign same-ID element is never adopted or removed', () => {
  const document = new FakeDocument()
  Object.assign(globalThis, { document, HTMLElement: FakeElement })
  const foreign = document.createElement()
  foreign.id = 'tockteam-chrome-layer'
  document.body.append(foreign)

  assert.throws(
    () => mountChromeSurface(document.createElement() as unknown as HTMLElement),
    /must be owned by TockTeam/,
  )
  assert.deepEqual(document.body.children, [foreign])
})

test('independent clients share one chrome layer until their last surface unmounts', () => {
  const document = new FakeDocument()
  Object.assign(globalThis, { document, HTMLElement: FakeElement })
  const summary = document.createElement()
  const marketplace = document.createElement()

  const unmountSummary = mountChromeSurface(summary as unknown as HTMLElement)
  const unmountMarketplace = mountChromeSurface(marketplace as unknown as HTMLElement)

  assert.equal(document.body.children.length, 1)
  assert.equal(summary.parentElement, marketplace.parentElement)
  unmountSummary()
  unmountSummary()
  assert.equal(document.body.children.length, 1)
  assert.equal(marketplace.parentElement?.id, 'tockteam-chrome-layer')
  unmountMarketplace()
  assert.equal(document.body.children.length, 0)
})
