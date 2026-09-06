export async function stopOwnedChild(child, graceMs = 500) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise(resolve => { child.once('close', resolve) })
  child.kill('SIGTERM')
  const stopped = await Promise.race([closed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), graceMs))])
  if (!stopped && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  if (!stopped) await closed
}
