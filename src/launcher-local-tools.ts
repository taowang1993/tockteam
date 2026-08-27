import { v4 as uuidv4, v6 as uuidv6, v7 as uuidv7 } from 'uuid'
import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, type LauncherLocalExtensionId } from './launcher-local-extension-config.ts'
import type { LauncherLocalExtensionSettings, LauncherUuidFormat } from './launcher-local-extension-contract.ts'

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
function setOutput(output: HTMLTextAreaElement, error: HTMLElement, value: string): void {
  if (value.length > MAX_LOCAL_TOOL_OUTPUT_LENGTH) {
    output.value = ''
    error.textContent = 'Output exceeds the 16,384 character limit.'
    error.hidden = false
  } else {
    output.value = value
    error.textContent = ''
    error.hidden = true
  }
}
function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function base64Decode(value: string): string {
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
  try {
    const rowSep = unescape(rowSeparator); const columnSep = unescape(columnSeparator); const tokens = parsePattern(pattern)
    const rows = rowSep === '' ? [input] : input.split(rowSep)
    const evaluate = (items: RowlandToken[], columns: string[]): string => items.map(token => {
      if (token.type === 'literal') return token.value
      if (token.type === 'column') return columns[token.index] ?? ''
      const params = token.params.map(param => evaluate(param, columns)); const name = token.name.toUpperCase()
      if (name === 'GETDATE') { const date = new Date(); const format = params[0] || 'yyyy-MM-ddTHH:mm:ss.000Z'; return format.replace(/yyyy/g, String(date.getFullYear())).replace(/MM/g, String(date.getMonth() + 1).padStart(2, '0')).replace(/dd/g, String(date.getDate()).padStart(2, '0')).replace(/HH/g, String(date.getHours()).padStart(2, '0')).replace(/mm/g, String(date.getMinutes()).padStart(2, '0')).replace(/ss/g, String(date.getSeconds()).padStart(2, '0')).replace(/SSS/g, String(date.getMilliseconds()).padStart(3, '0')) }
      if (name === 'SUBSTRING') { if (params.length < 3) throw new Error('SUBSTRING function requires at least 3 parameters: string, start, length'); if (Number.isNaN(Number(params[1])) || Number.isNaN(Number(params[2]))) throw new Error('Start and length parameters must be valid numbers'); return params[0]!.substring(Number(params[1]), Number(params[2])) }
      if (name === 'UUID') { const format = (params[0] || 'D').trim().toUpperCase(); const version = (params[1] || 'v4').toLowerCase(); const generated = version === 'v6' ? uuidv6() : version === 'v7' ? uuidv7() : uuidv4(); const compact = generated.replace(/-/g, ''); const dashed = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`; if (format === 'N') return compact; if (format === 'D') return dashed; if (format === 'B') return `{${dashed}}`; if (format === 'P') return `(${dashed})`; if (format.length !== 1) throw new Error(`Invalid UUID format: '${params[0]}'. Format must be a single character (N, D, B or P).`); throw new Error(`Invalid UUID format character: '${format}'. Valid formats are: N, D, B, or P.`) }
      throw new Error(`Unknown function: ${token.name}`)
    }).join('')
    return rows.map(value => evaluate(tokens, columnSep === '' ? [value] : value.split(columnSep))).join(rowSep)
  } catch (error) { return String(error) }
}
function uuidFormat(version: string, format: LauncherUuidFormat): string {
  const generated = version === 'v6' ? uuidv6() : version === 'v7' ? uuidv7() : uuidv4()
  let value = format.uppercase ? generated.toUpperCase() : generated
  if (!format.hyphens) value = value.replace(/-/g, '')
  if (format.braces) value = `{${value}}`
  if (format.quotes) value = `"${value}"`
  return value
}

export function createLauncherLocalTool(options: Readonly<{
  document: Document
  extensionId: LauncherLocalToolId
  onClose: () => void
  settings: LauncherLocalExtensionSettings
}>): HTMLElement {
  const { document, extensionId, settings } = options
  const tool = element(document, 'section', 'launcher-local-tool')
  tool.setAttribute('aria-label', `${TOOL_NAMES[extensionId]} tool`)
  const header = element(document, 'header', 'launcher-local-tool-header')
  const title = element(document, 'h2')
  title.textContent = TOOL_NAMES[extensionId]
  const close = element(document, 'button', 'launcher-secondary-button')
  close.type = 'button'; close.textContent = 'Back to results'; close.setAttribute('aria-label', `Close ${TOOL_NAMES[extensionId]} tool`); close.addEventListener('click', options.onClose)
  header.append(title, close); tool.append(header)
  const content = element(document, 'div', 'launcher-local-tool-content'); tool.append(content)
  const error = element(document, 'p', 'launcher-local-tool-error'); error.setAttribute('role', 'alert'); error.hidden = true; content.append(error)

  if (extensionId === 'Base64Conversion') {
    const operation = element(document, 'select'); operation.setAttribute('aria-label', 'Base64 operation'); for (const [value, label] of [['encode', 'Encode'], ['decode', 'Decode']] as const) { const option = element(document, 'option'); option.value = value; option.textContent = label; operation.append(option) }
    const input = element(document, 'textarea'); input.setAttribute('aria-label', 'Base64 input'); input.maxLength = MAX_LOCAL_TOOL_INPUT_LENGTH; input.rows = 8
    const output = element(document, 'textarea'); output.setAttribute('aria-label', 'Base64 output'); output.readOnly = true; output.rows = 8
    const update = () => { try { setOutput(output, error, operation.value === 'decode' ? base64Decode(input.value) : base64Encode(input.value)) } catch { output.value = ''; error.textContent = 'Base64 input could not be decoded.'; error.hidden = false } }
    operation.addEventListener('change', update); input.addEventListener('input', update); content.append(labeled(document, 'Operation', operation), labeled(document, 'Input', input), labeled(document, 'Output', output)); queueMicrotask(() => input.focus()); return tool
  }
  if (extensionId === 'RowlandTextEditor') {
    const input = element(document, 'textarea'); input.setAttribute('aria-label', 'Rowland input'); input.maxLength = MAX_LOCAL_TOOL_INPUT_LENGTH; input.rows = 7
    const pattern = element(document, 'input'); pattern.type = 'text'; pattern.setAttribute('aria-label', 'Rowland pattern'); pattern.maxLength = MAX_ROWLAND_PATTERN_LENGTH
    const output = element(document, 'textarea'); output.setAttribute('aria-label', 'Rowland output'); output.readOnly = true; output.rows = 7
    const update = () => setOutput(output, error, rowland(input.value, pattern.value, settings.RowlandTextEditor.rowSeparator, settings.RowlandTextEditor.columnSeparator))
    input.addEventListener('input', update); pattern.addEventListener('input', update); content.append(labeled(document, 'Input', input), labeled(document, 'Pattern', pattern), labeled(document, 'Output', output)); queueMicrotask(() => input.focus()); return tool
  }
  const version = element(document, 'select'); version.setAttribute('aria-label', 'Generator UUID version'); for (const value of ['v4', 'v6', 'v7'] as const) { const option = element(document, 'option'); option.value = value; option.textContent = value; version.append(option) }; version.value = settings.UuidGenerator.uuidVersion
  const quantity = element(document, 'input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '100'; quantity.value = String(settings.UuidGenerator.numberOfUuids); quantity.setAttribute('aria-label', 'Generator number of UUIDs')
  const output = element(document, 'textarea'); output.readOnly = true; output.rows = 10; output.setAttribute('aria-label', 'Generated UUIDs')
  const generate = element(document, 'button', 'launcher-primary-button'); generate.type = 'button'; generate.textContent = 'Generate UUIDs'
  const update = () => { const count = Math.min(100, Math.max(1, Number(quantity.value) || settings.UuidGenerator.numberOfUuids)); const nested = settings.UuidGenerator.generatorFormat; const format = { ...nested, braces: settings.UuidGenerator.braces, hyphens: settings.UuidGenerator.hyphens, quotes: settings.UuidGenerator.quotes, uppercase: settings.UuidGenerator.uppercase }; setOutput(output, error, Array.from({ length: count }, () => uuidFormat(version.value, format)).join('\n')) }
  generate.addEventListener('click', update); version.addEventListener('change', update); quantity.addEventListener('change', update); content.append(labeled(document, 'UUID version', version), labeled(document, 'Number of UUIDs', quantity), generate, labeled(document, 'Generated UUIDs', output)); queueMicrotask(() => generate.focus()); return tool
}

export { base64Decode, base64Encode, rowland }
