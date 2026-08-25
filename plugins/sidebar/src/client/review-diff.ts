import type {
  GitReviewCommit,
  GitReviewFile,
  GitReviewFileStatus,
  GitReviewLineType,
} from './review-types.ts'
import type { BetterSidebarGitLogEntry } from './better-sidebar-api.ts'

interface MutableReviewFile extends GitReviewFile {
  oldCursor: number | null
  newCursor: number | null
}

function decodeGitPath(value: string): string {
  const quoted = value.startsWith('"') && value.endsWith('"')
  if (!quoted) return value
  const source = value.slice(1, -1)
  const chunks: Buffer[] = []
  let text = ''
  const escapes: Record<string, string> = {
    a: '\u0007', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\u000b',
    '"': '"', '\\': '\\',
  }
  const flush = (): void => {
    if (text !== '') chunks.push(Buffer.from(text))
    text = ''
  }
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (character !== '\\') {
      text += character
      continue
    }
    const escaped = source[index + 1]
    if (escaped === undefined) {
      text += '\\'
      continue
    }
    const octal = /^[0-7]{1,3}/u.exec(source.slice(index + 1))?.[0]
    if (octal !== undefined) {
      flush()
      chunks.push(Buffer.from([Number.parseInt(octal, 8)]))
      index += octal.length
      continue
    }
    text += escapes[escaped] ?? escaped
    index += 1
  }
  flush()
  return Buffer.concat(chunks).toString('utf8')
}

function headerPaths(line: string): { oldPath: string; path: string } | null {
  const quoted = /^diff --git ("(?:\\.|[^"])*") ("(?:\\.|[^"])*")$/u.exec(line)
  const plain = /^diff --git (a\/.+) (b\/.+)$/u.exec(line)
  const match = quoted ?? plain
  if (match?.[1] === undefined || match[2] === undefined) return null
  const oldPath = decodeGitPath(match[1])
  const path = decodeGitPath(match[2])
  return {
    oldPath: oldPath.startsWith('a/') ? oldPath.slice(2) : oldPath,
    path: path.startsWith('b/') ? path.slice(2) : path,
  }
}

function fileStatus(line: string): GitReviewFileStatus | null {
  if (line.startsWith('new file mode ')) return 'added'
  if (line.startsWith('deleted file mode ')) return 'deleted'
  if (line.startsWith('rename from ')) return 'renamed'
  if (line.startsWith('Binary files ')) return 'binary'
  return null
}

function hunkStart(line: string): { oldStart: number; newStart: number } | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (match === null) return null
  const oldStart = Number(match[1])
  const newStart = Number(match[2])
  if (!Number.isSafeInteger(oldStart) || !Number.isSafeInteger(newStart)) {
    return null
  }
  return { oldStart, newStart }
}

function addLine(
  file: MutableReviewFile,
  type: GitReviewLineType,
  content: string,
): void {
  const oldLine = type === 'addition' ? null : file.oldCursor
  const newLine = type === 'deletion' ? null : file.newCursor
  file.lines.push({
    key: `${file.path}:${oldLine ?? 'x'}:${newLine ?? 'x'}:${String(file.lines.length)}`,
    type,
    content,
    oldLine,
    newLine,
  })
  if (type !== 'addition' && file.oldCursor !== null) file.oldCursor += 1
  if (type !== 'deletion' && file.newCursor !== null) file.newCursor += 1
  if (type === 'addition') file.additions += 1
  if (type === 'deletion') file.deletions += 1
}

export function parseGitReviewDiff(output: string): GitReviewFile[] {
  const files: GitReviewFile[] = []
  let current: MutableReviewFile | null = null
  let inHunk = false

  const finish = (): void => {
    if (current === null) return
    const { oldCursor: _oldCursor, newCursor: _newCursor, ...file } = current
    files.push(file)
    current = null
    inHunk = false
  }

  for (const rawLine of output.split(/\r?\n/)) {
    const header = headerPaths(rawLine)
    if (header !== null) {
      finish()
      current = {
        path: header.path,
        oldPath: header.oldPath,
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: [],
        oldCursor: null,
        newCursor: null,
      }
      continue
    }
    if (current === null) continue

    const status = fileStatus(rawLine)
    if (status !== null) {
      current.status = status
      continue
    }
    if (rawLine.startsWith('rename to ')) {
      current.path = decodeGitPath(rawLine.slice('rename to '.length))
      current.status = 'renamed'
      continue
    }
    if (rawLine.startsWith('--- ')) {
      const path = decodeGitPath(rawLine.slice(4))
      if (path !== '/dev/null') {
        current.oldPath = path.startsWith('a/') ? path.slice(2) : path
      }
      continue
    }
    if (rawLine.startsWith('+++ ')) {
      const path = decodeGitPath(rawLine.slice(4))
      if (path !== '/dev/null') {
        current.path = path.startsWith('b/') ? path.slice(2) : path
      }
      continue
    }

    const hunk = hunkStart(rawLine)
    if (hunk !== null) {
      current.oldCursor = hunk.oldStart
      current.newCursor = hunk.newStart
      inHunk = true
      continue
    }
    if (!inHunk || rawLine.startsWith('\\ No newline at end of file')) {
      continue
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      addLine(current, 'addition', rawLine.slice(1))
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      addLine(current, 'deletion', rawLine.slice(1))
    } else if (rawLine.startsWith(' ')) {
      addLine(current, 'context', rawLine.slice(1))
    }
  }
  finish()
  return files
}

export function reviewCommitFromBetterSidebar(
  entry: BetterSidebarGitLogEntry,
  diff: string,
): GitReviewCommit {
  return {
    id: entry.hashFull,
    shortId: entry.hash,
    subject: entry.subject,
    author: entry.author,
    authoredAt: entry.date,
    message: entry.subject,
    files: parseGitReviewDiff(diff),
  }
}
