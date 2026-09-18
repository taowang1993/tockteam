#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectInstalledReport } from '../check-installed-report.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(scriptDir, '../..')
const PLATFORMS = Object.freeze(['macOS', 'Windows', 'Linux'])
const REPORT_PLATFORM_BY_CATALOG_PLATFORM = Object.freeze({ macOS: 'darwin', Windows: 'win32', Linux: 'linux' })
const STATES = Object.freeze(['local-verified', 'hosted-verified', 'partially-verified', 'workflow-required', 'unverified', 'not-applicable'])
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
  'Windows:portable-archive-install',
  'Windows:identity-resources-notices',
  'Windows:security-action-settings',
  'Windows:notices-and-bounded-vendor-scan',
  'Windows:control-panel-terminal-elevation',
  'Windows:reinstall-rollback-cleanup',
  'Windows:shortcut-second-instance-permissions',
  'Linux:deb-install',
  'Linux:appimage-install',
  'Linux:identity-resources-notices',
  'Linux:notices-and-bounded-vendor-scan',
  'Linux:security-action-settings',
  'Linux:file-search-custom-browser',
  'Linux:reinstall-rollback-cleanup',
  'Linux:shortcut-second-instance-permissions',
])
const PUBLICATION_KEYS = Object.freeze(['installedArtifact', 'signed', 'notarized', 'publicDistribution'])
const EXPECTED_PLATFORM_BY_ID = Object.freeze(Object.fromEntries(REQUIRED_INSTALLED_EVIDENCE_ROWS.map(id => [id, id.slice(0, id.indexOf(':'))])))
const ALLOWED_OWNERS = new Set([
  'scripts/launcher-installed-smoke.mjs',
  '.github/workflows/tocklauncher-installed.yml',
])
const ALLOWED_POST_EVIDENCE_PATHS = new Set([
  '.agents/references/architecture.md',
  '.agents/references/usage.md',
  '.beads/interactions.jsonl',
  'scripts/ueli/installed-evidence-catalog.json',
])
const WORKFLOW_OWNER_ROWS = new Set([
  'Windows:portable-archive-install',
  'Linux:deb-install',
  'Linux:appimage-install',
])

function failure(failures, condition, message) {
  if (!condition) failures.push(message)
}

