import { v4 as uuidv4, v6 as uuidv6, v7 as uuidv7 } from 'uuid'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, type LauncherLocalExtensionId } from './launcher-local-extension-config.ts'
import type { LauncherLocalExtensionSettings, LauncherUuidFormat } from './launcher-local-extension-contract.ts'
import type { LauncherLocale } from './launcher-contract.ts'
import { launcherText } from './launcher-i18n.ts'

export const LAUNCHER_LOCAL_TOOL_IDS = Object.freeze(['Base64Conversion', 'RowlandTextEditor', 'UuidGenerator'] as const)
export type LauncherLocalToolId = (typeof LAUNCHER_LOCAL_TOOL_IDS)[number]
export const MAX_LOCAL_TOOL_INPUT_LENGTH = 16_384
export const MAX_ROWLAND_PATTERN_LENGTH = 2_048
export const MAX_LOCAL_TOOL_OUTPUT_LENGTH = 16_384

const TOOL_NAMES: Readonly<Record<LauncherLocalToolId, string>> = Object.freeze({
  Base64Conversion: 'Base64 Conversion',
  RowlandTextEditor: 'Rowland Text Editor',
  UuidGenerator: 'UUID / GUID Generator',
})

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag)
  if (className) created.className = className
  return created
}
function labeled(document: Document, labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = element(document, 'label', 'launcher-local-tool-field')
  const text = element(document, 'span')
  text.textContent = labelText
  label.append(text, control)
  return label
}
class LocalToolLimitError extends Error {}

