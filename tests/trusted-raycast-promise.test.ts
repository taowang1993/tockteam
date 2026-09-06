import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'

// This test schedules the adapter's three hooks deterministically, not React reconciliation.
// Configured unchanged-command tests separately exercise the real private React19 singleton.
test('usePromise fences results before debounce and recovers from current service failure', async () => {
  const output = await build({ stdin: { contents: `export { usePromise } from './src/trusted-raycast-compat-utils.ts'; export { advanceQuery } from './src/trusted-raycast-compat-api.ts'`, resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'isolated-hook-scheduler', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'test' }))
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `let state, dependency, cleanup; const ref = {current:0}; export default {useState(initial) {state ??= initial; return [state,next=>{state=next}]},useRef(){return ref},useEffect(effect,deps){if(JSON.stringify(deps)!==dependency){cleanup?.();dependency=JSON.stringify(deps);cleanup=effect()}}}` }))
  } }] })
  const { usePromise, advanceQuery } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`)
  const requests: { resolve: (value: string) => void; reject: (error: Error) => void }[] = []
  const errors: unknown[] = []
  const request = () => new Promise<string>((resolve, reject) => requests.push({ resolve, reject }))
  const render = (query: string) => usePromise(request, [query], { onError: (error: unknown) => errors.push(error) })
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
  advanceQuery('old'); render('old'); await flush()
  advanceQuery('current')
  assert.equal(render('old').isLoading, true)
  requests[0]!.resolve('obsolete'); await flush()
  assert.equal(render('old').data, undefined)
  render('current'); await flush()
  requests[1]!.reject(new Error('service unavailable')); await flush()
  assert.equal(render('current').isLoading, false)
  assert.equal(errors.length, 1)
  advanceQuery('recovery'); render('recovery'); await flush()
  requests[2]!.resolve('translated'); await flush()
  assert.equal(render('recovery').data, 'translated')
  advanceQuery('late error'); render('late error'); await flush(); advanceQuery('next')
  requests[3]!.reject(new Error('obsolete service failure')); await flush()
  assert.equal(errors.length, 1)
  // Return to the previous query inside the debounce window: it must not remain loading forever.
  advanceQuery('late error'); render('late error'); await flush()
  requests[4]!.resolve('repeated query'); await flush()
  assert.equal(render('late error').data, 'repeated query')
})
