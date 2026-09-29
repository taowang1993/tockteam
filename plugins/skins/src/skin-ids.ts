export const SKIN_ID = Object.freeze({
  navy: 'tockteam-skin-navy',
  jade: 'tockteam-skin-jade',
  ember: 'tockteam-skin-ember',
} as const)

export const LEGACY_PORCELAIN_ID = 'tockteam-skin-porcelain' as const

export const SKIN_IDS = Object.freeze(Object.values(SKIN_ID))
export type SkinId = typeof SKIN_ID[keyof typeof SKIN_ID]
