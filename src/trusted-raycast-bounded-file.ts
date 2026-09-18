import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs'

export function readBoundedRegularFile(path: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid bounded file limit')
  const selected = lstatSync(path, { bigint: true })
  if (!selected.isFile() || selected.size > BigInt(maxBytes)) throw new Error('Bounded file is invalid')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = fstatSync(fd, { bigint: true })
    if (!stat.isFile() || stat.size > BigInt(maxBytes) || stat.dev !== selected.dev || stat.ino !== selected.ino) throw new Error('Bounded file is invalid')
    const buffer = Buffer.allocUnsafe(maxBytes + 1)
    let offset = 0
    while (offset <= maxBytes) {
      const count = readSync(fd, buffer, offset, maxBytes + 1 - offset, null)
      if (count === 0) break
      offset += count
    }
    if (offset > maxBytes) throw new Error('Bounded file exceeds its size limit')
    const current = lstatSync(path, { bigint: true })
    if (!current.isFile() || current.dev !== stat.dev || current.ino !== stat.ino) throw new Error('Bounded file changed while reading')
    return buffer.subarray(0, offset).toString('utf8')
  } finally { closeSync(fd) }
}
