import type { LauncherActionRecord, LauncherInternalResultItem } from './launcher-actions.ts'

export const TOCKTEAM_WORKBENCH_HANDLER = 'focus-tockcoder'
export const TOCKTEAM_DESTINATIONS = Object.freeze(['tockcoder'] as const)
export type TockTeamDestination = (typeof TOCKTEAM_DESTINATIONS)[number]

const TOCKCODER_RESULT = Object.freeze({
  defaultAction: Object.freeze({
    argument: 'tockcoder',
    description: 'Focus TockCoder',
    handlerKey: TOCKTEAM_WORKBENCH_HANDLER,
    hideWindowAfterInvocation: true,
    requiresConfirmation: false,
  }),
  description: 'Focus the TockTeam coding composer',
  id: 'tockteam-route:tockcoder',
  name: 'TockCoder',
  sourceExtension: 'TockTeam',
} satisfies LauncherInternalResultItem)

export async function createTockTeamDestinationResults(searchTerm: string): Promise<Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
}>> {
  const normalized = searchTerm.trim().toLocaleLowerCase('en-US')
  const haystack = `${TOCKCODER_RESULT.name} ${TOCKCODER_RESULT.description}`.toLocaleLowerCase('en-US')
  return Object.freeze({
    after: Object.freeze([]),
    before: Object.freeze(normalized.length === 0 || haystack.includes(normalized) ? [TOCKCODER_RESULT] : []),
  })
}

export function parseTockTeamDestination(value: unknown): TockTeamDestination {
  if (value !== 'tockcoder') throw new Error('Invalid TockTeam launcher destination')
  return value
}

export async function executeTockTeamDestination(
  record: LauncherActionRecord,
  focusTockCoder: () => Promise<void> | void,
): Promise<void> {
  if (record.handlerKey !== TOCKTEAM_WORKBENCH_HANDLER) {
    throw new Error('TockTeam launcher action handler is not registered')
  }
  parseTockTeamDestination(record.argument)
  await focusTockCoder()
}
