import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { parseTrustedRaycastResult } from '../src/trusted-raycast-tracer-contract.ts'
import { stopOwnedChild } from './trusted-raycast-process.mjs'

const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR || '/tmp/tockteam-trusted-raycast-translate-artifact.tar'
const expected = '7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac'
const bytes = readFileSync(artifact)
const actual = createHash('sha256').update(bytes).digest('hex')
if (actual !== expected) throw new Error(`artifact digest mismatch: ${actual}`)
const work = mkdtempSync(join(tmpdir(), 'tockteam-raycast-tracer-'))
let childProcess
try {
  execFileSync('/usr/bin/tar', ['xf', '-', '-C', work], { input: bytes })
  const root = join(work, 'tockteam-raycast-artifact')
  symlinkSync(join(root, 'runtime', 'node_modules'), join(work, 'node_modules'))
  mkdirSync(join(work, 'tmp'), { recursive: true })
  const child = readFileSync(new URL('../src/trusted-raycast-child.ts', import.meta.url), 'utf8')
    .replace('/tmp/trusted-raycast-source', join(root, 'source'))
  const api = new URL('../src/trusted-raycast-compat-api.ts', import.meta.url).pathname
  const utils = new URL('../src/trusted-raycast-compat-utils.ts', import.meta.url).pathname
  writeFileSync(join(work, 'child.ts'), child)
  await build({ entryPoints: [join(work, 'child.ts')], outfile: join(work, 'child.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node24', external: ['react', 'react-reconciler', 'google-tts-api', 'https-proxy-agent', 'undici', 'axios'], alias: { '@raycast/api': api, '@raycast/utils': utils }, logLevel: 'silent' })
  childProcess = spawn(process.execPath, [join(work, 'child.mjs')], {
    cwd: work,
    env: { PATH: process.env.PATH, HOME: work, TMPDIR: join(work, 'tmp'), TMP: join(work, 'tmp'), TEMP: join(work, 'tmp'), NODE_PATH: join(work, 'node_modules'), TRUSTED_RAYCAST_FORCE_NO_RESULT: process.env.TRUSTED_RAYCAST_FORCE_NO_RESULT, TRUSTED_RAYCAST_CHILD_DEADLINE_MS: process.env.TRUSTED_RAYCAST_CHILD_DEADLINE_MS },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''; let stderr = ''; let outputOverflow = false
  childProcess.stdout.on('data', chunk => { const text = chunk.toString('utf8'); if (stdout.length + text.length > 1024 * 1024) outputOverflow = true; else stdout += text; process.stdout.write(text.slice(0, Math.max(0, 1024 * 1024 - stdout.length))) })
  childProcess.stderr.on('data', chunk => { const text = chunk.toString('utf8'); if (stderr.length + text.length > 64 * 1024) outputOverflow = true; else stderr += text; process.stderr.write(text.slice(0, Math.max(0, 64 * 1024 - stderr.length))) })
  const timer = setTimeout(() => { void stopOwnedChild(childProcess) }, 16000)
  await new Promise((resolve, reject) => {
    const fail = error => { void stopOwnedChild(childProcess).finally(() => reject(error)) }
    childProcess.once('error', fail)
    childProcess.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`child exited ${code ?? signal}: ${stderr}`))
      if (outputOverflow) return reject(new Error('trusted Raycast tracer output exceeded its bound'))
      try { parseTrustedRaycastResult(stdout, 'TockTeam compatibility tracer: hello world'); resolve() } catch (error) { reject(error) }
    })
  })
} finally {
  if (childProcess) await stopOwnedChild(childProcess)
  rmSync(work, { recursive: true, force: true })
}
