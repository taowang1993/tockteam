import { apply } from '../../plugins/sidebar/src/client/plugin.tsx'
import { TOCKTEAM_SURFACE_VIEW_SERVICE } from '../../plugins/shared/surface.ts'
import { DEFAULT_SIDEBAR_PREFERENCES, parseSidebarPreferences } from '../../plugins/sidebar/src/sidebar-preferences.ts'

// Real sidebar plugin and React UI; only DSH services and HTTP responses are fixtures.
const listeners = new Set<() => void>()
let current = 'first'
let snapshot = { current, byId: { first: { cwd: '/first' }, second: { cwd: '/second' } } }
const services = new Map<string, any>()
const disposers: Array<() => void> = []
const pendingFacts: Array<() => void> = []
const pendingDiffs: Array<() => void> = []
const pendingTrees: Array<() => void> = []
let holdFacts = false
let holdDiffs = false
let holdTrees = false
const longFilename = `${'a'.repeat(245)}.txt`
let preferences = DEFAULT_SIDEBAR_PREFERENCES
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const facts = (cwd: string) => ({ cwd, root: cwd, name: cwd.slice(1), kind: 'repository', ahead: 0, behind: 0, hasRemote: false })
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.href)
  if (url.pathname === '/tockteam/sidebar/preferences') {
    if (init?.method === 'PUT') {
      const next = parseSidebarPreferences(JSON.parse(String(init.body)))
      if (next === undefined) return new Response('invalid preferences', { status: 400 })
      preferences = next
    }
    return json(preferences)
  }
  if (url.pathname === '/tockteam/workspace') {
    const value = facts(url.searchParams.get('cwd')!)
    if (holdFacts) {
      holdFacts = false
      await new Promise<void>(resolve => { pendingFacts.push(resolve) })
    }
    return json(value)
  }
  const payload = JSON.parse(String(init?.body ?? '{}'))
  let value: unknown = {}
  if (url.pathname.endsWith('/git.status')) value = { isRepo: true, branch: payload.sessionId, entries: [{ path: 'one.ts', xy: ' M' }, { path: 'two.ts', xy: ' M' }, { path: 'partial.ts', xy: 'MM' }] }
  if (url.pathname.endsWith('/git.branch')) value = { current: payload.sessionId, names: [payload.sessionId] }
  if (url.pathname.endsWith('/git.log')) value = []
  if (url.pathname.endsWith('/settings.get')) value = { revision: 0, value: {} }
  if (url.pathname.endsWith('/fs.tree')) {
    const folder = `${payload.cwd}/folder\\name`
    const entries = payload.path === payload.cwd
      ? [
          { name: `${payload.sessionId}.ts`, path: `${payload.cwd}/${payload.sessionId}.ts`, isDir: false, hidden: false },
          { name: longFilename, path: `${payload.cwd}/${longFilename}`, isDir: false, hidden: false },
          { name: 'folder\\name', path: folder, isDir: true, hidden: false },
        ]
      : payload.path === folder
        ? [{ name: 'child', path: `${folder}/child`, isDir: true, hidden: false }]
        : []
    if (![payload.cwd, folder, `${folder}/child`].includes(payload.path)) {
      return json({ ok: false, error: { message: 'Directory does not exist' } })
    }
    value = { path: payload.path, entries, truncated: false }
    if (holdTrees) {
      holdTrees = false
      await new Promise<void>(resolve => { pendingTrees.push(resolve) })
    }
  }
  if (url.pathname.endsWith('/fs.read')) value = { kind: 'text', content: 'Long filename file contents', truncated: false }
  if (url.pathname.endsWith('/git.diff')) {
    value = { diff: payload.path === 'partial.ts' ? `${payload.staged ? 'staged' : 'unstaged'} partial.ts` : `diff for ${payload.path}` }
    if (holdDiffs) {
      holdDiffs = false
      await new Promise<void>(resolve => { pendingDiffs.push(resolve) })
    }
  }
  return json({ ok: true, value })
}
const subscribe = () => () => {}
services.set('sessions', {
  list: { getSnapshot: () => snapshot, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) } },
  binding: () => undefined,
})
services.set('locale', { bind: () => (key: string) => key, register: subscribe, subscribe, getSnapshot: () => ({ revision: 0 }) })
services.set('slots', { inject: () => {} })
services.set('inputTriggers', { registerSource: subscribe })
services.set(TOCKTEAM_SURFACE_VIEW_SERVICE, { kind: 'web' })
services.set('desktopPanels', { subscribe, isBottomPanelOpen: () => false, setAutoOpenTerminal: () => {} })
services.set('pinnedSummary', { subscribe, setOpen: () => {}, isOpen: () => false })
services.set('workspaces', { openPath: async () => {}, startSession: () => {} })
apply({
  get: name => services.get(name),
  effect: fn => { const dispose = fn(); if (dispose) disposers.push(dispose) },
  reflect: { provide: (name, value) => { services.set(name, value); return () => { services.delete(name) } } },
})
Object.assign(window, { panelProof: {
  open: () => services.get('workspaceTools').openReview(),
  select: (id: 'first' | 'second') => {
    current = id
    snapshot = { ...snapshot, current }
    for (const listener of listeners) listener()
    services.get('workspaceTools').openReview()
  },
  ready: () => services.get('desktopSidebar').getSnapshot().ready,
  holdFacts: () => { holdFacts = true },
  releaseFacts: () => { for (const release of pendingFacts.splice(0)) release() },
  factsPending: () => pendingFacts.length,
  holdDiffs: () => { holdDiffs = true },
  releaseDiffs: () => { for (const release of pendingDiffs.splice(0)) release() },
  diffsPending: () => pendingDiffs.length,
  openFiles: () => services.get('workspaceTools').openFiles(),
  holdTrees: () => { holdTrees = true },
  releaseTrees: () => { for (const release of pendingTrees.splice(0)) release() },
  treesPending: () => pendingTrees.length,
  preferences: () => preferences,
  dispose: () => { for (const dispose of disposers.reverse()) dispose() },
} })
