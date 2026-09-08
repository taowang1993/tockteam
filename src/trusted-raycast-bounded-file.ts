import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'

export function readBoundedRegularFile(path: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid bounded file limit')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Bounded file is invalid')
    const buffer = Buffer.allocUnsafe(maxBytes + 1)
    let offset = 0
    while (offset <= maxBytes) {
      const count = readSync(fd, buffer, offset, maxBytes + 1 - offset, null)
      if (count === 0) break
      offset += count
    }
    if (offset > maxBytes) throw new Error('Bounded file exceeds its size limit')
    return buffer.subarray(0, offset).toString('utf8')
  } finally { closeSync(fd) }
}
