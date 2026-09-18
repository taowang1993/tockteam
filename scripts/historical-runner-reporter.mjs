import assert from 'node:assert/strict'
import { tap } from 'node:test/reporters'
import { resolve } from 'node:path'

// No free-form output is evidence: these fixed signals are leads, not causes.
const signatures = new Map([
  ...[
    'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_ESM_URL_SCHEME',
    'ERR_UNKNOWN_FILE_EXTENSION', 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
    'ERR_INVALID_TYPESCRIPT_SYNTAX', 'ERR_DLOPEN_FAILED', 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ERR_PACKAGE_IMPORT_NOT_DEFINED', 'ERR_REQUIRE_ESM', 'ERR_TEST_FAILURE',
    'ERR_INTERNAL_ASSERTION', 'ERR_ACCESS_DENIED', 'ENOENT', 'EACCES', 'EPERM',
    'SyntaxError', 'TypeError', 'ReferenceError', 'RangeError', 'AssertionError',
  ].map(name => [name, new RegExp(`\\b${name}\\b`)]),
  ['test-failure', /^\s*not ok \d+(?: -|$)/m],
  ['module-not-found', /Cannot find (?:package|module)\b/],
  ['missing-export', /does not provide an export named/],
  ['bindings-not-found', /Could not locate the bindings file/],
])
const scanLimit = 64 * 1024
export const STARTUP_EVIDENCE_BYTES = 8192
const failureLimit = 8
const identities = new Map([
  ['Keyword search reconciles state-owned indexed candidates through the exact verifier', 'keyword'],
  ['persistent FlexSearch SQLite indexes reopen outside the user vault', 'persistent'],
])
const failureTypes = ['testCodeFailure', 'hookFailed', 'cancelledByParent', 'subtestsFailed', 'testTimeoutFailure', 'testAborted', 'parentAlreadyFinished', 'uncaughtException', 'unhandledRejection', 'expectedFailure', 'other']
const coordinate = value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000
const errorCodes = new Set([
  // Uppercase signatures are existing Node error codes, not free-form messages.
  ...[...signatures.keys()].filter(value => value === value.toUpperCase()),
  'ERR_ASSERTION', 'ERR_UNHANDLED_ERROR', 'EBUSY', 'EIO', 'ENOSPC', 'EMFILE', 'ENOTDIR', 'EISDIR',
  ...['ERROR', 'INTERNAL', 'PERM', 'ABORT', 'BUSY', 'LOCKED', 'NOMEM', 'READONLY', 'INTERRUPT',
    'IOERR', 'CORRUPT', 'NOTFOUND', 'FULL', 'CANTOPEN', 'PROTOCOL', 'EMPTY', 'SCHEMA', 'TOOBIG',
    'CONSTRAINT', 'MISMATCH', 'MISUSE', 'NOLFS', 'AUTH', 'FORMAT', 'RANGE', 'NOTADB'].map(code => `SQLITE_${code}`),
])
export const allowedCode = value => errorCodes.has(value) ? value : null

function failureRecord(data) {
  const file = resolve('tests/loader-composition.test.ts')
  const matchesFile = value => typeof value === 'string' && value.length <= 4096 && resolve(value) === file
  const inFile = matchesFile(data.file)
  const identity = inFile ? identities.get(data.name) : undefined
  const error = data.details?.error
  // This is Node's test declaration location, not an error stack or throw site.
  return {
    test: identity ?? (inFile && matchesFile(data.name) ? 'file' : 'other'),
    location: inFile && coordinate(data.line) && coordinate(data.column) ? { line: data.line, column: data.column } : null,
    type: failureTypes.includes(error?.failureType) ? error.failureType : 'other',
    // Fixed depth: Node's wrapper and immediate cause only; no messages or stacks.
    code: allowedCode(error?.code),
    causeCode: allowedCode(error?.cause?.code),
  }
}

