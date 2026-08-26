const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])

function extensionOf(pathValue: string): string {
  const base = pathValue.split(/[\\/]/u).pop() ?? pathValue
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot).toLowerCase() : ''
}

/** Return the only local media kind accepted by Base image values. */
export function isNotesBaseImagePath(pathValue: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(pathValue))
}
