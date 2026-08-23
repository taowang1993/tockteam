import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type {
  DesktopPickerAuthorization,
  DesktopPrintExportRequest,
  DesktopSourceRoot,
  DesktopMicrophoneRequest,
  NativeOperationIdentity,
} from '../src/host-contract.ts'
import {
  TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
  TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
  TOCKTEAM_DESKTOP_PICKER_SERVICE,
  TOCKTEAM_DESKTOP_POPOUT_SERVICE,
  TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
  MAX_PRINT_EXPORT_HTML_BYTES,
  MAX_PRINT_EXPORT_RESOURCE_REFERENCES,
  MAX_PRINT_EXPORT_RESOURCE_URL_BYTES,
  MAX_PRINT_EXPORT_TITLE_BYTES,
  TockTeamDesktopGrantError,
  createNativeOwnerLifetime,
} from '../src/host-contract.ts'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
  exports: Record<string, unknown>
  files: string[]
}
const declarations = readFileSync(new URL('../host.d.ts', import.meta.url), 'utf8')
const typeIdentity = {} as NativeOperationIdentity
const typeAuthorization = '' as DesktopPickerAuthorization
const typeRevision = '' as DesktopSourceRoot['revision']
const typeFileRoot: DesktopSourceRoot = {
  entry: {
    entryId: '' as never,
    kind: 'file',
    relativePath: '' as never,
    revision: typeRevision,
    size: 0,
  },
  kind: 'file',
  revision: typeRevision,
}
const typeDirectoryRoot: DesktopSourceRoot = { kind: 'directory', revision: typeRevision }
const typePrint: DesktopPrintExportRequest = {
  format: 'print',
  html: '',
  identity: typeIdentity,
  title: '',
}
const typeHtmlExport: DesktopPrintExportRequest = {
  authorization: typeAuthorization,
  format: 'html',
  html: '',
  identity: typeIdentity,
  purpose: 'export-html',
  title: '',
}
const typeMicrophone: DesktopMicrophoneRequest = { identity: typeIdentity }
const invalidPrint: DesktopPrintExportRequest = {
  // @ts-expect-error print must not carry destination authorization
  authorization: typeAuthorization,
  format: 'print',
  html: '',
  identity: typeIdentity,
  purpose: 'export-html',
  title: '',
}
// @ts-expect-error microphone binding stays in the adapter; native request is identity-only
const invalidMicrophone: DesktopMicrophoneRequest = { identity: typeIdentity, notePath: 'note.md' }
const invalidDirectoryRoot: DesktopSourceRoot = {
  // @ts-expect-error directory roots never expose a file entry
  entry: typeFileRoot.entry,
  kind: 'directory',
  revision: typeRevision,
}
void [typeFileRoot, typeDirectoryRoot, typePrint, typeHtmlExport, typeMicrophone, invalidPrint, invalidMicrophone, invalidDirectoryRoot]

 test('publishes the canonical Desktop Host subpath metadata', () => {
  assert.equal(packageJson.version, '0.1.5')
  assert.deepEqual(packageJson.exports['./host'], {
    types: './host.d.ts',
    node: './dist/host.js',
    default: './dist/host.js',
  })
  assert.ok(packageJson.files.includes('dist/host.js'))
  assert.ok(packageJson.files.includes('host.d.ts'))
  assert.match(declarations, /export interface TockTeamDesktopPickerService/)
  assert.match(declarations, /export declare class TockTeamDesktopGrantError/)
  assert.match(declarations, /export type DesktopSourceRoot =/)
  assert.match(declarations, /export declare const MAX_PRINT_EXPORT_HTML_BYTES/)
  assert.match(declarations, /purpose: 'export-html'/)
  assert.match(declarations, /purpose: 'export-pdf'/)
  assert.equal(MAX_PRINT_EXPORT_HTML_BYTES, 8 * 1024 * 1024)
  assert.equal(MAX_PRINT_EXPORT_TITLE_BYTES, 512)
  assert.equal(MAX_PRINT_EXPORT_RESOURCE_REFERENCES, 256)
  assert.equal(MAX_PRINT_EXPORT_RESOURCE_URL_BYTES, 2 * 1024 * 1024)
})

test('exports one stable service key for each native owner', () => {
  assert.deepEqual([
    TOCKTEAM_DESKTOP_PICKER_SERVICE,
    TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
    TOCKTEAM_DESKTOP_POPOUT_SERVICE,
    TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
    TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
  ], [
    'tockTeamDesktopPicker',
    'tockTeamDesktopDispatch',
    'tockTeamDesktopPopOut',
    'tockTeamDesktopMicrophone',
    'tockTeamDesktopPrintExport',
  ])
})

test('uses typed grant errors and closes pending owner work on disposal', async () => {
  const error = new TockTeamDesktopGrantError('purpose-mismatch', 'purpose mismatch')
  assert.equal(error.name, 'TockTeamDesktopGrantError')
  assert.equal(error.code, 'purpose-mismatch')

  const lifetime = createNativeOwnerLifetime()
  let release!: () => void
  const pending = lifetime.run(signal => new Promise<void>((resolve) => {
    release = resolve
    signal.addEventListener('abort', () => resolve(), { once: true })
  }))
  assert.equal(lifetime.active, 1)
  await lifetime.dispose()
  release()
  await pending
  assert.equal(lifetime.active, 0)
  await assert.rejects(
    lifetime.run(async () => undefined),
    /native owner lifetime is disposed/,
  )
})
