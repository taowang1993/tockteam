import {
  trustedRaycastCanIUseError,
  type TrustedRaycastCanIUseError,
  type TrustedRaycastCanIUseErrorCode,
} from './trusted-raycast-can-i-use-errors.ts'

/**
 * Stage 2 uses the stage 1 error instance without widening its source file.
 * The runtime class already carries a fixed code-only diagnostic.
 */
export type TrustedRaycastCanIUseStage2ErrorCode =
  | TrustedRaycastCanIUseErrorCode
  | 'WORKSPACE_UNAVAILABLE'
  | 'CONFIG_INVALID'
  | 'CONFIG_UNSUPPORTED'
  | 'CONFIG_ENV_MISSING'
  | 'RENDER_INVALID'
  | 'ACTION_DENIED'

export function trustedRaycastCanIUseStage2Error(code: TrustedRaycastCanIUseStage2ErrorCode): TrustedRaycastCanIUseError {
  return trustedRaycastCanIUseError(code as TrustedRaycastCanIUseErrorCode)
}

export function failTrustedRaycastCanIUseStage2(code: TrustedRaycastCanIUseStage2ErrorCode): never {
  throw trustedRaycastCanIUseStage2Error(code)
}
