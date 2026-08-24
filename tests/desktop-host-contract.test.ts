import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type {
  BeginDesktopDestinationRequest,
  DesktopDestinationPlan,
  DesktopDestinationPlanAuthorization,
  DesktopPickerAuthorization,
  DesktopPrintExportRequest,
  DesktopSelectedFilePlanEntry,
  DesktopSourceRoot,
  DesktopMicrophoneRequest,
  NativeOperationIdentity,
} from '../src/host-contract.ts'
import {
  TOCKTEAM_DESKTOP_CALLER_SERVICE,
  TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
  TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
  TOCKTEAM_DESKTOP_PICKER_SERVICE,
  TOCKTEAM_DESKTOP_POPOUT_SERVICE,
  TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
  TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE,
  MAX_PRINT_EXPORT_HTML_BYTES,
  MAX_PRINT_EXPORT_RESOURCE_REFERENCES,
  MAX_PRINT_EXPORT_RESOURCE_URL_BYTES,
  MAX_PRINT_EXPORT_TITLE_BYTES,
  DESKTOP_DESTINATION_PLAN_VERSION,
  TockTeamDesktopGrantError,
  computeDesktopDestinationPlanDigest,
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
const typePlanAuthorization = '' as DesktopDestinationPlanAuthorization
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
const typeSelectedEntry = {
  digest: '' as never,
  size: 0,
  target: { kind: 'selected-file' as const },
} satisfies DesktopSelectedFilePlanEntry
const typeRelativeEntry = {
  digest: '' as never,
  size: 0,
  target: { kind: 'relative-file' as const, relativePath: '' as never },
}
type HtmlDestinationPlan = Extract<DesktopDestinationPlan, { purpose: 'export-html' | 'export-pdf' }>
type VaultBackupPlan = Extract<DesktopDestinationPlan, { purpose: 'vault-backup' }>
const typeHtmlPlan: HtmlDestinationPlan = { entries: [typeSelectedEntry], purpose: 'export-html', totalBytes: 0 }
const typeVaultPlan: VaultBackupPlan = { entries: [typeSelectedEntry], purpose: 'vault-backup', totalBytes: 0 }
const typeHtmlDestination: BeginDesktopDestinationRequest = {
  authorization: typePlanAuthorization,
  entries: [typeSelectedEntry],
  identity: typeIdentity,
  planDigest: '' as never,
  purpose: 'export-html',
  totalBytes: 0,
}
const typeVaultDestination: BeginDesktopDestinationRequest = {
  authorization: typePlanAuthorization,
  entries: [typeSelectedEntry],
  identity: typeIdentity,
  planDigest: '' as never,
  purpose: 'vault-backup',
  totalBytes: 0,
}
// @ts-expect-error print must not carry destination authorization or purpose
const invalidPrint: DesktopPrintExportRequest = {
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
const invalidHtmlDestination: BeginDesktopDestinationRequest = {
  ...typeHtmlDestination,
  // @ts-expect-error HTML export cannot publish a relative-file plan
  entries: [typeRelativeEntry],
}
const invalidVaultDestination: BeginDesktopDestinationRequest = {
  ...typeVaultDestination,
  // @ts-expect-error vault backup never exposes archive member paths
  entries: [typeRelativeEntry],
}
const invalidVaultPublication: BeginDesktopDestinationRequest = {
  ...typeVaultDestination,
  // @ts-expect-error vault backup never carries publicationName
  publicationName: 'invalid',
}
void [
  typeFileRoot,
  typeDirectoryRoot,
  typePrint,
  typeHtmlExport,
  typeMicrophone,
  typeHtmlPlan,
  typeVaultPlan,
  typeHtmlDestination,
  typeVaultDestination,
  invalidPrint,
  invalidMicrophone,
  invalidDirectoryRoot,
  invalidHtmlDestination,
  invalidVaultDestination,
  invalidVaultPublication,
]

 test('vault backup digest binds one opaque selected-file archive', () => {
  assert.equal(computeDesktopDestinationPlanDigest({
    entries: [{ digest: 'b'.repeat(64) as never, size: 7, target: { kind: 'selected-file' } }],
    purpose: 'vault-backup',
    totalBytes: 7,
  }), '8bde99389b0f98d3ad4a033c6b695c65f1ae9c92d427984d1aef68912412fc7e')
  assert.throws(() => computeDesktopDestinationPlanDigest({
    entries: [{ digest: 'b'.repeat(64), size: 7, target: { kind: 'relative-file', relativePath: 'files/Plan.md' } }],
    publicationName: 'backup',
    purpose: 'vault-backup',
    totalBytes: 7,
  } as never), (cause: unknown) => cause instanceof TockTeamDesktopGrantError && cause.code === 'unsafe-target')
})

test('checked-in Host declarations expose only the single-archive backup seam', () => {
  assert.doesNotMatch(declarations, /DesktopRelativeFilePlanEntry|relative-file/)
  assert.match(declarations, /purpose: 'export-html' \| 'export-pdf'/)
  assert.match(declarations, /purpose: 'vault-backup'/)
  assert.match(declarations, /publicationName\?: never/)
})

test('publishes the canonical Desktop Host subpath metadata', () => {
  assert.equal(packageJson.version, '0.1.12')
  assert.deepEqual(packageJson.exports['./host'], {
    types: './host.d.ts',
    browser: null,
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
  assert.equal(DESKTOP_DESTINATION_PLAN_VERSION, 1)
  assert.equal(
    computeDesktopDestinationPlanDigest({
      entries: [{ digest: '0'.repeat(64) as never, size: 0, target: { kind: 'selected-file' } }],
      purpose: 'export-html',
      totalBytes: 0,
    }),
    '2fa676825d6fa51d61b64769f316431e7381b8c0fd42e5e513612a144ea3ca76',
  )
  const browserImport = spawnSync(process.execPath, [
    '--conditions=browser',
    '--input-type=module',
    '-e',
    "await import('@tockteam/desktop/host')",
  ], { cwd: process.cwd(), encoding: 'utf8' })
  assert.notEqual(browserImport.status, 0)
  assert.match(browserImport.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/)
})

test('exports one stable service key for each native owner', () => {
  assert.deepEqual([
    TOCKTEAM_DESKTOP_CALLER_SERVICE,
    TOCKTEAM_DESKTOP_PICKER_SERVICE,
    TOCKTEAM_DESKTOP_DISPATCH_SERVICE,
    TOCKTEAM_DESKTOP_POPOUT_SERVICE,
    TOCKTEAM_DESKTOP_MICROPHONE_SERVICE,
    TOCKTEAM_DESKTOP_PRINT_EXPORT_SERVICE,
    TOCKTEAM_DESKTOP_VAULT_SELECTION_SERVICE,
  ], [
    'tockTeamDesktopCaller',
    'tockTeamDesktopPicker',
    'tockTeamDesktopDispatch',
    'tockTeamDesktopPopOut',
    'tockTeamDesktopMicrophone',
    'tockTeamDesktopPrintExport',
    'tockTeamDesktopVaultSelection',
  ])
})

test('uses typed grant errors and closes pending owner work on disposal', async () => {
  const error = new TockTeamDesktopGrantError('purpose-mismatch')
  assert.equal(error.name, 'TockTeamDesktopGrantError')
  assert.equal(error.code, 'purpose-mismatch')
  assert.equal(error.message, 'The Desktop grant purpose did not match.')
  assert.equal(new TockTeamDesktopGrantError('recovery-required').message, 'Desktop destination recovery requires user action.')
  assert.equal(new TockTeamDesktopGrantError('not-a-real-code' as never).code, 'owner-lost')

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
