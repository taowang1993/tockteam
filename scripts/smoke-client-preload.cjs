const { contextBridge } = require('electron')

let pendingDispatch

const emptyMarketplaceSnapshot = Object.freeze({
  auth: { detail: 'client smoke', status: 'ready' },
  busy: false,
  catalog: [],
  catalogGeneratedAt: null,
  error: null,
  installed: [],
  lastAction: null,
  lifecycle: {
    candidate: null,
    current: { profile: 'desktop', state: 'live' },
    previous: null,
  },
  plan: null,
  preview: null,
  sourceLocks: [],
  undoAvailable: false,
})

contextBridge.exposeInMainWorld('dshDesktop', Object.freeze({
  chooseWorkspace: async () => [],
  getInfo: async () => ({
    appDataPath: '',
    dshHome: '',
    platform: process.platform,
    preview: null,
    profile: 'desktop',
    version: 'smoke',
  }),
  getRuntimeSnapshot: async () => ({
    bundledPlugins: [],
    logTail: [],
    profile: 'desktop',
    runtimeUrl: null,
    status: 'ready',
  }),
  onCommand: () => () => {},
  openExternal: async () => {},
  pluginMarketplace: Object.freeze({
    dispatch: async () => emptyMarketplaceSnapshot,
    getSnapshot: async () => emptyMarketplaceSnapshot,
  }),
  tockTutor: Object.freeze({
    authorize: async () => ({ authorization: 'smoke-opaque' }),
    cancelDispatch: async () => {
      pendingDispatch?.(null)
      pendingDispatch = undefined
    },
    completeDispatch: async () => 'stale',
    nextDispatch: async () => await new Promise(resolve => { pendingDispatch = resolve }),
  }),
}))
