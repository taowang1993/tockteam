import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

/** Desktop-only read of the pinned DSH provider's managed store, not its environment layers. */
export function readSavedDesktopModelKey(
  dshHome: string,
  ref: unknown,
  parseCredentialsDocument: (source: string, filename: string) => { refs: ReadonlyMap<string, string> },
): string | null {
  if (typeof ref !== 'string' || ref.length > 128 || !/^[A-Z][A-Z0-9_]*_API_KEY$/u.test(ref)) {
    throw new Error('Invalid Models API key reference')
  }
  const filename = join(dshHome, '.credentials.yaml')
  let metadata
  try { metadata = lstatSync(filename) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (!metadata.isFile() || (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) {
    throw new Error('Models credential store must be a private regular file')
  }
  const source = readBoundedRegularFile(filename, 1024 * 1024)
  const value = parseCredentialsDocument(source, filename).refs.get(ref)
  return typeof value === 'string' && value.length > 0 ? value : null
}
