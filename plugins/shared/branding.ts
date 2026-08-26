export function findHeroHeadlines(root: ParentNode = document): HTMLElement[] {
  const headlines = new Set<HTMLElement>()
  for (const mark of root.querySelectorAll<HTMLElement>("[data-slot='conversation.hero.brand.mark']")) {
    const headline = mark.parentElement?.nextElementSibling
    if (headline instanceof HTMLElement) headlines.add(headline)
  }
  return [...headlines]
}

export function pruneDisconnected<T extends Element, Value>(entries: Map<T, Value>): void {
  for (const element of entries.keys()) if (!element.isConnected) entries.delete(element)
}
