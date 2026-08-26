export const MARKETPLACE_CATALOG_REPOSITORY = 'whyihaveyou/dsh-suite'
export const MARKETPLACE_CATALOG_PATH = 'data/plugins.json'

export type MarketplaceAuthStatus = 'ready' | 'missing-cli' | 'signed-out' | 'error'
export type MarketplaceMechanism = 'bundle' | 'repository' | 'discover' | 'unsupported'
export type MarketplaceInstallMechanism = 'bundle' | 'repository'
export type MarketplaceAction = 'install' | 'update' | 'enable' | 'disable' | 'uninstall'
export type MarketplaceRuntimeRisk = 'profile-bundle' | 'trusted-host' | 'guided'
export type MarketplaceTrust = 'organization' | 'community' | 'untrusted'
export type MarketplaceRiskLevel = 'low' | 'elevated' | 'high' | 'blocked'
export type MarketplaceRiskReason =
  | 'install-scripts'
  | 'trusted-host-code'
  | 'source-change'
  | 'protected-plugin'
export type MarketplaceSourceReview = 'first-use' | 'matched' | 'changed'
export type MarketplaceConfirmation =
  | 'allow-build-scripts'
  | 'accept-high-risk'
  | 'accept-source-change'

const PROTECTED_PLUGIN_IDS = new Set([
  'better-sidebar-runtime',
  'desktop',
  'desktop-sidebar',
  'dsh-better-sidebar',
  'sidebar',
  'tockteam-desktop',
  'tockteam-skins',
  'tockteam-note-vault-tools',
  'tockteam-tocktutor',
  'tockbot-note-desktop',
  'tockbot-note-runtime',
  'tockbot-note-vault',
  'tockbot-web-clip',
  'tocktutor',
  'tocktutor-assistant',
  'tocktutor-import-export',
  'tocktutor-workbench',
  'note-vault-runtime',
  'note-vault-tools',
  'web-clip',
  'panel-controls',
  'pinned-summary',
  'plugin-marketplace',
  'workspace-tools',
])

const PROTECTED_PLUGIN_PACKAGES = new Set([
  '@tockteam/better-sidebar-runtime',
  '@tockteam/desktop',
  '@tockteam/desktop-sidebar',
  '@tockteam/panel-controls',
  '@tockteam/sidebar',
  '@tockteam/skins',
  '@tockteam/pinned-summary',
  '@tockteam/plugin-marketplace',
  '@tockteam/note-vault-tools',
  '@tockteam/tocktutor',
  '@tockteam/tocktutor-assistant',
  '@tockteam/tocktutor-import-export',
  '@tockteam/tocktutor-workbench',
  'tockbot-note-desktop',
  'tockbot-note-runtime',
  'tockbot-note-vault',
  'tockbot-web-clip',
  'dsh-better-sidebar',
])

const PROTECTED_PLUGIN_REPOSITORIES = new Set([
  'dsh-external/dsh-better-sidebar',
  'omdsh-dev/dsh-better-sidebar',
])

/** Marketplace code cannot replace the desktop or its transaction owner. */
export function isProtectedMarketplacePlugin(
  pluginId: string,
  repository?: string,
  packageName?: string,
): boolean {
  return PROTECTED_PLUGIN_IDS.has(pluginId.toLowerCase())
    || (repository !== undefined
      && PROTECTED_PLUGIN_REPOSITORIES.has(repository.toLowerCase()))
    || (packageName !== undefined
      && PROTECTED_PLUGIN_PACKAGES.has(packageName.toLowerCase()))
}

export interface MarketplacePlugin {
  category: string
  description: string
  currentCommit: string | null
  enabled: boolean
  id: string
  installed: boolean
  latestCommit: string | null
  mechanism: MarketplaceMechanism
  protected: boolean
  pushedAt: string | null
  repository: string
  runtimeRisk: MarketplaceRuntimeRisk
  tags: string[]
  title: string
  trust: MarketplaceTrust
  updateAvailable: boolean
  url: string
}

export interface MarketplaceInstalledPlugin {
  installedAt: string
  mechanism: MarketplaceInstallMechanism
  packageName: string | null
  pluginId: string
  resolvedCommit: string
  source: string
}

export interface MarketplaceSourceLock {
  canonicalSource: string
  firstSeenCommit: string
  manifestHash: string
  mechanism: MarketplaceInstallMechanism
  packageName: string
  pluginId: string
  recordedAt: string
  resolvedCommit: string
}

export interface MarketplacePlan {
  action: MarketplaceAction
  buildScripts: Record<string, string>
  description: string
  mechanism: MarketplaceInstallMechanism
  packageName: string | null
  pluginId: string
  manifestHash: string
  requirements: MarketplaceConfirmation[]
  repository: string
  resolvedCommit: string
  riskLevel: MarketplaceRiskLevel
  riskReasons: MarketplaceRiskReason[]
  source: string
  sourceReview: MarketplaceSourceReview
}

export interface MarketplacePreview {
  action: MarketplaceAction
  pluginId: string
  resolvedCommit: string
  startedAt: string
  transactionId: string
}

