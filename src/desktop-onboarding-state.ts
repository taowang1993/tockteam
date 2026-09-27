import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

const MARKER = 'desktop-onboarding-practical-v1.complete'
const COMPLETE = 'complete\n'

/** Desktop-owned completion only; never read or change model credentials here. */
export function readDesktopOnboardingComplete(userData: string): boolean {
  try {
    return readBoundedRegularFile(join(userData, MARKER), COMPLETE.length) === COMPLETE
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function completeDesktopOnboarding(userData: string): void {
  if (readDesktopOnboardingComplete(userData)) return
  writeFileSync(join(userData, MARKER), COMPLETE, { flag: 'wx', mode: 0o600 })
}
