export const TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES = Object.freeze({
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  PATH_UNSUPPORTED: 'PATH_UNSUPPORTED',
  QUERY_UNSUPPORTED: 'QUERY_UNSUPPORTED',
  SNAPSHOT_STALE: 'SNAPSHOT_STALE',
  WORKSPACE_UNAVAILABLE: 'WORKSPACE_UNAVAILABLE',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_UNSUPPORTED: 'CONFIG_UNSUPPORTED',
  CONFIG_ENV_MISSING: 'CONFIG_ENV_MISSING',
  RENDER_INVALID: 'RENDER_INVALID',
  ACTION_DENIED: 'ACTION_DENIED',
} as const)

export type TrustedRaycastCanIUseErrorCode = typeof TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES[keyof typeof TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES]

export class TrustedRaycastCanIUseError extends Error {
  readonly code: TrustedRaycastCanIUseErrorCode

  constructor(code: TrustedRaycastCanIUseErrorCode) {
    super(code)
    this.name = 'TrustedRaycastCanIUseError'
    this.code = code
  }
}

export function trustedRaycastCanIUseError(code: TrustedRaycastCanIUseErrorCode): TrustedRaycastCanIUseError {
  return new TrustedRaycastCanIUseError(code)
}

export function failTrustedRaycastCanIUse(code: TrustedRaycastCanIUseErrorCode): never {
  throw trustedRaycastCanIUseError(code)
}
