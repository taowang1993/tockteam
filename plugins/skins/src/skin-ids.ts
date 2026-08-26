export const SKIN_ID = Object.freeze({
  deepCurrent: 'tockteam-skin-deep-current',
  jadeCircuit: 'tockteam-skin-jade-circuit',
  porcelain: 'tockteam-skin-porcelain',
  emberDusk: 'tockteam-skin-ember-dusk',
} as const)

export const SKIN_IDS = Object.freeze(Object.values(SKIN_ID))
export type SkinId = typeof SKIN_ID[keyof typeof SKIN_ID]
