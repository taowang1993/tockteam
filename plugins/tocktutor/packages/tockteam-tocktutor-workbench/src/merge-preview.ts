import { mergeNotes } from './composer.ts'
import { isSafeVaultRelativePath } from './session.ts'
import type { MergeLinkPreviewRequest, MergeLinkPreviewResult, OpenDocumentResult, VaultReference } from './types.ts'

export type MergeSourceDisposition = 'keep' | 'trash' | 'link' | 'embed'

export interface NoteMergePreviewInput {
  expectedVault: VaultReference
  source: OpenDocumentResult
  destination: OpenDocumentResult
  placement: 'append' | 'prepend'
  propertyChoices?: Readonly<Record<string, 'source' | 'destination'>>
  sourceDisposition: MergeSourceDisposition
}

export type NoteMergeOptions = Pick<NoteMergePreviewInput, 'placement' | 'propertyChoices' | 'sourceDisposition'>

/** Saved documents with a route-owned lifetime. Apply requires the exact latest Host-reviewed preview. */
export interface PreparedNoteMerge {
  source: OpenDocumentResult
  destination: OpenDocumentResult
  signal: AbortSignal
  preview(options: NoteMergeOptions, signal: AbortSignal): Promise<NoteMergePreview>
  apply?(preview: NoteMergePreview, signal: AbortSignal): Promise<import('./types.ts').MergeResult>
}

export interface NoteMergePreview {
  request: MergeLinkPreviewRequest
  plan: MergeLinkPreviewResult
  destinationContent: string
  /** Null means no source replacement text: retain it unchanged or move it to trash. */
  sourceContent: string | null
  sourceDisposition: MergeSourceDisposition
}

/** Read-only review data, never apply authorization. The route must save drafts first and invalidate on owner changes. */
export async function previewNoteMerge(
  input: NoteMergePreviewInput,
  read: (request: MergeLinkPreviewRequest, signal: AbortSignal) => Promise<MergeLinkPreviewResult>,
  signal: AbortSignal,
): Promise<NoteMergePreview> {
  signal.throwIfAborted()
  const source = { ...input.source }, destination = { ...input.destination }, expectedVault = { ...input.expectedVault }
  const { placement, sourceDisposition } = input
  if (!['keep', 'trash', 'link', 'embed'].includes(sourceDisposition)
    || source.generation !== expectedVault.generation || destination.generation !== expectedVault.generation) throw new Error('Merge preview inputs are stale or invalid.')
  const options = {
    sourcePath: source.path, destinationPath: destination.path, placement,
    leftover: sourceDisposition === 'link' || sourceDisposition === 'embed' ? sourceDisposition : 'none' as const,
    ...(input.propertyChoices === undefined ? {} : { propertyChoices: { ...input.propertyChoices } }),
  }
  let composed = mergeNotes({ ...options, source: source.content, destination: destination.content })
  // Rebasing can change text. Replan once against that exact text, then require a stable result.
  for (let round = 0; round < 2; round++) {
    const request: MergeLinkPreviewRequest = {
      expectedVault, sourcePath: source.path, destinationPath: destination.path,
      expectedSourceRevision: source.revision, expectedDestinationRevision: destination.revision,
      mergedContent: composed.destinationContent, keepSource: sourceDisposition === 'keep',
    }
    const updates: MergeLinkPreviewResult['updates'] = [], paths = new Set<string>(), cursors = new Set<string>(), warnings = new Set<string>()
    let cursor: string | undefined, plan: MergeLinkPreviewResult | undefined, bytes = 0, requiresKeepSource = false
    for (let pageNumber = 0; pageNumber < 200; pageNumber++) {
      signal.throwIfAborted()
      const page = await read({ ...request, ...(cursor === undefined ? {} : { cursor }) }, signal)
      signal.throwIfAborted()
      if (page.generation !== expectedVault.generation || !page.fingerprint || !page.source || !page.destination
        || page.source.path !== source.path || page.destination.path !== destination.path
        || page.source.revision !== source.revision || page.destination.revision !== destination.revision
        || (plan && (page.fingerprint !== plan.fingerprint || page.source.content !== plan.source?.content || page.destination.content !== plan.destination?.content))) {
        throw new Error('Merge preview changed while being read. Create a new preview.')
      }
      for (const update of page.updates) {
        if (!isSafeVaultRelativePath(update.path) || !/\.(?:md|markdown)$/iu.test(update.path)
          || update.path === source.path || update.path === destination.path || paths.has(update.path)
          || !/^file:[0-9a-f]{64}$/u.test(update.revision ?? '')) throw new Error('Merge preview contains an invalid or duplicate referrer.')
        const size = new TextEncoder().encode(update.newContent).byteLength
        bytes += size
        if (size > 2_000_000 || bytes > 64 * 1024 * 1024) throw new Error('Merge preview exceeds its content limit.')
        paths.add(update.path)
        updates.push({ ...update })
      }
      for (const warning of page.warnings) warnings.add(warning)
      if (warnings.size > 1_000) throw new Error('Merge preview exceeds its warning limit.')
      requiresKeepSource ||= page.requiresKeepSource
      plan = { ...page, source: { ...page.source }, destination: { ...page.destination }, updates, warnings: [...warnings], requiresKeepSource }
      if (page.complete) {
        if (page.cursor !== null || page.truncated || page.truncationReason !== null) throw new Error('Merge preview is incomplete.')
        break
      }
      if (!page.cursor || page.truncationReason !== 'result-limit' || cursors.has(page.cursor)) throw new Error('Merge preview is incomplete or its cursor did not advance.')
      cursors.add(page.cursor)
      cursor = page.cursor
    }
    if (!plan?.complete || !plan.source || !plan.destination) throw new Error('Merge preview exceeds its page limit.')
    composed = mergeNotes({ ...options, source: plan.source.content, destination: plan.destination.content })
    if (composed.destinationContent === request.mergedContent) {
      return { request, plan, destinationContent: composed.destinationContent, sourceDisposition,
        sourceContent: sourceDisposition === 'link' || sourceDisposition === 'embed' ? composed.sourceContent : null }
    }
  }
  throw new Error('Merge preview content did not stabilize. Create a new preview.')
}
