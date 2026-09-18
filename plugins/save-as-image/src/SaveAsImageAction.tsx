/** Save-as-image entry in the finalized assistant action strip. */

import { Button } from '@tockteam/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tockteam/ui/tooltip'
import { Check, Download, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  captureAssistantStep,
  captureFileName,
  downloadBlob,
  findAssistantStep,
} from './capture.ts'
import type { LocaleService, Translate } from '../../shared/i18n.ts'
import {
  SAVE_AS_IMAGE_MESSAGES,
  type SaveAsImageMessage,
} from './locales.ts'

/** How long the transient saved state stays visible. */
const SAVED_RESET_MS = 1_500

interface SaveAsImageActionProps {
  messageId: string
  t: Translate<SaveAsImageMessage>
}

interface SlotsService {
  inject(name: string, register: () => () => void): void
  register(options: {
    id: string
    locale: string
    name: string
    order: number
  }, component: (props: SaveAsImageActionProps) => JSX.Element): () => void
}

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
}

type Phase = 'idle' | 'capturing' | 'saved' | 'failed'

function ActionIcon({ phase }: { phase: Phase }) {
  if (phase === 'capturing') return <LoaderCircle aria-hidden="true" className="animate-spin" />
  if (phase === 'saved') return <Check aria-hidden="true" />
  if (phase === 'failed') return <TriangleAlert aria-hidden="true" />
  return <Download aria-hidden="true" />
}

/**
 * One finalized assistant response's local save control. The RC.1 renderer
 * mounts this component only when a turn has a durable final assistant node.
 */
export function SaveAsImageAction({ messageId, t }: SaveAsImageActionProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const alive = useRef(true)
  const capturing = useRef(false)
  const resetTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(resetTimer.current)
    }
  }, [])

  const capture = useCallback(async (): Promise<void> => {
    const button = buttonRef.current
    if (button === null || capturing.current) return
    capturing.current = true
    window.clearTimeout(resetTimer.current)
    resetTimer.current = undefined
    setPhase('capturing')
    try {
      const node = findAssistantStep(button)
      const blob = await captureAssistantStep(node)
      if (!alive.current) return
      downloadBlob(blob, captureFileName(messageId))
      setPhase('saved')
      resetTimer.current = window.setTimeout(() => {
        if (alive.current) setPhase('idle')
      }, SAVED_RESET_MS)
    } catch {
      if (alive.current) setPhase('failed')
    } finally {
      capturing.current = false
    }
  }, [messageId])

  const label = phase === 'capturing'
    ? t('status.capturing')
    : phase === 'saved'
      ? t('status.saved')
      : phase === 'failed'
        ? t('status.failed')
        : t('action.saveAsImage')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={buttonRef}
            unstyled
            type="button"
            className="tockteam-save-as-image inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-1.5 text-subtle-foreground hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:[&_svg]:animate-none"
            data-state={phase}
            data-tockteam-save-as-image="true"
            aria-label={label}
            aria-busy={phase === 'capturing' || undefined}
            disabled={phase === 'capturing'}
            onClick={() => { void capture() }}
          >
            <ActionIcon phase={phase} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      {phase === 'failed' && (
        <span className="sr-only" role="status">{t('status.failed')}</span>
      )}
    </TooltipProvider>
  )
}

/** Services required by the RC.1 assistant-actions slot. */
export const inject = ['locale', 'slots']

/** Add one browser-local action to DSH's finalized assistant action strip. */
export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale') as LocaleService
  const slots = ctx.get('slots') as SlotsService
  ctx.effect(
    () => locale.register('tockteam.save-as-image', SAVE_AS_IMAGE_MESSAGES),
    'tockteam-save-as-image: dictionaries',
  )
  slots.inject('conversation.chat.assistant-actions', () => slots.register({
    id: 'save-as-image',
    locale: 'tockteam.save-as-image',
    name: 'conversation.chat.assistant-actions',
    order: 20,
  }, SaveAsImageAction))
}
