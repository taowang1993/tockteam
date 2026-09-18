import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Called inside the existing bounded/inventoried native worker. No substituted
// owner: the bundled launcher resolves the fresh runtime's public package entry.
export async function verifyWindowsWorkflows({ installation, root, observe, waitResult, release, waitFile, checkpoint, receipt }) {
  const { runBoundedWorkflowCommand } = await import(pathToFileURL(join(installation, 'workflow-proof.mjs')).href)
  receipt.workflows = []
  // Fixed diagnostic sample, not retries until green. Every attempt is retained;
  // stop at the first violated settlement assertion.
  const modes = ['arguments', ...Array(8).fill('normal-exit'), 'cancel', 'timeout', 'overflow', 'exit-code']
  for (const [attempt, mode] of modes.entries()) {
    const item = { mode, attempt, passed: false, publicInstalledOwner: true }
    receipt.workflows.push(item)
    await checkpoint(`workflow-${mode}`)
    const folder = join(root, `workflow ${mode}-${attempt}`); await mkdir(folder)
    const ready = join(folder, 'ready.json'), exit = join(folder, 'release'), entry = join(folder, 'fixture.cjs'), marker = join(folder, 'shell marker.txt')
    const descendant = "process.send(process.pid);process.disconnect();setInterval(()=>{},1000)"
    await writeFile(entry, `const fs=require('node:fs');
const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
child.once('message',pid=>{
fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({cmdPid:process.ppid,rootPid:process.pid,descendantPid:pid,args:process.argv.slice(2),cwd:process.cwd(),leak:process.env.OWNER_SHOULD_NOT_INHERIT??null}));
const tick=setInterval(()=>{if(fs.existsSync(${JSON.stringify(exit)})){
${mode === 'overflow' ? "process.stdout.write('x'.repeat(16384))" : `clearInterval(tick);process.stdout.write('hello',()=>process.stderr.write('error',()=>process.exit(${mode === 'exit-code' ? 7 : 0})))`}
}},10);
});`, { flag: 'wx' })
    const controller = new AbortController(), handles = []
    const command = `"${process.execPath}" "${entry}" "a b" "中文" "" "literal&value"${mode === 'arguments' ? ` && echo shell-ok > "${marker}"` : ''}`
    const pending = runBoundedWorkflowCommand({ command, platform: 'Windows', signal: controller.signal, workingDirectory: folder }, {
      runtimeRoot: installation, timeoutMs: mode === 'timeout' ? 5000 : 10000, maxOutputBytes: mode === 'overflow' ? 1024 : 65536,
    })
    // Observe rejection immediately, but never race away the runner's cleanup.
    void pending.catch(() => {})
    let fixture, result, operationError
    const sampleWaits = samples => {
      // Preallocated records keep diagnostic allocation out of the native samples.
      samples[0].waitResult = waitResult(handles[0])
      samples[1].waitResult = waitResult(handles[1])
      samples[2].waitResult = waitResult(handles[2])
      return samples
    }
    try {
      fixture = JSON.parse(await waitFile(ready)); Object.assign(item, fixture)
      assert.deepEqual(fixture.args, ['a b', '中文', '', 'literal&value'])
      assert.equal(fixture.cwd, folder); assert.equal(fixture.leak, null)
      for (const pid of [fixture.cmdPid, fixture.rootPid, fixture.descendantPid]) {
        assert.ok(Number.isSafeInteger(pid) && pid > 0); handles.push(observe(pid))
      }
      const identities = [['cmd', fixture.cmdPid], ['node', fixture.rootPid], ['descendant', fixture.descendantPid]]
      item.waitResults = identities.map(([role, pid]) => ({ role, pid, waitResult: null }))
      item.beforeWaitResults = sampleWaits(identities.map(([role, pid]) => ({ role, pid, waitResult: null })))
      assert.ok(item.beforeWaitResults.every(sample => sample.waitResult === 258), 'fixture processes must be live before the action')
      if (mode === 'arguments') {
        await writeFile(join(root, 'workflow-shell.ready'), String(fixture.cmdPid), { flag: 'wx' })
        console.log('\nWORKFLOW_SHELL_READY')
        await waitFile(join(root, 'workflow-shell.seen'))
      }
      if (mode === 'cancel') controller.abort()
      else if (mode !== 'timeout') await writeFile(exit, 'release', { flag: 'wx' })
      try { result = await pending } catch (error) { operationError = error }
      // Fixed synchronous samples for every retained identity, before any assertion
      // or I/O. Do not retry, poll, or hide a transient settlement failure.
      sampleWaits(item.waitResults)
      item.result = result; item.operationError = operationError?.message
      for (const sample of item.waitResults) assert.equal(sample.waitResult, 0, `workflow returned before ${sample.role} (${sample.pid}) signaled`)
      if (mode === 'arguments' || mode === 'normal-exit') {
        assert.equal(operationError, undefined); assert.deepEqual(result, { stdoutBytes: 5, stderrBytes: 5 })
      } else assert.match(operationError?.message ?? '', mode === 'cancel' ? /cancelled/ : mode === 'timeout' ? /timed out/ : mode === 'overflow' ? /output limit/ : /command failed/)
      if (mode === 'arguments') assert.equal((await readFile(marker, 'utf8')).trim(), 'shell-ok')
    } catch (error) { item.failure = error.message; throw error } finally {
      controller.abort(); await pending.catch(() => {})
      const failures = []
      for (const handle of handles) { try { release(handle) } catch (error) { failures.push(error) } }
      if (failures.length) { item.cleanupErrors = failures.map(error => error.message); throw new AggregateError(failures, 'Workflow observer cleanup failed') }
    }
    item.passed = true; item.retainedHandlesSignaled = true
  }
}
