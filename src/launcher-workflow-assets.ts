export type LauncherWorkflowImageKey = 'workflow'

export type LauncherWorkflowAsset = Readonly<{
  fileName: 'workflow.png'
  hash: 'baaf4c6eb4f9bdf3f921986eedd5f5186582f5788a2685e765a1321bfc6a5507'
  key: 'workflow'
  source: 'vendor/ueli/assets/Extensions/Workflow/workflow.png'
}>

const asset: LauncherWorkflowAsset = Object.freeze({
  fileName: 'workflow.png',
  hash: 'baaf4c6eb4f9bdf3f921986eedd5f5186582f5788a2685e765a1321bfc6a5507',
  key: 'workflow',
  source: 'vendor/ueli/assets/Extensions/Workflow/workflow.png',
})

export const LAUNCHER_WORKFLOW_ASSETS = Object.freeze([asset])
export const LAUNCHER_WORKFLOW_ASSET_HASHES = Object.freeze({ workflow: asset.hash })
export const LAUNCHER_WORKFLOW_ASSET_URLS = Object.freeze({ workflow: './launcher-assets/workflow.png' })

export function launcherWorkflowAssetUrl(key: string): string | undefined {
  return key === 'workflow' ? LAUNCHER_WORKFLOW_ASSET_URLS.workflow : undefined
}
