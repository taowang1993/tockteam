export function packagingEnvironment(environment = process.env) {
  return { ...environment, COPYFILE_DISABLE: '1' }
}

export function assertNoAppleDoubleEntries(entries, archiveLabel = 'archive') {
  const appleDoubleEntries = entries.filter(entry => entry.split('/').some(part => part.startsWith('._')))
  if (appleDoubleEntries.length > 0) {
    throw new Error(`${archiveLabel} contains macOS AppleDouble entries: ${appleDoubleEntries.join(', ')}`)
  }
}
