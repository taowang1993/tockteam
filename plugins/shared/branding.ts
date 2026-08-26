const HERO_MARK = "[data-slot='conversation.hero.brand.mark']"

export function matchingElements<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType[] {
  return [
    ...(root instanceof Element && root.matches(selector) ? [root as ElementType] : []),
    ...root.querySelectorAll<ElementType>(selector),
  ]
}

export function findHeroHeadlines(root: ParentNode = document): HTMLElement[] {
  const headlines = new Set<HTMLElement>()
  const marks = matchingElements<HTMLElement>(root, HERO_MARK)
  for (const mark of marks) {
    const headline = mark.parentElement?.nextElementSibling
    if (headline instanceof HTMLElement) headlines.add(headline)
  }
  return [...headlines]
}

export function brandingMutationRoots(records: readonly MutationRecord[]): ParentNode[] {
  const roots = new Set<ParentNode>()
  for (const record of records) {
    if (record.target instanceof Element || record.target instanceof DocumentFragment) {
      roots.add(record.target)
    } else if (record.target.parentElement !== null) {
      roots.add(record.target.parentElement.parentElement ?? record.target.parentElement)
    }
    for (const node of record.addedNodes) {
      if (node instanceof Element || node instanceof DocumentFragment) roots.add(node)
    }
  }
  return [...roots]
}

export function pruneDisconnected<T extends Element, Value>(entries: Map<T, Value>): void {
  for (const element of entries.keys()) if (!element.isConnected) entries.delete(element)
}
