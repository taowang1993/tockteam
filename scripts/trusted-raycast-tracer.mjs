import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTrustedRaycast } from './trusted-raycast-build.mjs'
import { TrustedRaycastManager } from '../src/trusted-raycast-manager.ts'
import { parseTrustedRaycastResult } from '../src/trusted-raycast-tracer-contract.ts'

// Test driver only. The interactive runtime never supplies its own search text.
const artifact = process.env.TRUSTED_RAYCAST_ARTIFACT_TAR
if (!artifact) throw new Error('Set TRUSTED_RAYCAST_ARTIFACT_TAR to the reviewed artifact')
const work = mkdtempSync(join(tmpdir(), 'tockteam-raycast-tracer-'))
const input = 'TockTeam compatibility tracer: hello world'
let latest
let result
let failure
const manager = new TrustedRaycastManager({
  runtimeDir: join(work, 'trusted-raycast'), nodePath: process.execPath,
  onMessage: (_, message) => {
    latest = message
    if (message.type === 'error') failure = message.message
    const visit = node => {
      if (node.type === 'raycast-list-item' && typeof node.props.title === 'string' && /[\u3400-\u9fff]/u.test(node.props.title)) result = { input, translated: node.props.title, target: 'zh-CN' }
      for (const child of node.children) if (typeof child !== 'string') visit(child)
    }
    if (message.root) visit(message.root)
  },
})
try {
  await buildTrustedRaycast(work, artifact)
  await manager.start({ webContentsId: 1 }, { sessionId: 'tracer', generation: '1', command: 'translate', preferences: {} })
  process.stdout.write('READY\n')
  if (process.env.TRUSTED_RAYCAST_FORCE_NO_RESULT !== '1') manager.send({ webContentsId: 1 }, { sessionId: latest.sessionId, generation: latest.generation, revision: latest.revision, eventId: latest.root.props.searchEventId, kind: 'searchChanged', value: input })
  const deadline = Date.now() + Number(process.env.TRUSTED_RAYCAST_CHILD_DEADLINE_MS ?? 15000)
  while (!result && !failure && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
  if (!result) throw new Error(failure ?? 'trusted Raycast child deadline: no validated translation result')
  const output = `RESULT ${JSON.stringify(result)}\n`
  parseTrustedRaycastResult(output, input)
  process.stdout.write(output)
} finally { await manager.close(); rmSync(work, { recursive: true, force: true }) }