function validateCheckedInEvidence(failures, row) {
  const evidence = row.evidence
  failure(failures, evidence !== null && typeof evidence === 'object', `verified row has no evidence provenance: ${String(row.id)}`)
  for (const key of ['kind', 'platform', 'commit', 'version', 'identity', 'result', 'reference', 'reportSha256']) {
    failure(failures, typeof evidence?.[key] === 'string' && evidence[key].length > 0, `verified row evidence is missing ${key}: ${String(row.id)}`)
  }
  failure(failures, evidence?.kind === 'checked-in-report', `verified row evidence kind is not checked-in-report: ${String(row.id)}`)
  failure(failures, /^[0-9a-f]{40}$/u.test(evidence?.commit ?? ''), `verified row evidence commit is not immutable: ${String(row.id)}`)
  failure(failures, /^[0-9a-f]{64}$/u.test(evidence?.reportSha256 ?? ''), `verified row evidence report hash is not immutable: ${String(row.id)}`)
  failure(failures, evidence?.result === 'passed', `verified row evidence did not pass: ${String(row.id)}`)
  failure(failures, evidence?.identity === 'ai.deepseek.tockteam-desktop', `verified row evidence identity drifted: ${String(row.id)}`)
  const reference = evidence?.reference
  const checkedInPath = typeof reference === 'string'
    && reference.startsWith('.beads/reports/')
    && reference.endsWith('.json')
    && !reference.includes('..')
  failure(failures, checkedInPath, `verified row evidence is not checked in: ${String(row.id)}`)
  const expectedPlatform = REPORT_PLATFORM_BY_CATALOG_PLATFORM[row.platform]
  failure(failures, evidence?.platform === expectedPlatform, `verified row evidence platform does not match its row: ${String(row.id)}`)
  if (!checkedInPath) return
  const reportPath = path.resolve(defaultRepoRoot, reference)
  failure(failures, existsSync(reportPath), `verified row evidence report is missing: ${String(row.id)}`)
  if (!existsSync(reportPath)) return
  let report
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')) } catch { report = undefined }
  failure(failures, report?.result === 'passed', `verified row report did not pass: ${String(row.id)}`)
  failure(failures, report?.sourceCommit === evidence.commit, `verified row report commit differs: ${String(row.id)}`)
  failure(failures, report?.version === evidence.version, `verified row report version differs: ${String(row.id)}`)
  failure(failures, report?.appId === evidence.identity, `verified row report identity differs: ${String(row.id)}`)
  const reportResult = inspectInstalledReport(report, {
    appId: evidence.identity,
    commit: evidence.commit,
    platform: expectedPlatform,
    productName: 'TockTeam Desktop',
    version: evidence.version,
  })
  failure(failures, reportResult.failures.length === 0, `verified row report failed full ${String(row.platform)} validation: ${reportResult.failures.join('; ')}`)
  if (row.id === 'macOS:shortcut-second-instance') {
    const launch = report?.installed?.secondInstance
    failure(failures, launch?.launchPath === 'macOS Launch Services (/usr/bin/open)' && launch?.persistentAppProcesses === 1 && launch?.toggleDelivered === true, 'macOS shortcut row lacks native application-launch evidence')
  }
  if (row.id === 'Linux:reinstall-rollback-cleanup' && row.state === 'hosted-verified') {
    const rollback = report?.installed?.deb?.rollback
    failure(failures, rollback?.atomic === false && rollback?.mechanism === 'reinstall-preserved-prior-deb' && rollback?.validationFailureRecovered === true, 'Linux rollback row lacks prior-package recovery evidence')
  }
  const reportHash = createHash('sha256').update(readFileSync(reportPath)).digest('hex')
  failure(failures, reportHash === evidence.reportSha256, `verified row report hash differs: ${String(row.id)}`)
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
    failure(failures, row.platform === EXPECTED_PLATFORM_BY_ID[row.id], `installed evidence row platform does not match its ID: ${String(row.id)}`)
    failure(failures, row.required === true, `installed evidence row is not required: ${String(row.id)}`)
    failure(failures, typeof row.owner === 'string' && ALLOWED_OWNERS.has(row.owner), `installed evidence row owner is not an approved source: ${String(row.id)}`)
    const expectedOwner = WORKFLOW_OWNER_ROWS.has(row.id) ? '.github/workflows/tocklauncher-installed.yml' : 'scripts/launcher-installed-smoke.mjs'
    failure(failures, row.owner === expectedOwner, `installed evidence row owner is incorrect: ${String(row.id)}`)
    failure(failures, STATES.includes(row.state), `installed evidence row has an unknown state: ${String(row.id)}`)
    if (row.state === 'local-verified' || row.state === 'hosted-verified' || row.state === 'partially-verified') validateCheckedInEvidence(failures, row)
    else {
      failure(failures, row.state === 'workflow-required', `unexecuted evidence row must remain workflow-required: ${String(row.id)}`)
      failure(failures, row.evidence === null || row.evidence === undefined, `unexecuted evidence row must not claim evidence: ${String(row.id)}`)
    }
  }
  failure(failures, rows.length === REQUIRED_INSTALLED_EVIDENCE_ROWS.length, `installed evidence catalog must contain exactly ${String(REQUIRED_INSTALLED_EVIDENCE_ROWS.length)} rows`)
  for (const id of REQUIRED_INSTALLED_EVIDENCE_ROWS) failure(failures, byId.has(id), `required installed evidence row is missing: ${id}`)
  for (const id of byId.keys()) failure(failures, REQUIRED_INSTALLED_EVIDENCE_ROWS.includes(id), `installed evidence catalog contains an unapproved row: ${id}`)
  for (const platform of PLATFORMS) failure(failures, rows.some(row => row?.platform === platform), `installed evidence has no ${platform} rows`)
  return Object.freeze({ failures, summary: Object.freeze({ rows: rows.length, platforms: PLATFORMS, verified: rows.filter(row => row?.state === 'local-verified' || row?.state === 'hosted-verified').length }) })
}