function setError(output: HTMLTextAreaElement, error: HTMLElement, message: string, status?: HTMLElement): void {
  output.value = ''
  error.textContent = message
  error.hidden = false
  if (status !== undefined) status.textContent = launcherText(undefined, 'toolUnavailable', 'The tool could not produce output.')
}
function setOutput(output: HTMLTextAreaElement, error: HTMLElement, value: string, status?: HTMLElement): void {
  if (value.length > MAX_LOCAL_TOOL_OUTPUT_LENGTH) {
    setError(output, error, 'Output exceeds the 16,384 character limit.', status)
  } else {
    output.value = value
    error.textContent = ''
    error.hidden = true
    if (status !== undefined) status.textContent = value.length === 0 ? launcherText(undefined, 'outputEmpty', 'Output is empty.') : launcherText(undefined, 'outputReady', 'Output is ready.')
  }
}
function assertLength(value: string, max: number, label: string): void {
  if (value.length > max) throw new LocalToolLimitError(`${label} exceeds the ${max.toLocaleString('en-US')} character limit.`)
}
function appendBounded(output: string, value: string): string {
  if (output.length + value.length > MAX_LOCAL_TOOL_OUTPUT_LENGTH) throw new LocalToolLimitError('Output exceeds the 16,384 character limit.')
  return output + value
}
function base64Encode(value: string): string {
  assertLength(value, MAX_LOCAL_TOOL_INPUT_LENGTH, 'Input')
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function base64Decode(value: string): string {
  assertLength(value, MAX_LOCAL_TOOL_INPUT_LENGTH, 'Input')
  const binary = atob(value)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}
function unescape(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\')
}
type RowlandToken = Readonly<{ type: 'literal'; value: string } | { type: 'column'; index: number } | { type: 'function'; name: string; params: RowlandToken[][] }>
function parsePattern(input: string): RowlandToken[] {
  let position = 0
  const fail = (message: string): never => { throw new Error(`Pattern parse error at position ${position}: ${message}`) }
  const dollar = (): RowlandToken => {
    position += 1
    if (/\d/u.test(input[position] ?? '')) { let digits = ''; while (/\d/u.test(input[position] ?? '')) digits += input[position++]!; return { type: 'column', index: Number.parseInt(digits, 10) } }
    let name = ''; while (/[A-Za-z]/u.test(input[position] ?? '')) name += input[position++]!
    if (!name && input[position] === '(') fail("Invalid function syntax: expected function name before '('")
    if (input[position] !== '(') return { type: 'literal', value: `$${name}` }
    position += 1; const params: RowlandToken[][] = []
    while (position < input.length && input[position] !== ')') {
      const parameter: RowlandToken[] = []
      while (position < input.length && input[position] !== ',' && input[position] !== ')') {
        if (input[position] === '$') parameter.push(dollar())
        else { let literal = ''; while (position < input.length && input[position] !== '$' && input[position] !== ',' && input[position] !== ')') { if (input[position] === '(') fail("Unmatched '(': opening bracket without corresponding function"); literal += input[position++]! } parameter.push({ type: 'literal', value: literal }) }
      }
      if (input[position] === ',' && input[position + 1] === ')') fail("Empty parameter: trailing comma before ')'")
      params.push(parameter)
      if (input[position] === ',') position += 1
    }
    if (position >= input.length) fail(`Unclosed function bracket. Expected ')' for function '${name}'`)
    position += 1
    return { type: 'function', name, params }
  }
  const result: RowlandToken[] = []
  while (position < input.length) {
    let literal = ''
    while (position < input.length && input[position] !== '$') literal += input[position++]!
    while (position < input.length && input[position] === '$' && input[position + 1] === '$') { literal += '$'; position += 2 }
    if (literal) result.push({ type: 'literal', value: literal })
    if (position < input.length && input[position] === '$') result.push(dollar())
  }
  return result
}
function rowland(input: string, pattern: string, rowSeparator: string, columnSeparator: string): string {
  assertLength(input, MAX_LOCAL_TOOL_INPUT_LENGTH, 'Input')
  assertLength(pattern, MAX_ROWLAND_PATTERN_LENGTH, 'Pattern')
  try {
    const rowSep = unescape(rowSeparator); const columnSep = unescape(columnSeparator); const tokens = parsePattern(pattern)
    const rows = rowSep === '' ? [input] : input.split(rowSep)
    const evaluate = (items: RowlandToken[], columns: string[]): string => {
      let output = ''
      for (const token of items) {
        let value: string
        if (token.type === 'literal') value = token.value
        else if (token.type === 'column') value = columns[token.index] ?? ''
        else {
          const params = token.params.map(param => evaluate(param, columns)); const name = token.name.toUpperCase()
          if (name === 'GETDATE') { const date = new Date(); const format = params[0] || 'yyyy-MM-ddTHH:mm:ss.000Z'; value = format.replace(/yyyy/g, String(date.getFullYear())).replace(/MM/g, String(date.getMonth() + 1).padStart(2, '0')).replace(/dd/g, String(date.getDate()).padStart(2, '0')).replace(/HH/g, String(date.getHours()).padStart(2, '0')).replace(/mm/g, String(date.getMinutes()).padStart(2, '0')).replace(/ss/g, String(date.getSeconds()).padStart(2, '0')).replace(/SSS/g, String(date.getMilliseconds()).padStart(3, '0')) }
          else if (name === 'SUBSTRING') { if (params.length < 3) throw new Error('SUBSTRING function requires at least 3 parameters: string, start, length'); if (Number.isNaN(Number(params[1])) || Number.isNaN(Number(params[2]))) throw new Error('Start and length parameters must be valid numbers'); value = params[0]!.substring(Number(params[1]), Number(params[2])) }
          else if (name === 'UUID') { const format = (params[0] || 'D').trim().toUpperCase(); const version = (params[1] || 'v4').toLowerCase(); const generated = version === 'v6' ? uuidv6() : version === 'v7' ? uuidv7() : uuidv4(); const compact = generated.replace(/-/g, ''); const dashed = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`; if (format === 'N') value = compact; else if (format === 'D') value = dashed; else if (format === 'B') value = `{${dashed}}`; else if (format === 'P') value = `(${dashed})`; else if (format.length !== 1) throw new Error(`Invalid UUID format: '${params[0]}'. Format must be a single character (N, D, B or P).`); else throw new Error(`Invalid UUID format character: '${format}'. Valid formats are: N, D, B, or P.`) }
          else throw new Error(`Unknown function: ${token.name}`)
        }
        output = appendBounded(output, value)
      }
      return output
    }
    let output = ''
    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0) output = appendBounded(output, rowSep)
      const row = rows[index]!
      output = appendBounded(output, evaluate(tokens, columnSep === '' ? [row] : row.split(columnSep)))
    }
    return output
  } catch (error) {
    if (error instanceof LocalToolLimitError) throw error
    return String(error)
  }
}

type UuidToolVersion = 'v4' | 'v6' | 'v7'
export function normalizeUuidToolOptions(version: string, count: string, fallbackCount: number): Readonly<{ count: number; version: UuidToolVersion }> {
  const parsed = Number(count)
  return Object.freeze({
    count: Number.isSafeInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : fallbackCount,
    version: version === 'v6' || version === 'v7' ? version : 'v4',
  })
}
function uuidFormat(version: UuidToolVersion, format: LauncherUuidFormat): string {
  const generated = version === 'v6' ? uuidv6() : version === 'v7' ? uuidv7() : uuidv4()
  let value = format.uppercase ? generated.toUpperCase() : generated
  if (!format.hyphens) value = value.replace(/-/g, '')
  if (format.braces) value = `{${value}}`
  if (format.quotes) value = `"${value}"`
  return value
}

export function createLauncherLocalTool(options: Readonly<{
  document: Document
  locale?: LauncherLocale
  extensionId: LauncherLocalToolId
  onClose: () => void
  settings: LauncherLocalExtensionSettings
}>): HTMLElement {
  const { document, extensionId, settings } = options
  const text = (key: string, fallback: string): string => launcherText(options.locale, key, fallback)
  const tool = element(document, 'section', 'launcher-local-tool')
  tool.setAttribute('aria-label', `${TOOL_NAMES[extensionId]} Tool`)
  const header = element(document, 'header', 'launcher-local-tool-header')
  const title = element(document, 'h2')
  title.textContent = TOOL_NAMES[extensionId]
  const close = element(document, 'button', 'launcher-secondary-button')
  close.type = 'button'; close.textContent = text('back', 'Back to Results'); close.setAttribute('aria-label', `Close ${TOOL_NAMES[extensionId]} Tool`); close.addEventListener('click', options.onClose)
  header.append(title, close); tool.append(header)
  const content = element(document, 'div', 'launcher-local-tool-content min-w-0 overflow-auto'); tool.append(content)
  const error = element(document, 'p', 'launcher-local-tool-error'); error.setAttribute('role', 'alert'); error.hidden = true
  const outputStatus = element(document, 'p', 'launcher-local-tool-status'); outputStatus.setAttribute('role', 'status'); outputStatus.setAttribute('aria-live', 'polite'); outputStatus.textContent = text('outputReady', 'Output is ready.')
  content.append(error, outputStatus)

  if (extensionId === 'Base64Conversion') {
    const operation = element(document, 'select'); operation.setAttribute('aria-label', text('base64Operation', 'Base64 Operation')); for (const [value, label] of [['encode', text('encode', 'Encode')], ['decode', text('decode', 'Decode')]] as const) { const option = element(document, 'option'); option.value = value; option.textContent = label; operation.append(option) }
    const input = element(document, 'textarea'); input.setAttribute('aria-label', text('base64Input', 'Base64 Input')); input.maxLength = MAX_LOCAL_TOOL_INPUT_LENGTH; input.rows = 8
    const output = element(document, 'textarea'); output.setAttribute('aria-label', text('base64Output', 'Base64 Output')); output.readOnly = true; output.rows = 8
    const update = () => { try { setOutput(output, error, operation.value === 'decode' ? base64Decode(input.value) : base64Encode(input.value), outputStatus) } catch (caught) { setError(output, error, caught instanceof LocalToolLimitError ? caught.message : 'Base64 input could not be decoded.', outputStatus) } }
    operation.addEventListener('change', update); input.addEventListener('input', update); content.append(labeled(document, 'Operation', operation), labeled(document, 'Input', input), labeled(document, 'Output', output)); queueMicrotask(() => input.focus()); return tool
  }
  if (extensionId === 'RowlandTextEditor') {
    const input = element(document, 'textarea'); input.setAttribute('aria-label', text('rowlandInput', 'Rowland Input')); input.maxLength = MAX_LOCAL_TOOL_INPUT_LENGTH; input.rows = 7
    const pattern = element(document, 'input'); pattern.type = 'text'; pattern.setAttribute('aria-label', text('rowlandPattern', 'Rowland Pattern')); pattern.maxLength = MAX_ROWLAND_PATTERN_LENGTH
    const output = element(document, 'textarea'); output.setAttribute('aria-label', text('rowlandOutput', 'Rowland Output')); output.readOnly = true; output.rows = 7
    const update = () => { try { setOutput(output, error, rowland(input.value, pattern.value, settings.RowlandTextEditor.rowSeparator, settings.RowlandTextEditor.columnSeparator), outputStatus) } catch (caught) { setError(output, error, caught instanceof Error ? caught.message : 'Rowland output could not be generated.', outputStatus) } }
    input.addEventListener('input', update); pattern.addEventListener('input', update); content.append(labeled(document, 'Input', input), labeled(document, 'Pattern', pattern), labeled(document, 'Output', output)); queueMicrotask(() => input.focus()); return tool
  }
  const version = element(document, 'select'); version.setAttribute('aria-label', text('uuidVersion', 'UUID Version')); for (const value of ['v4', 'v6', 'v7'] as const) { const option = element(document, 'option'); option.value = value; option.textContent = value; version.append(option) }; version.value = settings.UuidGenerator.uuidVersion
  const quantity = element(document, 'input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '100'; quantity.value = String(settings.UuidGenerator.numberOfUuids); quantity.setAttribute('aria-label', text('uuids', 'Number of UUIDs'))
  const output = element(document, 'textarea'); output.readOnly = true; output.rows = 10; output.setAttribute('aria-label', text('generatedUuids', 'Generated UUIDs'))
  const generate = element(document, 'button', 'launcher-primary-button'); generate.type = 'button'; generate.textContent = text('generateUuids', 'Generate UUIDs')
  const update = () => { const normalized = normalizeUuidToolOptions(version.value, quantity.value, settings.UuidGenerator.numberOfUuids); quantity.value = String(normalized.count); version.value = normalized.version; const nested = settings.UuidGenerator.generatorFormat; const format = { ...nested, braces: settings.UuidGenerator.braces, hyphens: settings.UuidGenerator.hyphens, quotes: settings.UuidGenerator.quotes, uppercase: settings.UuidGenerator.uppercase }; setOutput(output, error, Array.from({ length: normalized.count }, () => uuidFormat(normalized.version, format)).join('\n'), outputStatus) }
  generate.addEventListener('click', update); version.addEventListener('change', update); quantity.addEventListener('change', update); update(); content.append(labeled(document, 'UUID version', version), labeled(document, 'Number of UUIDs', quantity), generate, labeled(document, 'Generated UUIDs', output)); queueMicrotask(() => generate.focus()); return tool
}

export { base64Decode, base64Encode, rowland }
