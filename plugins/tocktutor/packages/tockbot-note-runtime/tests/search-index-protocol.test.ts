import assert from 'node:assert/strict'
import test from 'node:test'
import { connectIndexPeer, listenForIndexPeer } from '../src/search-index-auth.ts'
import { IndexProtocol } from '../src/search-index-protocol.ts'

async function pair() {
  const listener = await listenForIndexPeer(new AbortController().signal)
  try {
    const child = await connectIndexPeer(listener.bootstrap, new AbortController().signal)
    return { listener, child, host: await listener.peer }
  } catch (error) { await listener.close(); throw error }
}

for (const [name, body] of [
  ['generation', { type: 'request', id: 1, action: 'inventory', args: null, generation: '0'.repeat(32) }],
  ['sequence', { type: 'request', id: 1, action: 'inventory', args: null, sequence: 2 }],
  ['unknown action', { type: 'request', id: 1, action: 'sql', args: 'DROP TABLE documents' }],
  ['missing fields', { type: 'request', id: 1, action: 'inventory' }],
  ['unknown response identity', { type: 'page', id: 1, page: 0, items: [], done: true, meta: null }],
  ['unsolicited acknowledgement', { type: 'ack', id: 1, page: 0 }],
] as const) {
  test(`protocol rejects ${name} before invoking a request handler`, async () => {
    const { listener, child, host } = await pair()
    const failure = Promise.withResolvers<Error>()
    let invoked = false
    const protocol = new IndexProtocol(host, async () => { invoked = true; return { items: [], meta: null } }, () => {}, failure.resolve)
    try {
      await child.channel.send({ generation: child.generation, sequence: 1, ...body })
      assert.ok(await failure.promise)
      assert.equal(invoked, false)
    } finally { protocol.close(); child.channel.close(); await listener.close() }
  })
}

for (const [name, items, limit, maxBytes] of [
  ['oversized page', Array(257).fill('row'), 300, 10000],
  ['entry ceiling', ['row', 'row'], 1, 10000],
  ['byte ceiling', ['a'.repeat(100)], 10, 20],
] as const) {
  test(`protocol rejects ${name} without publishing partial data`, async () => {
    const { listener, child, host } = await pair()
    const protocol = new IndexProtocol(host, async () => { throw new Error('unexpected demand') }, () => {}, () => {})
    const result = assert.rejects(protocol.request('inventory', {}, limit, maxBytes))
    try {
      const request = (await child.channel.frames.next()).value as { id: number }
      await child.channel.send({ generation: child.generation, sequence: 1, type: 'page', id: request.id, page: 0, items, done: true, meta: true })
      await result
    } finally { protocol.close(); child.channel.close(); await listener.close() }
  })
}

test('cancelling a search sends its identity without prematurely freeing its request slot', async t => {
  const { listener, child, host } = await pair()
  const sent: unknown[] = []
  const send = host.channel.send.bind(host.channel)
  t.mock.method(host.channel, 'send', async (value: unknown) => { sent.push(value); await send(value) })
  const protocol = new IndexProtocol(host, async () => { throw new Error('unexpected demand') }, () => {}, () => {})
  const controller = new AbortController()
  const pending = [protocol.request('search', {}, 1, 1024, controller.signal), ...Array.from({ length: 3 }, () => protocol.request('search', {}, 1, 1024))]
  const settled = Promise.allSettled(pending)
  try {
    controller.abort()
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(sent.some(value => (value as { type: string; id: number }).type === 'cancel' && (value as { id: number }).id === 1))
    await assert.rejects(protocol.request('search', {}, 1, 1024), /limit/u)
  } finally { protocol.close(); await settled; child.channel.close(); await listener.close() }
})

test('protocol bounds requests until their terminal response, including abandoned callers', async () => {
  const { listener, child, host } = await pair()
  const protocol = new IndexProtocol(host, async () => { throw new Error('unexpected demand') }, () => {}, () => {})
  const pending = Array.from({ length: 4 }, () => protocol.request('search', {}, 1, 1024))
  const settled = Promise.allSettled(pending)
  try {
    await assert.rejects(protocol.request('search', {}, 1, 1024), /limit/u)
    protocol.close()
    assert.equal((await settled).filter(result => result.status === 'rejected').length, 4)
  } finally { protocol.close(); child.channel.close(); await listener.close() }
})

test('an unacknowledged data page blocks the next page and expires within the transfer bound', async t => {
  const { listener, child, host } = await pair()
  const failure = Promise.withResolvers<Error>()
  const protocol = new IndexProtocol(host, async () => ({ items: Array(300).fill('row'), meta: true }), () => {}, failure.resolve)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await child.channel.send({ generation: child.generation, sequence: 1, type: 'request', id: 1, action: 'inventory', args: {} })
    const first = (await child.channel.frames.next()).value as { items: unknown[]; done: boolean }
    assert.equal(first.items.length, 256)
    assert.equal(first.done, false)
    t.mock.timers.tick(15000)
    assert.match((await failure.promise).message, /acknowledgement stalled/u)
  } finally { protocol.close(); child.channel.close(); await listener.close() }
})
