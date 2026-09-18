import { MAX_EXECUTABLE_BASE_FILE_BYTES, type BaseHydratedFile } from './base-query.ts'
import { inferPropertyType, parseFrontmatterProperties, setFrontmatterProperty, type PropertyValue } from './properties.ts'

const EDITABLE_COLUMN = /^note\.([A-Za-z_][\w-]*)$/u
const REVISION = /^file:[0-9a-f]{64}$/u

export interface ExecutableBaseFrontmatterEditRequest {
  expectedPropertyIdentity: string
  expectedRevision: string
  operation: 'base-frontmatter'
  path: string
  previousSource: string
  previousValue: PropertyValue
  property: string
  source: string
  value: Exclude<PropertyValue, string[] | null>
}

export function executableBasePropertyIdentity(property: string, value: PropertyValue): string {
  return JSON.stringify([property, inferPropertyType(value), value])
}

function parseNextValue(current: PropertyValue, rawValue: string): Exclude<PropertyValue, string[] | null> | null {
  if (typeof current === 'boolean') {
    if (rawValue !== 'true' && rawValue !== 'false') return null
    return rawValue === 'true'
  }
  if (typeof current === 'number') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(rawValue)) return null
    const value = Number(rawValue)
    return Number.isFinite(value) ? value : null
  }
  return typeof current === 'string' ? rawValue : null
}

/** Stage one source-preserving note-property edit with exact revision and rollback source. */
export function createExecutableBaseFrontmatterEdit(
  file: BaseHydratedFile,
  column: string,
  rawValue: string,
): ExecutableBaseFrontmatterEditRequest | null {
  const property = EDITABLE_COLUMN.exec(column)?.[1]
  if (property === undefined || !REVISION.test(file.revision) || rawValue.length > 100_000 || /[\0\r\n]/u.test(rawValue)) return null
  const properties = parseFrontmatterProperties(file.source)
  const matching = properties.filter(entry => entry.key.toLocaleLowerCase() === property.toLocaleLowerCase())
  if (matching.length !== 1) return null
  const previous = matching[0]!
  const value = parseNextValue(previous.value, rawValue)
  if (value === null || Object.is(value, previous.value)) return null
  let source: string
  try { source = setFrontmatterProperty(file.source, previous.key, value) } catch { return null }
  if (source === file.source || new TextEncoder().encode(source).byteLength > MAX_EXECUTABLE_BASE_FILE_BYTES) return null
  return {
    expectedPropertyIdentity: executableBasePropertyIdentity(previous.key, previous.value),
    expectedRevision: file.revision,
    operation: 'base-frontmatter',
    path: file.path,
    previousSource: file.source,
    previousValue: previous.value,
    property: previous.key,
    source,
    value,
  }
}
