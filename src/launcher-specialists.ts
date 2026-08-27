import type { LauncherActionRecord, LauncherInternalResultItem } from './launcher-actions.ts'
import {
  LAUNCHER_ROUTE_DESTINATIONS,
  parseLauncherDestination,
  type TockTeamDestination,
} from './launcher-navigation.ts'

export const TOCKTEAM_WORKBENCH_HANDLER = 'focus-tockcoder'
export const TOCKTEAM_DESTINATIONS = LAUNCHER_ROUTE_DESTINATIONS
export type { TockTeamDestination }

const DESTINATION_RESULTS: readonly LauncherInternalResultItem[] = Object.freeze([
  Object.freeze({
    defaultAction: Object.freeze({
      argument: 'tockcoder',
      description: 'Open TockCoder',
      handlerKey: TOCKTEAM_WORKBENCH_HANDLER,
      hideWindowAfterInvocation: true,
      requiresConfirmation: false,
    }),
    description: 'Open the TockTeam coding workspace',
    id: 'tockteam-route:tockcoder',
    name: 'TockCoder',
    sourceExtension: 'TockTeam',
  }),
  Object.freeze({
    defaultAction: Object.freeze({
      argument: 'tocktutor',
      description: 'Open TockTutor',
      handlerKey: TOCKTEAM_WORKBENCH_HANDLER,
      hideWindowAfterInvocation: true,
      requiresConfirmation: false,
    }),
    description: 'Open the TockTeam notes workspace',
    id: 'tockteam-route:tocktutor',
    name: 'TockTutor',
    sourceExtension: 'TockTeam',
  }),
])

export async function createTockTeamDestinationResults(searchTerm: string): Promise<Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
}>> {
  const normalized = searchTerm.trim().toLocaleLowerCase('en-US')
  const before = DESTINATION_RESULTS.filter(item => {
    const haystack = `${item.name} ${item.description}`.toLocaleLowerCase('en-US')
    return normalized.length === 0 || haystack.includes(normalized)
  })
  return Object.freeze({
    after: Object.freeze([]),
    before: Object.freeze(before),
  })
}

export function parseTockTeamDestination(value: unknown): TockTeamDestination {
  return parseLauncherDestination(value)
}

export async function executeTockTeamDestination(
  record: LauncherActionRecord,
  isActiveRuntime: () => boolean,
  navigateTockTeam: (destination: TockTeamDestination) => Promise<void> | void,
): Promise<void> {
  if (record.handlerKey !== TOCKTEAM_WORKBENCH_HANDLER
    && record.handlerKey !== 'focus-tockcoder') {
    throw new Error('TockTeam launcher action handler is not registered')
  }
  const destination = parseTockTeamDestination(record.argument)
  if (!isActiveRuntime()) throw new Error('TockTeam workbench is not on an active runtime page')
  await navigateTockTeam(destination)
}
