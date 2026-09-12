export async function stopOwnedChild(child, graceMs = 500, group = false) {
  if (!group && (child.exitCode !== null || child.signalCode !== null)) return
  const closed = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise(resolve => child.once('close', resolve))
  const signal = name => {
    if (child.pid === undefined) return
    try { group ? process.kill(-child.pid, name) : child.kill(name) } catch (error) { if (error.code !== 'ESRCH' && !(group && error.code === 'EPERM')) throw error }
  }
  signal('SIGTERM')
  // A trusted command can leave a descendant after its leader exits.
  let timer
  const stopped = await Promise.race([closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), graceMs) })])
  clearTimeout(timer)
  if (group || !stopped) signal('SIGKILL')
  try {
    await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Trusted command did not close')), 2000) })])
  } finally { clearTimeout(timer) }
  if (group && child.pid !== undefined) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { process.kill(-child.pid, 0) } catch (error) { if (error.code === 'ESRCH') return; if (error.code !== 'EPERM') throw error }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Trusted command process group did not stop')
  }
}
