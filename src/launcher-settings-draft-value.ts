/** Compare a renderer draft with a typed snapshot value without treating empty input as zero. */
export function launcherDraftValueEquals(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'number') return left.trim().length > 0 && Number(left) === right
  if (typeof left === 'number' && typeof right === 'string') return right.trim().length > 0 && left === Number(right)
  return Object.is(left, right)
}

/** Formatting alone is not an unsaved JSON edit; malformed drafts stay untouched. */
export function launcherJsonDraftEquals(left: string, right: string): boolean {
  try { return JSON.stringify(JSON.parse(left)) === JSON.stringify(JSON.parse(right)) }
  catch { return left === right }
}
