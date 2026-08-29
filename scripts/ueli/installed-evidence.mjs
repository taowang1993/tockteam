#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(scriptDir, '../..')
const PLATFORMS = Object.freeze(['macOS', 'Windows', 'Linux'])
const STATES = Object.freeze(['local-verified', 'partially-verified', 'workflow-required', 'unverified', 'not-applicable'])
export const REQUIRED_INSTALLED_EVIDENCE_ROWS = Object.freeze([
  'macOS:artifact-build',
  'macOS:identity-and-resources',
  'macOS:notices-and-bounded-vendor-scan',
  'macOS:ad-hoc-signature',
  'macOS:security-and-workbench',
  'macOS:launcher-action',
  'macOS:settings-session-compatibility',
  'macOS:reinstall-settings',
  'macOS:rollback',
  'macOS:provider-catalog',
  'macOS:permissions-and-cleanup',
  'macOS:shortcut-second-instance',
  'Windows:nsis-install',
  'Windows:identity-resources-notices',
  'Windows:security-action-settings',
  'Windows:notices-and-bounded-vendor-scan',
  'Windows:control-panel-terminal-elevation',
  'Windows:reinstall-rollback-cleanup',
  'Windows:shortcut-second-instance-permissions',
  'Linux:deb-install',
  'Linux:appimage-install',
  'Linux:identity-resources-notices',
  'Linux:no-vendor-source',
  'Linux:security-action-settings',
  'Linux:file-search-custom-browser',
  'Linux:reinstall-rollback-cleanup',
  'Linux:shortcut-second-instance-permissions',
])
const PUBLICATION_KEYS = Object.freeze(['installedArtifact', 'signed', 'notarized', 'publicDistribution'])
const LOCAL_VERIFIED_ROWS = new Set([
  'macOS:artifact-build',
  'macOS:identity-and-resources',
  'macOS:ad-hoc-signature',
  'macOS:security-and-workbench',
  'macOS:launcher-action',
  'macOS:settings-session-compatibility',
  'macOS:reinstall-settings',
  'macOS:rollback',
  'macOS:permissions-and-cleanup',
])
const PARTIAL_VERIFIED_ROWS = new Set([
  'macOS:notices-and-bounded-vendor-scan',
  'macOS:provider-catalog',
])
const LOCAL_EVIDENCE = Object.freeze({
  kind: 'local-run',
  platform: 'darwin-arm64',
  commit: '98166c8b0351ab8dad255cef8de500b4215bc6e0',
  version: '0.1.14',
  identity: 'ai.deepseek.tockteam-desktop',
  result: 'passed',
  reference: '/tmp/tl15-installed-mac.json',
})

function failure(failures, condition, message) {
  if (!condition) failures.push(message)
}

export function inspectInstalledEvidenceCatalog(catalog) {
  const failures = []
  failure(failures, catalog?.schemaVersion === 1, 'installed evidence catalog schemaVersion must be 1')
  failure(failures, catalog?.issue === 'tockteam-tl.15', 'installed evidence catalog must belong to tockteam-tl.15')
  failure(failures, JSON.stringify(catalog?.evidenceStates) === JSON.stringify(STATES), 'installed evidence states differ from the approved state set')
  const publication = catalog?.publication
  failure(failures, publication !== null && typeof publication === 'object', 'installed evidence publication flags are missing')
  for (const key of PUBLICATION_KEYS) failure(failures, publication?.[key] === false, `publication.${key} must remain false until external evidence exists`)
  const rows = Array.isArray(catalog?.rows) ? catalog.rows : []
  const byId = new Map()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') {
      failures.push('installed evidence catalog contains a non-object row')
      continue
    }
    if (typeof row.id === 'string') {
      if (byId.has(row.id)) failures.push(`installed evidence catalog duplicates ${row.id}`)
      byId.set(row.id, row)
    }
    failure(failures, typeof row.id === 'string' && row.id.length > 0, 'installed evidence row id is missing')
    failure(failures, PLATFORMS.includes(row.platform), `installed evidence row has an unknown platform: ${String(row.platform)}`)
    failure(failures, row.required === true, `installed evidence row is not required: ${String(row.id)}`)
    failure(failures, typeof row.owner === 'string' && row.owner.length > 0 && row.owner !== 'unowned', `installed evidence row is unowned: ${String(row.id)}`)
    failure(failures, STATES.includes(row.state), `installed evidence row has an unknown state: ${String(row.id)}`)
    if (LOCAL_VERIFIED_ROWS.has(row.id)) failure(failures, row.state === 'local-verified', `local evidence row must remain local-verified: ${String(row.id)}`)
    else if (PARTIAL_VERIFIED_ROWS.has(row.id)) failure(failures, row.state === 'partially-verified', `partial evidence row must remain partially-verified: ${String(row.id)}`)
    else failure(failures, row.state === 'workflow-required', `unexecuted evidence row must remain workflow-required: ${String(row.id)}`)
    if (row.state === 'local-verified' || row.state === 'partially-verified') {
      const evidence = row.evidence
      failure(failures, evidence !== null && typeof evidence === 'object', `verified row has no evidence provenance: ${String(row.id)}`)
      for (const key of ['kind', 'platform', 'commit', 'version', 'identity', 'result', 'reference']) {
        failure(failures, typeof evidence?.[key] === 'string' && evidence[key].length > 0, `verified row evidence is missing ${key}: ${String(row.id)}`)
      }
      failure(failures, evidence?.kind === 'local-run', `verified row evidence kind is not local-run: ${String(row.id)}`)
      failure(failures, /^[0-9a-f]{40}$/u.test(evidence?.commit ?? ''), `verified row evidence commit is not immutable: ${String(row.id)}`)
      failure(failures, evidence?.result === 'passed', `verified row evidence did not pass: ${String(row.id)}`)
      failure(failures, evidence?.identity === 'ai.deepseek.tockteam-desktop', `verified row evidence identity drifted: ${String(row.id)}`)
      failure(failures, evidence?.version === '0.1.14', `verified row evidence version drifted: ${String(row.id)}`)
      failure(failures, evidence?.platform === 'darwin-arm64', `verified row evidence platform drifted: ${String(row.id)}`)
    } else failure(failures, row.evidence === null || row.evidence === undefined, `unexecuted evidence row must not claim evidence: ${String(row.id)}`)
  }
  failure(failures, rows.length === REQUIRED_INSTALLED_EVIDENCE_ROWS.length, `installed evidence catalog must contain exactly ${String(REQUIRED_INSTALLED_EVIDENCE_ROWS.length)} rows`)
  for (const id of REQUIRED_INSTALLED_EVIDENCE_ROWS) failure(failures, byId.has(id), `required installed evidence row is missing: ${id}`)
  for (const id of byId.keys()) failure(failures, REQUIRED_INSTALLED_EVIDENCE_ROWS.includes(id), `installed evidence catalog contains an unapproved row: ${id}`)
  for (const platform of PLATFORMS) failure(failures, rows.some(row => row?.platform === platform), `installed evidence has no ${platform} rows`)
  return Object.freeze({ failures, summary: Object.freeze({ rows: rows.length, platforms: PLATFORMS, verified: rows.filter(row => row?.state === 'local-verified').length }) })
}

