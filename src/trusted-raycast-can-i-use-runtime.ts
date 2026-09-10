import { join } from 'node:path'
import { readTrustedRaycastFile } from './trusted-raycast-artifact-admission.ts'
import { decodeTrustedRaycastCanIUseData, TRUSTED_RAYCAST_CAN_I_USE_ASSET } from './trusted-raycast-can-i-use-assets.ts'
import { failTrustedRaycastCanIUse } from './trusted-raycast-can-i-use-errors.ts'

/** Main-owned asset loading; never exposed as a renderer-selected path operation. */
export function loadTrustedRaycastCanIUseData(directory: string) {
  try {
    const pin = TRUSTED_RAYCAST_CAN_I_USE_ASSET
    return decodeTrustedRaycastCanIUseData(readTrustedRaycastFile(join(directory, pin.file), pin.bytes))
  } catch { return failTrustedRaycastCanIUse('DATA_UNAVAILABLE') }
}