export interface MarketplaceRecoveryPoint {
  appliedAt: string
  pluginId: string
  transactionId: string
}

export interface MarketplaceLifecycle {
  candidate: MarketplacePreview | null
  current: {
    profile: string
    state: 'live'
  }
  previous: MarketplaceRecoveryPoint | null
}

export interface MarketplaceSnapshot {
  auth: {
    detail: string
    status: MarketplaceAuthStatus
  }
  busy: boolean
  catalog: MarketplacePlugin[]
  catalogGeneratedAt: string | null
  error: string | null
  installed: MarketplaceInstalledPlugin[]
  lastAction: string | null
  lifecycle: MarketplaceLifecycle
  plan: MarketplacePlan | null
  preview: MarketplacePreview | null
  sourceLocks: MarketplaceSourceLock[]
  undoAvailable: boolean
}

export interface MarketplacePlanIdentity {
  action: MarketplaceAction
  manifestHash: string
  pluginId: string
  resolvedCommit: string
}

export type MarketplaceCommand =
  | { type: 'refresh' }
  | { type: 'inspect'; action: MarketplaceAction; pluginId: string }
  | { type: 'prepare'; action: MarketplaceAction; pluginId: string }
  | {
    type: 'preview'
    confirmations?: MarketplaceConfirmation[]
    expectedPlan?: MarketplacePlanIdentity
    /** @deprecated Accepted while older renderers reconnect during an upgrade. */
    allowBuildScripts?: boolean
  }
  | { type: 'discard' }
  | { type: 'apply'; expectedTransactionId?: string }
  | { type: 'undo' }

export interface PluginMarketplaceBridge {
  dispatch(command: MarketplaceCommand): Promise<MarketplaceSnapshot>
  getSnapshot(): Promise<MarketplaceSnapshot>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate untrusted renderer input before it reaches filesystem operations. */
export function parseMarketplaceCommand(value: unknown): MarketplaceCommand {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('marketplace command must be an object with a type')
  }
  if (value.type === 'refresh' || value.type === 'discard' || value.type === 'undo') {
    return { type: value.type }
  }
  if (value.type === 'apply') {
    if (Object.keys(value).some(key => key !== 'type' && key !== 'expectedTransactionId')
      || value.expectedTransactionId !== undefined
        && (typeof value.expectedTransactionId !== 'string' || value.expectedTransactionId.length === 0)) {
      throw new Error('invalid marketplace apply command')
    }
    return {
      type: 'apply',
      ...(value.expectedTransactionId === undefined ? {} : {
        expectedTransactionId: value.expectedTransactionId,
      }),
    }
  }
  if (value.type === 'inspect' || value.type === 'prepare') {
    if (!['install', 'update', 'enable', 'disable', 'uninstall'].includes(String(value.action))
      || typeof value.pluginId !== 'string') {
      throw new Error('invalid marketplace inspect command')
    }
    return {
      type: value.type,
      action: value.action as MarketplaceAction,
      pluginId: value.pluginId,
    }
  }
  if (value.type === 'preview') {
    if (Object.keys(value).some(key => !['allowBuildScripts', 'confirmations', 'expectedPlan', 'type'].includes(key))) {
      throw new Error('invalid marketplace preview command')
    }
    const valid = new Set<MarketplaceConfirmation>([
      'allow-build-scripts',
      'accept-high-risk',
      'accept-source-change',
    ])
    if (value.confirmations !== undefined
      && (!Array.isArray(value.confirmations)
        || value.confirmations.some(entry => typeof entry !== 'string'
          || !valid.has(entry as MarketplaceConfirmation)))) {
      throw new Error('invalid marketplace preview confirmations')
    }
    if (value.allowBuildScripts !== undefined
      && typeof value.allowBuildScripts !== 'boolean') {
      throw new Error('invalid marketplace preview compatibility flag')
    }
    let expectedPlan: MarketplacePlanIdentity | undefined
    if (value.expectedPlan !== undefined) {
      if (!isRecord(value.expectedPlan)
        || Object.keys(value.expectedPlan).some(key => !['action', 'manifestHash', 'pluginId', 'resolvedCommit'].includes(key))
        || typeof value.expectedPlan.pluginId !== 'string'
        || !['install', 'update', 'enable', 'disable', 'uninstall'].includes(String(value.expectedPlan.action))
        || typeof value.expectedPlan.manifestHash !== 'string'
        || typeof value.expectedPlan.resolvedCommit !== 'string') {
        throw new Error('invalid marketplace preview plan identity')
      }
      expectedPlan = value.expectedPlan as unknown as MarketplacePlanIdentity
    }
    const confirmations = Array.isArray(value.confirmations)
      ? value.confirmations as MarketplaceConfirmation[]
      : value.allowBuildScripts === true
        ? ['allow-build-scripts'] satisfies MarketplaceConfirmation[]
        : [] satisfies MarketplaceConfirmation[]
    return {
      type: 'preview',
      confirmations,
      ...(expectedPlan === undefined ? {} : { expectedPlan }),
    }
  }
  throw new Error(`unsupported marketplace command: ${value.type}`)
}
