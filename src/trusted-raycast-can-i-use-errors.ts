export const TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES = Object.freeze({
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  PATH_UNSUPPORTED: 'PATH_UNSUPPORTED',
  QUERY_UNSUPPORTED: 'QUERY_UNSUPPORTED',
  SNAPSHOT_STALE: 'SNAPSHOT_STALE',
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
