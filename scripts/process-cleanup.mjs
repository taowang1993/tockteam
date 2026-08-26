function delay(milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { resolve('timeout') }, milliseconds)
    timer.unref()
  })
}

export async function stopChildProcess(child, graceMs = 5_000, killMs = 1_000) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise(resolve => { child.once('close', () => { resolve('closed') }) })
  child.kill('SIGTERM')
  if (await Promise.race([closed, delay(graceMs)]) === 'closed') return
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  if (await Promise.race([closed, delay(killMs)]) !== 'closed'
    && child.exitCode === null && child.signalCode === null) {
    throw new Error('child process did not stop after SIGKILL')
  }
}
