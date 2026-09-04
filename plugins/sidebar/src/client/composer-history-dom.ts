import type { ComposerCaret } from './composer-history-keyboard.ts'

/**
 * Composer element access for the two input shapes DSH has shipped: the
 * textarea fallback and the RC.1 contenteditable div. Everything downstream
 * reads and writes the composer through these helpers, so an input-shape
 * change lands here instead of in the keyboard flow.
 */

/** The composer element the event target must be (never a terminal input). */
export function isComposerInput(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false
  if (target.dataset.composerInput === 'true') {
    return target.dataset.phase !== 'inert'
  }
  return (
    target instanceof HTMLTextAreaElement &&
    target.dataset.phase !== undefined &&
    !target.disabled &&
    !target.readOnly
  )
}

function textOffset(element: HTMLElement, container: Node, offset: number): number | null {
  if (!element.contains(container)) return null
  const range = element.ownerDocument.createRange()
  range.setStart(element, 0)
  try {
    range.setEnd(container, offset)
  } catch {
    return null
  }
  return range.toString().length
}

/** Read the composer's text and selection as the shared boundary-check shape. */
export function readComposerCaret(element: HTMLElement): ComposerCaret | null {
  if (element instanceof HTMLTextAreaElement) {
    return {
      selectionEnd: element.selectionEnd,
      selectionStart: element.selectionStart,
      value: element.value,
    }
  }
  const value = element.textContent ?? ''
  const selection = element.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const selectionStart = textOffset(element, range.startContainer, range.startOffset)
  const selectionEnd = textOffset(element, range.endContainer, range.endOffset)
  if (selectionStart === null || selectionEnd === null) return null
  return {
    selectionEnd: Math.max(selectionStart, selectionEnd),
    selectionStart: Math.min(selectionStart, selectionEnd),
    value,
  }
}

/** Place the caret at the end of the composer after a draft swap. */
export function focusComposerEnd(element: HTMLElement): void {
  if (element instanceof HTMLTextAreaElement) {
    const end = element.value.length
    element.setSelectionRange(end, end)
    return
  }
  const document = element.ownerDocument
  const selection = document.getSelection()
  if (selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}
