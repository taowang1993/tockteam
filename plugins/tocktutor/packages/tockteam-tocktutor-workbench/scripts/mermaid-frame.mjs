import mermaid from 'mermaid'

// This script runs only inside an opaque-origin, script-only sandboxed iframe.
// The frame CSP denies all connections, images and fonts, even if a renderer regresses.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  maxTextSize: 4096,
  maxEdges: 64,
  theme: 'base',
  logLevel: 'fatal',
})

const CHANNEL = 'tocktutor-mermaid'
let nextId = 0
window.addEventListener('message', event => {
  if (event.source !== window.parent) return
  const request = event.data
  if (request?.channel !== CHANNEL || typeof request.id !== 'number' || typeof request.source !== 'string') return
  const id = request.id
  const source = request.source
  if (source.length > 4096 || source.split('\n').length > 100 || /(?:https?:|file:|javascript:|data:)/iu.test(source) || /^\s*(?:click|href|linkStyle|classDef|style|%%\{)/imu.test(source)) {
    window.parent.postMessage({ channel: CHANNEL, id, error: 'unsupported' }, '*')
    return
  }
  const container = document.createElement('div')
  document.body.append(container)
  void mermaid.render(`tocktutor-mermaid-${String(++nextId)}`, source, container).then(({ svg }) => {
    window.parent.postMessage({ channel: CHANNEL, id, svg: svg.length <= 200_000 ? svg : undefined }, '*')
  }).catch(() => {
    window.parent.postMessage({ channel: CHANNEL, id, error: 'invalid' }, '*')
  }).finally(() => { container.remove() })
})
window.parent.postMessage({ channel: CHANNEL, ready: true }, '*')