function defaultRunGit(args, repoRoot) {
  const result = spawnSync('git', ['--no-replace-objects', '-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { status: result.status, stdout: result.stdout ?? '' }
}

export function inspectInstalledEvidenceFreshness(catalog, { head = 'HEAD', repoRoot = defaultRepoRoot, runGit = defaultRunGit } = {}) {
  const failures = []
  const commits = [...new Set((Array.isArray(catalog?.rows) ? catalog.rows : []).map(row => row?.evidence?.commit).filter(commit => /^[0-9a-f]{40}$/u.test(commit ?? '')))]
  for (const commit of commits) {
    const ancestor = runGit(['merge-base', '--is-ancestor', commit, head], repoRoot)
    if (ancestor.status !== 0) {
      failures.push(`installed evidence commit is not an ancestor of ${head}: ${commit}`)
      continue
    }
    const diff = runGit(['diff', '--name-only', `${commit}..${head}`], repoRoot)
    if (diff.status !== 0) {
      failures.push(`installed evidence freshness diff failed: ${commit}`)
      continue
    }
    const changed = String(diff.stdout).split(/\r?\n/u).filter(Boolean)
      .filter(file => !file.startsWith('.agents/skills/') && !file.startsWith('.beads/reports/') && !file.startsWith('tests/') && !file.includes('/tests/') && !ALLOWED_POST_EVIDENCE_PATHS.has(file))
      .sort()
    if (changed.length > 0) failures.push(`installed evidence commit has later runtime changes: ${commit}: ${changed.join(', ')}`)
  }
  return Object.freeze({ failures: Object.freeze(failures) })
}

export function inspectInstalledEvidenceWorkflow(workflow) {
  const failures = []
  const text = String(workflow ?? '').replace(/\r\n?/gu, '\n')
  failure(failures, /workflow_dispatch:[\s\S]*linux_prior_run_id:/u.test(text), 'installed evidence workflow must require a preserved Linux prior-package run')
  failure(failures, !/pull_request:/u.test(text), 'installed evidence workflow must not run on every pull request')
  failure(failures, /runs-on: windows-latest/u.test(text), 'installed evidence workflow must include Windows x64')
  failure(failures, /runs-on: ubuntu-24\.04/u.test(text), 'installed evidence workflow must include Linux x64')
  failure(failures, /pnpm test:launcher:installed/u.test(text), 'installed evidence workflow must execute installed smoke')
  for (const [index, job] of ['windows-x64', 'linux-x64'].entries()) {
    const start = text.indexOf(`  ${job}:`)
    const end = index === 1 ? text.length : text.indexOf('  linux-x64:', start)
    const section = start >= 0 && end >= start ? text.slice(start, end) : ''
    failure(failures, /actions\/checkout@[0-9a-f]{40}/u.test(section), `${job} checkout action is missing`)
    failure(failures, /fetch-depth:\s*0/u.test(section), `${job} checkout must fetch full checkout history`)
    failure(failures, /fetch-tags:\s*true/u.test(section), `${job} checkout must fetch tags`)
    failure(failures, /submodules:\s*recursive/u.test(section), `${job} checkout must fetch recursive submodules`)
    failure(failures, /id:\s*ueli-gates/u.test(section), `${job} must identify the Ueli gate step`)
    failure(failures, /id:\s*installed-smoke/u.test(section), `${job} must identify the installed smoke step`)
    failure(failures, /id:\s*report-check/u.test(section), `${job} must identify the report-check step`)
    failure(failures, /compression-level:\s*0/u.test(section), `${job} evidence upload must disable artifact compression`)
    const installerGlobs = job === 'windows-x64'
      ? ['${{ runner.temp }}/tockteam-installed-launcher-smoke-*/installer/*.tar.gz']
      : [
          '${{ runner.temp }}/tockteam-installed-launcher-smoke-*/installer/*.deb',
          '${{ runner.temp }}/tockteam-installed-launcher-smoke-*/installer/*.AppImage',
        ]
    const reportPath = '${{ runner.temp }}/tockteam-installed-launcher-smoke-${{ github.run_id }}.json'
    const gatePath = '${{ runner.temp }}/tockteam-installed-launcher-gate-${{ github.run_id }}.json'
    const diagnosticsPath = '${{ runner.temp }}/tockteam-installed-launcher-diagnostics-${{ github.run_id }}.json'
    const uploadPathLines = uploadSection => {
      const pathStart = uploadSection.indexOf('          path:')
      const pathEnd = uploadSection.indexOf('          if-no-files-found:', pathStart)
      if (pathStart < 0 || pathEnd < pathStart) return []
      const lines = uploadSection.slice(pathStart, pathEnd).split('\n').map(line => line.trim()).filter(Boolean)
      const inlinePath = lines[0]?.replace(/^path:\s*/u, '').trim()
      return inlinePath !== undefined && inlinePath !== '' && inlinePath !== '|' ? [inlinePath] : lines.slice(1)
    }
    const evidenceUploadStart = section.indexOf(`      - name: Upload ${job === 'windows-x64' ? 'Windows' : 'Linux'} installed evidence`)
    const evidenceUploadEnd = evidenceUploadStart >= 0 ? section.indexOf('      - name: ', evidenceUploadStart + 1) : -1
    const evidenceUploadSection = evidenceUploadStart >= 0
      ? section.slice(evidenceUploadStart, evidenceUploadEnd >= evidenceUploadStart ? evidenceUploadEnd : undefined)
      : ''
    const pathLines = uploadPathLines(evidenceUploadSection)
    const expectedPaths = [...installerGlobs, reportPath, gatePath]
    failure(failures, JSON.stringify(pathLines) === JSON.stringify(expectedPaths), `${job} upload paths must contain only distributable files, report JSON, and gate log`)
    failure(failures, section.includes(`TOCKTEAM_INSTALLED_SMOKE_DIAGNOSTICS: ${diagnosticsPath}`), `${job} must write diagnostics to the exact run path`)
    const diagnosticsUploadStart = section.indexOf(`      - name: Upload ${job === 'windows-x64' ? 'Windows' : 'Linux'} installed smoke diagnostics`)
    const diagnosticsUploadEnd = diagnosticsUploadStart >= 0 ? section.indexOf('      - name: ', diagnosticsUploadStart + 1) : -1
    const diagnosticsSection = diagnosticsUploadStart >= 0
      ? section.slice(diagnosticsUploadStart, diagnosticsUploadEnd >= diagnosticsUploadStart ? diagnosticsUploadEnd : undefined)
      : ''
    const diagnosticsPathLines = uploadPathLines(diagnosticsSection)
    const expectedDiagnosticsPaths = job === 'linux-x64' ? [diagnosticsPath, '${{ runner.temp }}/tockteam-installed-kernel-diagnostics-${{ github.run_id }}.txt'] : [diagnosticsPath]
    failure(failures, JSON.stringify(diagnosticsPathLines) === JSON.stringify(expectedDiagnosticsPaths), `${job} must upload exact failure diagnostics paths`)
    failure(failures, /if:\s*always\(\)\s*&&\s*steps\.installed-smoke\.outcome == 'failure'/u.test(diagnosticsSection), `${job} must upload failure diagnostics only after installed smoke fails`)
    if (job === 'linux-x64') {
      failure(failures, /gh run download "\$\{\{ inputs\.linux_prior_run_id \}\}"[\s\S]*TOCKTEAM_LINUX_ROLLBACK_DEB:\s*\$\{\{ steps\.prior-deb\.outputs\.path \}\}/u.test(section), `${job} must download and pass the preserved prior deb to the installed smoke`)
      const kernelDiagnosticsPath = '${{ runner.temp }}/tockteam-installed-kernel-diagnostics-${{ github.run_id }}.txt'
      failure(failures, /original_core_pattern="\$\(\/usr\/sbin\/sysctl -n kernel\.core_pattern\)"[\s\S]*trap restore_core_pattern EXIT[\s\S]*\/usr\/bin\/sudo -n \/usr\/sbin\/sysctl -q -w kernel\.core_pattern=\/tmp\/tockteam-core[\s\S]*ulimit -c 0[\s\S]*pnpm test:launcher:installed/u.test(section), `${job} must disable piped and file core dumps before installed smoke, then restore the runner core pattern`)
      failure(failures, section.includes(kernelDiagnosticsPath), `${job} must write kernel diagnostics to the exact run path`)
      failure(failures, /\/usr\/bin\/timeout 10s \/usr\/bin\/sudo -n \/usr\/bin\/dmesg[\s\S]*\/usr\/bin\/tail -n 200/u.test(section), `${job} must capture a bounded, time-limited dmesg tail`)
      failure(failures, /\/usr\/bin\/timeout 10s \/usr\/bin\/sudo -n \/usr\/bin\/journalctl -k --no-pager --lines=200[\s\S]*\/usr\/bin\/tail -n 200/u.test(section), `${job} must record a bounded, time-limited journalctl fallback`)
      failure(failures, new RegExp(`Upload Linux installed smoke diagnostics[\\s\\S]+path:\\s*\\|[\\s\\S]+tockteam-installed-launcher-diagnostics-\\$\\{\\{ github\\.run_id \\}\\}\\.json[\\s\\S]+tockteam-installed-kernel-diagnostics-\\$\\{\\{ github\\.run_id \\}\\}\\.txt`, 'u').test(section), `${job} must upload kernel diagnostics alongside smoke diagnostics`)
    }
  }
  failure(failures, /check-installed-report\.mjs/u.test(text), 'installed evidence workflow must verify the actual installed report')
  failure(failures, /Record installed gate outcomes/u.test(text), 'installed evidence workflow must record deterministic gate outcomes')
  failure(failures, /tockteam-installed-launcher-gate-\$\{\{ github\.run_id \}\}\.json/u.test(text), 'installed evidence workflow must upload deterministic gate outcomes')
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
  failure(failures, /hosted run `33295632276`[\s\S]*(?:Windows[\s\S]*Linux|Linux[\s\S]*Windows)[\s\S]*commit `ed39e301`/iu.test(combined), 'architecture/usage must cite the executed Windows/Linux hosted evidence')
  failure(failures, /Windows Control Panel[^\n]*unavailable/iu.test(combined), 'architecture/usage must retain the hosted Windows Control Panel limitation')
  failure(failures, /Linux[^\n]*rollback[^\n]*workflow-required/iu.test(combined), 'architecture/usage must retain the Linux rollback limitation')
  failure(failures, /notarized/iu.test(combined), 'architecture/usage must distinguish notarized evidence')
  failure(failures, /public distribution/iu.test(combined), 'architecture/usage must distinguish public distribution evidence')
  for (const line of `${architectureText}\n${usageText}`.split(/\r?\n/u)) {
    if (!/(?:Windows|Linux)/u.test(line) || !/published/iu.test(line)) continue
    failure(failures, /\b(?:not|never|unproven|unverified|workflow-required)\b/iu.test(line), `usage makes an unsupported publication claim: ${line}`)
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
  const freshnessResult = inspectInstalledEvidenceFreshness(inputs.catalog)
  const workflowResult = inspectInstalledEvidenceWorkflow(inputs.workflow)
  const failures = [...catalogResult.failures, ...docsResult.failures, ...freshnessResult.failures, ...workflowResult.failures]
  if (failures.length > 0) {
    for (const message of failures) console.error(`- ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`TockTeam installed evidence contract passed: ${catalogResult.summary.rows} rows; checked-in reports are required before platform proof is promoted.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    assert(error instanceof Error)
    console.error(error.message)
    process.exitCode = 1
  })
}
