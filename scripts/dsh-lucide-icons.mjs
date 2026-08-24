import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { icons } from 'lucide'

const UPSTREAM_SHA256 = 'b3b988bc9b2089c44d762be3d87ccf80021cadbafde11b6923ebb30cbf65da9b'
const ICON_SOURCE = 'packages/client/ui-primitives/src/icons/index.tsx'
const ADAPTER_MARKER = '/** TockTeam DSH Lucide adapter (temporary). */'
const LOCK_FILE = '.tockteam-dsh-lucide.lock'

const mappings = [
  ['IconNewChatOutline16', 'MessageSquarePlus', 16],
  ['IconSearchOutline16', 'Search', 16],
  ['IconGlobeOutline14', 'Globe', 14],
  ['IconSettingsOutline14', 'Settings', 14],
  // Lucide's gear has a smaller optical box than the adjacent 16px Blocks glyph.
  ['IconSettingsOutline16', 'Cog', 16, false, 1.125],
  ['IconPanelLeftOutline16', 'PanelLeft', 16],
  ['IconEllipsisOutline16', 'Ellipsis', 16],
  ['IconPlusOutline16', 'Plus', 16],
  ['IconCheckOutline16', 'Check', 16],
  ['IconCheckOutline14', 'Check', 14],
  ['IconBranchOutline16', 'GitBranch', 16],
  ['IconChevronDownOutline14', 'ChevronDown', 14],
  ['IconChevronLeftOutline14', 'ChevronLeft', 14],
  ['IconChevronRightOutline14', 'ChevronRight', 14],
  ['IconTriangleRightFill14', 'ChevronRight', 14],
  ['IconChevronUpOutline14', 'ChevronUp', 14],
  ['IconCloseOutline16', 'X', 16],
  ['IconCloseFill14', 'X', 14],
  ['IconCopyOutline16', 'Copy', 16],
  ['IconRefreshOutline16', 'RefreshCw', 16],
  ['IconRefreshOutline14', 'RefreshCw', 14],
  ['IconLikeOutline16', 'ThumbsUp', 16],
  ['IconLikeFill16', 'ThumbsUp', 16, true],
  ['IconDislikeOutline16', 'ThumbsDown', 16],
  ['IconDislikeFill16', 'ThumbsDown', 16, true],
  ['IconShareOutline16', 'Share2', 16],
  ['IconEditOutline16', 'Pencil', 16],
  ['IconThinkOutline14', 'Atom', 14],
  ['IconThinkOutline16', 'Atom', 16],
  ['IconAgentPresetOutline16', 'Network', 16],
  ['IconBrowseOutline16', 'FolderSearch', 16],
  ['IconLinkOutline14', 'Link', 14],
  ['IconLinkOutline16', 'Link', 16],
  ['IconRightUpOutline14', 'ArrowUpRight', 14],
  ['IconRightUpOutline16', 'ArrowUpRight', 16],
  ['IconEnhanceOutline16', 'WandSparkles', 16],
  ['IconTrashOutline16', 'Trash2', 16],
  ['IconWarningOutline16', 'TriangleAlert', 16],
  ['IconUserOutline16', 'User', 16],
  ['IconSendOutline16', 'ArrowUp', 16],
  ['IconStopFill16', 'Square', 16, true],
  ['IconPaperclipOutline16', 'Paperclip', 16],
  ['IconLoadingOutline16', 'LoaderCircle', 16],
  ['IconDownloadOutline16', 'Download', 16],
  ['IconPlayOutline16', 'Play', 16],
  ['IconPauseOutline16', 'Pause', 16],
  ['IconFullscreenOutline16', 'Maximize2', 16],
  ['IconCodeOutline16', 'Code2', 16],
  ['IconCordisPluginOutline14', 'Blocks', 14],
  ['IconApiOutline14', 'Braces', 14],
  ['IconPersonalizationOutline16', 'UserCog', 16],
  ['IconProjectAddOutline16', 'FolderPlus', 16],
  ['IconFolderOpenOutline16', 'FolderOpen', 16],
  ['IconFolderOpen16', 'FolderOpen', 16],
  ['IconFolderClose16', 'Folder', 16],
  ['IconTreeCorner8x10', 'CornerDownRight', 10],
  ['IconLightOutline16', 'Sun', 16],
  ['IconDarkOutline16', 'Moon', 16],
  ['IconFollowsystemOutline16', 'Monitor', 16],
  ['IconDataOutline16', 'Database', 16],
  ['IconSendOutline14', 'ArrowUp', 14],
  ['IconQueueOutline14', 'ListOrdered', 14],
  ['IconChecklistOutline14', 'ListChecks', 14],
  ['IconListPenOutline16', 'ListTodo', 16],
  ['IconGoalOutline16', 'Target', 16],
  ['IconSparkle16', 'Sparkles', 16],
  ['IconInspectOutline12', 'ScanSearch', 12],
  ['IconSkillOutline16', 'Wrench', 16],
  ['IconQuestionOutline14', 'CircleHelp', 14],
  ['IconArchiveOutline20', 'Archive', 20],
  ['TockTeamIconShield16', 'Shield', 16],
  ['TockTeamIconShieldCheck16', 'ShieldCheck', 16],
  ['TockTeamIconShieldAlert16', 'ShieldAlert', 16],
  ['TockTeamIconCircleCheck14', 'CircleCheck', 14],
  ['TockTeamIconLoaderCircle14', 'LoaderCircle', 14],
  ['TockTeamIconCircleDashed14', 'CircleDashed', 14],
  ['TockTeamIconInfo14', 'Info', 14],
  ['TockTeamIconCombine13', 'Combine', 13],
  ['TockTeamIconClock16', 'Clock3', 16],
]