// Node's second reporter runs in the existing runner, not an extra wrapper.
// Keep Node 24.20's default spec reporter on stdout for owned output accounting.
// TAP formatting here is private and only supplies the fixed signal matcher.
export default async function* startupReporter(source) {
  yield JSON.stringify({ started: true }) + '\n'
  const observed = new Set()
  let scannedBytes = 0, truncated = false, carry = '', failureCount = 0, failuresTruncated = false
  const pending = []
  async function* events() {
    for await (const event of source) {
      if (event.type === 'test:fail') {
        if (failureCount < failureLimit) { pending.push({ failure: failureRecord(event.data) }); failureCount++ }
        else failuresTruncated = true
      }
      yield event
    }
  }
  for await (const chunk of tap(events())) {
    for (const row of pending.splice(0)) yield JSON.stringify(row) + '\n'
    const bytes = Buffer.from(chunk)
    const length = Math.min(bytes.length, scanLimit - scannedBytes)
    truncated ||= length < bytes.length
    if (!length) continue
    scannedBytes += length
    const text = carry + bytes.subarray(0, length).toString('utf8')
    for (const [signal, pattern] of signatures) {
      if (!observed.has(signal) && pattern.test(text)) {
        observed.add(signal)
        yield JSON.stringify({ signal }) + '\n'
      }
    }
    carry = text.slice(-128)
  }
  for (const row of pending) yield JSON.stringify(row) + '\n'
  yield JSON.stringify({ complete: true, scannedBytes, truncated, failuresTruncated }) + '\n'
}

export function parseStartupEvidence(text) {
  assert.ok(Buffer.byteLength(text) > 0 && Buffer.byteLength(text) <= STARTUP_EVIDENCE_BYTES && text.endsWith('\n'), 'startup evidence byte bound or incomplete row')
  const rows = text.trimEnd().split('\n').map(line => JSON.parse(line))
  assert.ok(rows.length <= signatures.size + failureLimit + 2, 'startup evidence record bound')
  assert.deepEqual(rows.shift(), { started: true })
  const result = { observed: [], failures: [], complete: false, scannedBytes: null, truncated: null, failuresTruncated: null }
  for (const row of rows) {
    assert.equal(result.complete, false, 'record after startup evidence completion')
    if (Object.hasOwn(row, 'signal')) {
      assert.deepEqual(Object.keys(row), ['signal'])
      assert.ok(signatures.has(row.signal) && !result.observed.includes(row.signal), 'invalid or repeated startup signal')
      result.observed.push(row.signal)
    } else if (Object.hasOwn(row, 'failure')) {
      assert.deepEqual(Object.keys(row), ['failure'])
      const failure = row.failure
      assert.deepEqual(Object.keys(failure).sort(), ['causeCode', 'code', 'location', 'test', 'type'])
      for (const code of [failure.code, failure.causeCode]) assert.ok(code === null || errorCodes.has(code))
      assert.ok(['keyword', 'persistent', 'file', 'other'].includes(failure.test))
      assert.ok(failureTypes.includes(failure.type))
      if (failure.location !== null) {
        assert.deepEqual(Object.keys(failure.location).sort(), ['column', 'line'])
        assert.ok(coordinate(failure.location.line) && coordinate(failure.location.column))
      }
      assert.ok(result.failures.length < failureLimit, 'startup failure record bound')
      result.failures.push(failure)
    } else {
      assert.deepEqual(Object.keys(row).sort(), ['complete', 'failuresTruncated', 'scannedBytes', 'truncated'])
      assert.equal(row.complete, true)
      assert.ok(Number.isSafeInteger(row.scannedBytes) && row.scannedBytes >= 0 && row.scannedBytes <= scanLimit)
      assert.equal(typeof row.truncated, 'boolean')
      assert.equal(typeof row.failuresTruncated, 'boolean')
      if (row.failuresTruncated) assert.equal(result.failures.length, failureLimit)
      Object.assign(result, row)
    }
  }
  return result
}