export function inspectInstalledEvidenceWorkflow(workflow) {
  const failures = []
  const text = String(workflow ?? '').replace(/\r\n?/gu, '\n')
  failure(failures, /workflow_dispatch:/u.test(text), 'installed evidence workflow must support manual dispatch')
  failure(failures, /pull_request:/u.test(text), 'installed evidence workflow must support pull requests')
  failure(failures, /runs-on: windows-latest/u.test(text), 'installed evidence workflow must include Windows x64')
  failure(failures, /runs-on: ubuntu-24\.04/u.test(text), 'installed evidence workflow must include Linux x64')
  failure(failures, /pnpm test:launcher:installed/u.test(text), 'installed evidence workflow must execute installed smoke')
  failure(failures, /check-release-version\.mjs --tag/u.test(text), 'installed evidence workflow must verify package version')
  failure(failures, /upload-artifact/u.test(text), 'installed evidence workflow must upload evidence')
  for (const action of text.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) failure(failures, /@[0-9a-f]{40}$/u.test(action[1]), `installed evidence workflow action is not immutable: ${action[1]}`)
  return Object.freeze({ failures })
}

export function inspectInstalledEvidenceDocs({ architecture, usage }) {
  const failures = []
  const architectureText = String(architecture ?? '')
  const usageText = String(usage ?? '')
  const combined = `${architectureText}\n${usageText}`
  failure(failures, /unsigned internal macOS|unsigned\/internal macOS/iu.test(combined), 'architecture/usage must label macOS proof unsigned/internal')
  failure(failures, /Windows and Linux[^\n]*(?:not yet executed|unexecuted|workflow-required)/iu.test(combined), 'architecture/usage must say Windows/Linux evidence is not executed')
  failure(failures, /notarized/iu.test(combined), 'architecture/usage must distinguish notarized evidence')
  failure(failures, /public distribution/iu.test(combined), 'architecture/usage must distinguish public distribution evidence')
  for (const line of `${architectureText}\n${usageText}`.split(/\r?\n/u)) {
    if (!/(?:Windows|Linux)/u.test(line) || !/(?:published|verified|passed)/iu.test(line)) continue
    failure(failures, /\b(?:not|never|unproven|unverified|workflow-required)\b/iu.test(line), `usage makes an unsupported platform claim: ${line}`)
  }
  return Object.freeze({ failures })
}

export async function loadInstalledEvidenceInputs({ repoRoot = defaultRepoRoot } = {}) {
  const catalogPath = path.join(repoRoot, 'scripts/ueli/installed-evidence-catalog.json')
  return Object.freeze({
    architecture: await readFile(path.join(repoRoot, '.agents/references/architecture.md'), 'utf8'),
    catalog: JSON.parse(await readFile(catalogPath, 'utf8')),
    usage: await readFile(path.join(repoRoot, '.agents/references/usage.md'), 'utf8'),
    workflow: await readFile(path.join(repoRoot, '.github/workflows/tocklauncher-installed.yml'), 'utf8'),
  })
}

export async function main() {
  const inputs = await loadInstalledEvidenceInputs()
  const catalogResult = inspectInstalledEvidenceCatalog(inputs.catalog)
  const docsResult = inspectInstalledEvidenceDocs(inputs)
  const workflowResult = inspectInstalledEvidenceWorkflow(inputs.workflow)
  const failures = [...catalogResult.failures, ...docsResult.failures, ...workflowResult.failures]
  if (failures.length > 0) {
    for (const message of failures) console.error(`- ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`TockTeam installed evidence contract passed: ${catalogResult.summary.rows} rows; macOS proof is local-only; Windows/Linux remain workflow-required.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    assert(error instanceof Error)
    console.error(error.message)
    process.exitCode = 1
  })
}