function replaceChecked(source, search, replacement, sourcePath) {
  if (typeof search === 'string') {
    const first = source.indexOf(search)
    if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
      throw new Error(`DSH Lucide adapter expected one match in ${sourcePath}`)
    }
  } else if (source.match(search) === null) {
    throw new Error(`DSH Lucide adapter found no match in ${sourcePath}`)
  }
  return source.replace(search, replacement)
}

function replaceAllChecked(source, search, replacement, expected, sourcePath) {
  const count = source.split(search).length - 1
  if (count !== expected) {
    throw new Error(`DSH Lucide adapter expected ${String(expected)} matches in ${sourcePath}, received ${String(count)}`)
  }
  return source.replaceAll(search, replacement)
}

const sourcePatches = [
  {
    path: 'packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx',
    sha256: '339d08f250683043a6d01393059227627f4be6f65d4a8bb85adc580fec83f7dc',
    transform(source) {
      let next = replaceChecked(
        source,
        "import { IconChevronDownOutline14, Menu, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'",
        "import { IconChevronDownOutline14, Menu, RiskConfirmation, TockTeamIconShield16, TockTeamIconShieldAlert16, TockTeamIconShieldCheck16 } from '@deepseek-ai/dsh-client-ui-primitives'",
        this.path,
      )
      next = replaceChecked(
        next,
        /\/\* Shield glyphs[\s\S]*?\} as Record<string, ReactNode>/u,
        `const permissionGlyphs = {
  'read-only': <TockTeamIconShield16 />,
  'workspace-write': <TockTeamIconShieldCheck16 />,
  [FULL_ACCESS]: <TockTeamIconShieldAlert16 />,
} as Record<string, ReactNode>`,
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-conversation/src/client/skeleton/TodoPanel.tsx',
    sha256: 'ff439e2a827c7b8f3632a521b9824aa73a7482dfbe774e776be545d8fd51bb8e',
    transform(source) {
      let next = replaceChecked(source, "import { useId, useState } from 'react'", "import { useState } from 'react'", this.path)
      next = replaceChecked(
        next,
        "import { IconChecklistOutline14, IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'",
        "import { IconChecklistOutline14, IconChevronDownOutline14, IconChevronUpOutline14, TockTeamIconCircleCheck14, TockTeamIconCircleDashed14, TockTeamIconLoaderCircle14 } from '@deepseek-ai/dsh-client-ui-primitives'",
        this.path,
      )
      next = replaceChecked(
        next,
        /\/\*\* Status glyphs[\s\S]*?(?=function StatusGlyph)/u,
        `function CompletedGlyph() {
  return <TockTeamIconCircleCheck14 className={css.glyphCompleted} />
}

function ProgressGlyph() {
  return <TockTeamIconLoaderCircle14 className={css.glyphProgress} />
}

function PendingGlyph() {
  return <TockTeamIconCircleDashed14 className={css.glyphPending} />
}

`,
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-conversation/src/client/skeleton/DetailsPanel.tsx',
    sha256: '6f04dfbd1e5fac22fa7d735be59475d8ae2c29f9602269d896bece583264bf7b',
    transform(source) {
      let next = replaceChecked(
        source,
        "import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'",
        "import { CodeBlock, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'",
        this.path,
      )
      next = replaceChecked(
        next,
        /          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>[\s\S]*?          <\/svg>/u,
        '          <IconCloseOutline16 size={14} />',
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-conversation/src/client/skeleton/InputBar.tsx',
    sha256: '97cfe4ec31c89d0a50144c096ca8c81928c96628a561257d3d34406fb713a451',
    transform(source) {
      let next = replaceChecked(
        source,
        '  IconPlusOutline16, IconWarningOutline16, Toast, Tooltip,',
        '  IconPlusOutline16, IconSendOutline16, IconStopFill16, IconWarningOutline16, Toast, Tooltip,',
        this.path,
      )
      next = replaceAllChecked(
        next,
        `                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                    <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
                  </svg>`,
        '                  <IconStopFill16 />',
        2,
        this.path,
      )
      next = replaceChecked(
        next,
        /                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>[\s\S]*?                  <\/svg>/u,
        '                  <IconSendOutline16 />',
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-settings-models/src/client/ModelListEditor.tsx',
    sha256: '57a863006335dfd855cbf29dfa712fe69e699deced9a1e3bf4e3e3a3f14a16a7',
    transform(source) {
      let next = replaceChecked(
        source,
        "import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'",
        "import { Button, IconChevronRightOutline14, IconTrashOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'",
        this.path,
      )
      next = replaceChecked(
        next,
        /\/\*\* Disclosure chevron[\s\S]*?(?=\/\*\* The two token counts)/u,
        `/** Disclosure chevron; rotates to point down while its row is open. */
function IconChevron({ open }: { open: boolean }): ReactNode {
  return <IconChevronRightOutline14 size={14} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms ease' }} />
}

/** Removal glyph for one model row. */
function IconTrash(): ReactNode {
  return <IconTrashOutline16 size={14} />
}

`,
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-trajectory/src/client/TrajectoryTable.tsx',
    sha256: '90e8af9de154dc7824d7b25a58a21e610cf036aeb22080446a98077bb8de57da',
    transform(source) {
      let next = replaceChecked(
        source,
        '  IconSparkle16,\n  IconUserOutline16,',
        '  IconSparkle16,\n  IconSkillOutline16,\n  IconUserOutline16,\n  TockTeamIconCombine13,\n  TockTeamIconInfo14,',
        this.path,
      )
      next = replaceChecked(
        next,
        /function ToolWrenchIcon[\s\S]*?(?=const KIND_ICON)/u,
        `function ToolWrenchIcon(): ReactNode {
  return <IconSkillOutline16 size={13} data-role-icon="wrench" />
}

function InformationIcon(): ReactNode {
  return <TockTeamIconInfo14 data-role-icon="information" />
}

function CompactedIcon(): ReactNode {
  return <TockTeamIconCombine13 data-role-icon="compacted" />
}

`,
        this.path,
      )
      next = replaceChecked(
        next,
        /            <svg\n              className=\{css\.assistantToolCallIcon\}[\s\S]*?            <\/svg>/u,
        '            <IconSkillOutline16 className={css.assistantToolCallIcon} size={12} />',
        this.path,
      )
      next = replaceChecked(
        next,
        /function ToolGlyph\(\) \{[\s\S]*?\n\}/u,
        `function ToolGlyph() {
  return <IconSkillOutline16 className={css.toolCatalogIcon} size={12} />
}`,
        this.path,
      )
      return next
    },
  },
  {
    path: 'packages/client/ui-trajectory/src/client/TrajectoryToolbar.tsx',
    sha256: 'f447b983cd249e8d757e111ab99010f34265db9a0b40c443344fa07855cb9c82',
    transform(source) {
      let next = replaceChecked(
        source,
        "import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'",
        "import { IconSearchOutline16, TockTeamIconClock16 } from '@deepseek-ai/dsh-client-ui-primitives'",
        this.path,
      )
      next = replaceChecked(
        next,
        /            <svg\n              className=\{css\.toggleIcon\}[\s\S]*?            <\/svg>/u,
        '            <TockTeamIconClock16 className={css.toggleIcon} />',
        this.path,
      )
      return next
    },
  },
]

function normalizedNode(name) {
  const icon = icons[name]
  if (icon === undefined) throw new Error(`Lucide ${name} is unavailable`)
  const children = icon[2]
  if (!Array.isArray(children)) throw new Error(`Lucide ${name} has an unknown node shape`)
  return children
}

export function generateDshLucideIconSource() {
  const nodes = Object.fromEntries([...new Set(mappings.map(([, name]) => name))]
    .map(name => [name, normalizedNode(name)]))
  const exports = mappings.map(([exportName, lucideName, size, filled = false, scale = 1]) =>
    `export const ${exportName} = glyph('${lucideName}', ${String(size)}, ${String(filled)}, ${String(scale)})`).join('\n')
  return `import { createElement } from 'react'
import type { ReactNode, SVGProps } from 'react'
import type { IconProps } from './props.ts'

export type { IconProps } from './props.ts'

type LucideNode = readonly [tag: string, attributes: Readonly<Record<string, string | number>>, children?: readonly LucideNode[]]
type LucideIconProps = IconProps & Omit<SVGProps<SVGSVGElement>, 'height' | 'width'>

const nodes = ${JSON.stringify(nodes)} as unknown as Readonly<Record<string, readonly LucideNode[]>>

function renderNodes(iconNodes: readonly LucideNode[], prefix: string): ReactNode[] {
  return iconNodes.map(([tag, attributes, children], index) => createElement(
    tag,
    { ...attributes, key: \`\${prefix}-\${String(index)}\` },
    children === undefined ? undefined : renderNodes(children, \`\${prefix}-\${String(index)}\`),
  ))
}

function glyph(name: string, defaultSize: number, filled = false, scale = 1) {
  const iconNodes = nodes[name]
  if (iconNodes === undefined) throw new Error(\`Missing Lucide icon: \${name}\`)
  return function DshLucideIcon({ size = defaultSize, className, ...props }: LucideIconProps) {
    const renderedSize = size * scale
    return createElement('svg', {
      ...props,
      'aria-hidden': 'true',
      className: ['lucide', \`lucide-\${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}\`, className]
        .filter(Boolean)
        .join(' '),
      fill: filled ? 'currentColor' : 'none',
      height: renderedSize,
      stroke: 'currentColor',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: 2,
      viewBox: '0 0 24 24',
      width: renderedSize,
      xmlns: 'http://www.w3.org/2000/svg',
    }, renderNodes(iconNodes, name))
  }
}

${exports}
`
}

export function acquireDshLucideIconLock(dshSource) {
  const lockPath = join(dshSource, LOCK_FILE)
  const create = () => {
    const descriptor = openSync(lockPath, 'wx')
    writeFileSync(descriptor, `${String(process.pid)}\n`)
    closeSync(descriptor)
  }
  try {
    create()
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const owner = Number.parseInt(readFileSync(lockPath, 'utf8'), 10)
    try {
      process.kill(owner, 0)
      throw new Error(`another DSH Lucide build is active (pid ${String(owner)})`)
    } catch (ownerError) {
      if (ownerError?.code !== 'ESRCH') throw ownerError
    }
    unlinkSync(lockPath)
    create()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    unlinkSync(lockPath)
  }
}

export function adaptDshLucideIcons(dshSource) {
  const originals = []
  const patches = [
    { path: ICON_SOURCE, sha256: UPSTREAM_SHA256, transform: generateDshLucideIconSource },
    ...sourcePatches,
  ]
  try {
    for (const patch of patches) {
      const sourcePath = join(dshSource, patch.path)
      let original = readFileSync(sourcePath, 'utf8')
      let digest = createHash('sha256').update(original).digest('hex')
      if (digest !== patch.sha256 && original.startsWith(ADAPTER_MARKER)) {
        original = execFileSync('git', ['show', `HEAD:${patch.path}`], { cwd: dshSource, encoding: 'utf8' })
        digest = createHash('sha256').update(original).digest('hex')
        writeFileSync(sourcePath, original)
      }
      if (digest !== patch.sha256) {
        throw new Error(`DSH source changed at ${patch.path}: expected ${patch.sha256}, received ${digest}`)
      }
      originals.push([sourcePath, original])
      writeFileSync(sourcePath, `${ADAPTER_MARKER}\n${patch.transform(original)}`)
    }
  } catch (error) {
    for (const [sourcePath, original] of originals.reverse()) writeFileSync(sourcePath, original)
    throw error
  }
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const [sourcePath, original] of originals.reverse()) writeFileSync(sourcePath, original)
  }
}

export const dshLucideSourcePaths = Object.freeze([ICON_SOURCE, ...sourcePatches.map(patch => patch.path)])

export const dshLucideIconMappings = Object.freeze(mappings.map(([exportName, lucideName]) => ({
  exportName,
  lucideName,
})))
