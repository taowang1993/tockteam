export type TrustedProofPageRole = 'launcher' | 'workbench'
export type TrustedProofPage = Readonly<{ title(): Promise<string>; url(): string }>

/** Resolve every asynchronous title, then require one exact title-and-origin match. */
export async function selectTrustedProofPage<Page extends TrustedProofPage>(pages: readonly Page[], role: TrustedProofPageRole): Promise<Page> {
  const snapshots = await Promise.all(pages.map(async page => ({ page, title: await page.title(), url: page.url() })))
  const expectedTitle = role === 'workbench' ? 'TockCoder' : 'TockLauncher'
  const matches = snapshots.filter(snapshot => {
    if (snapshot.title !== expectedTitle) return false
    if (role === 'launcher') return /^file:\/\/\/[^?#]*\/launcher\.html$/u.test(snapshot.url)
    const match = snapshot.url.match(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{0,4})\/tockcoder(?:[?#].*)?$/u)
    return match !== null && Number(match[1]) <= 65_535
  })
  if (matches.length !== 1) {
    const titleMatches = snapshots.filter(snapshot => snapshot.title === expectedTitle)
    const schemeClasses = [...new Set(titleMatches.map(snapshot => snapshot.url.startsWith('http:') ? 'http' : snapshot.url.startsWith('file:') ? 'file' : 'other'))].sort()
    const hostClasses = [...new Set(titleMatches.map(snapshot => /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):/u.test(snapshot.url) ? 'loopback-with-port' : snapshot.url.startsWith('file:///') ? 'local-file' : 'other'))].sort()
    const pathClasses = [...new Set(titleMatches.map(snapshot => /\/tockcoder(?:[?#]|$)/u.test(snapshot.url) ? 'workbench' : /\/launcher\.html$/u.test(snapshot.url) ? 'launcher' : 'other'))].sort()
    throw new Error(`Expected exactly one trusted ${role} page; received ${matches.length} (title matches ${titleMatches.length}; scheme classes ${schemeClasses.join(',') || 'none'}; host classes ${hostClasses.join(',') || 'none'}; path classes ${pathClasses.join(',') || 'none'})`)
  }
  return matches[0]!.page
}

/** Poll through splash/transition pages until the exact trusted page is eligible. */
export async function waitForTrustedProofPage<Page extends TrustedProofPage>(readPages: () => Promise<readonly Page[]> | readonly Page[], role: TrustedProofPageRole, timeoutMs = 30_000, intervalMs = 100): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  let lastError = `Expected exactly one trusted ${role} page`
  for (;;) {
    try { return await selectTrustedProofPage(await readPages(), role) } catch (error) { lastError = error instanceof Error ? error.message : lastError }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(`Timed out waiting for trusted ${role} page: ${lastError}`)
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remaining)))
  }
}

/** The app-scoped Playwright CLI evaluates these exact reviewed selector functions. */
export const TRUSTED_PROOF_PAGE_SELECTOR_SOURCE = `const selectTrustedProofPage = ${selectTrustedProofPage.toString()}; const waitForTrustedProofPage = ${waitForTrustedProofPage.toString()};`
