import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  focusComposerEnd,
  isComposerInput,
  readComposerCaret,
} from '../plugins/sidebar/src/client/composer-history-dom.ts'

interface FakeRangeLike {
  startContainer: FakeNode
  startOffset: number
  endContainer: FakeNode
  endOffset: number
  setStart(container: FakeNode, offset: number): void
  setEnd(container: FakeNode, offset: number): void
  selectNodeContents(element: FakeElement): void
  collapse(toStart: boolean): void
  toString(): string
}

class FakeNode {
  readonly text: string
  constructor(text = '') { this.text = text }
}

class FakeElement extends FakeNode {
  dataset: Record<string, string> = {}
  ownerDocument!: FakeDocument
  get textContent(): string { return this.text }
  connected = true
  contains(node: FakeNode): boolean { return node === this || node === this.ownerDocument.textNode }
  get isConnected(): boolean { return this.connected }
  focus(): void {}
}

class FakeTextArea extends FakeElement {
  disabled = false
  readOnly = false
  selectionStart: number | null = 0
  selectionEnd: number | null = 0
  value = ''
  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start
    this.selectionEnd = end
  }
}

class FakeRange implements FakeRangeLike {
  startContainer: FakeNode
  startOffset = 0
  endContainer: FakeNode
  endOffset = 0
  private readonly document: FakeDocument

  constructor(document: FakeDocument) {
    this.document = document
    this.startContainer = document.root
    this.endContainer = document.root
  }

  setStart(container: FakeNode, offset: number): void {
    this.startContainer = container
    this.startOffset = offset
  }

  setEnd(container: FakeNode, offset: number): void {
    this.endContainer = container
    this.endOffset = offset
  }

  selectNodeContents(element: FakeElement): void {
    this.startContainer = element.ownerDocument.textNode
    this.startOffset = 0
    this.endContainer = element.ownerDocument.textNode
    this.endOffset = element.text.length
  }

  collapse(toStart: boolean): void {
    if (toStart) {
      this.endContainer = this.startContainer
      this.endOffset = this.startOffset
    } else {
      this.startContainer = this.endContainer
      this.startOffset = this.endOffset
    }
  }

  toString(): string {
    return this.document.textNode.text.slice(0, this.endOffset)
  }
}

class FakeSelection {
  range: FakeRangeLike | undefined
  get rangeCount(): number { return this.range === undefined ? 0 : 1 }
  getRangeAt(_index: number): FakeRangeLike { if (this.range === undefined) throw new Error('no range'); return this.range }
  removeAllRanges(): void { this.range = undefined }
  addRange(range: FakeRangeLike): void { this.range = range }
}

class FakeDocument {
  readonly root = new FakeElement('hello world')
  readonly textNode = new FakeNode('hello world')
  readonly selection = new FakeSelection()
  constructor() { this.root.ownerDocument = this }
  getSelection(): FakeSelection { return this.selection }
  createRange(): FakeRange { return new FakeRange(this) }
}

function elementOf(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement
}

function withDomGlobals<T>(callback: () => T): T {
  const globals = globalThis as unknown as Record<string, unknown>
  const previous = {
    HTMLElement: globals.HTMLElement,
    HTMLTextAreaElement: globals.HTMLTextAreaElement,
  }
  globals.HTMLElement = FakeElement
  globals.HTMLTextAreaElement = FakeTextArea
  try {
    return callback()
  } finally {
    globals.HTMLElement = previous.HTMLElement
    globals.HTMLTextAreaElement = previous.HTMLTextAreaElement
  }
}

test('supports textarea input shape and moves its caret to the end', () => withDomGlobals(() => {
  const textarea = new FakeTextArea()
  textarea.dataset.phase = 'idle'
  textarea.value = 'draft'
  textarea.selectionStart = 1
  textarea.selectionEnd = 1
  assert.equal(isComposerInput(elementOf(textarea)), true)
  assert.deepEqual(readComposerCaret(elementOf(textarea)), {
    selectionEnd: 1,
    selectionStart: 1,
    value: 'draft',
  })
  focusComposerEnd(elementOf(textarea))
  assert.equal(textarea.selectionStart, 5)
  assert.equal(textarea.selectionEnd, 5)
}))

test('supports contenteditable input shape and preserves a text selection', () => withDomGlobals(() => {
  const document = new FakeDocument()
  document.selection.range = (() => {
    const range = document.createRange()
    range.setStart(document.textNode, 1)
    range.setEnd(document.textNode, 4)
    return range
  })()
  document.root.dataset.composerInput = 'true'
  document.root.dataset.phase = 'idle'
  assert.equal(isComposerInput(elementOf(document.root)), true)
  assert.deepEqual(readComposerCaret(elementOf(document.root)), {
    selectionEnd: 4,
    selectionStart: 1,
    value: 'hello world',
  })
  focusComposerEnd(elementOf(document.root))
  assert.equal(document.selection.range?.startOffset, 11)
  assert.equal(document.selection.range?.endOffset, 11)
}))

test('does not treat inert or unrelated controls as composer input', () => withDomGlobals(() => {
  const inert = new FakeElement()
  inert.dataset.composerInput = 'true'
  inert.dataset.phase = 'inert'
  assert.equal(isComposerInput(elementOf(inert)), false)
  const textarea = new FakeTextArea()
  assert.equal(isComposerInput(elementOf(textarea)), false)
  textarea.dataset.phase = 'idle'
  textarea.readOnly = true
  assert.equal(isComposerInput(elementOf(textarea)), false)
}))
