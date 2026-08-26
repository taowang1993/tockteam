export function noteHasTag(tags: string[], tag: string): boolean {
  const normalized = tag.replace(/^#+/u, '').trim().toLowerCase()
  return tags.some(candidate => {
    const value = candidate.toLowerCase()
    return value === normalized || value.startsWith(`${normalized}/`)
  })
}
